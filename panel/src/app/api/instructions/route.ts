import { agentFetch, handleAgentRoute } from "@/lib/agent-api";
import { requireUser } from "@/lib/auth";
import type { InstructionsResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Límite defensivo: el prompt del bot son unos pocos KB, no megabytes. */
const MAX_BYTES = 128 * 1024;

export async function GET() {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  return handleAgentRoute(() =>
    agentFetch<InstructionsResponse>("/api/instructions")
  );
}

export async function PUT(request: Request) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  let content: unknown;
  try {
    ({ content } = await request.json());
  } catch {
    return Response.json(
      { error: "Cuerpo JSON inválido.", status: 400 },
      { status: 400 }
    );
  }

  if (typeof content !== "string") {
    return Response.json(
      { error: "El campo 'content' debe ser una cadena.", status: 400 },
      { status: 400 }
    );
  }

  // Guardar un prompt vacío deja al bot sin instrucciones y responde con la
  // personalidad por defecto de index.js. Casi siempre es un error del editor.
  if (content.trim().length === 0) {
    return Response.json(
      { error: "Las instrucciones no pueden quedar vacías.", status: 400 },
      { status: 400 }
    );
  }

  if (Buffer.byteLength(content, "utf8") > MAX_BYTES) {
    return Response.json(
      { error: `Las instrucciones superan el límite de ${MAX_BYTES / 1024} KB.`, status: 413 },
      { status: 413 }
    );
  }

  return handleAgentRoute(() =>
    agentFetch<InstructionsResponse>("/api/instructions", {
      method: "PUT",
      body: JSON.stringify({ content }),
      timeoutMs: 15_000,
    })
  );
}
