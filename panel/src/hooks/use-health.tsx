"use client";

import * as React from "react";

import { useAgentData, type AgentData } from "@/hooks/use-agent-data";
import type { HealthResponse } from "@/lib/types";

/** Un sondeo cada 15 s: suficiente para un panel que se mira, no se vigila. */
export const HEALTH_POLL_MS = 15_000;

const HealthContext = React.createContext<AgentData<HealthResponse> | null>(null);

/**
 * Un único sondeo de `/api/health` para todo el shell autenticado.
 *
 * Lo consumen la barra lateral (el punto de estado siempre visible), el
 * dashboard y la página de conexiones. Antes cada uno pedía por su cuenta, así
 * que estar en Conexiones costaba dos peticiones idénticas cada 15 segundos —y
 * cada una arrastra dos verificaciones de sesión contra Supabase.
 */
export function HealthProvider({ children }: { children: React.ReactNode }) {
  const health = useAgentData<HealthResponse>("/api/health", {
    pollMs: HEALTH_POLL_MS,
  });

  return <HealthContext value={health}>{children}</HealthContext>;
}

export function useHealth() {
  const context = React.useContext(HealthContext);

  if (!context) {
    throw new Error("useHealth debe usarse dentro de <HealthProvider>.");
  }

  return context;
}

/**
 * Resumen del estado global en una sola palabra.
 *
 * Un servicio caído manda sobre el resto: el peor estado es el que se muestra,
 * porque un panel que dice "todo bien" con Redis caído no sirve de nada.
 */
export function summarizeHealth(health: AgentData<HealthResponse>) {
  if (health.loading) return "loading" as const;
  if (health.error && !health.data) return "unreachable" as const;

  const services = health.data?.services ?? [];

  if (services.some((service) => service.status === "offline")) {
    return "down" as const;
  }

  if (
    services.some(
      (service) => service.status === "degraded" || service.status === "unknown"
    )
  ) {
    return "degraded" as const;
  }

  return services.length > 0 ? ("up" as const) : ("unreachable" as const);
}

export const HEALTH_SUMMARY_LABELS = {
  loading: "Comprobando…",
  unreachable: "Sin conexión",
  down: "Servicio caído",
  degraded: "Degradado",
  up: "Todo operativo",
} as const;
