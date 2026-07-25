/**
 * Cliente del middleware del servidor AWS.
 *
 * SOLO puede importarse desde código de servidor (route handlers, Server
 * Components). Lee AGENT_API_KEY, que no lleva el prefijo NEXT_PUBLIC_ y por
 * tanto nunca llega al bundle del navegador. Si este módulo acabara importado
 * desde un componente cliente, el build de Next.js fallaría al no encontrar la
 * variable — que es justo el comportamiento que queremos.
 */

export class AgentApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = "AgentApiError";
  }
}

interface AgentConfig {
  baseUrl: string;
  apiKey: string;
}

function getConfig(): AgentConfig {
  const baseUrl = process.env.AGENT_API_URL;
  const apiKey = process.env.AGENT_API_KEY;

  if (!baseUrl || !apiKey) {
    throw new AgentApiError(
      "El panel no está conectado al servidor. Define AGENT_API_URL y AGENT_API_KEY.",
      503
    );
  }

  return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey };
}

/** Un panel de operación no debe quedarse colgado esperando a un host caído. */
const DEFAULT_TIMEOUT_MS = 10_000;

export async function agentFetch<T>(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...requestInit } = init;
  const { baseUrl, apiKey } = getConfig();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...requestInit,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...requestInit.headers,
      },
      // Un panel de estado no puede servir datos cacheados.
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new AgentApiError(
        body?.slice(0, 300) || `El servidor respondió ${response.status}`,
        response.status
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof AgentApiError) throw error;

    if (error instanceof Error && error.name === "AbortError") {
      throw new AgentApiError(
        `El servidor no respondió en ${timeoutMs / 1000}s.`,
        504,
        error
      );
    }

    throw new AgentApiError(
      error instanceof Error ? error.message : "Fallo de red contra el servidor.",
      502,
      error
    );
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Abre un stream contra el middleware y devuelve la respuesta sin parsear.
 *
 * Se usa para Server-Sent Events: agentFetch consume el cuerpo entero con
 * .json(), lo que con un stream infinito no terminaría nunca. Aquí el cuerpo
 * se reenvía tal cual al navegador.
 *
 * Sin timeout a propósito: la conexión debe durar lo máximo que permita la
 * plataforma, no diez segundos.
 */
export async function agentStream(
  path: string,
  signal?: AbortSignal
): Promise<Response> {
  const { baseUrl, apiKey } = getConfig();

  const response = await fetch(`${baseUrl}${path}`, {
    signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "text/event-stream",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new AgentApiError(
      body?.slice(0, 300) || `El servidor respondió ${response.status}`,
      response.status
    );
  }

  if (!response.body) {
    throw new AgentApiError("El servidor no devolvió un stream.", 502);
  }

  return response;
}

/**
 * Envuelve un route handler para que cualquier AgentApiError salga como una
 * respuesta JSON con su código real en lugar de un 500 genérico. Así la UI
 * puede distinguir "no configurado" (503) de "servidor caído" (502).
 */
export async function handleAgentRoute<T>(
  fn: () => Promise<T>
): Promise<Response> {
  try {
    const data = await fn();
    return Response.json(data ?? { ok: true });
  } catch (error) {
    if (error instanceof AgentApiError) {
      return Response.json(
        { error: error.message, status: error.status },
        { status: error.status }
      );
    }

    console.error("[agent-api] error inesperado:", error);
    return Response.json(
      { error: "Error interno del panel.", status: 500 },
      { status: 500 }
    );
  }
}

/** True si el panel tiene configurada la conexión con el servidor. */
export function isAgentConfigured() {
  return Boolean(process.env.AGENT_API_URL && process.env.AGENT_API_KEY);
}
