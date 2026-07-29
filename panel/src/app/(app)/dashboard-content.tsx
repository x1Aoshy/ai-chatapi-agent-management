"use client";

import { Activity, RefreshCw } from "lucide-react";

import { LastUpdated } from "@/components/last-updated";
import { NotConfigured } from "@/components/not-configured";
import { StatusDot, STATUS_LABELS } from "@/components/status-dot";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  HEALTH_POLL_MS,
  HEALTH_SUMMARY_LABELS,
  summarizeHealth,
  useHealth,
} from "@/hooks/use-health";
import type { ServiceHealth, ServiceStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const SUMMARY_TONE = {
  up: "text-online",
  degraded: "text-warning",
  down: "text-destructive",
  unreachable: "text-muted-foreground",
  loading: "text-muted-foreground",
} as const;

const SEGMENT_TONE: Record<ServiceStatus, string> = {
  online: "bg-online",
  degraded: "bg-warning",
  offline: "bg-destructive",
  unknown: "bg-offline",
};

const BOT_LABELS: Record<string, string> = {
  online: "Online",
  stopped: "Parado",
  errored: "Con errores",
  unknown: "Sin datos",
};

function formatUptime(ms?: number) {
  if (!ms || ms < 0) return "—";

  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;

  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

/**
 * Celda de métrica. El valor va en mono y con cifras de ancho fijo: son
 * números que se refrescan solos y no deben moverse al cambiar de 9 a 10.
 */
function Metric({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  tone?: string;
}) {
  return (
    <div className="bg-background px-5 py-4">
      <p className="eyebrow">{label}</p>
      <p className="mt-2 flex items-baseline gap-1.5">
        <span className={cn("num text-2xl leading-none", tone)}>{value}</span>
        {unit ? (
          <span className="text-xs text-muted-foreground">{unit}</span>
        ) : null}
      </p>
    </div>
  );
}

/**
 * Fila de servicio con barra de latencia.
 *
 * La barra se escala contra el servicio más lento de la tanda, no contra un
 * máximo fijo: lo que interesa de un vistazo es cuál va rezagado respecto a los
 * demás, y ese contraste se pierde con una escala absoluta.
 */
function ServiceRow({
  service,
  maxLatency,
}: {
  service: ServiceHealth;
  maxLatency: number;
}) {
  const latency = typeof service.latencyMs === "number" ? service.latencyMs : null;
  const width = latency !== null && maxLatency > 0 ? (latency / maxLatency) * 100 : 0;

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 transition-colors hover:bg-accent/40">
      <span className="flex min-w-0 flex-1 items-center gap-3">
        <StatusDot status={service.status} />
        <span className="truncate text-sm">{service.name}</span>
      </span>

      {service.detail ? (
        <span className="truncate font-mono text-[11px] text-muted-foreground">
          {service.detail}
        </span>
      ) : null}

      <span className="flex w-28 shrink-0 items-center gap-2">
        <span className="h-1 flex-1 bg-muted" aria-hidden="true">
          <span
            className={cn(
              "block h-full transition-[width] duration-500 ease-panel",
              service.status === "online" ? "bg-foreground/40" : "bg-muted-foreground/40"
            )}
            style={{ width: `${Math.min(100, Math.max(latency === null ? 0 : 4, width))}%` }}
          />
        </span>
        <span className="num w-14 text-right text-[11px] text-muted-foreground">
          {latency !== null ? `${latency} ms` : "—"}
        </span>
      </span>

      <span
        className={cn(
          "w-20 shrink-0 text-right text-xs",
          service.status === "online" && "text-online",
          service.status === "degraded" && "text-warning",
          service.status === "offline" && "text-destructive",
          service.status === "unknown" && "text-muted-foreground"
        )}
      >
        {STATUS_LABELS[service.status]}
      </span>
    </li>
  );
}

export function DashboardContent() {
  const health = useHealth();
  const { data, error, loading, refreshing, status, refresh, updatedAt } = health;
  const summary = summarizeHealth(health);

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-28" />
        <div className="grid grid-cols-2 gap-px bg-border lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-[86px]" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  // Sin datos que enseñar el fallo es total; con datos previos se degrada a un
  // aviso y la pantalla sigue sirviendo (ver `useAgentData`).
  if (error && !data) {
    return (
      <NotConfigured
        error={status === 503 ? null : error}
        action={
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
            Reintentar
          </Button>
        }
      />
    );
  }

  if (!data) return null;

  const { bot, services } = data;
  const online = services.filter((service) => service.status === "online").length;
  const maxLatency = Math.max(
    ...services.map((service) => service.latencyMs ?? 0),
    1
  );

  return (
    <div className="space-y-5">
      {error ? (
        <p className="border border-warning/30 bg-warning/5 px-4 py-2.5 text-xs text-warning">
          El último sondeo falló ({error}). Se muestra la última lectura buena.
        </p>
      ) : null}

      {/* Estado global */}
      <Card className="ticked overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 px-5 py-5 sm:px-6">
          <div className="min-w-0">
            <p className="eyebrow">Estado global</p>
            <p className="mt-1.5 flex items-center gap-2.5">
              <StatusDot
                status={
                  summary === "up"
                    ? "online"
                    : summary === "degraded"
                      ? "degraded"
                      : summary === "down"
                        ? "offline"
                        : "unknown"
                }
                className="size-2"
              />
              <span
                className={cn(
                  "text-xl font-medium tracking-tight",
                  SUMMARY_TONE[summary]
                )}
              >
                {HEALTH_SUMMARY_LABELS[summary]}
              </span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="num text-foreground">
                {online}/{services.length}
              </span>{" "}
              servicios respondiendo
              {bot.model ? (
                <>
                  {" · modelo "}
                  <span className="num text-foreground">{bot.model}</span>
                </>
              ) : null}
            </p>
          </div>

          {/*
           * Barra segmentada: un tramo por servicio, en el mismo orden que la
           * lista de abajo. Es el resumen que se lee sin leer — de reojo se ve
           * cuántos tramos no están en verde.
           */}
          <div className="flex min-w-48 flex-1 flex-col gap-2 sm:max-w-xs">
            <div className="flex gap-1" aria-hidden="true">
              {services.map((service) => (
                <span
                  key={service.id}
                  title={`${service.name}: ${STATUS_LABELS[service.status]}`}
                  className={cn("h-6 flex-1", SEGMENT_TONE[service.status])}
                />
              ))}
            </div>
            <p className="eyebrow text-right">
              {services.length} servicios monitorizados
            </p>
          </div>
        </div>
      </Card>

      {/* Proceso del bot */}
      <div className="grid grid-cols-2 gap-px border border-border bg-border lg:grid-cols-4">
        <Metric
          label="Proceso del bot"
          value={BOT_LABELS[bot.status] ?? "Sin datos"}
          tone={
            bot.status === "online"
              ? "text-online"
              : bot.status === "unknown"
                ? "text-muted-foreground"
                : "text-destructive"
          }
        />
        <Metric label="Uptime" value={formatUptime(bot.uptimeMs)} />
        <Metric
          label="Reinicios"
          value={bot.restarts ?? "—"}
          tone={bot.restarts && bot.restarts > 5 ? "text-warning" : undefined}
        />
        <Metric
          label="Memoria"
          value={bot.memoryMb ? Math.round(bot.memoryMb) : "—"}
          unit={bot.memoryMb ? "MB" : undefined}
        />
      </div>

      {/* Servicios */}
      <Card>
        <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <Activity className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-medium tracking-tight">Servicios</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
            Actualizar
          </Button>
        </div>

        <ul className="divide-y divide-border">
          {services.map((service) => (
            <ServiceRow
              key={service.id}
              service={service}
              maxLatency={maxLatency}
            />
          ))}
        </ul>
      </Card>

      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
        <LastUpdated at={updatedAt} stale={Boolean(error)} />
        <span aria-hidden="true">·</span>
        <span>refresco automático cada {HEALTH_POLL_MS / 1000}s</span>
        <span aria-hidden="true">·</span>
        <span>
          pulsa{" "}
          <kbd className="border border-border px-1 py-0.5 font-mono text-[10px]">
            ⌘K
          </kbd>{" "}
          para ir a cualquier sección
        </span>
      </p>
    </div>
  );
}
