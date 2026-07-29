"use client";

import * as React from "react";
import {
  AlertTriangle,
  KeyRound,
  Loader2,
  Lock,
  RotateCw,
  Save,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

import { NotConfigured } from "@/components/not-configured";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAgentData } from "@/hooks/use-agent-data";
import type { EnvVar } from "@/lib/types";
import { cn } from "@/lib/utils";

export function SettingsForm() {
  const { data, error, loading, status, refresh } =
    useAgentData<{ vars: EnvVar[] }>("/api/env");

  const [edits, setEdits] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const [restarting, setRestarting] = React.useState(false);
  const [confirmRestart, setConfirmRestart] = React.useState(false);
  const [syncedData, setSyncedData] = React.useState(data);

  /*
   * Al llegar datos nuevos del servidor se descartan los cambios locales: lo
   * que se muestra debe ser siempre lo que hay en el .env.
   *
   * Se ajusta en render en lugar de en un efecto, para no encadenar un
   * repintado extra cada vez que se recarga.
   */
  if (data !== syncedData) {
    setSyncedData(data);
    setEdits({});
  }

  const changedKeys = Object.keys(edits);
  const dirty = changedKeys.length > 0;

  async function onSave() {
    setSaving(true);

    try {
      const response = await fetch("/api/env", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: edits }),
      });

      const body = await response.json().catch(() => null);

      if (!response.ok) {
        toast.error(body?.error ?? `Error ${response.status}`);
        return;
      }

      toast.success("Variables guardadas. Reinicia el bot para aplicarlas.");
      refresh();
    } catch {
      toast.error("No se pudo contactar con el servidor.");
    } finally {
      setSaving(false);
    }
  }

  async function onRestart() {
    setRestarting(true);

    try {
      const response = await fetch("/api/restart", { method: "POST" });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        toast.error(body?.error ?? `Error ${response.status}`);
        return;
      }

      toast.success("Bot reiniciado con el entorno actualizado.");
      setConfirmRestart(false);
    } catch {
      toast.error("No se pudo contactar con el servidor.");
    } finally {
      setRestarting(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl space-y-5">
        <Skeleton className="h-16" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error) {
    return <NotConfigured error={status === 503 ? null : error} />;
  }

  const vars = data?.vars ?? [];

  return (
    <>
      <div className="max-w-3xl space-y-5">
        <div className="flex items-start gap-3 border border-warning/30 bg-warning/5 px-4 py-3">
          <AlertTriangle className="mt-px size-4 shrink-0 text-warning" />
          <div className="space-y-0.5">
            <p className="text-sm text-warning">Los cambios no se aplican solos</p>
            <p className="text-xs leading-relaxed text-warning/80">
              El proceso lee el entorno al arrancar. Tras guardar hay que
              reiniciar el bot para que las variables surtan efecto.
            </p>
          </div>
        </div>

        {/* Variables de entorno */}
        <Card className="ticked">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-5 py-3.5">
            <div>
              <h2 className="flex items-center gap-2.5 text-sm font-medium tracking-tight">
                <KeyRound className="size-4 text-muted-foreground" />
                Variables de entorno
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {dirty
                  ? `${changedKeys.length} ${
                      changedKeys.length === 1
                        ? "variable modificada"
                        : "variables modificadas"
                    } sin guardar`
                  : `${vars.length} variables en el .env del servidor`}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {dirty ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEdits({})}
                  disabled={saving}
                >
                  <Undo2 className="size-4" />
                  Descartar
                </Button>
              ) : null}
              <Button size="sm" onClick={onSave} disabled={!dirty || saving}>
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Guardar
              </Button>
            </div>
          </div>

          <div className="divide-y divide-border">
            {vars.map((envVar) => {
              const edited = envVar.key in edits;

              return (
                <div
                  key={envVar.key}
                  className={cn(
                    "space-y-2 px-5 py-4 transition-colors",
                    edited && "bg-warning/[0.04]"
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label
                      htmlFor={envVar.key}
                      className="num flex items-center gap-2 text-xs"
                    >
                      {/*
                       * La barra de la izquierda marca las filas tocadas: en
                       * una lista de quince variables, el estado "esto lo has
                       * cambiado tú" tiene que verse sin leer.
                       */}
                      <span
                        aria-hidden="true"
                        className={cn(
                          "h-3.5 w-0.5",
                          edited ? "bg-warning" : "bg-transparent"
                        )}
                      />
                      {envVar.key}
                    </Label>

                    <div className="flex items-center gap-1.5">
                      {envVar.secret ? (
                        <Badge variant="outline">
                          <Lock className="size-3" />
                          Secreto
                        </Badge>
                      ) : null}
                      {!envVar.isSet ? (
                        <Badge variant="warning">Sin definir</Badge>
                      ) : null}
                      {!envVar.editable ? (
                        <Badge variant="outline">Solo lectura</Badge>
                      ) : null}
                      {edited ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1.5"
                          aria-label={`Descartar el cambio en ${envVar.key}`}
                          onClick={() =>
                            setEdits((current) => {
                              const next = { ...current };
                              delete next[envVar.key];
                              return next;
                            })
                          }
                        >
                          <Undo2 className="size-3.5" />
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <Input
                    id={envVar.key}
                    className="font-mono text-xs"
                    value={edits[envVar.key] ?? envVar.value}
                    disabled={!envVar.editable}
                    // Los secretos llegan enmascarados del servidor. Escribir
                    // encima los sustituye; dejarlos intactos los conserva.
                    placeholder={envVar.secret ? "•••• sin cambios" : undefined}
                    onChange={(event) =>
                      setEdits((current) => ({
                        ...current,
                        [envVar.key]: event.target.value,
                      }))
                    }
                  />
                </div>
              );
            })}

            {vars.length === 0 ? (
              <p className="px-5 py-8 text-center text-xs text-muted-foreground">
                El servidor no devolvió ninguna variable.
              </p>
            ) : null}
          </div>
        </Card>

        {/* Proceso */}
        <Card>
          <div className="border-b border-border px-5 py-3.5">
            <h2 className="flex items-center gap-2.5 text-sm font-medium tracking-tight">
              <RotateCw className="size-4 text-muted-foreground" />
              Proceso
            </h2>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
            <div className="space-y-1">
              <p className="text-sm">Reiniciar el bot</p>
              <p className="text-xs text-muted-foreground">
                Equivale a{" "}
                <span className="num">pm2 restart ai-bot --update-env</span>.
                Corta el servicio unos segundos.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmRestart(true)}
              disabled={restarting}
            >
              {restarting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RotateCw className="size-4" />
              )}
              Reiniciar
            </Button>
          </div>
        </Card>
      </div>

      {/*
       * Reiniciar corta las conversaciones en curso. Un clic accidental en un
       * botón de una fila no debería poder hacer eso.
       */}
      <Dialog open={confirmRestart} onOpenChange={setConfirmRestart}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reiniciar el bot</DialogTitle>
            <DialogDescription>
              El proceso se para y vuelve a arrancar leyendo el .env actual.
              Durante unos segundos, los mensajes que lleguen por WhatsApp no
              se atenderán.
            </DialogDescription>
          </DialogHeader>

          {dirty ? (
            <p className="mx-5 my-4 border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
              Hay variables sin guardar: el reinicio arrancará con los valores
              que ya estaban en el servidor, no con los del formulario.
            </p>
          ) : null}

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmRestart(false)}
              disabled={restarting}
            >
              Cancelar
            </Button>
            <Button size="sm" onClick={onRestart} disabled={restarting}>
              {restarting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RotateCw className="size-4" />
              )}
              Reiniciar ahora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
