import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

/**
 * Recuperación de contexto (RAG) para el bot.
 *
 * PRINCIPIO INNEGOCIABLE: nada de aquí puede impedir que el bot conteste. Un
 * fallo del embedding, de Supabase o de la red degrada la respuesta —el bot
 * usará solo instrucciones.txt— pero jamás deja a un cliente sin respuesta en
 * WhatsApp. Por eso todo devuelve [] en lugar de lanzar.
 */

/*
 * Proveedor de embeddings, intercambiable. DeepSeek no publica API de
 * embeddings, así que los vectores vienen de otro sitio aunque la inferencia
 * siga en DeepSeek.
 *
 *   openai  — text-embedding-3-small, ~$0.02 por millón de tokens
 *   gemini  — text-embedding-004, con nivel gratuito
 *
 * IMPORTANTE: los vectores de proveedores distintos NO son comparables entre
 * sí. Cambiar de proveedor obliga a regenerar todos los fragmentos desde el
 * panel; si no, la búsqueda devuelve resultados incorrectos en silencio.
 */
const PROVIDER = process.env.EMBEDDING_PROVIDER === 'gemini' ? 'gemini' : 'openai';
const EMBEDDING_MODEL =
  PROVIDER === 'gemini' ? 'text-embedding-004' : 'text-embedding-3-small';

/*
 * Dimensión de la columna en Supabase. Gemini devuelve 768 y se rellena con
 * ceros: en similitud coseno los ceros no aportan nada al producto escalar ni
 * a las normas, así que la similitud no cambia y no hace falta migrar.
 */
const DIMENSIONS = 1536;
const MATCH_COUNT = 3;
/*
 * Umbral de similitud coseno. Por debajo, el fragmento habla de otra cosa y
 * meterlo en el prompt es peor que no meter nada: empuja al modelo a
 * responder con material irrelevante en lugar de admitir que no sabe.
 */
const MATCH_THRESHOLD = 0.3;
const EMBEDDING_TIMEOUT_MS = 5_000;

const openaiKey = process.env.OPENAI_API_KEY;
const geminiKey = process.env.GEMINI_API_KEY;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const providerKey = PROVIDER === 'gemini' ? geminiKey : openaiKey;
const enabled = Boolean(providerKey && supabaseUrl && supabaseKey);

// Cliente propio y separado del de DeepSeek: son proveedores distintos y el de
// DeepSeek apunta a otra baseURL.
const embeddings =
  enabled && PROVIDER === 'openai'
    ? new OpenAI({ apiKey: openaiKey, timeout: EMBEDDING_TIMEOUT_MS })
    : null;

const supabase = enabled
  ? createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })
  : null;

if (enabled) {
  console.log('🧠 RAG activo (' + PROVIDER + '/' + EMBEDDING_MODEL + ')');
} else {
  const falta = [
    !providerKey && (PROVIDER === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY'),
    !supabaseUrl && 'SUPABASE_URL',
    !supabaseKey && 'SUPABASE_SERVICE_ROLE_KEY',
  ].filter(Boolean);
  console.log('🧠 RAG inactivo: falta ' + falta.join(', '));
}

export function isKnowledgeEnabled() {
  return enabled;
}

/** Rellena con ceros hasta la dimensión de la columna. */
function pad(vector) {
  if (vector.length >= DIMENSIONS) return vector.slice(0, DIMENSIONS);
  return vector.concat(new Array(DIMENSIONS - vector.length).fill(0));
}

/** Vector del texto, o null si no se pudo generar. */
async function embed(text) {
  try {
    if (PROVIDER === 'gemini') {
      const response = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=' +
          geminiKey,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'models/text-embedding-004',
            content: { parts: [{ text }] },
          }),
          signal: AbortSignal.timeout(EMBEDDING_TIMEOUT_MS),
        }
      );

      if (!response.ok) {
        console.error('⚠️ Gemini respondió', response.status);
        return null;
      }

      const body = await response.json();
      const values = body?.embedding?.values;
      return Array.isArray(values) ? pad(values) : null;
    }

    const response = await embeddings.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
    });
    return pad(response.data[0].embedding);
  } catch (error) {
    console.error('⚠️ Embedding falló:', error.message);
    return null;
  }
}

/** Fragmentos relevantes para el mensaje. Array vacío si algo falla. */
export async function searchKnowledge(message) {
  if (!enabled) return [];

  const vector = await embed(message);
  if (!vector) return [];

  try {
    const { data, error } = await supabase.rpc('match_snippets', {
      query_embedding: vector,
      match_count: MATCH_COUNT,
      match_threshold: MATCH_THRESHOLD,
    });

    if (error) {
      console.error('⚠️ Búsqueda de conocimiento falló:', error.message);
      return [];
    }

    return data ?? [];
  } catch (error) {
    console.error('⚠️ Supabase no responde:', error.message);
    return [];
  }
}

/**
 * Añade los fragmentos al prompt de sistema.
 *
 * El bloque se marca explícitamente y se acompaña de una instrucción: sin ella
 * el modelo tiende a tratar el contexto como si fuera cierto por completo y a
 * rellenar los huecos inventando. Decirle que puede no haber respuesta ahí es
 * lo que evita que se invente precios o productos.
 */
export function buildSystemPrompt(baseInstructions, snippets) {
  if (snippets.length === 0) return baseInstructions;

  const context = snippets
    .map((s, index) => `[${index + 1}] ${s.title}\n${s.content}`)
    .join('\n\n');

  return (
    baseInstructions +
    '\n\n--- CONTEXTO ADICIONAL ---\n' +
    'Información de la base de conocimiento, seleccionada por relevancia para ' +
    'este mensaje. Úsala si responde a lo que pregunta el cliente.\n' +
    'Si no contiene la respuesta, ignórala y sigue las reglas de arriba. ' +
    'NUNCA inventes datos que no estén ni aquí ni en tus instrucciones.\n\n' +
    context +
    '\n--- FIN DEL CONTEXTO ---'
  );
}
