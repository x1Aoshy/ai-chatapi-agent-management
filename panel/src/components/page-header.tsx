import { cn } from "@/lib/utils";

/**
 * Cabecera de página.
 *
 * Se queda pegada arriba al desplazar: en las páginas largas —logs, el editor
 * de instrucciones— las acciones principales viven aquí, y perderlas de vista
 * obliga a subir del todo para guardar. El fondo es traslúcido con desenfoque
 * para que se note que hay contenido pasando por debajo.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  /** Micro-etiqueta sobre el título: sitúa la página dentro del panel. */
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-glass backdrop-blur-md">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-5 py-4 sm:px-6 sm:py-5">
        <div className="min-w-0 space-y-1">
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h1 className="text-lg font-medium leading-tight tracking-tight">
            {title}
          </h1>
          {description ? (
            <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>

        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}

/**
 * Cuerpo de página. Centra el contenido y le pone un ancho máximo: a 2560px,
 * una tabla estirada de borde a borde es ilegible.
 */
export function PageBody({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[1440px] px-5 py-5 sm:px-6 sm:py-6",
        className
      )}
    >
      {children}
    </div>
  );
}
