import OpenAI from "openai";

/**
 * Generación de embeddings. Solo servidor: OPENAI_API_KEY no lleva el prefijo
 * NEXT_PUBLIC_ y nunca debe llegar al navegador.
 */

export const EMBEDDING_MODEL = "text-embedding-3-small";

/**
 * Debe coincidir con la dimensión de la columna en Supabase.
 *
 * Cambiar de modelo obliga a recrear la columna y regenerar todos los vectores:
 * los embeddings de modelos distintos no son comparables entre sí, y mezclarlos
 * produce búsquedas silenciosamente incorrectas en vez de un error.
 */
export const EMBEDDING_DIMENSIONS = 1536;

export class EmbeddingError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "EmbeddingError";
  }
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new EmbeddingError(
      "Falta OPENAI_API_KEY. Sin ella no se pueden generar embeddings y el fragmento no sería localizable por el bot.",
      503
    );
  }

  const openai = new OpenAI({ apiKey, timeout: 15_000 });

  try {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
    });

    const embedding = response.data[0]?.embedding;

    if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new EmbeddingError(
        `El modelo devolvió ${embedding?.length ?? 0} dimensiones y la tabla espera ${EMBEDDING_DIMENSIONS}.`,
        502
      );
    }

    return embedding;
  } catch (error) {
    if (error instanceof EmbeddingError) throw error;

    const status =
      typeof error === "object" && error !== null && "status" in error
        ? Number((error as { status: unknown }).status)
        : 502;

    throw new EmbeddingError(
      status === 401
        ? "OpenAI rechazó la API key."
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
