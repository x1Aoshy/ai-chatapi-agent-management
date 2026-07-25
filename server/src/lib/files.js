import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Escribe un archivo de forma atómica.
 *
 * El bot lee instrucciones.txt en cada mensaje entrante. Una escritura en
 * sitio puede ser leída a medias y dejar al bot con un prompt truncado durante
 * unos milisegundos. Escribir a un temporal en el mismo directorio y renombrar
 * hace que el cambio sea instantáneo desde el punto de vista del lector: o ve
 * el contenido viejo entero, o el nuevo entero.
 *
 * El temporal va en el mismo directorio a propósito: rename() solo es atómico
 * dentro del mismo sistema de archivos.
 */
export async function writeFileAtomic(filePath, content) {
  const dir = path.dirname(filePath);
  const tmp = path.join(dir, `.${path.basename(filePath)}.tmp-${process.pid}-${Date.now()}`);

  try {
    await fs.writeFile(tmp, content, 'utf8');
    await fs.rename(tmp, filePath);
  } catch (error) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw error;
  }
}

/** Lee las últimas `maxLines` líneas sin cargar el archivo entero. */
export async function tailFile(filePath, maxLines, maxBytes = 256 * 1024) {
  let handle;

  try {
    handle = await fs.open(filePath, 'r');
    const { size } = await handle.stat();
    const start = Math.max(0, size - maxBytes);
    const length = size - start;

    if (length === 0) return [];

    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, start);

    const lines = buffer.toString('utf8').split('\n');

    // Si se truncó por el principio, la primera línea puede estar partida.
    if (start > 0) lines.shift();

    return lines.filter((line) => line.trim() !== '').slice(-maxLines);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  } finally {
    await handle?.close();
  }
}

export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}
