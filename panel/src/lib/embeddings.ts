import OpenAI from "openai";

/**
 * Generación de embeddings, con proveedor intercambiable.
 *
 * Solo servidor: ninguna de estas claves lleva el prefijo NEXT_PUBLIC_ y
 * ninguna debe llegar al navegador.
 *
 * DeepSeek no publica API de embeddings, así que los vectores vienen de otro
 * sitio aunque la inferencia siga en DeepSeek. Se soportan dos:
 *
 *   openai  — text-embedding-3-small. ~$0.02 por millón de tokens.
 *   gemini  — text-embedding-004. Tiene nivel gratuito.
 *
 * Se elige con EMBEDDING_PROVIDER; por defecto, openai.
 */

/**
 * Dimensión de la columna `embedding` en Supabase.
 *
 * Gemini devuelve 768 y se rellena con ceros hasta 1536. No es un apaño: en
 * similitud coseno los ceros no aportan nada ni al producto escalar ni a las
 * normas, así que la similitud entre dos vectores rellenados es idéntica a la
 * de los originales. Permite cambiar de proveedor sin migrar la columna.
 */
export const EMBEDDING_DIMENSIONS = 1536;

type Provider = "openai" | "gemini";

function getProvider(): Provider {
  return process.env.EMBEDDING_PROVIDER === "gemini" ? "gemini" : "openai";
}

export const EMBEDDING_MODEL =
  getProvider() === "gemini" ? "text-embedding-004" : "text-embedding-3-small";

export class EmbeddingError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "EmbeddingError";
  }
}

/** Rellena con ceros hasta la dimensión de la columna. */
function pad(vector: number[]): number[] {
  if (vector.length === EMBEDDING_DIMENSIONS) return vector;

  if (vector.length > EMBEDDING_DIMENSIONS) {
    throw new EmbeddingError(
      `El modelo devolvió ${vector.length} dimensiones y la columna admite ${EMBEDDING_DIMENSIONS}.`,
      502
    );
  }

  return [...vector, ...new Array(EMBEDDING_DIMENSIONS - vector.length).fill(0)];
}

async function embedWithOpenAI(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new EmbeddingError(
      "Falta OPENAI_API_KEY. Defínela, o usa EMBEDDING_PROVIDER=gemini con GEMINI_API_KEY.",
      503
    );
  }

  const openai = new OpenAI({ apiKey, timeout: 15_000 });

  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });

  const embedding = response.data[0]?.embedding;
  if (!embedding) {
    throw new EmbeddingError("OpenAI no devolvió ningún vector.", 502);
  }

  return pad(embedding);
}

async function embedWithGemini(text: string): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new EmbeddingError(
      "Falta GEMINI_API_KEY. Consíguela gratis en aistudio.google.com.",
      503
    );
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "models/text-embedding-004",
        content: { parts: [{ text }] },
      }),
      signal: AbortSignal.timeout(15_000),
    }
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new EmbeddingError(
      response.status === 400 || response.status === 403
        ? "Google rechazó la API key."
        : `Gemini respondió ${response.status}. ${detail.slice(0, 150)}`,
      response.status
    );
  }

  const body = await response.json();
  const embedding = body?.embedding?.values;

  if (!Array.isArray(embedding)) {
    throw new EmbeddingError("Gemini no devolvió ningún vector.", 502);
  }

  return pad(embedding);
}

export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    return getProvider() === "gemini"
      ? await embedWithGemini(text)
      : await embedWithOpenAI(text);
  } catch (error) {
    if (error instanceof EmbeddingError) throw error;

    const status =
      typeof error === "object" && error !== null && "status" in error
        ? Number((error as { status: unknown }).status)
        : 502;

    throw new EmbeddingError(
      status === 401
        ? "El proveedor de embeddings rechazó la API key."
        : `No se pudo generar el embedding: ${
            error instanceof Error ? error.message : "error desconocido"
          }`,
      Number.isFinite(status) && status >= 400 ? status : 502
    );
  }
}

/** El texto que se vectoriza incluye el título: aporta contexto a la búsqueda. */
export function embeddingInput(title: string, content: string) {
  return `${title}\n\n${content}`;
}
