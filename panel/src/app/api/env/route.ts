import { agentFetch, handleAgentRoute } from "@/lib/agent-api";
import { requireUser } from "@/lib/auth";
import type { EnvVar } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Lista blanca de variables editables desde el panel.
 *
 * Es deliberadamente corta. El destino de esta escritura es el .env del que
 * depende un proceso en ejecución, así que permitir claves arbitrarias
 * convertiría el endpoint en una vía para inyectar cualquier variable en el
 * entorno del bot. El middleware del servidor debe aplicar la misma lista:
 * esta comprobación es la primera barrera, no la única.
 */
const EDITABLE_KEYS = new Set([
  "DEEPSEEK_MODEL",
  "CHATWOOT_BASE_URL",
  "DEEPSEEK_API_KEY",
  "CHATWOOT_ACCESS_TOKEN",
]);

export async function GET() {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  return handleAgentRoute(() => agentFetch<{ vars: EnvVar[] }>("/api/env"));
}

export async function PUT(request: Request) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  let updates: unknown;
  try {
    ({ updates } = await request.json());
  } catch {
    return Response.json(
      { error: "Cuerpo JSON inválido.", status: 400 },
      { status: 400 }
    );
  }

  if (typeof updates !== "object" || updates === null || Array.isArray(updates)) {
    return Response.json(
      { error: "El campo 'updates' debe ser un objeto de clave/valor.", status: 400 },
      { status: 400 }
    );
  }

  const entries = Object.entries(updates as Record<string, unknown>);

  if (entries.length === 0) {
    return Response.json(
      { error: "No se ha enviado ninguna variable.", status: 400 },
      { status: 400 }
    );
  }

  for (const [key, value] of entries) {
    if (!EDITABLE_KEYS.has(key)) {
      return Response.json(
        { error: `La variable '${key}' no es editable desde el panel.`, status: 403 },
        { status: 403 }
      );
    }

    if (typeof value !== "string") {
      return Response.json(
        { error: `El valor de '${key}' debe ser una cadena.`, status: 400 },
        { status: 400 }
      );
    }

    // Un salto de línea partiría el .env en dos y permitiría declarar una
    // variable extra a continuación.
    if (/[\r\n]/.test(value)) {
      return Response.json(
        { error: `El valor de '${key}' no puede contener saltos de línea.`, status: 400 },
        { status: 400 }
      );
    }
  }

  return handleAgentRoute(() =>
    agentFetch<{ vars: EnvVar[] }>("/api/env", {
      method: "PUT",
      body: JSON.stringify({ updates }),
      timeoutMs: 15_000,
    })
  );
}
