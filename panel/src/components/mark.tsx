import { cn } from "@/lib/utils";

/**
 * Marca del panel.
 *
 * Un cuadrado de trazo fino con tres barras de señal dentro: el mismo gramaje
 * de 1px que ordena toda la interfaz, y un motivo que dice qué hace esto —
 * vigilar algo que está vivo— sin recurrir a un logotipo prestado. Hereda
 * `currentColor`, así que sirve igual en el carril, en la cabecera móvil y en
 * la pantalla de acceso.
 */
export function Mark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={cn("size-4 shrink-0 text-foreground", className)}
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="0.5"
        y="0.5"
        width="15"
        height="15"
        stroke="currentColor"
        strokeOpacity="0.6"
      />
      <rect x="4" y="9" width="1.5" height="3" fill="currentColor" />
      <rect x="7.25" y="6.5" width="1.5" height="5.5" fill="currentColor" />
      <rect x="10.5" y="4" width="1.5" height="8" fill="currentColor" />
    </svg>
  );
}
