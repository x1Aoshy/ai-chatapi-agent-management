import { createClient } from 'redis';

import { config } from '../config.js';

const CONNECT_TIMEOUT_MS = 3_000;

/**
 * Cliente de Redis que falla rápido en lugar de reintentar.
 *
 * Por defecto, node-redis reintenta la conexión indefinidamente con backoff.
 * Eso es lo correcto para un proceso de larga vida como el bot, pero aquí es
 * justo lo contrario de lo que queremos: si Redis está caído, `/api/health`
 * tiene que responder "Redis offline" en tres segundos, no quedarse colgado.
 * Un dashboard que se bloquea precisamente cuando algo falla no sirve de nada.
 */
export function createFailFastClient() {
  const client = createClient({
    url: config.redis.url,
    socket: {
      connectTimeout: CONNECT_TIMEOUT_MS,
      reconnectStrategy: false,
    },
  });

  // Sin listener, un error de conexión se convierte en excepción no capturada
  // y tumba el proceso entero.
  client.on('error', () => {});

  return client;
}

/**
 * Abre una conexión, ejecuta y cierra.
 *
 * Se prefiere a mantener un cliente vivo porque el middleware atiende
 * peticiones esporádicas y el servidor va justo de memoria: no compensa
 * sostener una conexión ociosa las 24 horas.
 */
export async function withRedis(fn) {
  const client = createFailFastClient();

  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.quit().catch(() => {});
  }
}

/** Recorre el keyspace con SCAN; KEYS bloquearía el servidor. */
export async function scanKeys(client, match) {
  const keys = [];
  let cursor = '0';

  do {
    const reply = await client.scan(cursor, { MATCH: match, COUNT: 100 });
    cursor = String(reply.cursor);
    keys.push(...reply.keys);
  } while (cursor !== '0');

  return keys;
}
