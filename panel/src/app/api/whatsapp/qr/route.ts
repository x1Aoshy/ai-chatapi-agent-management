import { agentFetch, handleAgentRoute } from "@/lib/agent-api";
import { requireUser } from "@/lib/auth";
import type { WhatsAppQr } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  return handleAgentRoute(() =>
    agentFetch<WhatsAppQr>("/api/whatsapp/qr", { timeoutMs: 25_000 })
  );
}
