import express from 'express';

import { rateLimit, requireApiKey } from './auth.js';
import { config } from './config.js';
import { envRouter } from './routes/env.js';
import { healthRouter } from './routes/health.js';
import { instructionsRouter } from './routes/instructions.js';
import { logsRouter } from './routes/logs.js';
import { redisRouter } from './routes/redis.js';
import { restartRouter } from './routes/restart.js';
import { whatsappRouter } from './routes/whatsapp.js';

/*
 * Arrancar sin clave dejaría la infraestructura expuesta a cualquiera que
 * alcance el puerto. Es preferible no arrancar: PM2 lo marcará como errored y
 * el fallo será visible, en lugar de quedar un servicio abierto sin que nadie
 * se entere.
 */
if (!config.apiKey || config.apiKey.length < 32) {
  console.error(
    'PANEL_API_KEY no está definida o es demasiado corta (mínimo 32 caracteres).\n' +
      'Genera una con: openssl rand -hex 32'
  );
  process.exit(1);
}

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));

/**
 * Sonda de vida sin autenticar.
 *
 * No revela nada del sistema: solo confirma que el proceso responde. Sirve
 * para diagnosticar desde el propio servidor sin tener la clave a mano.
 */
app.get('/ping', (_req, res) => res.json({ ok: true }));

// A partir de aquí, todo exige la clave compartida con el panel.
app.use('/api', rateLimit({ windowMs: 60_000, max: 120 }), requireApiKey);

app.use('/api', healthRouter);
app.use('/api', instructionsRouter);
app.use('/api', envRouter);
app.use('/api', restartRouter);
app.use('/api', logsRouter);
app.use('/api', whatsappRouter);
app.use('/api', redisRouter);

app.use((req, res) => {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.path}` });
});

// Manejador de errores. La firma de cuatro argumentos es lo que hace que
// Express lo reconozca como tal, aunque `next` no se use.
// eslint-disable-next-line no-unused-vars
app.use((error, req, res, _next) => {
  console.error(`[error] ${req.method} ${req.path}:`, error.message);
  // El mensaje interno no se devuelve al cliente: puede contener rutas del
  // disco o detalles de la infraestructura.
  res.status(500).json({ error: 'Error interno del middleware.' });
});

const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`Middleware AI Management escuchando en el puerto ${config.port}`);
  console.log(`Directorio del bot: ${config.bot.dir}`);
  console.log(`Proceso PM2: ${config.bot.processName}`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(`\n${signal} recibido, cerrando…`);
    server.close(() => process.exit(0));
  });
}
