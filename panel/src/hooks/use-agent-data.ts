"use client";

import { useCallback, useEffect, useState } from "react";

export interface AgentDataState<T> {
  data: T | null;
  error: string | null;
  /** Solo la primera carga, cuando aún no hay nada que enseñar. */
  loading: boolean;
  /**
   * Hay una petición en vuelo teniendo ya datos en pantalla.
   *
   * Se separa de `loading` para que un refresco anime el botón en lugar de
   * sustituir la vista por un esqueleto: parpadear el contenido entero en cada
   * actualización es peor que no indicar nada.
   */
  refreshing: boolean;
  /** Código HTTP del último fallo; 503 significa "panel sin configurar". */
  status: number | null;
  /** `Date.now()` de la última respuesta correcta. */
  updatedAt: number | null;
}

export interface AgentData<T> extends AgentDataState<T> {
  refresh: () => void;
}

const INITIAL_STATE = {
  data: null,
  error: null,
  refreshing: false,
  status: null,
  updatedAt: null,
} as const;

/**
 * Lee un endpoint del panel, con refresco por sondeo opcional.
 *
 * Se usa sondeo en lugar de SSE/WebSocket a propósito: para el volumen de este
 * bot, un GET cada pocos segundos es suficiente y evita mantener conexiones
 * abiertas contra un servidor que va justo de memoria.
 *
 * Un fallo puntual conserva los datos anteriores en lugar de borrarlos. Un
 * panel de operación que se vacía porque un sondeo llegó tarde es peor que uno
 * que muestra el último estado conocido junto al aviso de que está caducado;
 * quien mira la pantalla necesita saber qué pasaba hace 15 segundos.
 */
export function useAgentData<T>(
  path: string,
  { pollMs, enabled = true }: { pollMs?: number; enabled?: boolean } = {}
): AgentData<T> {
  const [state, setState] = useState<AgentDataState<T>>({
    ...INITIAL_STATE,
    loading: enabled,
  });

  // Se incrementa para forzar una relectura desde fuera del efecto.
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback(() => {
    setState((current) => ({ ...current, refreshing: true }));
    setReloadToken((token) => token + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    // Descarta respuestas de peticiones ya obsoletas —y de este efecto una vez
    // desmontado— para que una respuesta lenta no pise a otra más reciente.
    let active = true;
    const controller = new AbortController();
    let interval: ReturnType<typeof setInterval> | undefined;
    // Evita que dos sondeos se solapen si el servidor tarda más que el intervalo.
    let inFlight = false;

    function stopPolling() {
      if (interval) {
        clearInterval(interval);
        interval = undefined;
      }
    }

    async function load() {
      if (inFlight) return;
      inFlight = true;

      // Marca el refresco solo si ya hay algo en pantalla; en la primera carga
      // manda `loading` y el esqueleto.
      setState((current) =>
        current.loading ? current : { ...current, refreshing: true }
      );

      try {
        const response = await fetch(path, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = await response.json().catch(() => null);

        if (!active) return;

        if (!response.ok) {
          setState((current) => ({
            ...current,
            // 503 es "panel sin configurar": ahí los datos previos no existen
            // y mantenerlos solo confundiría.
            data: response.status === 503 ? null : current.data,
            error: body?.error ?? `Error ${response.status}`,
            loading: false,
            refreshing: false,
            status: response.status,
          }));

          /*
           * 503 significa que el panel no tiene configurado AGENT_API_URL o
           * AGENT_API_KEY. Eso no cambia hasta un redeploy, así que seguir
           * sondeando solo gasta round-trips de autenticación contra Supabase
           * —dos por petición— para recibir siempre la misma respuesta.
           */
          if (response.status === 503) stopPolling();
          return;
        }

        setState({
          data: body as T,
          error: null,
          loading: false,
          refreshing: false,
          status: 200,
          updatedAt: Date.now(),
        });
      } catch (error) {
        // El abort al desmontar entra por aquí y no es un fallo que mostrar.
        if (!active || (error instanceof Error && error.name === "AbortError")) {
          return;
        }

        setState((current) => ({
          ...current,
          error: error instanceof Error ? error.message : "Fallo de red.",
          loading: false,
          refreshing: false,
          status: null,
        }));
      } finally {
        inFlight = false;
      }
    }

    // Sondear con la pestaña en segundo plano no aporta nada: nadie está
    // mirando y el navegador estrangula los timers igualmente.
    function tick() {
      if (document.visibilityState === "visible") void load();
    }

    function onVisibilityChange() {
      // Al volver a la pestaña, refresca ya en lugar de esperar al siguiente tick.
      if (document.visibilityState === "visible") void load();
    }

    void load();

    if (pollMs) {
      interval = setInterval(tick, pollMs);
      document.addEventListener("visibilitychange", onVisibilityChange);
    }

    return () => {
      active = false;
      controller.abort();
      stopPolling();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [path, pollMs, enabled, reloadToken]);

  return { ...state, refresh };
}
