import { cn } from "@/lib/utils";

/**
 * Marca del panel.
 *
 * Texto puro, sin icono: el cuadro de 16px que había antes se leía como una
 * imagen rota más que como un logotipo.
 */
export function Wordmark({
  className,
  size = "sm",
}: {
  className?: string;
  size?: "sm" | "lg";
}) {
  return (
    <span
      className={cn(
        "font-display font-bold uppercase leading-none tracking-[0.18em] text-foreground",
        size === "sm" ? "text-sm" : "text-2xl tracking-[0.22em]",
        className
      )}
    >
      x1Aoshy
      <span className="text-muted-foreground"> API Panel</span>
    </span>
  );
}

/**
 * Firma del autor. Discreta a propósito: se lee si la buscas, no compite con
 * la interfaz.
 */
export function Signature({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "select-none text-[10px] tracking-wide text-muted-foreground/40 transition-colors hover:text-muted-foreground",
        className
      )}
    >
      made by x1Aoshy / Hian Chang
    </p>
  );
}
