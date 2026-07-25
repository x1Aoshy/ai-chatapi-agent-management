import 'dotenv/config';
import path from 'node:path';

/**
 * Configuración del middleware.
 *
 * Todo lo que apunta a rutas del disco o a servicios internos se resuelve aquí
 * para que el resto del código no construya rutas a mano.
 */

const BOT_DIR = process.env.BOT_DIR || '/home/ubuntu/api';

export const config = {
  port: Number(process.env.PORT || 5001),

  /** Clave compartida con el panel. Sin ella el servicio no arranca. */
  apiKey: process.env.PANEL_API_KEY,

  bot: {
    dir: BOT_DIR,
    instructionsPath: path.join(BOT_DIR, 'instrucciones.txt'),
    historyDir: path.join(BOT_DIR, 'instrucciones.history'),
    envPath: path.join(BOT_DIR, '.env'),
    /** Nombre del proceso en PM2. */
    processName: process.env.PM2_PROCESS_NAME || 'ai-bot',
  },

  chatwoot: {
    baseUrl: process.env.CHATWOOT_BASE_URL || 'http://172.17.0.1:3000',
    accountId: process.env.CHATWOOT_ACCOUNT_ID || '2',
    token: process.env.CHATWOOT_ACCESS_TOKEN,
  },

  evolution: {
    baseUrl: process.env.EVOLUTION_BASE_URL || 'http://localhost:8080',
    apiKey: process.env.EVOLUTION_API_KEY,
    instance: process.env.EVOLUTION_INSTANCE || 'ventas',
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  },

  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseUrl: 'https://api.deepseek.com',
  },
};

/**
 * Claves del .env del bot que el panel puede modificar.
 *
 * El panel valida contra su propia copia de esta lista, pero la decisión real
 * se toma aquí: es este proceso el que escribe el archivo. Cualquier clave
 * fuera de la lista se rechaza, porque el .env alimenta el entorno de un
 * proceso en ejecución y aceptar claves arbitrarias sería una vía de inyección.
 */
export const EDITABLE_ENV_KEYS = new Set([
  'DEEPSEEK_MODEL',
  'CHATWOOT_BASE_URL',
  'DEEPSEEK_API_KEY',
  'CHATWOOT_ACCESS_TOKEN',
]);

/** Claves cuyo valor nunca se devuelve en claro. */
export const SECRET_ENV_KEYS = new Set([
  'DEEPSEEK_API_KEY',
  'CHATWOOT_ACCESS_TOKEN',
]);
