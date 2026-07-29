import { agentFetch, handleAgentRoute } from "@/lib/agent-api";
import { requireUser } from "@/lib/auth";
import type { LogsResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

/** El middleware corta en 500; se replica aquí para no pedirle lo imposible. */
const MAX_LINES = 500;
const DEFAULT_LINES = 200;

export async function GET(request: Request) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  const params = new URL(request.url).searchParams;

  /*
   * Los parámetros se reconstruyen en lugar de reenviarse tal cual: lo que
   * llega del navegador no puede convertirse en parte de la URL que se pide al
   * middleware con la API key puesta.
   */
  const requested = Number(params.get("lines"));
  const lines = Number.isFinite(requested)
    ? Math.min(Math.max(Math.trunc(requested), 1), MAX_LINES)
    : DEFAULT_LINES;

  const query = new URLSearchParams({ lines: String(lines) });
  if (params.get("stream") === "err") query.set("stream", "err");

  return handleAgentRoute(() =>
    agentFetch<LogsResponse>(`/api/logs?${query.toString()}`, {
      // Leer medio megabyte de log del disco puede pasar de los 10s por defecto.
      timeoutMs: 15_000,
    })
  );
}
