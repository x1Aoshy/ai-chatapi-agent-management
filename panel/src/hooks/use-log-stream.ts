"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { LogLine } from "@/lib/types";

export type StreamStatus = "connecting" | "live" | "reconnecting" | "paused" | "error";

/** Estado de la conexión, sin contar la pausa (que decide el operador). */
type ConnectionState = Exclude<StreamStatus, "paused">;

/** Tope del búfer en cliente: un bot hablador llenaría la memoria si no. */
const MAX_LINES = 2_000;
const BACKLOG_LINES = 200;

interface Options {
  stream: "all" | "err";
  enabled: boolean;
}

/**
 * Consume el stream de logs por Server-Sent Events.
 *
 * Se usa EventSource en lugar de fetch + ReadableStream porque reconecta solo
 * y el navegador gestiona el ciclo de vida. La reconexión se controla a mano
 * igualmente para poder pedir el historial únicamente en la primera conexión:
 * si no, cada corte de Vercel reinyectaría 200 líneas ya mostradas.
 */
export function useLogStream({ stream, enabled }: Options) {
  /*
   * Las líneas se guardan junto al stream del que salieron. Así, al cambiar de
   * pestaña, las de la anterior desaparecen derivándolo en render, sin un
   * efecto que las limpie: el contenido pertenece a un stream concreto y esa
   * relación queda explícita en el propio estado.
   */
  const [buffer, setBuffer] = useState<{ stream: string; lines: LogLine[] }>({
    stream,
    lines: [],
  });

  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [error, setError] = useState<string | null>(null);

  const sourceRef = useRef<EventSource | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptsRef = useRef(0);
  // Tras la primera conexión el historial ya está en pantalla.
  const hasBacklogRef = useRef(false);
  // Fuerza una reconexión inmediata desde la UI.
  const [reconnectToken, setReconnectToken] = useState(0);

  const reconnect = useCallback(() => {
    hasBacklogRef.current = false;
    attemptsRef.current = 0;
    setError(null);
    setConnection("connecting");
    setReconnectToken((token) => token + 1);
  }, []);

  useEffect(() => {
    if (!enabled) {
      sourceRef.current?.close();
      sourceRef.current = null;
      return;
    }

    let cancelled = false;
    // Al cambiar de stream hay que volver a pedir el historial del nuevo.
    hasBacklogRef.current = false;

    function connect() {
      if (cancelled) return;

      const backlog = hasBacklogRef.current ? 0 : BACKLOG_LINES;
      const source = new EventSource(
        `/api/logs/stream?lines=${backlog}&stream=${stream}`
      );
      sourceRef.current = source;

      source.addEventListener("backlog", (event) => {
        if (cancelled) return;
        attemptsRef.current = 0;
        hasBacklogRef.current = true;

        const payload = JSON.parse((event as MessageEvent).data);
        setBuffer({ stream, lines: payload.lines ?? [] });
        setError(null);
        setConnection("live");
      });

      source.addEventListener("lines", (event) => {
        if (cancelled) return;
        attemptsRef.current = 0;

        const payload = JSON.parse((event as MessageEvent).data);
        setConnection("live");
        setBuffer((current) => {
          // Descarta lo que llegue de una conexión del stream anterior.
          if (current.stream !== stream) return current;

          const next = [...current.lines, ...(payload.lines ?? [])];
          return {
            stream,
            lines: next.length > MAX_LINES ? next.slice(-MAX_LINES) : next,
          };
        });
      });

      source.addEventListener("error", (event) => {
        if (cancelled) return;

        // El servidor puede mandar un evento 'error' con detalle antes de
        // cerrar; se distingue del error genérico de conexión de EventSource.
        const data = (event as MessageEvent).data;
        if (typeof data === "string" && data.length > 0) {
          try {
            setError(JSON.parse(data).message ?? null);
          } catch {
            /* error de conexión sin cuerpo */
          }
        }
      });

      source.onerror = () => {
        if (cancelled) return;

        source.close();
        sourceRef.current = null;
        attemptsRef.current += 1;

        /*
         * Vercel corta la función por tiempo, así que las reconexiones son
         * normales y no deben mostrarse como fallo. Solo tras varios intentos
         * seguidos se asume que el problema es real.
         */
        if (attemptsRef.current >= 5) {
          setConnection("error");
          setError(
            (current) => current ?? "No se pudo mantener la conexión con el servidor."
          );
          return;
        }

        setConnection("reconnecting");

        const delay = Math.min(1000 * 2 ** (attemptsRef.current - 1), 8000);
        retryRef.current = setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (retryRef.current) clearTimeout(retryRef.current);
      sourceRef.current?.close();
      sourceRef.current = null;
    };
  }, [stream, enabled, reconnectToken]);

  return {
    lines: buffer.stream === stream ? buffer.lines : [],
    status: (enabled ? connection : "paused") as StreamStatus,
    error,
    reconnect,
  };
}
