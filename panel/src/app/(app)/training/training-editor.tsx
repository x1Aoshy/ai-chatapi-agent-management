"use client";

import { useEffect, useState } from "react";
import { History, Loader2, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";

import { NotConfigured } from "@/components/not-configured";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAgentData } from "@/hooks/use-agent-data";
import type { InstructionsResponse, InstructionVersion } from "@/lib/types";

export function TrainingEditor() {
  const { data, error, loading, status, refresh } =
    useAgentData<InstructionsResponse>("/api/instructions");

  const versions = useAgentData<{ versions: InstructionVersion[] }>(
    "/api/instructions/versions"
  );

  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  // Copia de lo último confirmado por el servidor, para saber si hay cambios
  // sin guardar sin tener que volver a pedirlo.
  const [saved, setSaved] = useState("");

  useEffect(() => {
    if (data?.content !== undefined) {
      setDraft(data.content);
      setSaved(data.content);
    }
  }, [data?.content]);

  const dirty = draft !== saved;

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
  }

  async function onRollback(versionId: string) {
    try {
      const response = await fetch("/api/instructions/rollback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId }),
      });

      const body = await response.json().catch(() => null);

      if (!response.ok) {
        toast.error(body?.error ?? `Error ${response.status}`);
        return;
      }

      toast.success("Versión restaurada.");
      refresh();
      versions.refresh();
    } catch {
      toast.error("No se pudo contactar con el servidor.");
    }
  }

  if (loading) return <Skeleton className="h-96" />;

  if (error) {
    return <NotConfigured error={status === 503 ? null : error} />;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <Card>
        <CardHeader className="flex-row items-center justify-between border-b border-border">
          <div className="space-y-1">
            <CardTitle>instrucciones.txt</CardTitle>
            <p className="text-xs text-muted-foreground">
              {new Blob([draft]).size} bytes
              {dirty ? " · cambios sin guardar" : ""}
            </p>
          </div>
          <Button size="sm" onClick={onSave} disabled={!dirty || saving}>
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Guardar
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            spellCheck={false}
            className="min-h-[32rem] resize-y border-0 font-mono text-xs leading-relaxed focus-visible:ring-0"
            aria-label="Contenido de instrucciones.txt"
          />
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader className="border-b border-border">
          <CardTitle className="flex items-center gap-2">
            <History className="size-4" />
            Historial
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {versions.loading ? (
            <div className="space-y-px p-2">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : versions.data?.versions?.length ? (
            <ul className="divide-y divide-border">
              {versions.data.versions.map((version) => (
                <li
                  key={version.id}
                  className="flex items-center justify-between gap-2 px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs">
                      {new Date(version.createdAt).toLocaleString("es")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {version.bytes} bytes
                      {version.author ? ` · ${version.author}` : ""}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRollback(version.id)}
                    title="Restaurar esta versión"
                  >
                    <RotateCcw className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-center text-xs text-muted-foreground">
              Sin versiones anteriores.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
