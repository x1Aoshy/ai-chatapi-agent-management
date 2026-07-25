"use client";

import { RefreshCw } from "lucide-react";

import { NotConfigured } from "@/components/not-configured";
import { StatusDot, STATUS_LABELS } from "@/components/status-dot";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAgentData } from "@/hooks/use-agent-data";
import { cn } from "@/lib/utils";
import type { HealthResponse, ServiceHealth } from "@/lib/types";

const POLL_MS = 15_000;

function formatUptime(ms?: number) {
  if (!ms || ms < 0) return "—";

  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;

  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  accent?: string;
}) {
  return (
    <div className="border border-border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 font-mono text-xl tabular-nums tracking-tight",
          accent
        )}
      >
        {value}
      </p>
    </div>
  );
}

/**
 * Un servicio como baldosa.
 *
 * Antes era una lista de cinco filas a ancho completo: mucho recorrido
 * vertical para leer cinco estados que caben de un vistazo en rejilla.
 */
function ServiceTile({ service }: { service: ServiceHealth }) {
  return (
    <div className="flex items-start justify-between gap-3 border border-border p-4">
      <div className="min-w-0 space-y-1">
        <p className="truncate text-sm">{service.name}</p>
        {service.detail ? (
          <p
            className="truncate font-mono text-[10px] text-muted-foreground"
            title={service.detail}
          >
            {service.detail}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="inline-flex items-center gap-1.5">
          <StatusDot status={service.status} />
          <span
            className={cn(
              "text-xs",
              service.status === "online" ? "text-online" : "text-muted-foreground"
            )}
          >
            {STATUS_LABELS[service.status]}
          </span>
        </span>
        {typeof service.latencyMs === "number" ? (
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground/60">
            {service.latencyMs} ms
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function DashboardContent() {
  const { data, error, loading, refreshing, status, refresh } =
    useAgentData<HealthResponse>("/api/health", { pollMs: POLL_MS });

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-20" />
          ))}
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-20" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <NotConfigured error={status === 503 ? null : error} />
        <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
          <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
          Reintentar
        </Button>
      </div>
    );
  }

  if (!data) return null;

  const { bot, services, checkedAt } = data;
  const down = services.filter((s) => s.status !== "online").length;

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric
          label="Proceso del bot"
          value={bot.status === "online" ? "Online" : "Caído"}
          accent={bot.status === "online" ? "text-online" : "text-destructive"}
        />
        <Metric label="Uptime" value={formatUptime(bot.uptimeMs)} />
        <Metric label="Reinicios" value={bot.restarts ?? "—"} />
        <Metric
          label="Memoria"
          value={bot.memoryMb ? `${Math.round(bot.memoryMb)} MB` : "—"}
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-baseline gap-3">
            <h2 className="text-sm font-medium">Servicios</h2>
            <span
              className={cn(
                "text-xs",
                down === 0 ? "text-muted-foreground" : "text-destructive"
              )}
            >
              {down === 0
                ? "todos operativos"
                : `${down} con incidencias`}
            </span>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={refresh}
            disabled={refreshing}
          >
            <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
            Actualizar
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {services.map((service) => (
            <ServiceTile key={service.id} service={service} />
          ))}
        </div>
      </section>

      <p className="text-xs text-muted-foreground">
        Última comprobación{" "}
        <span className="font-mono">
          {checkedAt ? new Date(checkedAt).toLocaleTimeString("es") : "—"}
        </span>
        {" · "}cada {POLL_MS / 1000}s
        {bot.model ? (
          <>
            {" · "}modelo <span className="font-mono">{bot.model}</span>
          </>
        ) : null}
      </p>
    </div>
  );
}
