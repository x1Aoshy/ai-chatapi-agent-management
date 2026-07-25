"use client";

import { useCallback, useEffect, useState } from "react";

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

  // Se incrementa para forzar una relectura desde fuera del efecto.
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    // Descarta respuestas de peticiones ya obsoletas —y de este efecto una vez
    // desmontado— para que una respuesta lenta no pise a otra más reciente.
    let active = true;
    const controller = new AbortController();

    async function load() {
      try {
        const response = await fetch(path, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = await response.json().catch(() => null);

        if (!active) return;

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
        // El abort al desmontar entra por aquí y no es un fallo que mostrar.
        if (!active || (error instanceof Error && error.name === "AbortError")) {
          return;
        }

        setState({
          data: null,
          error: error instanceof Error ? error.message : "Fallo de red.",
          loading: false,
          status: null,
        });
      }
    }

    void load();

    const interval = pollMs ? setInterval(() => void load(), pollMs) : undefined;

    return () => {
      active = false;
      controller.abort();
      if (interval) clearInterval(interval);
    };
  }, [path, pollMs, enabled, reloadToken]);

  return { ...state, refresh };
}
