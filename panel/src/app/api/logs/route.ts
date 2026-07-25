import { agentFetch, handleAgentRoute } from "@/lib/agent-api";
import { requireUser } from "@/lib/auth";
import type { LogsResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

const DEFAULT_LINES = 100;
const MAX_LINES = 500;

export async function GET(request: Request) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(request.url);

  const requested = Number(searchParams.get("lines") ?? DEFAULT_LINES);
  const lines = Number.isFinite(requested)
    ? Math.min(Math.max(Math.trunc(requested), 1), MAX_LINES)
    : DEFAULT_LINES;

  const stream = searchParams.get("stream") === "err" ? "err" : "all";

  return handleAgentRoute(() =>
    agentFetch<LogsResponse>(`/api/logs?lines=${lines}&stream=${stream}`)
  );
}
