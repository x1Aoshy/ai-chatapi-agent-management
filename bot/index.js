import 'dotenv/config';
import express from 'express';
import axios from 'axios';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createClient } from 'redis';

const app = express();
app.use(express.json());

const openai = new OpenAI({ baseURL: 'https://api.deepseek.com', apiKey: process.env.DEEPSEEK_API_KEY });
const CHATWOOT_URL = process.env.CHATWOOT_BASE_URL || 'http://172.17.0.1:3000';
const CHATWOOT_TOKEN = process.env.CHATWOOT_ACCESS_TOKEN;

const HANDOFF_MESSAGE = 'Te comunico con uno de nuestros asesores. Dame un momento.';

const redisClient = createClient({ url: process.env.REDIS_URL || 'redis://127.0.0.1:6379' });
redisClient.on('error', (err) => console.error('⚠️ Redis:', err.message));
await redisClient.connect().then(() => console.log('⚡ Redis conectado')).catch(() => console.log('⚠️ Redis no disponible'));

// ---------------------------------------------------------------------------
// Prompt del sistema (instrucciones.txt)
// ---------------------------------------------------------------------------

const INSTRUCTIONS_PATH = path.resolve(process.env.INSTRUCTIONS_PATH || 'instrucciones.txt');
const INSTRUCTIONS_FALLBACK = 'Eres Marcos, asistente virtual.';

/*
 * Se cachea en memoria. Antes se hacía readFileSync EN CADA mensaje entrante:
 * I/O síncrona bloqueando el event loop en el camino caliente.
 *
 * La invalidación observa el DIRECTORIO, no el archivo. El middleware escribe de
 * forma atómica (temporal + rename), y un watch sobre el archivo sigue al inodo
 * viejo: tras el primer guardado dejaría de notificar y el bot se quedaría con
 * el prompt anterior para siempre. Además hay una relectura por antigüedad, por
 * si el watch no está disponible (algunos volúmenes montados no emiten eventos).
 */
const INSTRUCTIONS_MAX_AGE_MS = 60_000;
let cachedInstructions = null;
let cachedAt = 0;

function readInstructions() {
  try {
    return fs.readFileSync(INSTRUCTIONS_PATH, 'utf8');
  } catch {
    return INSTRUCTIONS_FALLBACK;
  }
}

function getInstructions() {
  if (cachedInstructions === null || Date.now() - cachedAt > INSTRUCTIONS_MAX_AGE_MS) {
    cachedInstructions = readInstructions();
    cachedAt = Date.now();
  }
  return cachedInstructions;
}

function invalidateInstructions() {
  cachedInstructions = null;
  console.log('📝 instrucciones.txt recargado');
}

try {
  fs.watch(path.dirname(INSTRUCTIONS_PATH), (_event, filename) => {
    if (!filename || filename === path.basename(INSTRUCTIONS_PATH)) invalidateInstructions();
  });
} catch (err) {
  console.warn('⚠️ No se pudo observar instrucciones.txt:', err.message);
}

getInstructions();

// ---------------------------------------------------------------------------
// Memoria conversacional
// ---------------------------------------------------------------------------

const HISTORY_TURNS = 6;
const HISTORY_TTL_SECONDS = 86_400;

const historyKey = (conversationId) => 'chat_history:' + conversationId;

/*
 * Se usa una LISTA de Redis en vez de un JSON bajo GET/SET.
 *
 * Con GET/SET, dos mensajes seguidos del mismo cliente —el caso normal en
 * WhatsApp, donde la gente escribe en ráfagas— leían ambos el mismo historial y
 * el segundo pisaba lo que había escrito el primero. RPUSH es atómico, así que
 * cada turno se añade sin leer antes y no hay carrera posible.
 */
async function loadHistory(conversationId) {
  if (!redisClient.isOpen) return [];

  try {
    const raw = await redisClient.lRange(historyKey(conversationId), 0, -1);
    return raw
      .map((entry) => {
        try {
          return JSON.parse(entry);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function appendHistory(conversationId, turns) {
  if (!redisClient.isOpen) return;

  try {
    const key = historyKey(conversationId);
    await redisClient.rPush(key, turns.map((t) => JSON.stringify(t)));
    // Conserva sólo los últimos turnos y renueva el TTL en cada intercambio.
    await redisClient.lTrim(key, -HISTORY_TURNS, -1);
    await redisClient.expire(key, HISTORY_TTL_SECONDS);
  } catch (err) {
    console.error('⚠️ No se pudo guardar el historial:', err.message);
  }
}

async function clearHistory(conversationId) {
  if (!redisClient.isOpen) return;
  try {
    await redisClient.del(historyKey(conversationId));
  } catch { /* la memoria es best-effort */ }
}

// ---------------------------------------------------------------------------
// Modelo
// ---------------------------------------------------------------------------

/*
 * El handoff viaja como TOOL CALL, no como un token dentro del texto.
 *
 * Antes el modelo debía responder "[HUMAN_HANDOFF]" y el bot hacía
 * reply.includes(...). Dos fallos: si el modelo mencionaba el token a mitad de
 * una frase se descartaba la respuesta entera, y si lo escribía distinto
 * ("[HUMAN HANDOFF]") el marcador se le enviaba tal cual al cliente. Un tool
 * call es un canal aparte del texto, así que ninguna de las dos cosas puede
 * pasar.
 */
const HANDOFF_TOOL = {
  type: 'function',
  function: {
    name: 'transferir_a_agente',
    description:
      'Transfiere la conversación a un asesor humano. Úsala cuando el cliente ' +
      'pida hablar con una persona, cuando pregunte algo médico, o cuando no ' +
      'puedas resolver su caso con la información disponible.',
    parameters: {
      type: 'object',
      properties: {
        motivo: {
          type: 'string',
          enum: ['peticion_explicita', 'consulta_medica', 'fuera_de_alcance'],
          description: 'Por qué se transfiere.',
        },
      },
      required: ['motivo'],
    },
  },
};

/** Marcador heredado: la instalación en producción puede seguir enseñándolo. */
const LEGACY_HANDOFF_RE = /\[\s*HUMAN[_\s-]?HANDOFF\s*\]/i;

const MAX_ATTEMPTS = 3;
const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Llama al modelo con reintentos y backoff exponencial.
 *
 * Antes un fallo de la API dejaba al cliente SIN NINGUNA respuesta: el catch
 * general sólo escribía en consola. En WhatsApp eso es indistinguible de que el
 * negocio te ignore, así que ahora se reintenta y, si aun así falla, el que
 * llama escala a un humano en vez de callar.
 */
async function completeWithRetry(messages) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await openai.chat.completions.create({
        model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
        messages,
        tools: [HANDOFF_TOOL],
        tool_choice: 'auto',
        temperature: 0.7,
        max_tokens: 300,
      });
    } catch (error) {
      lastError = error;

      const status = error?.status ?? error?.response?.status;
      const retryable = status === undefined || RETRYABLE_STATUS.has(status);

      if (!retryable || attempt === MAX_ATTEMPTS) break;

      const backoffMs = 400 * 2 ** (attempt - 1);
      console.warn(`⚠️ DeepSeek falló (intento ${attempt}/${MAX_ATTEMPTS}, status ${status ?? 'n/a'}). Reintento en ${backoffMs}ms`);
      await sleep(backoffMs);
    }
  }

  throw lastError;
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

/*
 * Verificación opcional del webhook.
 *
 * Si WEBHOOK_TOKEN está definido, toda petición debe traerlo en la cabecera
 * `x-webhook-token`. Sin él, cualquiera que alcance el puerto puede inyectar
 * conversaciones falsas y quemar tokens de la API. Es opcional para no romper la
 * instalación existente al desplegar, pero conviene activarlo.
 */
const WEBHOOK_TOKEN = process.env.WEBHOOK_TOKEN || '';

function webhookAuthorized(req) {
  if (!WEBHOOK_TOKEN) return true;

  const provided = req.get('x-webhook-token') || '';
  const a = crypto.createHash('sha256').update(provided).digest();
  const b = crypto.createHash('sha256').update(WEBHOOK_TOKEN).digest();
  return crypto.timingSafeEqual(a, b);
}

app.post('/webhook', async (req, res) => {
  if (!webhookAuthorized(req)) {
    console.warn('⚠️ Webhook rechazado: token inválido');
    return res.status(401).send('unauthorized');
  }

  const payload = req.body;
  // ACK inmediato: Chatwoot reintenta si la respuesta tarda, y el trabajo real
  // (llamar al modelo) puede tomar segundos.
  res.status(200).send('OK');

  try {
    const conversationId = payload.conversation?.id;
    const accountId = payload.account?.id;
    if (!conversationId || !accountId) return;

    // Limpiar memoria cuando se resuelve la conversación
    if (payload.event === 'conversation_status_changed' || payload.event === 'conversation_resolved') {
      const newStatus = payload.status || payload.conversation?.status;
      if (newStatus === 'resolved') {
        await clearHistory(conversationId);
        console.log('🧹 Memoria limpiada para conversación ' + conversationId);
      }
      return;
    }

    if (payload.event === 'message_created' && payload.message_type === 'incoming' && payload.content) {
      const msg = payload.content.trim();
      console.log('\n[📥 CLIENTE] ' + msg);

      // Detección directa de "agente": ahorra una llamada al modelo.
      if (msg.toLowerCase().match(/^agente[s]?$/)) {
        console.log('➡️ Cliente pidió agente directamente');
        await handoff(accountId, conversationId);
        return;
      }

      const history = await loadHistory(conversationId);
      const messages = [
        { role: 'system', content: getInstructions() },
        ...history,
        { role: 'user', content: msg },
      ];

      let response;
      try {
        response = await completeWithRetry(messages);
      } catch (error) {
        // El modelo no está disponible: escalar a un humano en vez de dejar al
        // cliente sin respuesta.
        console.error('❌ DeepSeek no disponible tras reintentos:', error.message);
        await sendMessage(
          accountId,
          conversationId,
          'Estoy teniendo problemas para responderte en este momento. Te comunico con un asesor.'
        );
        await handoffToHuman(accountId, conversationId);
        await clearHistory(conversationId);
        return;
      }

      const choice = response.choices[0].message;

      // 1) Handoff por tool call (camino nuevo).
      const toolCall = choice.tool_calls?.find((c) => c.function?.name === 'transferir_a_agente');
      if (toolCall) {
        let motivo = 'sin especificar';
        try {
          motivo = JSON.parse(toolCall.function.arguments || '{}').motivo || motivo;
        } catch { /* el motivo es informativo */ }
        console.log(`➡️ Transfiriendo a agente humano (motivo: ${motivo})`);
        await handoff(accountId, conversationId);
        return;
      }

      const rawReply = (choice.content || '').trim();

      // 2) Handoff por marcador heredado: el prompt en producción puede seguir
      //    pidiéndolo. Se acepta, pero nunca se le muestra al cliente.
      if (LEGACY_HANDOFF_RE.test(rawReply)) {
        console.log('➡️ Transfiriendo a agente humano (marcador heredado)');
        await handoff(accountId, conversationId);
        return;
      }

      if (!rawReply) {
        console.warn('⚠️ El modelo devolvió una respuesta vacía; escalando.');
        await handoff(accountId, conversationId);
        return;
      }

      console.log('[🤖 MARCOS] ' + rawReply);
      await appendHistory(conversationId, [
        { role: 'user', content: msg },
        { role: 'assistant', content: rawReply },
      ]);
      await sendMessage(accountId, conversationId, rawReply);
    }
  } catch (error) {
    console.error('❌ Error general:', error.message);
  }
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, redis: redisClient.isOpen });
});

// ---------------------------------------------------------------------------
// Chatwoot
// ---------------------------------------------------------------------------

/** Avisa al cliente, pasa la conversación a un humano y olvida el contexto. */
async function handoff(accountId, conversationId) {
  await sendMessage(accountId, conversationId, HANDOFF_MESSAGE);
  await handoffToHuman(accountId, conversationId);
  await clearHistory(conversationId);
}

async function sendMessage(accountId, conversationId, content) {
  try {
    await axios.post(
      CHATWOOT_URL + '/api/v1/accounts/' + accountId + '/conversations/' + conversationId + '/messages',
      { content, message_type: 'outgoing' },
      { headers: { 'api_access_token': CHATWOOT_TOKEN } }
    );
    console.log('📤 Mensaje enviado');
  } catch (err) {
    console.error('❌ Error enviando:', err.response?.status, err.response?.data?.error || err.message);
  }
}

async function handoffToHuman(accountId, conversationId) {
  try {
    await axios.patch(
      CHATWOOT_URL + '/api/v1/accounts/' + accountId + '/conversations/' + conversationId,
      { status: 'open' },
      { headers: { 'api_access_token': CHATWOOT_TOKEN } }
    );
    console.log('✅ Transferido a agente humano');
  } catch (err) {
    console.error('❌ Error handoff:', err.response?.status, err.response?.data?.error || err.message);
  }
}

app.listen(5000, () => console.log('Enrutador IA listo en puerto 5000'));
