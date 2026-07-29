import { agentFetch, handleAgentRoute } from "@/lib/agent-api";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Reinicia la instancia de Evolution.
 *
 * Remedio para cuando el QR deja de vincular: Evolution agota su cupo de
 * códigos por sesión de emparejamiento y sigue devolviendo uno inservible.
 */
export async function POST() {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  return handleAgentRoute(() =>
    agentFetch<{ ok: boolean }>("/api/whatsapp/restart", {
      method: "POST",
      timeoutMs: 25_000,
    })
  );
}
