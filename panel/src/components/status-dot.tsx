import { cn } from "@/lib/utils";
import type { ServiceStatus } from "@/lib/types";

const STATUS_STYLES: Record<ServiceStatus, string> = {
  online: "bg-online dot-online-glow",
  degraded: "bg-warning",
  offline: "bg-destructive",
  unknown: "bg-offline",
};

export const STATUS_LABELS: Record<ServiceStatus, string> = {
  online: "Online",
  degraded: "Degradado",
  offline: "Offline",
  unknown: "Sin datos",
};

/**
 * Punto de estado. El color es el único portador de significado en toda la
 * interfaz, así que nunca aparece solo: siempre va acompañado de su etiqueta
 * de texto para no depender de la percepción del color.
 */
export function StatusDot({
  status,
  className,
}: {
  status: ServiceStatus;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-block size-1.5 shrink-0", STATUS_STYLES[status], className)}
      aria-hidden="true"
    />
  );
}

export function StatusLabel({
  status,
  className,
}: {
  status: ServiceStatus;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-xs", className)}>
      <StatusDot status={status} />
      <span
        className={cn(
          status === "online" && "text-online",
          status === "degraded" && "text-warning",
          status === "offline" && "text-destructive",
          status === "unknown" && "text-muted-foreground"
        )}
      >
        {STATUS_LABELS[status]}
      </span>
    </span>
  );
}
