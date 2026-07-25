import { Router } from 'express';

import { scanKeys, withRedis } from '../lib/redis-client.js';

export const redisRouter = Router();

const KEY_PREFIX = 'chat_history:';

/**
 * Traduce un fallo de conexión a un 503 con mensaje útil.
 *
 * Sin esto el operador ve "Error interno del middleware", que no distingue un
 * bug del middleware de un Redis apagado. Son dos problemas muy distintos y el
 * panel debe poder decir cuál es.
 */
function isConnectionError(error) {
  return (
    error?.code === 'ECONNREFUSED' ||
    error?.code === 'ETIMEDOUT' ||
    error?.code === 'ENOTFOUND' ||
    error?.name === 'ConnectionTimeoutError' ||
    error?.name === 'ClientClosedError' ||
    /connect|closed|socket/i.test(error?.message ?? '')
  );
}

function handleRedisError(error, res, next) {
  if (isConnectionError(error)) {
    return res.status(503).json({
      error: 'Redis no está disponible. Comprueba que el servicio esté levantado.',
    });
  }
  return next(error);
}

redisRouter.get('/redis/conversations', async (_req, res, next) => {
  try {
    const conversations = await withRedis(async (client) => {
      // SCAN en lugar de KEYS: KEYS bloquea el servidor mientras recorre todo
      // el keyspace, y este Redis también sirve la cola de Sidekiq.
      const keys = await scanKeys(client, `${KEY_PREFIX}*`);

      const found = await Promise.all(
        keys.map(async (key) => {
          const [raw, ttl] = await Promise.all([client.get(key), client.ttl(key)]);

          let messages = 0;
          let preview;

          try {
            const history = JSON.parse(raw ?? '[]');
            messages = Array.isArray(history) ? history.length : 0;

            const lastUser = [...history].reverse().find((m) => m.role === 'user');
            preview = lastUser?.content?.slice(0, 80);
          } catch {
            // Una entrada corrupta no debe tumbar el listado entero.
          }

          return {
            conversationId: key.slice(KEY_PREFIX.length),
            messages,
            ttlSeconds: ttl,
            preview,
          };
        })
      );

      return found.sort(
        (a, b) => Number(b.conversationId) - Number(a.conversationId)
      );
    });

    res.json({ conversations });
  } catch (error) {
    handleRedisError(error, res, next);
  }
});

redisRouter.delete('/redis/conversations/:id', async (req, res, next) => {
  const { id } = req.params;

  // El id se concatena a una key de Redis. Los ids de conversación de Chatwoot
  // son enteros, así que cualquier otra cosa se rechaza.
  if (!/^\d{1,12}$/.test(id)) {
    return res.status(400).json({ error: 'Identificador de conversación inválido.' });
  }

  try {
    const deleted = await withRedis((client) => client.del(`${KEY_PREFIX}${id}`));
    console.log(`[redis] memoria de la conversación ${id} borrada (${deleted})`);
    res.json({ ok: true });
  } catch (error) {
    handleRedisError(error, res, next);
  }
});
