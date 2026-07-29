import 'dotenv/config';
import express from 'express';
import axios from 'axios';
import OpenAI from 'openai';
import fs from 'fs';
import { createClient } from 'redis';

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildSystemPrompt, searchKnowledge } from './knowledge.js';

/*
 * Ruta ABSOLUTA, derivada de la ubicación de este archivo.
 *
 * Antes era 'instrucciones.txt' a secas, que Node resuelve contra el
 * directorio de trabajo del proceso y no contra el del script. Basta con que
 * PM2 arranque el bot desde otro sitio para que no lo encuentre.
 */
const BOT_DIR = path.dirname(fileURLToPath(import.meta.url));

/*
 * INSTRUCTIONS_PATH permite apuntarlo a otro sitio. Hace falta en Docker: el
 * panel reescribe este archivo con rename() —una escritura atómica—, y un bind
 * mount de un ARCHIVO suelto se rompe con eso, porque el contenedor sigue
 * viendo el inodo viejo. Con la ruta dentro de un DIRECTORIO montado, el
 * rename ocurre en el mismo volumen y el bot ve el contenido nuevo.
 */
const INSTRUCTIONS_PATH =
  process.env.INSTRUCTIONS_PATH || path.join(BOT_DIR, 'instrucciones.txt');

/*
 * Prompt de reserva. Es UNA FRASE: sin personalidad, sin catálogo, sin las
 * reglas que impiden hablar de otros temas o revelar qué modelo hay detrás.
 * Un bot con esto puesto atiende a clientes reales sin ninguna restricción, así
 * que caer aquí tiene que ser ruidoso, nunca silencioso.
 */
const FALLBACK_PROMPT = 'Eres Marcos, asistente virtual.';

/** null = aún sin comprobar. Evita repetir el aviso en cada mensaje. */
let instructionsOk = null;

function loadInstructions() {
  try {
    const content = fs.readFileSync(INSTRUCTIONS_PATH, 'utf8');

    if (instructionsOk === false) {
      console.log('✅ instrucciones.txt vuelve a leerse correctamente');
    }
    instructionsOk = true;
    return content;
  } catch (error) {
    // Solo se avisa al cambiar de estado: en cada mensaje llenaría el log.
    if (instructionsOk !== false) {
      console.error(
        '🚨 NO se pudo leer ' + INSTRUCTIONS_PATH + ' (' + error.code + ').\n' +
        '   El bot está respondiendo SIN reglas, SIN catálogo y SIN restricciones.'
      );
      instructionsOk = false;
    }
    return FALLBACK_PROMPT;
  }
}

const app = express();
app.use(express.json());

/*
 * Sin la clave, el constructor de OpenAI lanza y PM2 entra en bucle de
 * reinicios con un stack trace que habla de OPENAI_API_KEY — una variable que
 * en este proyecto ni existe. Mejor decir cuál falta de verdad.
 */
if (!process.env.DEEPSEEK_API_KEY) {
  console.error('🚨 Falta DEEPSEEK_API_KEY en el .env. El bot no puede generar respuestas.');
  process.exit(1);
}

const openai = new OpenAI({ baseURL: 'https://api.deepseek.com', apiKey: process.env.DEEPSEEK_API_KEY });
const CHATWOOT_URL = process.env.CHATWOOT_BASE_URL || 'http://172.17.0.1:3000';
const CHATWOOT_TOKEN = process.env.CHATWOOT_ACCESS_TOKEN;

/*
 * Sin timeout, axios espera indefinidamente. Una conexión que se queda colgada
 * —el caso típico cuando Docker cambia de red y la IP antigua ya no responde—
 * bloquearía el manejador para siempre en lugar de fallar y dejar rastro.
 */
const HTTP_TIMEOUT_MS = 15_000;

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  socket: {
    connectTimeout: 3_000,
    /*
     * Por defecto node-redis reintenta para siempre, y mientras tanto
     * `connect()` no resuelve NI rechaza. Como esta llamada es un await de
     * nivel superior, el bot se quedaba colgado antes de llegar a escuchar en
     * el 5000: sin Redis no arrancaba en absoluto, en lugar de arrancar sin
     * memoria como estaba previsto. Tres intentos y se rinde.
     */
    reconnectStrategy: (retries) =>
      retries >= 3 ? new Error('Redis no responde') : 200,
  },
});

// Un 'error' sin manejador tumba el proceso. Se registra una vez por estado,
// no por reintento: los reintentos llenarían el log de líneas idénticas.
let redisWarned = false;
redisClient.on('error', (err) => {
  if (!redisWarned) {
    console.error('⚠️ Redis:', err.message);
    redisWarned = true;
  }
});
redisClient.on('ready', () => { redisWarned = false; });

await redisClient
  .connect()
  .then(() => console.log('⚡ Redis conectado'))
  .catch(() => console.log('⚠️ Redis no disponible: el bot funciona, pero sin memoria de conversación'));

app.post('/webhook', async (req, res) => {
  const payload = req.body;
  res.status(200).send('OK');

  try {
    const conversationId = payload.conversation?.id;
    const accountId = payload.account?.id;
    if (!conversationId || !accountId) return;

    // Limpiar memoria cuando se resuelve la conversación
    if (payload.event === 'conversation_status_changed' || payload.event === 'conversation_resolved') {
      const newStatus = payload.status || payload.conversation?.status;
      if (newStatus === 'resolved' && redisClient.isOpen) {
        await redisClient.del('chat_history:' + conversationId);
        console.log('🧹 Memoria limpiada para conversación ' + conversationId);
      }
      return;
    }

    if (payload.event === 'message_created' && payload.message_type === 'incoming' && payload.content) {
      const msg = payload.content.trim();
      console.log('\n[📥 CLIENTE] ' + msg);

      // Detección directa de "agente"
      if (msg.toLowerCase().match(/^agente[s]?$/)) {
        console.log('➡️ Cliente pidió agente directamente');
        await sendMessage(accountId, conversationId, 'Te comunico con uno de nuestros asesores. Dame un momento.');
        await handoffToHuman(accountId, conversationId);
        if (redisClient.isOpen) await redisClient.del('chat_history:' + conversationId);
        return;
      }

      const conocimientos = loadInstructions();

      // Recuperar historial de Redis
      const historyKey = 'chat_history:' + conversationId;
      let history = [];
      if (redisClient.isOpen) {
        try {
          const raw = await redisClient.get(historyKey);
          if (raw) history = JSON.parse(raw);
        } catch(e) {}
      }

      // Contexto dinámico de la base de conocimiento. Devuelve [] ante
      // cualquier fallo, así que el bot responde igual aunque el RAG caiga.
      const snippets = await searchKnowledge(msg);
      if (snippets.length > 0) {
        console.log(
          '[🧠 CONTEXTO] ' +
            snippets
              .map((s) => s.title + ' (' + s.similarity.toFixed(2) + ')')
              .join(', ')
        );
      }

      const messages = [
        { role: 'system', content: buildSystemPrompt(conocimientos, snippets) },
        ...history,
        { role: 'user', content: msg }
      ];

      const response = await openai.chat.completions.create({
        model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
        messages: messages,
        temperature: 0.7,
        max_tokens: 300
      });

      const reply = response.choices[0].message.content.trim();
      console.log('[🤖 MARCOS] ' + reply);

      if (reply.includes('[HUMAN_HANDOFF]')) {
        console.log('➡️ Transfiriendo a agente humano...');
        await sendMessage(accountId, conversationId, 'Te comunico con uno de nuestros asesores. Dame un momento.');
        await handoffToHuman(accountId, conversationId);
        if (redisClient.isOpen) await redisClient.del(historyKey);
      } else {
        if (redisClient.isOpen) {
          history.push({ role: 'user', content: msg });
          history.push({ role: 'assistant', content: reply });
          if (history.length > 6) history = history.slice(-6);
          await redisClient.set(historyKey, JSON.stringify(history), { EX: 86400 });
        }
        await sendMessage(accountId, conversationId, reply);
      }
    }
  } catch (error) {
    console.error('❌ Error general:', error.message);
  }
});

/**
 * Detalle legible de un fallo de axios.
 *
 * Sin esto, un fallo de red se registraba como "❌ Error enviando: undefined",
 * porque `err.response` no existe cuando no se llegó a hablar con el servidor.
 * El código (ECONNREFUSED, ETIMEDOUT, EHOSTUNREACH) es justo lo que distingue
 * "Chatwoot rechazó la petición" de "no se llegó hasta Chatwoot" — dos causas
 * distintas con dos arreglos distintos.
 */
function describeAxiosError(err) {
  if (err.response) {
    return 'HTTP ' + err.response.status + ' — ' + (err.response.data?.error || err.response.statusText || '');
  }
  return 'sin respuesta (' + (err.code || err.message) + ') de ' + CHATWOOT_URL;
}

async function sendMessage(accountId, conversationId, content) {
  try {
    const response = await axios.post(
      CHATWOOT_URL + '/api/v1/accounts/' + accountId + '/conversations/' + conversationId + '/messages',
      { content, message_type: 'outgoing' },
      { headers: { 'api_access_token': CHATWOOT_TOKEN }, timeout: HTTP_TIMEOUT_MS }
    );

    /*
     * El id confirma que Chatwoot creó el mensaje de verdad. Importa porque
     * "enviado" aquí significa solo "Chatwoot lo aceptó": la entrega a WhatsApp
     * la hace Chatwoot después, y puede fallar sin que el bot se entere. Con el
     * id se puede buscar el mensaje y ver si se quedó parado.
     */
    console.log('📤 Mensaje enviado (Chatwoot id ' + (response.data?.id ?? '?') + ')');
    return true;
  } catch (err) {
    console.error('❌ Error enviando: ' + describeAxiosError(err));
    if (!err.response) {
      console.error('   Ejecuta: node diagnostico.mjs');
    }
    return false;
  }
}

/**
 * Pasa la conversación a un humano.
 *
 * Son DOS pasos, no uno. Poner la conversación en 'open' solo la saca de la
 * cola del bot; si nadie la tiene asignada, Chatwoot la deja en "Sin asignar",
 * que no es la bandeja que mira un agente por defecto. Ese era el motivo de que
 * los casos "desaparecieran" tras pedir agente.
 */
async function handoffToHuman(accountId, conversationId) {
  const headers = { 'api_access_token': CHATWOOT_TOKEN };
  const base = CHATWOOT_URL + '/api/v1/accounts/' + accountId + '/conversations/' + conversationId;

  // 1. Sacarla de la cola del bot. Este paso es el crítico: sin él, el bot
  //    seguiría respondiendo aunque el cliente ya haya pedido un humano.
  try {
    await axios.patch(base, { status: 'open' }, { headers, timeout: HTTP_TIMEOUT_MS });
  } catch (err) {
    console.error('❌ Error abriendo la conversación: ' + describeAxiosError(err));
    return;
  }

  // 2. Asignarla, si hay destinatario configurado.
  const assigneeId = process.env.CHATWOOT_HANDOFF_ASSIGNEE_ID;
  const teamId = process.env.CHATWOOT_HANDOFF_TEAM_ID;

  if (!assigneeId && !teamId) {
    console.log('✅ Conversación abierta (sin asignar: define CHATWOOT_HANDOFF_ASSIGNEE_ID o CHATWOOT_HANDOFF_TEAM_ID)');
    return;
  }

  /*
   * Un fallo aquí no revierte el paso 1 ni corta el flujo: la conversación ya
   * está fuera del bot, que es lo que impide que siga respondiendo a alguien
   * que pidió un humano. Quedarse sin asignar es recuperable a mano; que el
   * bot siga contestando, no.
   */
  try {
    await axios.post(
      base + '/assignments',
      teamId ? { team_id: Number(teamId) } : { assignee_id: Number(assigneeId) },
      { headers, timeout: HTTP_TIMEOUT_MS }
    );
    console.log('✅ Transferido y asignado a ' + (teamId ? 'equipo ' + teamId : 'agente ' + assigneeId));
  } catch (err) {
    console.error('⚠️ Abierta pero SIN asignar: ' + describeAxiosError(err));
  }
}

/**
 * Comprueba al arrancar que existe el camino de SALIDA.
 *
 * El bot usa dos caminos distintos y solo uno es visible en los logs: Sidekiq
 * lo llama a él (entrada), y él llama a la API de Chatwoot (salida). Si se
 * rompe solo la salida, el bot parece perfectamente sano —se ven los mensajes
 * entrando y las respuestas generándose— mientras ningún cliente recibe nada.
 * Ese silencio es el problema: hay que oírlo al arrancar, no cuando alguien se
 * queja.
 */
async function checkOutboundPath() {
  if (!CHATWOOT_TOKEN) {
    console.error(
      '🚨 CHATWOOT_ACCESS_TOKEN vacío. El bot NO podrá responder ni traspasar a un agente.'
    );
  }

  try {
    // validateStatus: cualquier código sirve. Solo se comprueba si hay alguien
    // al otro lado, no si esta ruta concreta existe.
    const response = await axios.get(CHATWOOT_URL + '/', {
      timeout: 5_000,
      validateStatus: () => true,
    });
    console.log('🔌 Chatwoot alcanzable en ' + CHATWOOT_URL + ' (HTTP ' + response.status + ')');
  } catch (err) {
    console.error(
      '🚨 NO se alcanza Chatwoot en ' + CHATWOOT_URL + ' (' + (err.code || err.message) + ').\n' +
      '   El bot recibirá mensajes y generará respuestas, pero ninguna llegará al\n' +
      '   cliente y el traspaso a agente tampoco funcionará.\n' +
      '   Diagnóstico: node diagnostico.mjs'
    );
  }
}

app.listen(5000, () => {
  console.log('Enrutador IA listo en puerto 5000');

  /*
   * Comprobación al arrancar. Sin esto, un archivo ilocalizable solo se nota
   * cuando un cliente recibe una respuesta que no debía recibir.
   */
  const prompt = loadInstructions();
  if (prompt === FALLBACK_PROMPT) {
    console.error('   Esperado en: ' + INSTRUCTIONS_PATH);
  } else {
    console.log(
      '📄 instrucciones.txt cargado (' + Buffer.byteLength(prompt, 'utf8') + ' bytes)'
    );
  }

  // No se espera: una comprobación de red no debe retrasar la escucha, y
  // checkOutboundPath no rechaza nunca.
  checkOutboundPath();
});
