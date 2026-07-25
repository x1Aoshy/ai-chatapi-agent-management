import { agentFetch, handleAgentRoute } from "@/lib/agent-api";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Borra la memoria de una conversación (`DEL chat_history:{id}`).
 *
 * En Next.js 15 los params de ruta son asíncronos.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  const { id } = await params;

  // El id se concatena a una key de Redis en el servidor. Los ids de
  // conversación de Chatwoot son enteros, así que cualquier otra cosa se
  // rechaza antes de salir del panel.
  if (!/^\d{1,12}$/.test(id)) {
    return Response.json(
      { error: "Identificador de conversación inválido.", status: 400 },
      { status: 400 }
    );
  }

  return handleAgentRoute(() =>
    agentFetch<{ ok: boolean }>(`/api/redis/conversations/${id}`, {
      method: "DELETE",
    })
  );
}
