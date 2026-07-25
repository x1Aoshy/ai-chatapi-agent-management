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
async function handleQr(_req, res, next) {
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

    if (!body?.base64 && !body?.code) {
      // Suele significar que la instancia ya está vinculada.
      return res.status(409).json({
        error: 'Evolution no devolvió QR. Puede que WhatsApp ya esté conectado.',
      });
    }

    console.log('[whatsapp] QR generado');

    /*
     * `base64` es el QR que usa el panel. Se devuelve también `code` por si
     * sirve para diagnosticar, pero NO para redibujar el código.
     *
     * Se intentó: quedaba mejor con la paleta del panel, pero WhatsApp
     * rechazaba el resultado — lo escaneaba y respondía que no se podía
     * vincular. El QR de vinculación es un formato del que WhatsApp es la
     * autoridad, no un dato que se pueda re-serializar sin más.
     */
    /*
     * `count` es cuántos QR lleva emitidos Evolution en esta sesión de
     * emparejamiento. Importa porque hay un tope (QRCODE_LIMIT): al llegar
     * deja de emitir y la instancia necesita reiniciarse. Sin este dato, el
     * síntoma es "el QR no vincula" sin ninguna pista de por qué.
     */
    res.json({
      base64: body.base64 ?? null,
      code: body.code ?? null,
      count: typeof body.count === 'number' ? body.count : null,
    });
  } catch (error) {
    next(error);
  }
}

const qrLimit = rateLimit({ windowMs: 60_000, max: 5 });

// Dos verbos para la misma operación. GET es el que usa el panel al detectar
// la desconexión; POST se mantiene porque ya había clientes apuntando ahí.
whatsappRouter.get('/whatsapp/qr', qrLimit, handleQr);
whatsappRouter.post('/whatsapp/connect', qrLimit, handleQr);

/**
 * Reinicia la instancia de Evolution.
 *
 * Es el remedio cuando el QR deja de vincular: Evolution agota su cupo de
 * códigos por sesión de emparejamiento y sigue devolviendo uno ya inservible.
 * Reiniciar arranca una sesión limpia.
 *
 * El verbo cambió entre versiones de Evolution (PUT en la 1.x, POST en la 2.x),
 * así que se prueban ambos antes de darlo por fallido: es preferible eso a que
 * el operador se quede sin salida por un 404 de método.
 */
whatsappRouter.post(
  '/whatsapp/restart',
  rateLimit({ windowMs: 60_000, max: 3 }),
  async (_req, res, next) => {
    if (!config.evolution.apiKey) {
      return res.status(503).json({ error: 'EVOLUTION_API_KEY no está configurada.' });
    }

    try {
      let response;

      for (const method of ['POST', 'PUT']) {
        response = await fetch(evolutionUrl('/instance/restart'), {
          method,
          headers: evolutionHeaders(),
          signal: AbortSignal.timeout(20_000),
        });
        if (response.status !== 404 && response.status !== 405) break;
      }

      if (!response.ok) {
        return res.status(502).json({ error: `Evolution respondió ${response.status}.` });
      }

      console.log('[whatsapp] instancia reiniciada');
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Cierra la sesión de WhatsApp.
 *
 * Deja el bot incomunicado hasta que alguien escanee un QR nuevo, así que se
 * limita con dureza: es la operación más destructiva de todo el panel.
 */
whatsappRouter.post(
  '/whatsapp/logout',
  rateLimit({ windowMs: 60_000, max: 3 }),
  async (_req, res, next) => {
    if (!config.evolution.apiKey) {
      return res.status(503).json({ error: 'EVOLUTION_API_KEY no está configurada.' });
    }

    try {
      const response = await fetch(evolutionUrl('/instance/logout'), {
        method: 'DELETE',
        headers: evolutionHeaders(),
        signal: AbortSignal.timeout(20_000),
      });

      if (!response.ok) {
        return res.status(502).json({ error: `Evolution respondió ${response.status}.` });
      }

      console.warn('[whatsapp] sesión cerrada — el bot no recibirá mensajes hasta re-vincular');
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  }
);
