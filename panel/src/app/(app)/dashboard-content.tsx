"use client";

import { RefreshCw } from "lucide-react";

import { NotConfigured } from "@/components/not-configured";
import { StatusDot, STATUS_LABELS } from "@/components/status-dot";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAgentData } from "@/hooks/use-agent-data";
import { cn } from "@/lib/utils";
import type { HealthResponse } from "@/lib/types";

const POLL_MS = 15_000;

function formatUptime(ms?: number) {
  if (!ms || ms < 0) return "—";

  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;

  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-xs font-normal text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="font-mono text-2xl tabular-nums tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}

export function DashboardContent() {
  const { data, error, loading, refreshing, status, refresh } = useAgentData<HealthResponse>(
    "/api/health",
    { pollMs: POLL_MS }
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
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

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Proceso del bot"
          value={
            <span className={bot.status === "online" ? "text-online" : undefined}>
              {bot.status === "online" ? "Online" : "Caído"}
            </span>
          }
        />
        <Metric label="Uptime" value={formatUptime(bot.uptimeMs)} />
        <Metric label="Reinicios" value={bot.restarts ?? "—"} />
        <Metric
          label="Memoria"
          value={bot.memoryMb ? `${Math.round(bot.memoryMb)} MB` : "—"}
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between border-b border-border">
          <div>
            <CardTitle>Servicios</CardTitle>
          </div>
          <Button variant="ghost" size="sm" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
            Actualizar
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y divide-border">
            {services.map((service) => (
              <li
                key={service.id}
                className="flex items-center justify-between gap-4 px-5 py-3"
              >
                <div className="flex items-center gap-3">
                  <StatusDot status={service.status} />
                  <span className="text-sm">{service.name}</span>
                </div>
                <div className="flex items-center gap-4">
                  {service.detail ? (
                    <span className="font-mono text-xs text-muted-foreground">
                      {service.detail}
                    </span>
                  ) : null}
                  {typeof service.latencyMs === "number" ? (
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {service.latencyMs} ms
                    </span>
                  ) : null}
                  <span
                    className={
                      service.status === "online"
                        ? "text-xs text-online"
                        : "text-xs text-muted-foreground"
                    }
                  >
                    {STATUS_LABELS[service.status]}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Última comprobación:{" "}
        <span className="font-mono">
          {checkedAt ? new Date(checkedAt).toLocaleTimeString("es") : "—"}
        </span>
        {" · "}
        Refresco automático cada {POLL_MS / 1000}s
        {bot.model ? (
          <>
            {" · "}Modelo <span className="font-mono">{bot.model}</span>
          </>
        ) : null}
      </p>
    </div>
  );
}
