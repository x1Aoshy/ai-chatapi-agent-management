import { agentFetch, handleAgentRoute } from "@/lib/agent-api";
import { requireUser } from "@/lib/auth";
import type { InstructionsResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  let versionId: unknown;
  try {
    ({ versionId } = await request.json());
  } catch {
    return Response.json(
      { error: "Cuerpo JSON inválido.", status: 400 },
      { status: 400 }
    );
  }

  // El id acaba formando parte de una ruta de archivo en el servidor. Se
  // restringe a un patrón conocido para que no pueda escapar del directorio
  // de versiones.
  if (typeof versionId !== "string" || !/^[\w.-]{1,64}$/.test(versionId)) {
    return Response.json(
      { error: "Identificador de versión inválido.", status: 400 },
      { status: 400 }
    );
  }

  return handleAgentRoute(() =>
    agentFetch<InstructionsResponse>("/api/instructions/rollback", {
      method: "POST",
      body: JSON.stringify({ versionId }),
      timeoutMs: 15_000,
    })
  );
}
