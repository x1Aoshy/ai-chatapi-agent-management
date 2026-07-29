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

/**
 * Inspecciona PM2 devolviendo también POR QUÉ ha fallado.
 *
 * La versión anterior se tragaba el motivo y devolvía null, así que un PM2 no
 * instalado, un demonio de otro usuario y un nombre de proceso equivocado
 * producían el mismo 404 sin pistas. Son tres problemas con tres soluciones
 * distintas, y el operador necesita saber cuál tiene.
 */
export async function inspectPm2() {
  let stdout;

  try {
    stdout = await pm2(['jlist']);
  } catch (error) {
    const reason =
      error.code === 'ENOENT'
        ? 'PM2 no está en el PATH del middleware.'
        : `No se pudo ejecutar 'pm2 jlist': ${error.message}`;
    return { process: null, names: [], error: reason };
  }

  let processes;
  try {
    processes = JSON.parse(stdout);
  } catch {
    return { process: null, names: [], error: "'pm2 jlist' no devolvió JSON válido." };
  }

  const names = processes.map((p) => p.name);
  const found = processes.find((p) => p.name === config.bot.processName) ?? null;

  if (!found) {
    /*
     * PM2 corre un demonio por usuario. Si el middleware arranca con un
     * usuario distinto al del bot, ve una lista vacía o ajena aunque el bot
     * esté perfectamente vivo. Es la causa más habitual y la menos evidente,
     * así que se nombra explícitamente.
     */
    const detail = names.length
      ? `PM2 ve estos procesos: ${names.join(', ')}.`
      : 'PM2 no ve ningún proceso. Probablemente el middleware corre con un usuario distinto al del bot.';

    return {
      process: null,
      names,
      error: `No existe el proceso '${config.bot.processName}'. ${detail}`,
    };
  }

  return { process: found, names, error: null };
}

/** Devuelve la entrada del bot en PM2, o null. */
export async function getBotProcess() {
  const { process: found, error } = await inspectPm2();
  if (error) console.error('[pm2]', error);
  return found;
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

/**
 * Vacía los archivos de log del bot (`pm2 flush`).
 *
 * Es destructivo y no hay deshacer: PM2 trunca los archivos, no los archiva.
 * Por eso el panel pide confirmación antes de llegar aquí.
 */
export async function flushLogs() {
  await pm2(['flush', config.bot.processName]);
}

export async function restartBot() {
  // --update-env es obligatorio: sin él PM2 conserva el entorno del arranque
  // anterior y los cambios en .env no surten efecto.
  await pm2(['restart', config.bot.processName, '--update-env'], 30_000);
}

/**
 * Rutas de los archivos de log del bot, con el motivo si no se pueden obtener.
 */
export async function getLogPaths() {
  const { process: found, error } = await inspectPm2();

  if (error) return { out: null, err: null, error };

  const out = found.pm2_env?.pm_out_log_path ?? null;
  const err = found.pm2_env?.pm_err_log_path ?? null;

  if (!out && !err) {
    return {
      out: null,
      err: null,
      error: `PM2 conoce '${config.bot.processName}' pero no reporta rutas de log para él.`,
    };
  }

  return { out, err, error: null };
}
