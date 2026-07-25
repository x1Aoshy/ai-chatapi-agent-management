"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, LogOut, RefreshCw, Smartphone } from "lucide-react";
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
 * Los QR de WhatsApp caducan en torno al minuto. Se regenera algo antes para
 * que el que hay en pantalla siempre sea escaneable, y solo mientras la
 * pestaña está visible: pedirlos de fondo gastaría el límite de Evolution
 * (5/min) sin que nadie los mire.
 */
const QR_REFRESH_MS = 50_000;

export function WhatsAppCard({
  service,
  onStateChange,
}: {
  service?: ServiceHealth;
  onStateChange: () => void;
}) {
  const connected = service?.status === "online";

  const [qr, setQr] = useState<string | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const inFlight = useRef(false);

  // Al conectar, el QR deja de tener sentido: se deriva en render en lugar de
  // limpiarlo desde un efecto.
  const shownQr = connected ? null : qr;

  const [qrToken, setQrToken] = useState(0);

  /**
   * Petición manual. Solo aquí se marca `loadingQr`: el refresco automático
   * cada 50 s no debe girar el botón, o el indicador dejaría de significar
   * "estoy pidiendo lo que me acabas de pedir".
   */
  const requestQr = useCallback(() => {
    setLoadingQr(true);
    setQrToken((token) => token + 1);
  }, []);

  // Mientras esté desconectado, mantener un QR fresco en pantalla.
  useEffect(() => {
    if (connected) return;

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
          // 409 significa que Evolution ya tiene sesión: no es un error que
          // mostrar en rojo, sino una señal de que hay que releer el estado.
          if (response.status === 409) {
            setQrError(null);
            onStateChange();
            return;
          }
          setQrError(body?.error ?? `Error ${response.status}`);
          return;
        }

        setQr(body.base64);
        setQrError(null);
      } catch {
        if (active) setQrError("No se pudo contactar con el servidor.");
      } finally {
        inFlight.current = false;
        if (active) setLoadingQr(false);
      }
    }

    void loadQr();

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void loadQr();
    }, QR_REFRESH_MS);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [connected, qrToken, onStateChange]);

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
        <CardHeader className="flex-row items-center justify-between gap-4 border-b border-border">
          <div className="space-y-1">
            <CardTitle>WhatsApp</CardTitle>
            <p className="text-xs text-muted-foreground">
              {connected
                ? "El bot está recibiendo mensajes."
                : "Escanea el código para vincular el número."}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {service ? (
              <Badge variant={connected ? "online" : "offline"}>
                <StatusDot status={service.status} />
                {service.detail ?? STATUS_LABELS[service.status]}
              </Badge>
            ) : (
              <Badge variant="offline">Sin datos</Badge>
            )}

            {connected ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setConfirmLogout(true)}
              >
                <LogOut className="size-4" />
                Desvincular
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={requestQr}
                disabled={loadingQr}
              >
                <RefreshCw className={cn("size-4", loadingQr && "animate-spin")} />
                Regenerar
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {connected ? (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <Smartphone className="size-4" />
              Sesión activa. Desvincular deja al bot sin canal hasta que se
              escanee un código nuevo.
            </div>
          ) : qrError ? (
            <div className="space-y-3 py-4 text-center">
              <p className="text-sm text-destructive">{qrError}</p>
              <Button variant="outline" size="sm" onClick={requestQr}>
                <RefreshCw className="size-4" />
                Reintentar
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 py-4">
              {shownQr ? (
                <Image
                  src={shownQr}
                  alt="Código QR para vincular WhatsApp"
                  width={240}
                  height={240}
                  className="size-60 bg-white p-3"
                  unoptimized
                />
              ) : (
                <Skeleton className="size-60" />
              )}

              <div className="space-y-1 text-center">
                <p className="text-xs text-muted-foreground">
                  WhatsApp → Dispositivos vinculados → Vincular un dispositivo
                </p>
                <p className="text-[10px] text-muted-foreground/60">
                  El código caduca en menos de un minuto y se renueva solo.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

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
