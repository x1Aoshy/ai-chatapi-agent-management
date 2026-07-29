"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play, RotateCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLogStream, type StreamStatus } from "@/hooks/use-log-stream";
import { cn } from "@/lib/utils";

const STATUS_TEXT: Record<StreamStatus, string> = {
  connecting: "Conectando",
  live: "En vivo",
  reconnecting: "Reconectando",
  paused: "Pausado",
  error: "Sin conexión",
};

/**
 * Indicador de estado del stream.
 *
 * El punto se anima solo cuando hay algo en marcha: en vivo late despacio,
 * reconectando parpadea. Parado y en error no se mueven, para que el
 * movimiento signifique siempre "está pasando algo".
 */
function StreamIndicator({ status }: { status: StreamStatus }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs">
      <span className="relative flex size-1.5">
        {status === "live" ? (
          <span className="absolute inline-flex size-full animate-ping bg-online opacity-60" />
        ) : null}
        <span
          className={cn(
            "relative inline-flex size-1.5",
            status === "live" && "bg-online",
            status === "connecting" && "animate-pulse bg-warning",
            status === "reconnecting" && "animate-pulse bg-warning",
            status === "paused" && "bg-offline",
            status === "error" && "bg-destructive"
          )}
        />
      </span>
      <span
        className={cn(
          status === "live" && "text-online",
          (status === "connecting" || status === "reconnecting") && "text-warning",
          status === "error" && "text-destructive",
          status === "paused" && "text-muted-foreground"
        )}
      >
        {STATUS_TEXT[status]}
      </span>
    </span>
  );
}

export function LogsViewer() {
  const [stream, setStream] = useState<"all" | "err">("all");
  const [live, setLive] = useState(true);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  const { lines, status, error, reconnect } = useLogStream({
    stream,
    enabled: live,
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  // Si el operador sube a leer algo, el autoscroll no debe arrastrarlo abajo.
  const pinnedRef = useRef(true);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }

  useEffect(() => {
    if (!pinnedRef.current || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [lines]);

  const connecting = status === "connecting" && lines.length === 0;

  async function onClear() {
    setClearing(true);

    try {
      const response = await fetch("/api/logs/clear", { method: "POST" });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        toast.error(body?.error ?? `Error ${response.status}`);
        return;
      }

      toast.success("Logs vaciados.");
      setConfirmClear(false);
      // El stream sigue conectado pero muestra líneas que ya no existen en
      // disco; se reconecta para que la pantalla refleje el archivo vacío.
      reconnect();
    } catch {
      toast.error("No se pudo contactar con el servidor.");
    } finally {
      setClearing(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-4 border-b border-border">
        <div className="flex items-center gap-6">
          <CardTitle>ai-bot</CardTitle>
          <Tabs
            value={stream}
            onValueChange={(value) => setStream(value as "all" | "err")}
          >
            <TabsList className="w-auto border-0">
              <TabsTrigger value="all">Todo</TabsTrigger>
              <TabsTrigger value="err">Solo errores</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex items-center gap-3">
          <StreamIndicator status={status} />

          <Button variant="ghost" size="sm" onClick={() => setLive(!live)}>
            {live ? <Pause className="size-4" /> : <Play className="size-4" />}
            {live ? "Pausar" : "Reanudar"}
          </Button>

          <Button variant="ghost" size="sm" onClick={reconnect}>
            <RotateCw
              className={cn(
                "size-4",
                (status === "connecting" || status === "reconnecting") &&
                  "animate-spin"
              )}
            />
            Reconectar
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmClear(true)}
            title="Vaciar los archivos de log"
          >
            <Trash2 className="size-4" />
            Vaciar
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {error && status === "error" ? (
          <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={reconnect}>
              <RotateCw className="size-4" />
              Reintentar
            </Button>
          </div>
        ) : connecting ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton
                key={index}
                className="h-3"
                style={{ width: `${40 + ((index * 17) % 55)}%` }}
              />
            ))}
          </div>
        ) : (
          <div
            ref={scrollRef}
            onScroll={onScroll}
            // El fondo sale de los tokens y no de un hex fijo: con tema claro, un
            // negro incrustado dejaba el visor como un agujero en la página.
            className="h-[32rem] overflow-y-auto bg-background p-4 font-mono text-xs leading-relaxed"
          >
            {lines.length === 0 ? (
              <p className="text-muted-foreground">
                Sin líneas todavía. Las nuevas aparecerán aquí en cuanto el bot
                escriba.
              </p>
            ) : (
              lines.map((line, index) => (
                <div
                  key={`${index}-${line.timestamp ?? ""}-${line.message.slice(0, 24)}`}
                  className="flex animate-in gap-3 whitespace-pre-wrap break-all py-0.5 fade-in duration-300"
                >
                  {line.timestamp ? (
                    <span className="shrink-0 select-none text-muted-foreground/60">
                      {new Date(line.timestamp).toLocaleTimeString("es")}
                    </span>
                  ) : null}
                  <span
                    className={cn(
                      line.stream === "err"
                        ? "text-destructive"
                        : "text-foreground/90"
                    )}
                  >
                    {line.message}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </CardContent>

      <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Vaciar los logs</DialogTitle>
            <DialogDescription>
              Ejecuta `pm2 flush` sobre el bot. PM2 trunca los archivos, no los
              archiva: lo que se borre no se puede recuperar, y es justo el
              historial que hace falta para diagnosticar un incidente.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmClear(false)}
              disabled={clearing}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={onClear}
              disabled={clearing}
            >
              {clearing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Sí, vaciar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {status === "reconnecting" ? (
        <div className="flex items-center gap-2 border-t border-border px-5 py-2 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          Reconectando con el servidor…
        </div>
      ) : null}
    </Card>
  );
}
