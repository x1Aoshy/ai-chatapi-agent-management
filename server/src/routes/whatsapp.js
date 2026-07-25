import { Router } from 'express';

import { rateLimit } from '../auth.js';
import { config } from '../config.js';

export const whatsappRouter = Router();

function evolutionUrl(pathname) {
  return `${config.evolution.baseUrl}${pathname}/${config.evolution.instance}`;
}

function evolutionHeaders() {
  return { apikey: config.evolution.apiKey };
}

whatsappRouter.get('/whatsapp/state', async (_req, res, next) => {
  if (!config.evolution.apiKey) {
    return res.status(503).json({ error: 'EVOLUTION_API_KEY no está configurada.' });
  }

  try {
    const response = await fetch(evolutionUrl('/instance/connectionState'), {
      headers: evolutionHeaders(),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return res.status(502).json({ error: `Evolution respondió ${response.status}.` });
    }

    const body = await response.json();

    res.json({
      instance: body?.instance?.instanceName ?? config.evolution.instance,
      state: body?.instance?.state ?? 'unknown',
    });
  } catch (error) {
    next(error);
  }
});

/*
 * El QR equivale a una sesión de WhatsApp: quien lo escanee primero se queda
 * con ella. Se limita el ritmo para que no se puedan ir generando en serie, y
 * no se registra su contenido en los logs.
 */
whatsappRouter.post(
  '/whatsapp/connect',
  rateLimit({ windowMs: 60_000, max: 5 }),
  async (_req, res, next) => {
    if (!config.evolution.apiKey) {
      return res.status(503).json({ error: 'EVOLUTION_API_KEY no está configurada.' });
    }

    try {
      const response = await fetch(evolutionUrl('/instance/connect'), {
        headers: evolutionHeaders(),
        signal: AbortSignal.timeout(20_000),
      });

      if (!response.ok) {
        return res.status(502).json({ error: `Evolution respondió ${response.status}.` });
      }

      const body = await response.json();

      if (!body?.base64) {
        // Suele significar que la instancia ya está vinculada.
        return res.status(409).json({
          error: 'Evolution no devolvió QR. Puede que WhatsApp ya esté conectado.',
        });
      }

      console.log('[whatsapp] QR generado');
      res.json({ base64: body.base64 });
    } catch (error) {
      next(error);
    }
  }
);
