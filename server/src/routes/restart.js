import { Router } from 'express';

import { rateLimit } from '../auth.js';
import { restartBot } from '../lib/pm2.js';

export const restartRouter = Router();

/*
 * El reinicio corta el servicio unos segundos. Se limita con más dureza que el
 * resto: sin esto, quien tuviera la clave podría dejar el bot en un bucle de
 * reinicios y tirar la atención al cliente sin tocar nada más.
 */
restartRouter.post(
  '/restart',
  rateLimit({ windowMs: 60_000, max: 3 }),
  async (_req, res, next) => {
    try {
      await restartBot();
      console.log('[restart] bot reiniciado con --update-env');
      res.json({ ok: true, message: 'Bot reiniciado con el entorno actualizado.' });
    } catch (error) {
      next(error);
    }
  }
);
