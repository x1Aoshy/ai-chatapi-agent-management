import { config } from '../config.js';
import { scanKeys, withRedis } from './redis-client.js';

/**
 * Sondas de los servicios externos.
 *
 * Cada una devuelve { status, detail, latencyMs } y NUNCA lanza: el dashboard
 * tiene que poder pintar "este servicio está caído" en lugar de fallar entero
 * porque uno de los cinco no responde.
 */

const PROBE_TIMEOUT_MS = 5_000;

async function timed(fn) {
  const start = Date.now();
  try {
    const result = await fn();
    return { ...result, latencyMs: Date.now() - start };
  } catch (error) {
    return {
      status: 'offline',
      detail: error.name === 'TimeoutError' || error.name === 'AbortError'
        ? 'sin respuesta'
        : error.message?.slice(0, 80),
      latencyMs: Date.now() - start,
    };
  }
}

function fetchWithTimeout(url, options = {}) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
}

export function probeChatwoot() {
  return timed(async () => {
    if (!config.chatwoot.token) {
      return { status: 'unknown', detail: 'sin token' };
    }

    const url = `${config.chatwoot.baseUrl}/api/v1/accounts/${config.chatwoot.accountId}/conversations?per_page=1`;
    const response = await fetchWithTimeout(url, {
      headers: { api_access_token: config.chatwoot.token },
    });

    /*
     * Un 401 NO significa que Chatwoot esté caído: significa que respondió,
     * y por tanto está vivo. Marcarlo "offline" mandaba a buscar el problema
     * al sitio equivocado mientras el servicio funcionaba perfectamente.
     *
     * Además, este endpoint es de nivel agente. El token del AgentBot sirve
     * para publicar mensajes en sus conversaciones, pero no para listar las de
     * la cuenta, así que aquí hace falta un token de usuario (Chatwoot →
     * Perfil → Access Token), no el del bot.
     */
    if (response.status === 401 || response.status === 403) {
      return {
        status: 'degraded',
        detail: `${response.status} — Chatwoot responde, pero el token no autoriza. Usa un token de usuario, no el del AgentBot.`,
      };
    }

    return response.ok
      ? { status: 'online', detail: `HTTP ${response.status}` }
      : { status: 'degraded', detail: `HTTP ${response.status}` };
  });
}

export function probeWhatsApp() {
  return timed(async () => {
    if (!config.evolution.apiKey) {
      return { status: 'unknown', detail: 'sin apikey' };
    }

    const url = `${config.evolution.baseUrl}/instance/connectionState/${config.evolution.instance}`;
    const response = await fetchWithTimeout(url, {
      headers: { apikey: config.evolution.apiKey },
    });

    if (!response.ok) {
      return { status: 'offline', detail: `HTTP ${response.status}` };
    }

    const body = await response.json();
    const state = body?.instance?.state ?? 'unknown';

    return {
      status: state === 'open' ? 'online' : 'offline',
      detail: `state: ${state}`,
    };
  });
}

export function probeRedis() {
  return timed(async () => {
    const keys = await withRedis((client) => scanKeys(client, 'chat_history:*'));
    return { status: 'online', detail: `${keys.length} conversaciones` };
  });
}

export function probeDeepSeek() {
  return timed(async () => {
    if (!config.deepseek.apiKey) {
      return { status: 'unknown', detail: 'sin API key' };
    }

    // /models solo lista modelos: no consume tokens ni saldo de inferencia.
    const response = await fetchWithTimeout(`${config.deepseek.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${config.deepseek.apiKey}` },
    });

    if (response.status === 401) {
      return { status: 'offline', detail: '401 — API key inválida' };
    }

    return response.ok
      ? { status: 'online', detail: `HTTP ${response.status}` }
      : { status: 'degraded', detail: `HTTP ${response.status}` };
  });
}

