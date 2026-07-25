import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { config } from '../config.js';

const run = promisify(execFile);

/**
 * Ejecuta PM2.
 *
 * Siempre con execFile y una lista de argumentos, nunca componiendo una cadena
 * para el shell. Aunque hoy ningún argumento venga del usuario, hacerlo por
 * shell dejaría la puerta abierta a que un cambio futuro introdujera inyección
 * de comandos sin que nadie lo notara.
 */
async function pm2(args, timeoutMs = 15_000) {
  const { stdout } = await run('pm2', args, {
    timeout: timeoutMs,
    maxBuffer: 4 * 1024 * 1024,
  });
  return stdout;
}

/** Devuelve la entrada de `pm2 jlist` correspondiente al bot, o null. */
export async function getBotProcess() {
  try {
    const stdout = await pm2(['jlist']);
    const processes = JSON.parse(stdout);
    return processes.find((p) => p.name === config.bot.processName) ?? null;
  } catch (error) {
    console.error('[pm2] jlist falló:', error.message);
    return null;
  }
}

/** Estado del bot en la forma que espera el panel (tipo BotProcess). */
export async function getBotStatus() {
  const proc = await getBotProcess();

  if (!proc) {
    return { status: 'unknown' };
  }

  const env = proc.pm2_env ?? {};
  const monit = proc.monit ?? {};

  const statusMap = {
    online: 'online',
    stopped: 'stopped',
    errored: 'errored',
  };

  return {
    status: statusMap[env.status] ?? 'unknown',
    uptimeMs: env.pm_uptime ? Date.now() - env.pm_uptime : undefined,
    restarts: env.restart_time,
    memoryMb: monit.memory ? monit.memory / (1024 * 1024) : undefined,
    cpuPercent: monit.cpu,
    model: env.env?.DEEPSEEK_MODEL,
  };
}

export async function restartBot() {
  // --update-env es obligatorio: sin él PM2 conserva el entorno del arranque
  // anterior y los cambios en .env no surten efecto.
  await pm2(['restart', config.bot.processName, '--update-env'], 30_000);
}

/** Rutas de los archivos de log que PM2 mantiene para el bot. */
export async function getLogPaths() {
  const proc = await getBotProcess();
  if (!proc) return { out: null, err: null };

  return {
    out: proc.pm2_env?.pm_out_log_path ?? null,
    err: proc.pm2_env?.pm_err_log_path ?? null,
  };
}
