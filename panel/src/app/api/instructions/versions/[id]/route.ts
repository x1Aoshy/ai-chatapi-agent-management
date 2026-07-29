import { agentFetch, handleAgentRoute } from "@/lib/agent-api";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Formato de los nombres del historial: 20260725-034512.txt */
const VERSION_ID_RE = /^\d{8}-\d{6}\.txt$/;

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  const { id } = await params;

  // El identificador acaba formando parte de una ruta de disco en el servidor,
  // y aquí además se borra lo que apunte. El middleware vuelve a validarlo.
  if (!VERSION_ID_RE.test(id)) {
    return Response.json(
      { error: "Identificador de versión inválido.", status: 400 },
      { status: 400 }
    );
  }

  return handleAgentRoute(() =>
    agentFetch<{ ok: boolean }>(`/api/instructions/versions/${id}`, {
      method: "DELETE",
    })
  );
}
