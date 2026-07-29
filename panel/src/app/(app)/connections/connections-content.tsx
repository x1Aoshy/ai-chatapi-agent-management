"use client";

import Link from "next/link";
import { RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { NotConfigured } from "@/components/not-configured";
import { STATUS_LABELS } from "@/components/status-dot";
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
import { useHealth } from "@/hooks/use-health";
import { cn } from "@/lib/utils";
import type { ConversationsResponse } from "@/lib/types";

import { WhatsAppCard } from "./whatsapp-card";

function formatTtl(seconds: number) {
  if (seconds < 0) return "sin TTL";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function ConnectionsContent() {
  // El estado sale del sondeo compartido del shell: pedirlo otra vez aquí
  // duplicaba una petición idéntica cada 15s, con su verificación de sesión.
  const health = useHealth();
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

  /*
   * Dos columnas en pantallas anchas.
   *
   * Antes eran tres tarjetas a ancho completo, una debajo de otra, y encima la
   * tabla de servicios repetía lo que ya muestra el Dashboard. Aquí se queda
   * solo lo propio de esta página —controlar WhatsApp y la memoria del bot— y
   * el estado general vive en un único sitio.
   */
  return (
    <div className="grid items-start gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
      <WhatsAppCard service={whatsapp} onStateChange={health.refresh} />

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4 border-b border-border">
          <div className="space-y-1">
            <CardTitle>Memoria de conversaciones</CardTitle>
            <p className="text-xs text-muted-foreground">
              Historial en Redis: 6 mensajes por conversación, TTL de 24 h.
              Borrarla hace que el bot empiece de cero con ese cliente.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={conversations.refresh}
            disabled={conversations.refreshing}
          >
            <RefreshCw
              className={cn("size-4", conversations.refreshing && "animate-spin")}
            />
            Actualizar
          </Button>
        </CardHeader>

        <CardContent className="p-0">
          {conversations.loading ? (
            <Skeleton className="m-4 h-24" />
          ) : conversations.error ? (
            <p className="px-5 py-8 text-center text-xs text-muted-foreground">
              {conversations.status === 503
                ? "Sin conexión con el servidor."
                : conversations.error}
            </p>
          ) : conversations.data?.conversations?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Conversación</TableHead>
                  <TableHead className="hidden sm:table-cell">
                    Último mensaje
                  </TableHead>
                  <TableHead>Mensajes</TableHead>
                  <TableHead>TTL</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {conversations.data.conversations.map((conversation) => (
                  <TableRow key={conversation.conversationId}>
                    <TableCell className="font-mono text-xs">
                      #{conversation.conversationId}
                    </TableCell>
                    <TableCell className="hidden max-w-[18rem] truncate text-xs text-muted-foreground sm:table-cell">
                      {conversation.preview ?? "—"}
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
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-muted-foreground">
                No hay conversaciones en memoria.
              </p>
              <p className="mt-1 text-xs text-muted-foreground/60">
                Aparecen en cuanto un cliente escribe, y expiran solas a las
                24 h.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground xl:col-span-2">
        El estado del resto de servicios está en el{" "}
        <Link
          href="/"
          className="underline underline-offset-2 hover:text-foreground"
        >
          Dashboard
        </Link>
        {whatsapp ? (
          <>
            {" · "}WhatsApp{" "}
            <span
              className={whatsapp.status === "online" ? "text-online" : undefined}
            >
              {STATUS_LABELS[whatsapp.status].toLowerCase()}
            </span>
          </>
        ) : null}
      </p>
    </div>
  );
}
