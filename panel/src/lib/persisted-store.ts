/**
 * Preferencia de interfaz guardada en `localStorage`, expuesta como store
 * externo para `useSyncExternalStore`.
 *
 * Es la forma correcta de leer algo que vive fuera de React: leerlo en un
 * efecto y volcarlo con `setState` provoca un render de más en cada montaje y
 * deja un fotograma con el valor por defecto. Con un store externo, React usa
 * el valor del servidor mientras hidrata y salta al real en cuanto se suscribe.
 *
 * El evento `storage` solo llega a las *otras* pestañas, que es justo lo que
 * hace falta para que dos ventanas del panel no se contradigan.
 */
export interface PersistedStore<T> {
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => T;
  getServerSnapshot: () => T;
  set: (value: T) => void;
}

export function createPersistedStore<T>({
  key,
  fallback,
  parse,
  serialize,
}: {
  key: string;
  /** Valor en el servidor y cuando no hay nada guardado o legible. */
  fallback: T;
  parse: (raw: string | null) => T;
  serialize: (value: T) => string;
}): PersistedStore<T> {
  const listeners = new Set<() => void>();
  // `undefined` significa "todavía no leído del almacenamiento".
  let cache: T | undefined;

  function read(): T {
    try {
      return parse(window.localStorage.getItem(key));
    } catch {
      // Safari en modo privado lanza al tocar localStorage: la preferencia no
      // persistirá, pero la sesión funciona igual.
      return fallback;
    }
  }

  function emit() {
    for (const listener of listeners) listener();
  }

  function onStorage(event: StorageEvent) {
    if (event.key !== key) return;

    cache = read();
    emit();
  }

  return {
    subscribe(onChange) {
      listeners.add(onChange);

      if (listeners.size === 1) {
        cache = read();
        window.addEventListener("storage", onStorage);
      }

      return () => {
        listeners.delete(onChange);
        if (listeners.size === 0) {
          window.removeEventListener("storage", onStorage);
        }
      };
    },

    getSnapshot() {
      // El valor se cachea porque `getSnapshot` se llama en cada render y debe
      // devolver algo estable: leer del almacenamiento cada vez es lento y, con
      // valores no primitivos, provocaría un bucle de renders.
      if (cache === undefined) cache = read();
      return cache;
    },

    getServerSnapshot() {
      return fallback;
    },

    set(value) {
      cache = value;

      try {
        window.localStorage.setItem(key, serialize(value));
      } catch {
        // Ver `read`.
      }

      emit();
    },
  };
}
