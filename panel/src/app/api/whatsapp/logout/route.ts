import { agentFetch, handleAgentRoute } from "@/lib/agent-api";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Desvincula WhatsApp.
 *
 * Deja al bot sin canal hasta que alguien escanee un QR nuevo, así que la
 * interfaz pide confirmación explícita antes de llegar aquí.
 */
export async function POST() {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  return handleAgentRoute(() =>
    agentFetch<{ ok: boolean }>("/api/whatsapp/logout", {
      method: "POST",
      timeoutMs: 25_000,
    })
  );
}
