#!/usr/bin/env node
/*
 * Diagnóstico de la ruta de SALIDA de un mensaje.
 *
 * El caso que motiva este script: el bot recibe los mensajes, los procesa y
 * genera la respuesta —todo eso se ve en los logs— pero al cliente no le llega
 * nada por WhatsApp. Entre "el bot decide responder" y "el teléfono vibra" hay
 * cuatro saltos, y los logs del bot solo cubren el primero:
 *
 *     bot ──①──▶ Chatwoot ──②──▶ Evolution ──③──▶ WhatsApp
 *
 * Un fallo en ② o ③ es indistinguible de "todo bien" desde el bot: la API de
 * Chatwoot devuelve 200, el bot escribe "📤 Mensaje enviado", y el mensaje se
 * queda parado. Este script prueba cada salto por separado y dice cuál falla.
 *
 * No tiene dependencias: se ejecuta con `node diagnostico.mjs` aunque no haya
 * node_modules. Lee los .env a mano por eso mismo.
 *
 * Uso:
 *     node diagnostico.mjs
 *     node diagnostico.mjs --conversation 42     # prueba el envío de verdad
 *
 * La prueba de envío escribe una NOTA PRIVADA en la conversación: recorre
 * exactamente el mismo endpoint, la misma autenticación y la misma
 * conversación que un mensaje normal, pero el cliente no la ve.
 */

import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const TIMEOUT_MS = 6_000;

const OK = '✅';
const BAD = '\u{1F6A8}';
const WARN = '⚠️ ';
const SKIP = '– ';

// ---------------------------------------------------------------- argumentos

function arg(name) {
  const index = process.argv.indexOf('--' + name);
  return index !== -1 ? process.argv[index + 1] : undefined;
}

const BOT_DIR = arg('bot-dir') || process.env.BOT_DIR || '/home/ubuntu/api';

// --------------------------------------------------------------------- .env

/**
 * Parser mínimo de .env. Solo lo que este script necesita: KEY=valor, comillas
 * opcionales, comentarios y líneas en blanco.
 */
function readEnvFile(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }

  const result = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

/** Primer .env que exista de la lista. Devuelve { file, values }. */
function findEnv(candidates) {
  for (const file of candidates) {
    const values = readEnvFile(file);
    if (values) return { file, values };
  }
  return { file: null, values: {} };
}

const botEnv = findEnv([
  path.join(BOT_DIR, '.env'),
  path.join(SCRIPT_DIR, '.env'),
]);

/*
 * Las credenciales de Evolution no están en el .env del bot —el bot nunca habla
 * con Evolution— sino en el del middleware. Se buscan ahí para no obligar a
 * pasarlas a mano.
 */
const serverEnv = findEnv([
  '/home/ubuntu/aimanagement/server/.env',
  path.join(SCRIPT_DIR, '..', 'server', '.env'),
  '/home/ubuntu/server/.env',
]);

/** process.env gana; luego el .env del bot; luego el del middleware. */
function cfg(key, fallback) {
  return process.env[key] || botEnv.values[key] || serverEnv.values[key] || fallback;
}

const CHATWOOT_URL = (cfg('CHATWOOT_BASE_URL', 'http://172.17.0.1:3000') || '').replace(/\/+$/, '');
const CHATWOOT_TOKEN = cfg('CHATWOOT_ACCESS_TOKEN', '');
const ACCOUNT_ID = arg('account') || cfg('CHATWOOT_ACCOUNT_ID', '2');
const USER_TOKEN = cfg('CHATWOOT_USER_TOKEN', '');

const EVO_URL = (cfg('EVOLUTION_BASE_URL', 'http://localhost:8080') || '').replace(/\/+$/, '');
const EVO_KEY = cfg('EVOLUTION_API_KEY', '');
const EVO_INSTANCE = cfg('EVOLUTION_INSTANCE', 'ventas');

const DEEPSEEK_KEY = cfg('DEEPSEEK_API_KEY', '');

// ------------------------------------------------------------------ salidas

const problems = [];
let step = 0;

function check(label, status, detail) {
  step += 1;
  const icon = { ok: OK, bad: BAD, warn: WARN, skip: SKIP }[status];
  console.log('  ' + String(step).padStart(2) + '. ' + label.padEnd(42) + icon + ' ' + detail);
  if (status === 'bad') problems.push(label);
}

function note(text) {
  console.log('      └ ' + text);
}

function section(title) {
  console.log('\n' + title);
  console.log('─'.repeat(72));
}

/**
 * ¿Es una IPv4 enrutable en internet? Los nombres de host devuelven false: un
 * nombre de contenedor lo resuelve el DNS de Docker y es justo lo que se busca.
 */
function isPublicIp(url) {
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    return false;
  }

  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false;
  }

  const [a, b] = parts;
  const privada =
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254);

  return !privada;
}

// ------------------------------------------------------------------ sondeos

/** ¿Hay algo escuchando en ese puerto? */
function tcpProbe(host, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(2_000);
    socket.on('connect', () => done({ ok: true }));
    socket.on('timeout', () => done({ ok: false, error: 'timeout' }));
    socket.on('error', (error) => done({ ok: false, error: error.code || error.message }));
  });
}

/**
 * fetch que nunca lanza. Distingue "respondió con un código" de "no se pudo
 * llegar", que es justo la distinción que importa aquí.
 */
async function http(url, options = {}, timeoutMs = TIMEOUT_MS) {
  try {
    const response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(timeoutMs),
    });

    let body = null;
    const text = await response.text();
    try {
      body = JSON.parse(text);
    } catch {
      body = text.slice(0, 200);
    }

    return { reached: true, status: response.status, body };
  } catch (error) {
    const cause = error.cause?.code || error.code || error.name;
    return {
      reached: false,
      error: cause === 'TimeoutError' || error.name === 'TimeoutError' ? 'timeout' : cause,
    };
  }
}

// ================================================================== ejecución

console.log('');
console.log('  DIAGNÓSTICO DE SALIDA');
console.log('  bot → Chatwoot → Evolution → WhatsApp');

section('Configuración leída');
console.log('  .env del bot        ' + (botEnv.file || 'NO ENCONTRADO (usa --bot-dir)'));
console.log('  .env del middleware ' + (serverEnv.file || 'no encontrado (Evolution se omitirá)'));
console.log('  CHATWOOT_BASE_URL   ' + CHATWOOT_URL);
console.log('  cuenta de Chatwoot  ' + ACCOUNT_ID);
console.log('  instancia Evolution ' + EVO_INSTANCE + '  @  ' + EVO_URL);

section('Comprobaciones');

// --- 0. El propio bot ------------------------------------------------------

const botPort = await tcpProbe('127.0.0.1', 5000);
check(
  'Bot escuchando en :5000',
  botPort.ok ? 'ok' : 'bad',
  botPort.ok ? 'acepta conexiones' : botPort.error
);
if (!botPort.ok) note('el proceso está caído: pm2 status / pm2 restart ai-bot');

// --- 1. bot → Chatwoot: ¿se alcanza? --------------------------------------

const chatwootPing = await http(CHATWOOT_URL + '/');
check(
  'Chatwoot alcanzable desde el bot',
  chatwootPing.reached ? 'ok' : 'bad',
  chatwootPing.reached ? 'HTTP ' + chatwootPing.status : chatwootPing.error
);

let workingChatwootUrl = chatwootPing.reached ? CHATWOOT_URL : null;

if (!chatwootPing.reached) {
  note('probado: ' + CHATWOOT_URL);

  /*
   * El motivo habitual es que Docker recreó sus redes y la gateway cambió de
   * subred. En vez de decir "revisa la IP", se prueban las candidatas y se
   * dice cuál funciona.
   */
  const candidates = [
    'http://127.0.0.1:3000',
    'http://localhost:3000',
    'http://172.17.0.1:3000',
    'http://172.18.0.1:3000',
    'http://172.19.0.1:3000',
    'http://172.20.0.1:3000',
  ].filter((url) => url !== CHATWOOT_URL);

  for (const candidate of candidates) {
    // Timeout corto: son seis y casi todas van a estar muertas.
    const probe = await http(candidate + '/', {}, 2_500);
    if (probe.reached) {
      workingChatwootUrl = candidate;
      note('SÍ responde: ' + candidate + '  ← pon esto en CHATWOOT_BASE_URL');
      break;
    }
  }

  if (!workingChatwootUrl) note('ninguna URL alternativa respondió: ¿está Chatwoot levantado?');
}

// --- 2. bot → Chatwoot: ¿autoriza el token? -------------------------------

/** Busca una conversación real para probar el envío de verdad. */
function detectConversation() {
  const explicit = arg('conversation');
  if (explicit) return { id: explicit, source: 'argumento' };

  // El bot guarda chat_history:<id> por cada conversación que ha atendido.
  try {
    const output = execFileSync('redis-cli', ['--scan', '--pattern', 'chat_history:*'], {
      encoding: 'utf8',
      timeout: 3_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const first = output.split('\n').map((l) => l.trim()).filter(Boolean)[0];
    if (first) return { id: first.replace('chat_history:', ''), source: 'Redis' };
  } catch {
    // redis-cli puede no estar instalado. No es un fallo del sistema.
  }

  return null;
}

const conversation = detectConversation();
let sendWorks = null;

if (!CHATWOOT_TOKEN) {
  check('Token de Chatwoot', 'bad', 'CHATWOOT_ACCESS_TOKEN vacío');
} else if (!workingChatwootUrl) {
  check('Token de Chatwoot', 'skip', 'no se pudo llegar a Chatwoot');
} else if (!conversation) {
  check('Envío real de un mensaje', 'skip', 'sin conversación con la que probar');
  note('repite con: node diagnostico.mjs --conversation <id>');
  note('el id sale de la URL de Chatwoot o de los logs del bot');
} else {
  /*
   * Nota privada: mismo endpoint, misma autenticación y misma conversación que
   * un mensaje normal, pero invisible para el cliente. Es la única forma de
   * probar el token del AgentBot sin escribirle a alguien: Chatwoot valida ese
   * token contra la inbox de la conversación, así que no hay endpoint genérico
   * de "¿este token sirve?".
   */
  const result = await http(
    workingChatwootUrl +
      '/api/v1/accounts/' + ACCOUNT_ID +
      '/conversations/' + conversation.id + '/messages',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        api_access_token: CHATWOOT_TOKEN,
      },
      body: JSON.stringify({
        content: 'Diagnóstico del bot: nota privada de prueba. El cliente no la ve.',
        message_type: 'outgoing',
        private: true,
      }),
    }
  );

  if (!result.reached) {
    check('Envío real de un mensaje', 'bad', result.error);
  } else if (result.status === 401 || result.status === 403) {
    sendWorks = false;
    check('Envío real de un mensaje', 'bad', 'HTTP ' + result.status + ' — el token no autoriza');
    note('conversación #' + conversation.id + ' (' + conversation.source + ')');
    note('token vigente: docker exec chatwoot-rails-1 bundle exec rails runner \\');
    note('               "puts AgentBot.first.access_token.token"');
  } else if (result.status === 404) {
    check('Envío real de un mensaje', 'warn', '404 — esa conversación no existe');
    note('conversación #' + conversation.id + ' (' + conversation.source + ')');
    note('repite con una conversación viva: --conversation <id>');
  } else if (result.status >= 200 && result.status < 300) {
    sendWorks = true;
    check('Envío real de un mensaje', 'ok', 'Chatwoot aceptó la nota privada');
    note('conversación #' + conversation.id + ' — míralo en Chatwoot para confirmarlo');
  } else {
    check('Envío real de un mensaje', 'bad', 'HTTP ' + result.status);
    note(typeof result.body === 'string' ? result.body : JSON.stringify(result.body).slice(0, 160));
  }
}

// --- 3. Evolution: ¿está viva y vinculada? --------------------------------

let evoState = null;

if (!EVO_KEY) {
  check('Evolution API', 'skip', 'sin EVOLUTION_API_KEY');
  note('está en el .env del middleware; o pásala: EVOLUTION_API_KEY=... node diagnostico.mjs');
} else {
  const state = await http(EVO_URL + '/instance/connectionState/' + EVO_INSTANCE, {
    headers: { apikey: EVO_KEY },
  });

  if (!state.reached) {
    check('Evolution API alcanzable', 'bad', state.error);
  } else if (state.status !== 200) {
    check('Evolution API alcanzable', 'bad', 'HTTP ' + state.status);
    if (state.status === 401) note('EVOLUTION_API_KEY incorrecta');
    if (state.status === 404) note('la instancia "' + EVO_INSTANCE + '" no existe en Evolution');
  } else {
    evoState = state.body?.instance?.state ?? 'unknown';
    check(
      'Sesión de WhatsApp vinculada',
      evoState === 'open' ? 'ok' : 'bad',
      'state: ' + evoState
    );
    if (evoState !== 'open') {
      note('sin sesión no entra ni sale nada: vuelve a vincular desde el panel');
    }
  }

  // --- 4. Chatwoot ← Evolution: la integración ----------------------------

  const integration = await http(EVO_URL + '/chatwoot/find/' + EVO_INSTANCE, {
    headers: { apikey: EVO_KEY },
  });

  if (!integration.reached || integration.status !== 200) {
    check('Integración Chatwoot en Evolution', 'warn', integration.reached ? 'HTTP ' + integration.status : integration.error);
  } else {
    const conf = integration.body || {};
    const enabled = conf.enabled === true || conf.enabled === 'true';

    check(
      'Integración Chatwoot en Evolution',
      enabled ? 'ok' : 'bad',
      enabled ? 'activa' : 'DESACTIVADA (enabled: ' + conf.enabled + ')'
    );
    note('url que Evolution usa para Chatwoot: ' + (conf.url || '(vacía)'));
    note('cuenta: ' + (conf.accountId ?? conf.account_id ?? '?') +
         '   inbox: ' + (conf.nameInbox ?? conf.name_inbox ?? '?'));

    /*
     * Esa url la usa Evolution DESDE DENTRO de su contenedor. Una IP pública
     * ahí no funciona aunque el navegador la abra sin problema: AWS no hace
     * hairpin NAT hacia la IP pública de la propia instancia, así que la
     * conexión sale al gateway de internet y no vuelve. El síntoma es que
     * Chatwoot acepta los mensajes y no entrega ninguno.
     */
    if (isPublicIp(conf.url)) {
      check('URL de Chatwoot alcanzable por Evolution', 'bad', 'es una IP pública');
      note('desde el contenedor de Evolution eso no se alcanza (AWS no hace hairpin NAT)');
      note('usa el nombre del contenedor: http://chatwoot-rails-1:3000');
      note('receta completa en docs/06-troubleshooting.md');
    }

    /*
     * conversationPending gobierna el sentido de ENTRADA: si es false las
     * conversaciones nacen abiertas y Chatwoot no dispara el AgentBot. Se
     * comprueba igualmente porque es barato y porque una integración a medio
     * reconfigurar suele traer las dos cosas mal.
     */
    const pending = conf.conversationPending ?? conf.conversation_pending;
    if (pending === false || pending === 'false') {
      check('conversationPending', 'warn', 'false — el bot dejará de recibir mensajes nuevos');
      note('corregir con POST /chatwoot/set/' + EVO_INSTANCE + ' (ver docs/06)');
    }
  }
}

// --- 5. Buzones de Chatwoot (necesita token de usuario) -------------------

if (USER_TOKEN && workingChatwootUrl) {
  const inboxes = await http(
    workingChatwootUrl + '/api/v1/accounts/' + ACCOUNT_ID + '/inboxes',
    { headers: { api_access_token: USER_TOKEN } }
  );

  if (inboxes.reached && inboxes.status === 200) {
    const list = inboxes.body?.payload ?? [];
    const api = list.filter((i) => (i.channel_type || '').includes('Api'));

    check('Buzones de Chatwoot', api.length === 1 ? 'ok' : 'warn', api.length + ' buzón(es) de tipo API');
    for (const inbox of api) note('#' + inbox.id + '  ' + inbox.name + '  →  ' + (inbox.webhook_url || '(sin webhook)'));

    /*
     * Más de un buzón de API es la firma de una instancia recreada: Evolution
     * crea uno nuevo, los mensajes entran por ahí, y el AgentBot sigue colgado
     * del viejo.
     */
    if (api.length > 1) note('varios buzones API: comprueba de cuál cuelga el AgentBot');
  } else {
    check('Buzones de Chatwoot', 'warn', inboxes.reached ? 'HTTP ' + inboxes.status : inboxes.error);
  }
}

// --- 6. DeepSeek ----------------------------------------------------------

if (DEEPSEEK_KEY) {
  // /models lista modelos: no consume saldo de inferencia.
  const models = await http('https://api.deepseek.com/models', {
    headers: { Authorization: 'Bearer ' + DEEPSEEK_KEY },
  });
  check(
    'DeepSeek',
    models.reached && models.status === 200 ? 'ok' : 'warn',
    models.reached ? 'HTTP ' + models.status : models.error
  );
} else {
  check('DeepSeek', 'skip', 'sin DEEPSEEK_API_KEY');
}

// =================================================================== veredicto

section('Veredicto');

if (!botPort.ok) {
  console.log('  El bot no está corriendo. Arranca primero: pm2 restart ai-bot');
} else if (!workingChatwootUrl) {
  console.log('  El bot NO puede hablar con Chatwoot, y ninguna URL alternativa responde.');
  console.log('  Comprueba que Chatwoot esté levantado:  sudo docker ps | grep chatwoot');
} else if (workingChatwootUrl !== CHATWOOT_URL) {
  console.log('  CHATWOOT_BASE_URL apunta a una dirección muerta.');
  console.log('  El bot genera la respuesta y falla al entregarla — por eso recibe y no envía.');
  console.log('');
  console.log('    nano ' + (botEnv.file || BOT_DIR + '/.env'));
  console.log('    CHATWOOT_BASE_URL=' + workingChatwootUrl);
  console.log('    pm2 restart ai-bot --update-env');
} else if (sendWorks === false) {
  console.log('  Chatwoot responde pero rechaza el token del bot.');
  console.log('  Por eso fallan a la vez las respuestas y el traspaso a agente:');
  console.log('  los dos usan ese mismo token.');
  console.log('');
  console.log('    sudo docker exec chatwoot-rails-1 bundle exec rails runner \\');
  console.log('      "puts AgentBot.first.access_token.token"');
  console.log('    nano ' + (botEnv.file || BOT_DIR + '/.env') + '     # CHATWOOT_ACCESS_TOKEN=...');
  console.log('    pm2 restart ai-bot --update-env');
} else if (sendWorks === true && evoState && evoState !== 'open') {
  console.log('  Chatwoot acepta los mensajes del bot, pero la sesión de WhatsApp está');
  console.log('  caída (state: ' + evoState + '). Los mensajes se quedan en Chatwoot.');
  console.log('  Vuelve a vincular el teléfono desde el panel → Conexiones → QR.');
} else if (sendWorks === true) {
  console.log('  El bot SÍ consigue escribir en Chatwoot. El fallo está más adelante.');
  console.log('');
  console.log('  Abre la conversación en Chatwoot y mira si aparecen las respuestas:');
  console.log('');
  console.log('    aparecen en Chatwoot pero no en WhatsApp');
  console.log('      → el salto Chatwoot → Evolution. Revisa el buzón y su webhook_url');
  if (!USER_TOKEN) {
    console.log('        (relanza con CHATWOOT_USER_TOKEN=<token de usuario> para verlo aquí)');
  }
  console.log('');
  console.log('    tampoco aparecen en Chatwoot');
  console.log('      → el bot no está llegando a llamar a la API. Mira pm2 logs ai-bot');
  console.log('        buscando "❌ Error enviando"');
} else {
  console.log('  Faltó la prueba decisiva: el envío real.');
  console.log('  Relanza indicando una conversación cualquiera de Chatwoot:');
  console.log('');
  console.log('    node diagnostico.mjs --conversation <id>');
  console.log('');
  console.log('  (el id está en la URL de la conversación en Chatwoot)');
}

console.log('');
process.exit(problems.length > 0 ? 1 : 0);
