import { createHash, timingSafeEqual } from 'node:crypto';

import { config } from './config.js';

/**
 * Comparación en tiempo constante de la API key.
 *
 * Se comparan los SHA-256 y no las cadenas: timingSafeEqual exige buffers de
 * la misma longitud, y compararlas directamente obligaría a comprobar antes el
 * tamaño, filtrando la longitud de la clave. Los digests miden siempre 32
 * bytes, así que la comparación no revela nada.
 */
function matchesApiKey(candidate) {
  const a = createHash('sha256').update(candidate).digest();
  const b = createHash('sha256').update(config.apiKey).digest();
  return timingSafeEqual(a, b);
}

export function requireApiKey(req, res, next) {
  const header = req.get('authorization') || '';

  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Falta la cabecera Authorization.' });
  }

  if (!matchesApiKey(header.slice(7))) {
    console.warn(`[auth] clave inválida desde ${req.ip} → ${req.method} ${req.path}`);
    return res.status(401).json({ error: 'No autorizado.' });
  }

  return next();
}

/**
 * Limitador de peticiones en memoria.
 *
 * Basta para un único proceso con un solo cliente legítimo. Protege sobre todo
 * los endpoints que escriben o reinician: sin esto, quien consiguiera la clave
 * podría dejar el bot en un bucle de reinicios.
 */
export function rateLimit({ windowMs, max }) {
  const hits = new Map();

  return function limiter(req, res, next) {
    const now = Date.now();
    const key = req.ip || 'desconocido';
    const recent = (hits.get(key) || []).filter((ts) => now - ts < windowMs);

    if (recent.length >= max) {
      return res.status(429).json({ error: 'Demasiadas peticiones.' });
    }

    recent.push(now);
    hits.set(key, recent);

    // Evita que el Map crezca sin límite si rota la IP de origen.
    if (hits.size > 1000) {
      for (const [k, timestamps] of hits) {
        if (timestamps.every((ts) => now - ts >= windowMs)) hits.delete(k);
      }
    }

    return next();
  };
}
