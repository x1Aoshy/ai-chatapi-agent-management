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

const EMBEDDING_MODEL = 'text-embedding-3-small';
const MATCH_COUNT = 3;
/*
 * Umbral de similitud coseno. Por debajo, el fragmento habla de otra cosa y
 * meterlo en el prompt es peor que no meter nada: empuja al modelo a
 * responder con material irrelevante en lugar de admitir que no sabe.
 */
const MATCH_THRESHOLD = 0.3;
const EMBEDDING_TIMEOUT_MS = 5_000;

const openaiKey = process.env.OPENAI_API_KEY;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const enabled = Boolean(openaiKey && supabaseUrl && supabaseKey);

// Cliente propio y separado del de DeepSeek: son proveedores distintos y el de
// DeepSeek apunta a otra baseURL.
const embeddings = enabled
  ? new OpenAI({ apiKey: openaiKey, timeout: EMBEDDING_TIMEOUT_MS })
  : null;

const supabase = enabled
  ? createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })
  : null;

if (enabled) {
  console.log('🧠 RAG activo (' + EMBEDDING_MODEL + ')');
} else {
  console.log('🧠 RAG inactivo: faltan OPENAI_API_KEY, SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
}

export function isKnowledgeEnabled() {
  return enabled;
}

/** Vector del texto, o null si no se pudo generar. */
async function embed(text) {
  try {
    const response = await embeddings.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
    });
    return response.data[0].embedding;
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
