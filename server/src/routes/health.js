import { Router } from 'express';

import { getBotStatus } from '../lib/pm2.js';
import {
  probeChatwoot,
  probeDeepSeek,
  probeRedis,
  probeWhatsApp,
} from '../lib/services.js';

export const healthRouter = Router();

healthRouter.get('/health', async (_req, res) => {
  // En paralelo: son cinco sondas independientes y en serie el dashboard
  // tardaría la suma de todas.
  const [bot, chatwoot, whatsapp, redis, deepseek] = await Promise.all([
    getBotStatus(),
    probeChatwoot(),
    probeWhatsApp(),
    probeRedis(),
    probeDeepSeek(),
  ]);

  res.json({
    bot,
    services: [
      {
        id: 'bot',
        name: 'Bot (PM2)',
        status: bot.status === 'online' ? 'online' : 'offline',
        detail:
          bot.status === 'online'
            ? `${bot.restarts ?? 0} reinicios`
            : `estado: ${bot.status}`,
      },
      { id: 'chatwoot', name: 'Chatwoot', ...chatwoot },
      { id: 'whatsapp', name: 'WhatsApp (Evolution)', ...whatsapp },
      { id: 'redis', name: 'Redis', ...redis },
      { id: 'deepseek', name: 'DeepSeek', ...deepseek },
    ],
    checkedAt: new Date().toISOString(),
  });
});
