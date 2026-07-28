import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { readEnvFile, updateEnvFile, maskSecret } from './dotenv-file.js';

/*
 * El .env del bot alimenta el entorno de un proceso en ejecución, así que el
 * parseo y la reescritura son superficie de seguridad: una clave de más, un
 * comentario perdido o un secreto devuelto en claro se traducen en un incidente.
 */

let dir;
let envPath;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dotenv-test-'));
  envPath = path.join(dir, '.env');
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('readEnvFile', () => {
  test('lee pares clave=valor e ignora comentarios y líneas vacías', async () => {
    await fs.writeFile(envPath, [
      '# comentario',
      '',
      'DEEPSEEK_MODEL=deepseek-chat',
      '   ',
      'CHATWOOT_BASE_URL=http://172.17.0.1:3000',
      '# DEEPSEEK_API_KEY=no-deberia-leerse',
    ].join('\n'));

    const values = await readEnvFile(envPath);
    assert.equal(values.get('DEEPSEEK_MODEL'), 'deepseek-chat');
    assert.equal(values.get('CHATWOOT_BASE_URL'), 'http://172.17.0.1:3000');
    assert.equal(values.has('DEEPSEEK_API_KEY'), false);
  });

  test('quita comillas simples y dobles', async () => {
    await fs.writeFile(envPath, 'A="con comillas"\nB=\'simples\'\nC=sin\n');

    const values = await readEnvFile(envPath);
    assert.equal(values.get('A'), 'con comillas');
    assert.equal(values.get('B'), 'simples');
    assert.equal(values.get('C'), 'sin');
  });

  test('un archivo inexistente devuelve un Map vacío, no un error', async () => {
    const values = await readEnvFile(path.join(dir, 'no-existe'));
    assert.equal(values.size, 0);
  });
});

describe('updateEnvFile', () => {
  test('sustituye en el sitio y preserva comentarios, orden y líneas en blanco', async () => {
    const original = [
      '# --- DeepSeek ---',
      'DEEPSEEK_API_KEY=sk-original',
      '',
      '# modelo',
      'DEEPSEEK_MODEL=deepseek-chat',
      'CHATWOOT_BASE_URL=http://172.17.0.1:3000',
      '',
    ].join('\n');
    await fs.writeFile(envPath, original);

    await updateEnvFile(envPath, { DEEPSEEK_MODEL: 'deepseek-v4-flash' });

    const after = await fs.readFile(envPath, 'utf8');
    assert.ok(after.includes('# --- DeepSeek ---'), 'conserva los comentarios');
    assert.ok(after.includes('# modelo'));
    assert.ok(after.includes('DEEPSEEK_MODEL=deepseek-v4-flash'));
    // Lo que no se tocó queda igual.
    assert.ok(after.includes('DEEPSEEK_API_KEY=sk-original'));
    assert.ok(after.includes('CHATWOOT_BASE_URL=http://172.17.0.1:3000'));

    // Y el orden se respeta: el modelo sigue después de su comentario.
    assert.ok(after.indexOf('# modelo') < after.indexOf('DEEPSEEK_MODEL='));
  });

  test('añade al final las claves que no existían', async () => {
    await fs.writeFile(envPath, 'EXISTENTE=1\n');
    await updateEnvFile(envPath, { NUEVA: 'valor' });

    const values = await readEnvFile(envPath);
    assert.equal(values.get('EXISTENTE'), '1');
    assert.equal(values.get('NUEVA'), 'valor');
  });

  test('no duplica una clave al actualizarla dos veces', async () => {
    await fs.writeFile(envPath, 'A=1\n');
    await updateEnvFile(envPath, { A: '2' });
    await updateEnvFile(envPath, { A: '3' });

    const raw = await fs.readFile(envPath, 'utf8');
    const occurrences = raw.split('\n').filter((l) => l.startsWith('A=')).length;
    assert.equal(occurrences, 1);
    assert.equal((await readEnvFile(envPath)).get('A'), '3');
  });

  test('no toca una clave comentada que se llame igual', async () => {
    await fs.writeFile(envPath, '# A=comentada\nA=real\n');
    await updateEnvFile(envPath, { A: 'nueva' });

    const raw = await fs.readFile(envPath, 'utf8');
    assert.ok(raw.includes('# A=comentada'), 'la línea comentada sigue intacta');
    assert.equal((await readEnvFile(envPath)).get('A'), 'nueva');
  });

  test('el archivo siempre termina en salto de línea', async () => {
    await fs.writeFile(envPath, 'A=1');
    await updateEnvFile(envPath, { A: '2' });
    assert.ok((await fs.readFile(envPath, 'utf8')).endsWith('\n'));
  });

  test('la escritura es atómica: no deja temporales', async () => {
    await fs.writeFile(envPath, 'A=1\n');
    await updateEnvFile(envPath, { A: '2' });

    const left = await fs.readdir(dir);
    assert.deepEqual(left, ['.env'], `quedaron archivos sueltos: ${left.join(', ')}`);
  });
});

describe('maskSecret', () => {
  test('deja lo justo para reconocer la clave', () => {
    const key = 'sk-abcdefghijklmnop1234';
    const masked = maskSecret(key);

    assert.ok(!masked.includes('efghijklmn'), 'no filtra el cuerpo de la clave');
    assert.ok(masked.startsWith('sk-a'));
    assert.ok(masked.endsWith('1234'));
    assert.ok(masked.includes('…'), 'lleva el marcador que PUT usa para ignorarlo');
  });

  test('los valores cortos se ocultan por completo', () => {
    assert.equal(maskSecret('12345678'), '•'.repeat(8));
    assert.equal(maskSecret('abc'), '•••');
  });

  test('el vacío se queda vacío', () => {
    assert.equal(maskSecret(''), '');
    assert.equal(maskSecret(undefined), '');
  });
});
