"use client";

import { Moon, Sun } from "lucide-react";

import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

/**
 * Interruptor claro/oscuro suelto, para las pantallas que no tienen la burbuja
 * de usuario —el acceso, básicamente—. Dentro del panel el tema se cambia desde
 * el menú de la burbuja o con ⌘K, no desde un botón suelto: un panel operativo
 * no necesita dos sitios distintos para lo mismo.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, toggleTheme } = useTheme();
  const nextLabel = resolvedTheme === "dark" ? "claro" : "oscuro";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={`Cambiar a tema ${nextLabel}`}
      aria-label={`Cambiar a tema ${nextLabel}`}
      className={cn(
        "flex size-9 items-center justify-center border border-border text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground",
        className
      )}
    >
      {resolvedTheme === "dark" ? (
        <Sun className="size-4" />
      ) : (
        <Moon className="size-4" />
      )}
    </button>
  );
}
