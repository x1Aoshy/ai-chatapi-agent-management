"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface Snippet {
  id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

const MAX_CONTENT = 8000;

export function KnowledgeManager() {
  const [snippets, setSnippets] = useState<Snippet[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // null = cerrado; objeto sin id = creando; con id = editando.
  const [editing, setEditing] = useState<Partial<Snippet> | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Snippet | null>(null);

  const [reloadToken, setReloadToken] = useState(0);

  /*
   * Recarga desde un manejador de evento, no desde el efecto: `refreshing` se
   * marca aquí —donde marcar estado es correcto— y el efecto solo reacciona al
   * token. Así la lectura vive dentro del efecto y no hay setState síncrono en
   * su cuerpo.
   */
  const load = useCallback(() => {
    setRefreshing(true);
    setReloadToken((token) => token + 1);
  }, []);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const response = await fetch("/api/knowledge", { cache: "no-store" });
        const body = await response.json().catch(() => null);

        if (!active) return;

        if (!response.ok) {
          setError(body?.error ?? `Error ${response.status}`);
          setSnippets([]);
          return;
        }

        setSnippets(body.snippets ?? []);
        setError(null);
      } catch {
        if (!active) return;
        setError("No se pudo contactar con la base de datos.");
        setSnippets([]);
      } finally {
        if (active) setRefreshing(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [reloadToken]);

  async function onSave() {
    if (!editing) return;

    const title = editing.title?.trim() ?? "";
    const content = editing.content?.trim() ?? "";

    if (!title || !content) {
      toast.error("El título y el contenido son obligatorios.");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(
        editing.id ? `/api/knowledge/${editing.id}` : "/api/knowledge",
        {
          method: editing.id ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, content }),
        }
      );

      const body = await response.json().catch(() => null);

      if (!response.ok) {
        toast.error(body?.error ?? `Error ${response.status}`);
        return;
      }

      toast.success(
        editing.id
          ? "Fragmento actualizado y reindexado."
          : "Fragmento creado. El bot ya puede encontrarlo."
      );
      setEditing(null);
      load();
    } catch {
      toast.error("No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!deleting) return;

    try {
      const response = await fetch(`/api/knowledge/${deleting.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        toast.error(body?.error ?? `Error ${response.status}`);
        return;
      }

      toast.success("Fragmento eliminado.");
      setDeleting(null);
      load();
    } catch {
      toast.error("No se pudo eliminar.");
    }
  }

  if (snippets === null) {
    return (
      <div className="space-y-px">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-20" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="flex-row items-center justify-between border-b border-border">
          <div className="space-y-1">
            <CardTitle>Fragmentos</CardTitle>
            <p className="text-xs text-muted-foreground">
              {snippets.length}{" "}
              {snippets.length === 1 ? "fragmento" : "fragmentos"} · el bot usa
              los 3 más relevantes por mensaje
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={load}
              disabled={refreshing}
            >
              <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
              Actualizar
            </Button>
            <Button size="sm" onClick={() => setEditing({ title: "", content: "" })}>
              <Plus className="size-4" />
              Nuevo
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {snippets.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="text-sm text-muted-foreground">
                Todavía no hay conocimiento.
              </p>
              <p className="mx-auto mt-2 max-w-md text-xs text-muted-foreground/70">
                Añade fragmentos con información que el bot deba conocer:
                horarios, políticas de envío, promociones. Cada uno se indexa y
                el bot recupera los que encajen con la pregunta del cliente.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {snippets.map((snippet) => (
                <li
                  key={snippet.id}
                  className="flex items-start justify-between gap-4 px-5 py-4 transition-colors hover:bg-muted/30"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-medium">{snippet.title}</p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {snippet.content}
                    </p>
                    <p className="font-mono text-[10px] text-muted-foreground/60">
                      {new Date(snippet.updated_at).toLocaleString("es")}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditing(snippet)}
                      title="Editar"
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleting(snippet)}
                      title="Eliminar"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editing?.id ? "Editar fragmento" : "Nuevo fragmento"}
            </DialogTitle>
            <DialogDescription>
              Al guardar se genera su representación vectorial, que es lo que
              permite al bot encontrarlo.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-5 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Título</Label>
              <Input
                id="title"
                value={editing?.title ?? ""}
                onChange={(event) =>
                  setEditing((current) => ({ ...current, title: event.target.value }))
                }
                placeholder="Horario de atención"
                maxLength={200}
                disabled={saving}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="content">Contenido</Label>
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {editing?.content?.length ?? 0} / {MAX_CONTENT}
                </span>
              </div>
              <Textarea
                id="content"
                value={editing?.content ?? ""}
                onChange={(event) =>
                  setEditing((current) => ({ ...current, content: event.target.value }))
                }
                placeholder="Atendemos de lunes a sábado, de 9:00 a 20:00. Los domingos permanecemos cerrados."
                className="min-h-48 font-mono text-xs leading-relaxed"
                maxLength={MAX_CONTENT}
                disabled={saving}
              />
              <p className="text-xs text-muted-foreground">
                Un fragmento, una idea. Varios temas mezclados hacen que la
                búsqueda por similitud los encuentre peor.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing(null)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button size="sm" onClick={onSave} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {saving ? "Indexando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar fragmento</DialogTitle>
            <DialogDescription>
              El bot dejará de tener acceso a esta información. No se puede
              deshacer.
            </DialogDescription>
          </DialogHeader>

          <div className="px-5 py-4">
            <p className="border border-border px-3 py-2 text-sm">
              {deleting?.title}
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleting(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" size="sm" onClick={onDelete}>
              <Trash2 className="size-4" />
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
