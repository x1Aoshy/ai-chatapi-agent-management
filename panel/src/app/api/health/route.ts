import { agentFetch, handleAgentRoute } from "@/lib/agent-api";
import { requireUser } from "@/lib/auth";
import type { HealthResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  return handleAgentRoute(() =>
    agentFetch<HealthResponse>("/api/health", { timeoutMs: 8000 })
  );
}
