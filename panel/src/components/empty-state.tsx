import { cn } from "@/lib/utils";

/**
 * Hueco sin datos.
 *
 * El rayado diagonal es deliberado: comunica "este espacio existe y ahora
 * mismo está vacío", que es distinto de un panel en blanco —que se lee como
 * algo que no ha cargado— y de un error. Ninguna conversación en memoria es un
 * estado sano del sistema, y la interfaz debe decirlo sin alarmar.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-hatch flex flex-col items-center justify-center gap-2 px-6 py-12 text-center",
        className
      )}
    >
      {Icon ? (
        <span className="mb-1 flex size-9 items-center justify-center border border-border bg-background text-muted-foreground">
          <Icon className="size-4" />
        </span>
      ) : null}
      <p className="text-sm text-foreground">{title}</p>
      {description ? (
        <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
