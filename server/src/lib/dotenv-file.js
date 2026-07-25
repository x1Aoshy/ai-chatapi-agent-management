import fs from 'node:fs/promises';

import { writeFileAtomic } from './files.js';

/**
 * Lectura y escritura del .env del bot preservando su forma.
 *
 * No se usa un serializador genérico porque reescribir el archivo entero
 * perdería comentarios y orden. Se edita línea a línea: lo que el panel no
 * toca queda exactamente igual.
 */

const LINE_RE = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;

/** Devuelve un Map de clave → valor. */
export async function readEnvFile(filePath) {
  let raw;

  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return new Map();
    throw error;
  }

  const values = new Map();

  for (const line of raw.split('\n')) {
    if (line.trim().startsWith('#')) continue;

    const match = LINE_RE.exec(line);
    if (!match) continue;

    const [, key, rawValue] = match;
    values.set(key, unquote(rawValue.trim()));
  }

  return values;
}

function unquote(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

/**
 * Aplica `updates` sobre el archivo.
 *
 * Las claves existentes se sustituyen en su sitio; las nuevas se añaden al
 * final. Comentarios, líneas en blanco y orden se conservan.
 */
export async function updateEnvFile(filePath, updates) {
  let raw = '';

  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const lines = raw.split('\n');
  const pending = new Map(Object.entries(updates));

  const rewritten = lines.map((line) => {
    if (line.trim().startsWith('#')) return line;

    const match = LINE_RE.exec(line);
    if (!match) return line;

    const key = match[1];
    if (!pending.has(key)) return line;

    const value = pending.get(key);
    pending.delete(key);
    return `${key}=${value}`;
  });

  for (const [key, value] of pending) {
    rewritten.push(`${key}=${value}`);
  }

  let output = rewritten.join('\n');
  if (!output.endsWith('\n')) output += '\n';

  await writeFileAtomic(filePath, output);
}

/**
 * Enmascara un secreto dejando lo justo para reconocerlo.
 *
 * El panel nunca recibe la clave completa: si alguien accede a la sesión del
 * navegador no debe poder extraer las credenciales del bot.
 */
export function maskSecret(value) {
  if (!value) return '';
  if (value.length <= 8) return '•'.repeat(value.length);
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}
