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
     * Se devuelve también `code`, el contenido en crudo del QR.
     * Evolution renderiza su propio PNG con la paleta de WhatsApp, que no pega
     * con nada en un panel monocromo. Con el texto original, el panel dibuja el
     * código con los colores del sistema; `base64` queda como respaldo por si
     * una versión de Evolution no expone `code`.
     */
    res.json({ base64: body.base64 ?? null, code: body.code ?? null });
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
