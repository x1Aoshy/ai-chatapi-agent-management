import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';

import { config } from '../config.js';
import { ensureDir, writeFileAtomic } from '../lib/files.js';

export const instructionsRouter = Router();

const MAX_BYTES = 128 * 1024;
/** Formato de los nombres en el historial: 20260725-034512.txt */
const VERSION_ID_RE = /^\d{8}-\d{6}\.txt$/;

async function readInstructions() {
  const [content, stat] = await Promise.all([
    fs.readFile(config.bot.instructionsPath, 'utf8'),
    fs.stat(config.bot.instructionsPath),
  ]);

  return {
    content,
    updatedAt: stat.mtime.toISOString(),
    bytes: stat.size,
  };
}

/**
 * Archiva el contenido actual antes de sobrescribirlo.
 *
 * Se hace siempre antes de escribir, de modo que cualquier cambio —incluido un
 * rollback— sea reversible. Un directorio con archivos por timestamp evita
 * meter una dependencia de base de datos en un servidor que va justo de RAM.
 */
async function archiveCurrent() {
  let current;

  try {
    current = await fs.readFile(config.bot.instructionsPath, 'utf8');
  } catch (error) {
    // Sin archivo previo no hay nada que archivar: es el primer guardado.
    if (error.code === 'ENOENT') return;
    throw error;
  }

  await ensureDir(config.bot.historyDir);

  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '-')
    .slice(0, 15);

  await writeFileAtomic(path.join(config.bot.historyDir, `${stamp}.txt`), current);
}

instructionsRouter.get('/instructions', async (_req, res, next) => {
  try {
    res.json(await readInstructions());
  } catch (error) {
    if (error.code === 'ENOENT') {
      return res.status(404).json({ error: 'No existe instrucciones.txt en el servidor.' });
    }
    next(error);
  }
});

instructionsRouter.put('/instructions', async (req, res, next) => {
  const { content } = req.body ?? {};

  if (typeof content !== 'string') {
    return res.status(400).json({ error: "El campo 'content' debe ser una cadena." });
  }

  if (content.trim().length === 0) {
    return res.status(400).json({ error: 'Las instrucciones no pueden quedar vacías.' });
  }

  if (Buffer.byteLength(content, 'utf8') > MAX_BYTES) {
    return res.status(413).json({ error: `Superan el límite de ${MAX_BYTES / 1024} KB.` });
  }

  try {
    await archiveCurrent();
    await writeFileAtomic(config.bot.instructionsPath, content);
    console.log(`[instructions] guardadas (${Buffer.byteLength(content, 'utf8')} bytes)`);
    res.json(await readInstructions());
  } catch (error) {
    next(error);
  }
});

instructionsRouter.get('/instructions/versions', async (_req, res, next) => {
  try {
    let entries = [];

    try {
      entries = await fs.readdir(config.bot.historyDir);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    const versions = await Promise.all(
      entries
        .filter((name) => VERSION_ID_RE.test(name))
        .map(async (name) => {
          const stat = await fs.stat(path.join(config.bot.historyDir, name));
          return {
            id: name,
            createdAt: stat.mtime.toISOString(),
            bytes: stat.size,
          };
        })
    );

    versions.sort((a, b) => b.id.localeCompare(a.id));
    res.json({ versions: versions.slice(0, 50) });
  } catch (error) {
    next(error);
  }
});

/**
 * Borra una versión del historial.
 *
 * Se valida el identificador igual que en el rollback: acaba formando parte de
 * una ruta de disco, y aquí además se BORRA lo que apunte, así que una ruta que
 * escapara del directorio sería mucho peor que leer de más.
 */
instructionsRouter.delete('/instructions/versions/:id', async (req, res, next) => {
  const { id } = req.params;

  if (!VERSION_ID_RE.test(id)) {
    return res.status(400).json({ error: 'Identificador de versión inválido.' });
  }

  const versionPath = path.join(config.bot.historyDir, id);

  if (path.dirname(path.resolve(versionPath)) !== path.resolve(config.bot.historyDir)) {
    return res.status(400).json({ error: 'Identificador de versión inválido.' });
  }

  try {
    await fs.unlink(versionPath);
    console.log(`[instructions] versión ${id} eliminada`);
    res.json({ ok: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return res.status(404).json({ error: 'Esa versión no existe.' });
    }
    next(error);
  }
});

instructionsRouter.post('/instructions/rollback', async (req, res, next) => {
  const { versionId } = req.body ?? {};

  /*
   * El id se concatena a una ruta de disco. Se valida contra el formato exacto
   * del historial en lugar de sanear: así ".." o una ruta absoluta no llegan
   * nunca a path.join. El panel ya valida por su lado, pero quien escribe el
   * archivo es este proceso, así que la comprobación que cuenta es esta.
   */
  if (typeof versionId !== 'string' || !VERSION_ID_RE.test(versionId)) {
    return res.status(400).json({ error: 'Identificador de versión inválido.' });
  }

  try {
    const versionPath = path.join(config.bot.historyDir, versionId);

    // Defensa adicional por si el regex se relajara en el futuro.
    if (path.dirname(path.resolve(versionPath)) !== path.resolve(config.bot.historyDir)) {
      return res.status(400).json({ error: 'Identificador de versión inválido.' });
    }

    const content = await fs.readFile(versionPath, 'utf8');

    await archiveCurrent();
    await writeFileAtomic(config.bot.instructionsPath, content);
    console.log(`[instructions] restaurada la versión ${versionId}`);

    res.json(await readInstructions());
  } catch (error) {
    if (error.code === 'ENOENT') {
      return res.status(404).json({ error: 'Esa versión no existe.' });
    }
    next(error);
  }
});
