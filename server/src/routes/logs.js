import { Router } from 'express';

import { tailFile } from '../lib/files.js';
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

logsRouter.get('/logs', async (req, res, next) => {
  const requested = Number(req.query.lines ?? 100);
  const lines = Number.isFinite(requested)
    ? Math.min(Math.max(Math.trunc(requested), 1), MAX_LINES)
    : 100;

  const onlyErrors = req.query.stream === 'err';

  try {
    const paths = await getLogPaths();

    if (!paths.out && !paths.err) {
      return res.status(404).json({ error: 'PM2 no reporta archivos de log para el bot.' });
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
    next(error);
  }
});
