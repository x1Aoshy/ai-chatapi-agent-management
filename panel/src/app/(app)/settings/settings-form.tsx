"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, RotateCw, Save } from "lucide-react";
import { toast } from "sonner";

import { NotConfigured } from "@/components/not-configured";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAgentData } from "@/hooks/use-agent-data";
import type { EnvVar } from "@/lib/types";

export function SettingsForm() {
  const { data, error, loading, status, refresh } =
    useAgentData<{ vars: EnvVar[] }>("/api/env");

  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [restarting, setRestarting] = useState(false);

  // Al recargar del servidor se descartan los cambios locales: lo que se
  // muestra debe ser siempre lo que hay en el .env.
  useEffect(() => {
    setEdits({});
  }, [data]);

  const dirty = Object.keys(edits).length > 0;

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
    } catch {
      toast.error("No se pudo contactar con el servidor.");
    } finally {
      setRestarting(false);
    }
  }

  if (loading) return <Skeleton className="h-96" />;

  if (error) {
    return <NotConfigured error={status === 503 ? null : error} />;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Alert>
        <AlertTriangle />
        <AlertTitle>Los cambios no se aplican solos</AlertTitle>
        <AlertDescription>
          El proceso lee el entorno al arrancar. Tras guardar hay que reiniciar
          el bot para que las variables surtan efecto.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="flex-row items-center justify-between border-b border-border">
          <CardTitle>Variables de entorno</CardTitle>
          <Button size="sm" onClick={onSave} disabled={!dirty || saving}>
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Guardar
          </Button>
        </CardHeader>
        <CardContent className="space-y-5">
          {data?.vars.map((envVar) => (
            <div key={envVar.key} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor={envVar.key} className="font-mono">
                  {envVar.key}
                </Label>
                <div className="flex items-center gap-1.5">
                  {envVar.secret ? <Badge variant="outline">Secreto</Badge> : null}
                  {!envVar.isSet ? (
                    <Badge variant="warning">Sin definir</Badge>
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
          ))}

          {!data?.vars?.length ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              El servidor no devolvió ninguna variable.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-border">
          <CardTitle>Proceso</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm">Reiniciar el bot</p>
            <p className="text-xs text-muted-foreground">
              Equivale a <span className="font-mono">pm2 restart ai-bot --update-env</span>.
              Corta el servicio unos segundos.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onRestart} disabled={restarting}>
            {restarting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RotateCw className="size-4" />
            )}
            Reiniciar
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
