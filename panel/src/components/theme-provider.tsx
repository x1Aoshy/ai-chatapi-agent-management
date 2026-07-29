"use client";

import * as React from "react";

import { createPersistedStore } from "@/lib/persisted-store";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

/** Clave de localStorage. La comparte el script inline de `layout.tsx`. */
export const THEME_STORAGE_KEY = "aim.theme";

const themeStore = createPersistedStore<Theme>({
  key: THEME_STORAGE_KEY,
  fallback: "system",
  parse: (raw) =>
    raw === "light" || raw === "dark" || raw === "system" ? raw : "system",
  serialize: (theme) => theme,
});

/* --------------------------- Preferencia del sistema --------------------- */

let mediaQuery: MediaQueryList | null = null;

function getMediaQuery() {
  mediaQuery ??= window.matchMedia("(prefers-color-scheme: dark)");
  return mediaQuery;
}

function subscribeToSystem(onChange: () => void) {
  const query = getMediaQuery();
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getSystemTheme(): ResolvedTheme {
  return getMediaQuery().matches ? "dark" : "light";
}

/*
 * En el servidor no hay preferencia que consultar. Se asume oscuro porque es el
 * tema con el que nació el panel: si acierta, la hidratación no cambia nada.
 */
function getServerSystemTheme(): ResolvedTheme {
  return "dark";
}

/* ------------------------------- Contexto -------------------------------- */

interface ThemeContextValue {
  /** Lo que el usuario eligió, incluido "system". */
  theme: Theme;
  /** Lo que se está pintando ahora mismo. */
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  /** Alterna claro ↔ oscuro tomando como partida lo que se ve. */
  toggleTheme: () => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

/**
 * Provider de tema propio, sin `next-themes`.
 *
 * La dependencia no compensa para lo que hace falta aquí, y escribirlo a mano
 * deja el punto delicado a la vista: el flash. La clase la aplica el script
 * inline de `layout.tsx` antes del primer pintado; este provider solo la
 * mantiene sincronizada a partir de ahí.
 *
 * La preferencia se lee con `useSyncExternalStore` en vez de con un efecto, así
 * que el render del servidor y el primer render del cliente coinciden sin
 * necesidad de un estado "montado" y sin repintados en cascada.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = React.useSyncExternalStore(
    themeStore.subscribe,
    themeStore.getSnapshot,
    themeStore.getServerSnapshot
  );

  const systemTheme = React.useSyncExternalStore(
    subscribeToSystem,
    getSystemTheme,
    getServerSystemTheme
  );

  const resolvedTheme: ResolvedTheme = theme === "system" ? systemTheme : theme;

  // Único efecto del provider, y hace lo que los efectos deben hacer: llevar el
  // estado de React a un sistema externo, en este caso el <html>.
  React.useEffect(() => {
    const root = document.documentElement;

    root.classList.toggle("dark", resolvedTheme === "dark");
    root.classList.toggle("light", resolvedTheme === "light");
    root.style.colorScheme = resolvedTheme;
    root.dataset.theme = theme;
  }, [resolvedTheme, theme]);

  const value = React.useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme,
      setTheme: themeStore.set,
      toggleTheme: () =>
        themeStore.set(resolvedTheme === "dark" ? "light" : "dark"),
    }),
    [theme, resolvedTheme]
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme() {
  const context = React.useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme debe usarse dentro de <ThemeProvider>.");
  }

  return context;
}
