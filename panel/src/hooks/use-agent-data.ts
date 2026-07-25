"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface AgentDataState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** Código HTTP del último fallo; 503 significa "panel sin configurar". */
  status: number | null;
}

/**
 * Lee un endpoint del panel, con refresco por sondeo opcional.
 *
 * Se usa sondeo en lugar de SSE/WebSocket a propósito: para el volumen de este
 * bot, un GET cada pocos segundos es suficiente y evita mantener conexiones
 * abiertas contra un servidor que va justo de memoria.
 */
export function useAgentData<T>(
  path: string,
  { pollMs, enabled = true }: { pollMs?: number; enabled?: boolean } = {}
) {
  const [state, setState] = useState<AgentDataState<T>>({
    data: null,
    error: null,
    loading: enabled,
    status: null,
  });

  // Evita que una respuesta lenta de una petición ya obsoleta pise a una más
  // reciente.
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++requestId.current;

    try {
      const response = await fetch(path, { cache: "no-store" });
      const body = await response.json().catch(() => null);

      if (id !== requestId.current) return;

      if (!response.ok) {
        setState({
          data: null,
          error: body?.error ?? `Error ${response.status}`,
          loading: false,
          status: response.status,
        });
        return;
      }

      setState({ data: body as T, error: null, loading: false, status: 200 });
    } catch (error) {
      if (id !== requestId.current) return;

      setState({
        data: null,
        error: error instanceof Error ? error.message : "Fallo de red.",
        loading: false,
        status: null,
      });
    }
  }, [path]);

  useEffect(() => {
    if (!enabled) return;

    refresh();

    if (!pollMs) return;

    const interval = setInterval(refresh, pollMs);
    return () => clearInterval(interval);
  }, [refresh, pollMs, enabled]);

  return { ...state, refresh };
}
