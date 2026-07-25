import { Router } from 'express';

import { tailFile } from '../lib/files.js';
import { followFile } from '../lib/log-stream.js';
import { getLogPaths } from '../lib/pm2.js';

export const logsRouter = Router();

const MAX_LINES = 500;

/** PM2 antepone la marca temporal cuando se configura; si está, se extrae. */
const TIMESTAMP_RE = /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?)\s*[:|-]?\s*(.*)$/;

function parseLine(raw, stream) {
  const match = TIMESTAMP_RE.exec(raw);

  if (!match) return { stream, message: raw };

  const parsed = new Date(match[1]);
  return Number.isNaN(parsed.getTime())
    ? { stream, message: raw }
    : { stream, timestamp: parsed.toISOString(), message: match[2] };
}

function clampLines(value, fallback = 100) {
  const requested = Number(value ?? fallback);
  return Number.isFinite(requested)
    ? Math.min(Math.max(Math.trunc(requested), 0), MAX_LINES)
    : fallback;
}

/**
 * Traduce un fallo de lectura a un mensaje accionable.
 *
 * EACCES es especialmente confuso: el archivo existe y la ruta es correcta,
 * pero el middleware corre con otro usuario. Sin nombrarlo, el operador acaba
 * buscando el problema donde no está.
 */
function describeReadError(error, filePath) {
  if (error.code === 'EACCES') {
    return `Sin permiso para leer ${filePath}. El middleware corre con un usuario que no puede acceder a los logs del bot.`;
  }
  return `No se pudo leer ${filePath}: ${error.message}`;
}

logsRouter.get('/logs', async (req, res, next) => {
  const lines = clampLines(req.query.lines) || 100;
  const onlyErrors = req.query.stream === 'err';

  try {
    const paths = await getLogPaths();

    if (paths.error) {
      return res.status(404).json({ error: paths.error });
    }

    const [out, err] = await Promise.all([
      onlyErrors || !paths.out ? [] : tailFile(paths.out, lines),
      paths.err ? tailFile(paths.err, lines) : [],
    ]);

    const merged = [
      ...out.map((raw) => parseLine(raw, 'out')),
      ...err.map((raw) => parseLine(raw, 'err')),
    ];

    /*
     * Los dos archivos se leen por separado, así que hay que reordenarlos.
     * Solo se ordena si TODAS las líneas traen marca temporal: con un orden
     * parcial, las líneas sin fecha saltarían a posiciones arbitrarias y el
     * log resultante sería más confuso que el original.
     */
    if (merged.length > 0 && merged.every((line) => line.timestamp)) {
      merged.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    }

    res.json({ lines: merged.slice(-lines) });
  } catch (error) {
    if (error.code === 'EACCES') {
      return res.status(403).json({ error: describeReadError(error, error.path ?? 'el log') });
    }
    next(error);
  }
});

/**
 * Stream de logs en tiempo real (Server-Sent Events).
 *
 * Sustituye al sondeo: el navegador abre una conexión y el servidor empuja
 * cada línea nueva en cuanto aparece, con ~1s de latencia en lugar de esperar
 * al siguiente intervalo.
 */
logsRouter.get('/logs/stream', async (req, res) => {
  const backlog = clampLines(req.query.lines, 100);
  const onlyErrors = req.query.stream === 'err';

  const paths = await getLogPaths();

  if (paths.error) {
    return res.status(404).json({ error: paths.error });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Sin esto, un Nginx intermedio almacena la respuesta y el "tiempo real"
    // se convierte en ráfagas cada varios segundos.
    'X-Accel-Buffering': 'no',
  });

  function send(event, payload) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  }

  // Historial inicial, para que la pantalla no arranque vacía.
  if (backlog > 0) {
    try {
      const [out, err] = await Promise.all([
        onlyErrors || !paths.out ? [] : tailFile(paths.out, backlog),
        paths.err ? tailFile(paths.err, backlog) : [],
      ]);

      const merged = [
        ...out.map((raw) => parseLine(raw, 'out')),
        ...err.map((raw) => parseLine(raw, 'err')),
      ];

      if (merged.length > 0 && merged.every((line) => line.timestamp)) {
        merged.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      }

      send('backlog', { lines: merged.slice(-backlog) });
    } catch (error) {
      send('error', { message: describeReadError(error, 'el log') });
    }
  } else {
    send('backlog', { lines: [] });
  }

  const stops = [];

  if (!onlyErrors && paths.out) {
    stops.push(
      followFile(paths.out, {
        onLines: (raw) => send('lines', { lines: raw.map((l) => parseLine(l, 'out')) }),
      })
    );
  }

  if (paths.err) {
    stops.push(
      followFile(paths.err, {
        onLines: (raw) => send('lines', { lines: raw.map((l) => parseLine(l, 'err')) }),
      })
    );
  }

  /*
   * Latido periódico. Sin tráfico, un proxy o un balanceador dan la conexión
   * por muerta y la cierran; un comentario SSE la mantiene viva sin ensuciar
   * el flujo de datos.
   */
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 15_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    stops.forEach((stop) => stop());
    res.end();
  });
});
