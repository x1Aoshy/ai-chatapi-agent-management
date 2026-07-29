"use client";

import * as React from "react";
import { History, Loader2, RotateCcw, Save, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { NotConfigured } from "@/components/not-configured";
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
import { Textarea } from "@/components/ui/textarea";
import { useAgentData } from "@/hooks/use-agent-data";
import type { InstructionsResponse, InstructionVersion } from "@/lib/types";
import { cn } from "@/lib/utils";

function byteLength(value: string) {
  return new TextEncoder().encode(value).length;
}

function formatBytes(bytes: number) {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} kB`;
}

export function TrainingEditor() {
  const { data, error, loading, status, refresh } =
    useAgentData<InstructionsResponse>("/api/instructions");

  const versions = useAgentData<{ versions: InstructionVersion[] }>(
    "/api/instructions/versions"
  );

  const [draft, setDraft] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  // Copia de lo último confirmado por el servidor, para saber si hay cambios
  // sin guardar sin tener que volver a pedirlo.
  const [saved, setSaved] = React.useState("");
  const [pendingRollback, setPendingRollback] =
    React.useState<InstructionVersion | null>(null);
  const [rollingBack, setRollingBack] = React.useState(false);

  // Último contenido recibido del servidor. Se guarda aparte de `saved`
  // porque al guardar se actualiza `saved` en local sin volver a pedir el
  // archivo: comparar contra él reintroduciría el contenido antiguo.
  const [serverContent, setServerContent] = React.useState<string | null>(null);

  /*
   * Sincroniza el editor con lo que devuelve el servidor.
   *
   * Se ajusta en render y no en un efecto: es el patrón que React recomienda
   * para derivar estado de datos que cambian, y evita el repintado extra que
   * provoca un setState dentro de useEffect.
   */
  if (data?.content !== undefined && data.content !== serverContent) {
    setServerContent(data.content);
    setSaved(data.content);
    setDraft(data.content);
  }

  const dirty = draft !== saved;

  const onSave = React.useCallback(
    async function onSave() {
      setSaving(true);

      try {
        const response = await fetch("/api/instructions", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: draft }),
        });

        const body = await response.json().catch(() => null);

        if (!response.ok) {
          toast.error(body?.error ?? `Error ${response.status}`);
          return;
        }

        setSaved(draft);
        toast.success("Instrucciones guardadas. El bot ya usa la versión nueva.");
        versions.refresh();
      } catch {
        toast.error("No se pudo contactar con el servidor.");
      } finally {
        setSaving(false);
      }
    },
    [draft, versions]
  );

  /*
   * ⌘S / Ctrl+S guarda. Esto es un editor de texto a pantalla completa: quien
   * escribe aquí va a pulsar ⌘S por reflejo, y sin capturarlo el navegador
   * abre el diálogo de "guardar página".
   */
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "s" || !(event.metaKey || event.ctrlKey)) {
        return;
      }

      event.preventDefault();
      if (dirty && !saving) void onSave();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dirty, saving, onSave]);

  // Cerrar la pestaña con cambios sin guardar tira el prompt del navegador. Es
  // el prompt feo del navegador, sí, pero es el único que sigue funcionando si
  // el usuario cierra la ventana entera.
  React.useEffect(() => {
    if (!dirty) return;

    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  async function onRollback(version: InstructionVersion) {
    setRollingBack(true);

    try {
      const response = await fetch("/api/instructions/rollback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: version.id }),
      });

      const body = await response.json().catch(() => null);

      if (!response.ok) {
        toast.error(body?.error ?? `Error ${response.status}`);
        return;
      }

      toast.success("Versión restaurada.");
      setPendingRollback(null);
      refresh();
      versions.refresh();
    } catch {
      toast.error("No se pudo contactar con el servidor.");
    } finally {
      setRollingBack(false);
    }
  }

  if (loading) {
    return (
      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <Skeleton className="h-[32rem]" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error) {
    return <NotConfigured error={status === 503 ? null : error} />;
  }

  const bytes = byteLength(draft);
  const lines = draft ? draft.split("\n").length : 0;
  const words = draft.trim() ? draft.trim().split(/\s+/).length : 0;

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* Editor */}
        <Card className="ticked flex min-w-0 flex-col">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-5 py-3">
            <div className="min-w-0">
              <p className="eyebrow">Prompt de sistema</p>
              <p className="num mt-0.5 text-sm">instrucciones.txt</p>
            </div>

            <div className="flex items-center gap-2">
              {dirty ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDraft(saved)}
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
                <kbd className="ml-1 hidden font-mono text-[10px] opacity-60 sm:inline">
                  ⌘S
                </kbd>
              </Button>
            </div>
          </div>

          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            spellCheck={false}
            className="min-h-[26rem] flex-1 resize-y border-0 bg-transparent p-5 font-mono text-xs leading-relaxed focus-visible:ring-0 lg:min-h-[34rem]"
            aria-label="Contenido de instrucciones.txt"
          />

          {/* Barra de estado del editor: los números que importan al escribir. */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-border px-5 py-2">
            <span className="eyebrow">
              <span className="num text-foreground">{formatBytes(bytes)}</span>
            </span>
            <span className="eyebrow">
              <span className="num text-foreground">{lines}</span> líneas
            </span>
            <span className="eyebrow">
              <span className="num text-foreground">{words}</span> palabras
            </span>
            <span
              className={cn(
                "eyebrow ml-auto flex items-center gap-1.5",
                dirty ? "text-warning" : "text-muted-foreground"
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "size-1.5",
                  dirty ? "animate-blink bg-warning" : "bg-online"
                )}
              />
              {dirty ? "cambios sin guardar" : "sincronizado"}
            </span>
          </div>
        </Card>

        {/* Historial */}
        <Card className="h-fit">
          <div className="border-b border-border px-5 py-3.5">
            <h2 className="flex items-center gap-2.5 text-sm font-medium tracking-tight">
              <History className="size-4 text-muted-foreground" />
              Historial
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Cada guardado deja una copia en el servidor.
            </p>
          </div>

          {versions.loading ? (
            <div className="space-y-px p-3">
              <Skeleton className="h-11" />
              <Skeleton className="h-11" />
            </div>
          ) : versions.data?.versions?.length ? (
            <ul className="divide-y divide-border">
              {versions.data.versions.map((version) => (
                <li
                  key={version.id}
                  className="flex items-center justify-between gap-2 px-4 py-2.5 transition-colors hover:bg-accent/40"
                >
                  <div className="min-w-0">
                    <p className="num truncate text-xs">
                      {new Date(version.createdAt).toLocaleString("es")}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {formatBytes(version.bytes)}
                      {version.author ? ` · ${version.author}` : ""}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPendingRollback(version)}
                    aria-label={`Restaurar la versión del ${new Date(
                      version.createdAt
                    ).toLocaleString("es")}`}
                  >
                    <RotateCcw className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={History}
              title="Sin versiones anteriores"
              description="Aparecerán aquí en cuanto guardes por primera vez."
            />
          )}
        </Card>
      </div>

      {/*
       * Restaurar pisa el archivo del servidor. Si además hay cambios sin
       * guardar en el editor, se avisa: es el único punto del panel donde se
       * puede perder trabajo escrito a mano.
       */}
      <Dialog
        open={pendingRollback !== null}
        onOpenChange={(open) => !open && setPendingRollback(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Restaurar versión</DialogTitle>
            <DialogDescription>
              {pendingRollback
                ? `Se restaurará la copia del ${new Date(
                    pendingRollback.createdAt
                  ).toLocaleString("es")} (${formatBytes(
                    pendingRollback.bytes
                  )}). El bot la usará en el siguiente mensaje entrante.`
                : null}
            </DialogDescription>
          </DialogHeader>

          {dirty ? (
            <p className="mx-5 my-4 border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
              Tienes cambios sin guardar en el editor. Restaurar los descarta.
            </p>
          ) : null}

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPendingRollback(null)}
              disabled={rollingBack}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={rollingBack}
              onClick={() => pendingRollback && onRollback(pendingRollback)}
            >
              {rollingBack ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RotateCcw className="size-4" />
              )}
              Restaurar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
