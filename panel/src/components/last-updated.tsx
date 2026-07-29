"use client";

import { useNow } from "@/hooks/use-now";

function formatAgo(seconds: number) {
  if (seconds < 5) return "ahora mismo";
  if (seconds < 60) return `hace ${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes}m`;

  const hours = Math.floor(minutes / 60);
  return `hace ${hours}h ${minutes % 60}m`;
}

/**
 * "Actualizado hace 8s", contando en vivo.
 *
 * En un panel que se refresca solo, el dato importante no es la hora de la
 * última lectura sino su antigüedad: un contador que sigue subiendo delata al
 * instante que el sondeo se ha parado, cosa que una hora fija no hace.
 *
 * En el servidor no hay reloj del navegador, así que el primer render muestra
 * un guion y el valor real entra al hidratar.
 */
export function LastUpdated({
  at,
  stale = false,
  className,
}: {
  /** `Date.now()` de la última respuesta correcta. */
  at: number | null;
  /** Marca el dato como caducado: el último intento falló. */
  stale?: boolean;
  className?: string;
}) {
  const now = useNow();

  const label =
    at && now ? formatAgo(Math.max(0, Math.round((now - at) / 1000))) : "—";

  return (
    <span
      className={className}
      title={at ? new Date(at).toLocaleString("es") : undefined}
    >
      {stale ? "sin refrescar desde " : "actualizado "}
      <span className="num text-foreground">{label}</span>
    </span>
  );
}
