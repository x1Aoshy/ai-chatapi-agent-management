import { agentFetch, handleAgentRoute } from "@/lib/agent-api";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Reinicia el bot (`pm2 restart ai-bot --update-env`).
 *
 * El middleware debe invocar PM2 con execFile y argumentos fijos, nunca
 * componiendo una cadena de shell: este endpoint no acepta parámetros
 * precisamente para que no haya nada del usuario que pueda llegar al comando.
 */
export async function POST() {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  return handleAgentRoute(() =>
    agentFetch<{ ok: boolean; message?: string }>("/api/restart", {
      method: "POST",
      // El reinicio de PM2 más la reconexión a Redis tarda más que una lectura.
      timeoutMs: 30_000,
    })
  );
}
