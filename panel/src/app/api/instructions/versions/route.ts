import { agentFetch, handleAgentRoute } from "@/lib/agent-api";
import { requireUser } from "@/lib/auth";
import type { InstructionVersion } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  return handleAgentRoute(() =>
    agentFetch<{ versions: InstructionVersion[] }>("/api/instructions/versions")
  );
}
