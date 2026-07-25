import {
  EmbeddingError,
  embeddingInput,
  generateEmbedding,
} from "@/lib/embeddings";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const MAX_TITLE = 200;
const MAX_CONTENT = 8000;

/**
 * Valida lo mismo que los CHECK de la tabla.
 *
 * Comprobarlo aquí no es redundante: un fallo de constraint de Postgres llega
 * como un error opaco, mientras que esto le dice al operador qué campo arreglar.
 * La base de datos sigue siendo la autoridad final.
 */
function validate(body: unknown) {
  if (typeof body !== "object" || body === null) {
    return { error: "Cuerpo JSON inválido." };
  }

  const { title, content } = body as Record<string, unknown>;

  if (typeof title !== "string" || title.trim().length === 0) {
    return { error: "El título es obligatorio." };
  }
  if (title.trim().length > MAX_TITLE) {
    return { error: `El título no puede superar ${MAX_TITLE} caracteres.` };
  }
  if (typeof content !== "string" || content.trim().length === 0) {
    return { error: "El contenido es obligatorio." };
  }
  if (content.trim().length > MAX_CONTENT) {
    return { error: `El contenido no puede superar ${MAX_CONTENT} caracteres.` };
  }

  return { title: title.trim(), content: content.trim() };
}

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "No autenticado.", status: 401 }, { status: 401 });
  }

  // El embedding no se devuelve: son 1536 números por fila que la interfaz no
  // usa y que multiplicarían el peso de la respuesta.
  const { data, error } = await supabase
    .from("knowledge_snippets")
    .select("id, title, content, created_at, updated_at")
    .order("updated_at", { ascending: false });

  if (error) {
    return Response.json({ error: error.message, status: 500 }, { status: 500 });
  }

  return Response.json({ snippets: data });
}

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "No autenticado.", status: 401 }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Cuerpo JSON inválido.", status: 400 }, { status: 400 });
  }

  const parsed = validate(body);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error, status: 400 }, { status: 400 });
  }

  /*
   * El embedding se genera ANTES de insertar. Si se hiciera después, un fallo
   * de OpenAI dejaría el fragmento guardado pero sin vector: invisible para el
   * bot y sin nada en la interfaz que lo delate.
   */
  let embedding: number[];
  try {
    embedding = await generateEmbedding(embeddingInput(parsed.title, parsed.content));
  } catch (error) {
    if (error instanceof EmbeddingError) {
      return Response.json(
        { error: error.message, status: error.status },
        { status: error.status }
      );
    }
    throw error;
  }

  const { data, error } = await supabase
    .from("knowledge_snippets")
    .insert({ title: parsed.title, content: parsed.content, embedding })
    .select("id, title, content, created_at, updated_at")
    .single();

  if (error) {
    return Response.json({ error: error.message, status: 500 }, { status: 500 });
  }

  return Response.json(data, { status: 201 });
}
