import 'dotenv/config';
import express from 'express';
import axios from 'axios';
import OpenAI from 'openai';
import fs from 'fs';
import { createClient } from 'redis';

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

      const messages = [
        { role: 'system', content: conocimientos },
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
