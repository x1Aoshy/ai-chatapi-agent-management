"use client";

import Image from "next/image";
import * as React from "react";
import {
  Database,
  Loader2,
  QrCode,
  RefreshCw,
  Smartphone,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { LastUpdated } from "@/components/last-updated";
import { NotConfigured } from "@/components/not-configured";
import { StatusDot, STATUS_LABELS } from "@/components/status-dot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useAgentData } from "@/hooks/use-agent-data";
import { useHealth } from "@/hooks/use-health";
import type { ConversationsResponse, WhatsAppQr } from "@/lib/types";
import { cn } from "@/lib/utils";

/** TTL y tope de mensajes con los que el bot guarda cada conversación. */
const MEMORY_TTL_SECONDS = 24 * 3600;
const MAX_MESSAGES = 6;

function formatTtl(seconds: number) {
  if (seconds < 0) return "sin TTL";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/** Barra fina: la misma pieza para el TTL y para el número de mensajes. */
function Meter({ ratio, tone }: { ratio: number; tone?: string }) {
  return (
    <span className="block h-1 w-full bg-muted" aria-hidden="true">
      <span
        className={cn(
          "block h-full transition-[width] duration-500 ease-panel",
          tone ?? "bg-foreground/40"
        )}
        style={{ width: `${Math.max(2, Math.min(100, ratio * 100))}%` }}
      />
    </span>
  );
}

function PanelHeader({
  icon: Icon,
  title,
  description,
  actions,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-5 py-3.5">
      <div className="min-w-0 space-y-0.5">
        <h2 className="flex items-center gap-2.5 text-sm font-medium tracking-tight">
          <Icon className="size-4 text-muted-foreground" />
          {title}
        </h2>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function ConnectionsContent() {
  const health = useHealth();
  const conversations = useAgentData<ConversationsResponse>(
    "/api/redis/conversations",
    { pollMs: 30_000 }
  );

  const [qr, setQr] = React.useState<string | null>(null);
  const [connecting, setConnecting] = React.useState(false);
  // Conversación pendiente de confirmar el borrado.
  const [pendingDelete, setPendingDelete] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  async function onConnect() {
    setConnecting(true);

    try {
      const response = await fetch("/api/whatsapp/connect", { method: "POST" });
      const body = (await response.json().catch(() => null)) as
        | (WhatsAppQr & { error?: string })
        | null;

      if (!response.ok || !body?.base64) {
        toast.error(body?.error ?? "No se pudo generar el QR.");
        return;
      }

      setQr(body.base64);
    } catch {
      toast.error("No se pudo contactar con el servidor.");
    } finally {
      setConnecting(false);
    }
  }

  async function onClearMemory(conversationId: string) {
    setDeleting(true);

    try {
      const response = await fetch(
        `/api/redis/conversations/${conversationId}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        toast.error(body?.error ?? `Error ${response.status}`);
        return;
      }

      toast.success(`Memoria de la conversación #${conversationId} borrada.`);
      setPendingDelete(null);
      conversations.refresh();
    } catch {
      toast.error("No se pudo contactar con el servidor.");
    } finally {
      setDeleting(false);
    }
  }

  if (health.loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (health.error && !health.data) {
    return (
      <NotConfigured
        error={health.status === 503 ? null : health.error}
        action={
          <Button variant="outline" size="sm" onClick={health.refresh}>
            <RefreshCw
              className={cn("size-4", health.refreshing && "animate-spin")}
            />
            Reintentar
          </Button>
        }
      />
    );
  }

  const services = health.data?.services ?? [];
  const whatsapp = services.find((service) => service.id === "whatsapp");
  const rows = conversations.data?.conversations ?? [];

  return (
    <div className="space-y-5">
      {/* Sesión de WhatsApp */}
      <Card className="ticked">
        <PanelHeader
          icon={Smartphone}
          title="WhatsApp"
          description="Vincular genera un QR que equivale a una sesión: escanéalo solo tú."
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={onConnect}
              disabled={connecting}
            >
              {connecting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <QrCode className="size-4" />
              )}
              Vincular dispositivo
            </Button>
          }
        />
        <div className="flex flex-wrap items-center gap-x-10 gap-y-4 px-5 py-5">
          <div>
            <p className="eyebrow">Sesión</p>
            <p className="mt-1.5 flex items-center gap-2.5">
              <StatusDot
                status={whatsapp?.status ?? "unknown"}
                className="size-2"
              />
              <span
                className={cn(
                  "text-lg font-medium tracking-tight",
                  whatsapp?.status === "online" && "text-online",
                  whatsapp?.status === "degraded" && "text-warning",
                  whatsapp?.status === "offline" && "text-destructive"
                )}
              >
                {STATUS_LABELS[whatsapp?.status ?? "unknown"]}
              </span>
            </p>
          </div>

          {whatsapp?.detail ? (
            <div>
              <p className="eyebrow">Detalle de Evolution</p>
              <p className="num mt-1.5 text-sm">{whatsapp.detail}</p>
            </div>
          ) : null}

          {typeof whatsapp?.latencyMs === "number" ? (
            <div>
              <p className="eyebrow">Latencia</p>
              <p className="num mt-1.5 text-sm">{whatsapp.latencyMs} ms</p>
            </div>
          ) : null}
        </div>
      </Card>

      {/* Servicios externos */}
      <Card>
        <PanelHeader
          icon={RefreshCw}
          title="Servicios externos"
          description="Comprobación activa desde el servidor, no un ping."
          actions={
            <Button
              variant="ghost"
              size="sm"
              onClick={health.refresh}
              disabled={health.refreshing}
            >
              <RefreshCw
                className={cn("size-4", health.refreshing && "animate-spin")}
              />
              Actualizar
            </Button>
          }
        />
        <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-3">
          {services.map((service) => (
            <div key={service.id} className="bg-card px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm">{service.name}</p>
                <Badge
                  variant={
                    service.status === "online"
                      ? "online"
                      : service.status === "degraded"
                        ? "warning"
                        : service.status === "offline"
                          ? "destructive"
                          : "offline"
                  }
                >
                  <StatusDot status={service.status} />
                  {STATUS_LABELS[service.status]}
                </Badge>
              </div>
              <p className="mt-2 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                <span className="truncate">
                  {service.detail ?? "sin detalle"}
                </span>
                {typeof service.latencyMs === "number" ? (
                  <span className="num ml-auto shrink-0">
                    {service.latencyMs} ms
                  </span>
                ) : null}
              </p>
            </div>
          ))}
        </div>
      </Card>

      {/* Memoria en Redis */}
      <Card>
        <PanelHeader
          icon={Database}
          title="Memoria en Redis"
          description={`Historial por conversación: ${MAX_MESSAGES} mensajes, TTL de 24 h.`}
          actions={
            <Button
              variant="ghost"
              size="sm"
              onClick={conversations.refresh}
              disabled={conversations.refreshing}
            >
              <RefreshCw
                className={cn(
                  "size-4",
                  conversations.refreshing && "animate-spin"
                )}
              />
              Actualizar
            </Button>
          }
        />

        {conversations.loading ? (
          <div className="space-y-px p-4">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : conversations.error && !conversations.data ? (
          <EmptyState
            icon={Database}
            title="No se pudo leer Redis"
            description={conversations.error}
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={conversations.refresh}
              >
                <RefreshCw className="size-4" />
                Reintentar
              </Button>
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Database}
            title="No hay conversaciones en memoria"
            description="El bot guarda el historial solo mientras dura el TTL. Sin conversaciones activas esto está vacío, y es lo esperable."
          />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((conversation) => (
              <li
                key={conversation.conversationId}
                className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3.5 transition-colors hover:bg-accent/40"
              >
                <span className="num w-24 shrink-0 text-sm">
                  #{conversation.conversationId}
                </span>

                <span className="w-32 shrink-0 space-y-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="eyebrow">Mensajes</span>
                    <span className="num text-[11px]">
                      {conversation.messages}/{MAX_MESSAGES}
                    </span>
                  </span>
                  <Meter ratio={conversation.messages / MAX_MESSAGES} />
                </span>

                <span className="w-32 shrink-0 space-y-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="eyebrow">TTL</span>
                    <span className="num text-[11px]">
                      {formatTtl(conversation.ttlSeconds)}
                    </span>
                  </span>
                  <Meter
                    ratio={
                      conversation.ttlSeconds < 0
                        ? 1
                        : conversation.ttlSeconds / MEMORY_TTL_SECONDS
                    }
                    tone={
                      conversation.ttlSeconds >= 0 &&
                      conversation.ttlSeconds < 3600
                        ? "bg-warning"
                        : undefined
                    }
                  />
                </span>

                {conversation.preview ? (
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {conversation.preview}
                  </span>
                ) : (
                  <span className="flex-1" />
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPendingDelete(conversation.conversationId)}
                  aria-label={`Borrar la memoria de la conversación ${conversation.conversationId}`}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="text-[11px] text-muted-foreground">
        <LastUpdated at={health.updatedAt} stale={Boolean(health.error)} />
      </p>

      {/* QR de vinculación */}
      <Dialog open={qr !== null} onOpenChange={(open) => !open && setQr(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Vincular WhatsApp</DialogTitle>
            <DialogDescription>
              WhatsApp → Dispositivos vinculados → Vincular un dispositivo.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center px-6 py-6">
            {qr ? (
              <Image
                src={qr}
                alt="Código QR para vincular WhatsApp"
                width={256}
                height={256}
                className="size-64 bg-white p-2"
                unoptimized
              />
            ) : null}
          </div>
          <p className="border-t border-border px-5 py-3 text-[11px] leading-relaxed text-muted-foreground">
            El código caduca en menos de un minuto. Si expira, vuelve a pulsar
            «Vincular dispositivo».
          </p>
        </DialogContent>
      </Dialog>

      {/*
       * Borrar memoria pide confirmación: es una acción destructiva sin
       * deshacer, y en la lista el botón queda a un pixel del de la fila de al
       * lado. El coste de un clic extra es menor que el de vaciar la
       * conversación equivocada.
       */}
      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Borrar la memoria de #{pendingDelete}</DialogTitle>
            <DialogDescription>
              El bot perderá el contexto de esa conversación y responderá al
              siguiente mensaje como si fuera el primero. No se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPendingDelete(null)}
              disabled={deleting}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleting}
              onClick={() => pendingDelete && onClearMemory(pendingDelete)}
            >
              {deleting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Borrar memoria
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
