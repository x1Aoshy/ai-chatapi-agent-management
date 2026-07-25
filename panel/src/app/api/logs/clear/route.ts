import { agentFetch, handleAgentRoute } from "@/lib/agent-api";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Vacía los logs del bot (`pm2 flush`).
 *
 * PM2 trunca los archivos, no los archiva: no hay deshacer. La interfaz pide
 * confirmación antes de llegar aquí.
 */
export async function POST() {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  return handleAgentRoute(() =>
    agentFetch<{ ok: boolean }>("/api/logs/clear", {
      method: "POST",
      timeoutMs: 20_000,
    })
  );
}
