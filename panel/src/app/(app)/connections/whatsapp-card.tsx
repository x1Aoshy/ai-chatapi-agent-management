"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, LogOut, QrCode, RefreshCw, Smartphone } from "lucide-react";
import { toast } from "sonner";

import { StatusDot, STATUS_LABELS } from "@/components/status-dot";
import { Badge } from "@/components/ui/badge";
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
import { cn } from "@/lib/utils";
import type { ServiceHealth, WhatsAppQr } from "@/lib/types";

/*
 * Los QR de WhatsApp caducan en torno al minuto, así que mientras el diálogo
 * está abierto se renueva algo antes.
 *
 * Solo mientras está abierto: antes se pedía uno cada 50 s con la tarjeta a la
 * vista, gastando el límite de Evolution (5/min) para dibujar códigos que
 * nadie estaba mirando.
 */
const QR_REFRESH_MS = 50_000;

function QrDialog({
  open,
  onOpenChange,
  onLinked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLinked: () => void;
}) {
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState(0);

  const inFlight = useRef(false);

  const requestQr = useCallback(() => {
    setLoading(true);
    setToken((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!open) return;

    let active = true;

    async function loadQr() {
      if (inFlight.current) return;
      inFlight.current = true;

      try {
        const response = await fetch("/api/whatsapp/qr", { cache: "no-store" });
        const body = (await response.json().catch(() => null)) as
          | (WhatsAppQr & { error?: string })
          | null;

        if (!active) return;

        if (!response.ok || !body?.base64) {
          // 409 significa que Evolution ya tiene sesión: no es un fallo, es
          // que acaba de vincularse. Se cierra y se relee el estado.
          if (response.status === 409) {
            onLinked();
            onOpenChange(false);
            return;
          }
          setError(body?.error ?? `Error ${response.status}`);
          return;
        }

        setQr(body.base64);
        setError(null);
      } catch {
        if (active) setError("No se pudo contactar con el servidor.");
      } finally {
        inFlight.current = false;
        if (active) setLoading(false);
      }
    }

    void loadQr();
    const interval = setInterval(() => void loadQr(), QR_REFRESH_MS);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [open, token, onLinked, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Vincular WhatsApp</DialogTitle>
          <DialogDescription>
            WhatsApp → Dispositivos vinculados → Vincular un dispositivo
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 px-5 py-6">
          {error ? (
            <div className="space-y-3 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" size="sm" onClick={requestQr}>
                <RefreshCw className="size-4" />
                Reintentar
              </Button>
            </div>
          ) : qr ? (
            /*
             * PNG oficial de Evolution. Se intentó redibujarlo con la paleta
             * del panel y WhatsApp rechazaba el resultado: ese formato lo
             * define WhatsApp, no es un dato re-serializable.
             */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qr}
              alt="Código QR para vincular WhatsApp"
              width={240}
              height={240}
              className="block size-60 border border-border bg-white p-3"
            />
          ) : (
            <Skeleton className="size-60 border border-border" />
          )}

          <p className="text-center text-[10px] text-muted-foreground/60">
            El código caduca en menos de un minuto y se renueva solo.
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={requestQr}
            disabled={loading}
          >
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
            Regenerar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function WhatsAppCard({
  service,
  onStateChange,
}: {
  service?: ServiceHealth;
  onStateChange: () => void;
}) {
  const connected = service?.status === "online";

  const [showQr, setShowQr] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function onLogout() {
    setLoggingOut(true);

    try {
      const response = await fetch("/api/whatsapp/logout", { method: "POST" });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        toast.error(body?.error ?? `Error ${response.status}`);
        return;
      }

      toast.success("Sesión cerrada. Escanea el QR para volver a vincular.");
      setConfirmLogout(false);
      onStateChange();
    } catch {
      toast.error("No se pudo contactar con el servidor.");
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="border-b border-border">
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="size-4" />
            WhatsApp
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">Sesión</span>
            {service ? (
              <Badge variant={connected ? "online" : "offline"}>
                <StatusDot status={service.status} />
                {service.detail ?? STATUS_LABELS[service.status]}
              </Badge>
            ) : (
              <Badge variant="offline">Sin datos</Badge>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            {connected
              ? "El bot está recibiendo y enviando mensajes."
              : "Sin sesión activa: el bot no recibe mensajes hasta que vincules un número."}
          </p>

          {connected ? (
            <Button
              variant="destructive"
              size="sm"
              className="w-full"
              onClick={() => setConfirmLogout(true)}
            >
              <LogOut className="size-4" />
              Desvincular
            </Button>
          ) : (
            <Button size="sm" className="w-full" onClick={() => setShowQr(true)}>
              <QrCode className="size-4" />
              Mostrar código QR
            </Button>
          )}
        </CardContent>
      </Card>

      <QrDialog open={showQr} onOpenChange={setShowQr} onLinked={onStateChange} />

      <Dialog open={confirmLogout} onOpenChange={setConfirmLogout}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Desvincular WhatsApp</DialogTitle>
            <DialogDescription>
              El bot dejará de recibir y enviar mensajes de inmediato. Para
              volver a operar habrá que escanear un código nuevo desde el
              teléfono.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmLogout(false)}
              disabled={loggingOut}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={onLogout}
              disabled={loggingOut}
            >
              {loggingOut ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <LogOut className="size-4" />
              )}
              Sí, desvincular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
