import {
  EmbeddingError,
  embeddingInput,
  generateEmbedding,
} from "@/lib/embeddings";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_TITLE = 200;
const MAX_CONTENT = 8000;

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "No autenticado.", status: 401 }, { status: 401 });
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return Response.json({ error: "Identificador inválido.", status: 400 }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Cuerpo JSON inválido.", status: 400 }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const content = typeof body.content === "string" ? body.content.trim() : "";

  if (!title || title.length > MAX_TITLE) {
    return Response.json(
      { error: `El título es obligatorio y no puede superar ${MAX_TITLE} caracteres.`, status: 400 },
      { status: 400 }
    );
  }
  if (!content || content.length > MAX_CONTENT) {
    return Response.json(
      { error: `El contenido es obligatorio y no puede superar ${MAX_CONTENT} caracteres.`, status: 400 },
      { status: 400 }
    );
  }

  /*
   * Se regenera el embedding en cada edición aunque solo cambie una coma.
   * Comparar el texto anterior para decidir si hace falta sería una
   * optimización con un modo de fallo caro: si la comparación se equivoca, el
   * fragmento queda indexado por un contenido que ya no existe y el bot
   * recupera material equivocado sin que nada lo señale.
   */
  let embedding: number[];
  try {
    embedding = await generateEmbedding(embeddingInput(title, content));
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
    .update({ title, content, embedding })
    .eq("id", id)
    .select("id, title, content, created_at, updated_at")
    .single();

  if (error) {
    return Response.json({ error: error.message, status: 500 }, { status: 500 });
  }

  if (!data) {
    return Response.json({ error: "Ese fragmento no existe.", status: 404 }, { status: 404 });
  }

  return Response.json(data);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "No autenticado.", status: 401 }, { status: 401 });
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return Response.json({ error: "Identificador inválido.", status: 400 }, { status: 400 });
  }

  const { error } = await supabase.from("knowledge_snippets").delete().eq("id", id);

  if (error) {
    return Response.json({ error: error.message, status: 500 }, { status: 500 });
  }

  return Response.json({ ok: true });
}
