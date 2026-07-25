import 'dotenv/config';
import express from 'express';
import axios from 'axios';
import OpenAI from 'openai';
import fs from 'fs';
import { createClient } from 'redis';

import { buildSystemPrompt, searchKnowledge } from './knowledge.js';

const app = express();
app.use(express.json());

const openai = new OpenAI({ baseURL: 'https://api.deepseek.com', apiKey: process.env.DEEPSEEK_API_KEY });
const CHATWOOT_URL = process.env.CHATWOOT_BASE_URL || 'http://172.17.0.1:3000';
const CHATWOOT_TOKEN = process.env.CHATWOOT_ACCESS_TOKEN;

const redisClient = createClient({ url: 'redis://127.0.0.1:6379' });
redisClient.on('error', (err) => console.error('⚠️ Redis:', err.message));
await redisClient.connect().then(() => console.log('⚡ Redis conectado')).catch(() => console.log('⚠️ Redis no disponible'));

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

      let conocimientos = 'Eres Marcos, asistente virtual.';
      try { conocimientos = fs.readFileSync('instrucciones.txt', 'utf8'); } catch(e) {}

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
    await axios.patch(base, { status: 'open' }, { headers });
  } catch (err) {
    console.error('❌ Error abriendo la conversación:', err.response?.status, err.response?.data?.error || err.message);
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
      { headers }
    );
    console.log('✅ Transferido y asignado a ' + (teamId ? 'equipo ' + teamId : 'agente ' + assigneeId));
  } catch (err) {
    console.error('⚠️ Abierta pero SIN asignar:', err.response?.status, err.response?.data?.error || err.message);
  }
}

app.listen(5000, () => console.log('Enrutador IA listo en puerto 5000'));
