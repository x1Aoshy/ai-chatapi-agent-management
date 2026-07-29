import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";

/**
 * 404 global. Vive en la raíz y no dentro de `(app)` para que también cubra a
 * quien llega sin sesión: no puede depender del shell autenticado.
 */
export default function NotFound() {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center px-5 text-center">
      <div
        className="bg-grid pointer-events-none absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]"
        aria-hidden="true"
      />

      <div className="relative max-w-sm space-y-4">
        <Wordmark className="block" />
        <p className="num text-5xl tracking-tight text-muted-foreground">404</p>
        <div className="space-y-1.5">
          <h1 className="text-base font-medium tracking-tight">
            Esta ruta no existe en el panel
          </h1>
          <p className="text-xs leading-relaxed text-muted-foreground">
            El enlace apunta a una sección que no está publicada. Desde el
            dashboard llegas a todo lo que sí lo está.
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/">Volver al dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
