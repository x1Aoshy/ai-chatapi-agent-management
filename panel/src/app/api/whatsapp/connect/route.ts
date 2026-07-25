import { agentFetch, handleAgentRoute } from "@/lib/agent-api";
import { requireUser } from "@/lib/auth";
import type { WhatsAppQr } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Pide a Evolution API un QR para vincular WhatsApp.
 *
 * El QR es, en la práctica, una sesión de WhatsApp: quien lo escanee primero se
 * queda con ella. Por eso pasa por el panel autenticado y nunca se cachea.
 */
export async function POST() {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  return handleAgentRoute(() =>
    agentFetch<WhatsAppQr>("/api/whatsapp/connect", {
      method: "POST",
      timeoutMs: 20_000,
    })
  );
}
