import fs from 'node:fs/promises';

/**
 * Sigue el crecimiento de un archivo y emite las líneas nuevas.
 *
 * Se comprueba el tamaño cada `intervalMs` en lugar de usar fs.watch: watch se
 * comporta de forma distinta según el sistema de archivos y puede perder
 * eventos o dispararse varias veces por una sola escritura. Sondear el tamaño
 * es aburrido y predecible, y con un archivo local cada segundo el coste es
 * despreciable.
 */
export function followFile(filePath, { onLines, intervalMs = 1000 }) {
  let offset = null;
  let stopped = false;
  // Resto de una lectura que cortó a mitad de línea.
  let carry = '';

  async function poll() {
    if (stopped) return;

    let handle;

    try {
      handle = await fs.open(filePath, 'r');
      const { size } = await handle.stat();

      // Primera pasada: colocarse al final para no reenviar todo el archivo.
      if (offset === null) {
        offset = size;
        return;
      }

      /*
       * Si el archivo encogió, PM2 lo ha rotado o vaciado (`pm2 flush`).
       * Volver a empezar desde cero; si se mantuviera el offset anterior no se
       * leería nada nunca más.
       */
      if (size < offset) {
        offset = 0;
        carry = '';
      }

      if (size === offset) return;

      const length = size - offset;
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, offset);
      offset = size;

      const chunk = carry + buffer.toString('utf8');
      const parts = chunk.split('\n');

      // La última porción puede ser una línea incompleta: se guarda para la
      // siguiente vuelta en lugar de emitirla partida.
      carry = parts.pop() ?? '';

      const lines = parts.filter((line) => line.trim() !== '');
      if (lines.length > 0) onLines(lines);
    } catch (error) {
      // Un archivo que aún no existe no es un fallo: PM2 lo creará al primer
      // mensaje. Se reintenta en la siguiente vuelta.
      if (error.code !== 'ENOENT') {
        console.error(`[log-stream] ${filePath}:`, error.message);
      }
    } finally {
      await handle?.close().catch(() => {});
    }
  }

  const timer = setInterval(poll, intervalMs);
  void poll();

  return function stop() {
    stopped = true;
    clearInterval(timer);
  };
}
