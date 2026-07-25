import { AgentApiError, agentStream } from "@/lib/agent-api";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/*
 * Vercel corta las funciones al llegar a este límite. El navegador reconecta
 * solo, así que el efecto es un hueco de ~1s cada pocos minutos, no una
 * pérdida del stream. 300s es el máximo del plan Pro; en Hobby se recorta a 60
 * automáticamente, sin error.
 */
export const maxDuration = 300;

/**
 * Reenvía al navegador el stream de logs del middleware.
 *
 * El navegador se conecta aquí con EventSource, que no admite cabeceras
 * personalizadas — y precisamente por eso la API key se añade en este punto,
 * del lado del servidor, y nunca llega al cliente.
 */
export async function GET(request: Request) {
  const unauthorized = await requireUser();
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(request.url);

  const requested = Number(searchParams.get("lines") ?? 200);
  const lines = Number.isFinite(requested)
    ? Math.min(Math.max(Math.trunc(requested), 0), 500)
    : 200;

  const stream = searchParams.get("stream") === "err" ? "err" : "all";

  try {
    const upstream = await agentStream(
      `/api/logs/stream?lines=${lines}&stream=${stream}`,
      // Al cerrar el navegador la pestaña, se corta también la conexión con el
      // servidor en lugar de dejarla colgada consumiendo recursos allí.
      request.signal
    );

    return new Response(upstream.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    if (error instanceof AgentApiError) {
      return Response.json(
        { error: error.message, status: error.status },
        { status: error.status }
      );
    }

    return Response.json(
      { error: "No se pudo abrir el stream de logs.", status: 502 },
      { status: 502 }
    );
  }
}
