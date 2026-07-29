"use client";

import { useSyncExternalStore } from "react";

/*
 * Reloj compartido: un solo `setInterval` para todos los componentes que
 * muestran antigüedades ("actualizado hace 8s"). Con un intervalo por
 * componente, cinco contadores en pantalla son cinco temporizadores
 * desincronizados que repintan en momentos distintos.
 *
 * El temporizador solo existe mientras haya alguien suscrito: al desmontarse el
 * último consumidor se apaga, y no deja un timer corriendo en una pestaña
 * abierta toda la tarde.
 */
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let now = 0;

function subscribe(onChange: () => void) {
  listeners.add(onChange);

  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      for (const listener of listeners) listener();
    }, 1000);
  }

  return () => {
    listeners.delete(onChange);

    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/**
 * `Date.now()` con precisión de segundo, o `0` mientras se renderiza en el
 * servidor —donde no hay reloj del navegador que valga— y hasta la primera
 * suscripción. Quien lo use debe tratar el 0 como "todavía no se sabe".
 */
export function useNow() {
  return useSyncExternalStore(
    subscribe,
    () => now,
    () => 0
  );
}
