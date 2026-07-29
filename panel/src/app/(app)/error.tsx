"use client";

import { useEffect } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";

import { PageBody, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * Frontera de error de la zona autenticada.
 *
 * Sin esto, cualquier excepción al renderizar una página tumba el árbol entero
 * y deja la pantalla en blanco. Aquí el fallo se queda dentro del `<main>`: la
 * barra lateral sigue en pie y el panel sigue siendo navegable, que es lo que
 * hace falta cuando lo que falla es justo la página que estabas mirando.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[panel] error de renderizado:", error);
  }, [error]);

  return (
    <>
      <PageHeader eyebrow="Panel" title="Algo ha fallado" />
      <PageBody>
        <Card className="ticked bg-hatch">
          <div className="flex flex-col items-start gap-4 bg-card/60 p-6 sm:p-8">
            <span className="flex size-9 items-center justify-center border border-border bg-background text-destructive">
              <TriangleAlert className="size-4" />
            </span>

            <div className="space-y-1.5">
              <p className="eyebrow">Error de la interfaz</p>
              <h2 className="text-base font-medium tracking-tight">
                La página no se pudo pintar
              </h2>
              <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">
                El fallo está en el panel, no necesariamente en el bot: el
                proceso del servidor puede seguir atendiendo mensajes. Reintenta;
                si vuelve a ocurrir, el detalle está en la consola del navegador.
              </p>
            </div>

            {error.digest ? (
              <p className="num border border-border px-3 py-1.5 text-[11px] text-muted-foreground">
                digest {error.digest}
              </p>
            ) : null}

            <Button variant="outline" size="sm" onClick={reset}>
              <RefreshCw className="size-4" />
              Reintentar
            </Button>
          </div>
        </Card>
      </PageBody>
    </>
  );
}
