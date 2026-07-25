"use client";

import { RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { NotConfigured } from "@/components/not-configured";
import { StatusDot, STATUS_LABELS } from "@/components/status-dot";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAgentData } from "@/hooks/use-agent-data";
import { cn } from "@/lib/utils";
import type { ConversationsResponse, HealthResponse } from "@/lib/types";

import { WhatsAppCard } from "./whatsapp-card";

function formatTtl(seconds: number) {
  if (seconds < 0) return "sin TTL";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function ConnectionsContent() {
  const health = useAgentData<HealthResponse>("/api/health", { pollMs: 15_000 });
  const conversations = useAgentData<ConversationsResponse>(
    "/api/redis/conversations",
    { pollMs: 30_000 }
  );

  async function onClearMemory(conversationId: string) {
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

      toast.success(`Memoria de la conversación ${conversationId} borrada.`);
      conversations.refresh();
    } catch {
      toast.error("No se pudo contactar con el servidor.");
    }
  }

  if (health.loading) return <Skeleton className="h-96" />;

  if (health.error) {
    return <NotConfigured error={health.status === 503 ? null : health.error} />;
  }

  const whatsapp = health.data?.services.find((s) => s.id === "whatsapp");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between border-b border-border">
          <CardTitle>Servicios</CardTitle>
          <Button variant="ghost" size="sm" onClick={health.refresh} disabled={health.refreshing}>
            <RefreshCw className={cn("size-4", health.refreshing && "animate-spin")} />
            Actualizar
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Servicio</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Detalle</TableHead>
                <TableHead className="text-right">Latencia</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {health.data?.services.map((service) => (
                <TableRow key={service.id}>
                  <TableCell className="font-medium">{service.name}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-2">
                      <StatusDot status={service.status} />
                      <span
                        className={
                          service.status === "online"
                            ? "text-xs text-online"
                            : "text-xs text-muted-foreground"
                        }
                      >
                        {STATUS_LABELS[service.status]}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {service.detail ?? "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                    {typeof service.latencyMs === "number"
                      ? `${service.latencyMs} ms`
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <WhatsAppCard service={whatsapp} onStateChange={health.refresh} />

      <Card>
        <CardHeader className="flex-row items-center justify-between border-b border-border">
          <div className="space-y-1">
            <CardTitle>Memoria en Redis</CardTitle>
            <p className="text-xs text-muted-foreground">
              Historial por conversación: 6 mensajes, TTL de 24 h.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={conversations.refresh} disabled={conversations.refreshing}>
            <RefreshCw className={cn("size-4", conversations.refreshing && "animate-spin")} />
            Actualizar
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {conversations.loading ? (
            <Skeleton className="m-4 h-24" />
          ) : conversations.data?.conversations?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Conversación</TableHead>
                  <TableHead>Mensajes</TableHead>
                  <TableHead>TTL restante</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {conversations.data.conversations.map((conversation) => (
                  <TableRow key={conversation.conversationId}>
                    <TableCell className="font-mono text-xs">
                      #{conversation.conversationId}
                    </TableCell>
                    <TableCell className="font-mono text-xs tabular-nums">
                      {conversation.messages}/6
                    </TableCell>
                    <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">
                      {formatTtl(conversation.ttlSeconds)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onClearMemory(conversation.conversationId)}
                        title="Borrar memoria de esta conversación"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="px-5 py-8 text-center text-xs text-muted-foreground">
              No hay conversaciones en memoria.
            </p>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
