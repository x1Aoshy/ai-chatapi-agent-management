"use client";

import * as React from "react";
import { LogOut, Monitor, Moon, Sun, type LucideIcon } from "lucide-react";

import { useTheme, type Theme } from "@/components/theme-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { displayNameFromEmail, initialsFromEmail } from "@/lib/nav";
import { submitSignOut } from "@/lib/sign-out";
import { cn } from "@/lib/utils";

const THEME_OPTIONS: { value: Theme; label: string; icon: LucideIcon }[] = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Oscuro", icon: Moon },
  { value: "system", label: "Sistema", icon: Monitor },
];

/**
 * Burbuja de usuario.
 *
 * Es el único elemento redondo del panel, y lo es a propósito: en una interfaz
 * de ángulos rectos, un círculo es imposible de perder de vista. Concentra lo
 * que no es navegación —quién eres, cómo se ve el panel y cómo salir— para que
 * ninguna de esas tres cosas ocupe sitio en la barra lateral.
 */
export function UserBubble({
  email,
  size = "md",
  className,
}: {
  email?: string | null;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border border-border-strong bg-secondary font-mono font-medium text-foreground",
        "transition-colors",
        size === "sm" ? "size-7 text-[10px]" : "size-8 text-[11px]",
        className
      )}
    >
      {initialsFromEmail(email)}
    </span>
  );
}

export function UserMenu({
  email,
  align = "start",
  side = "top",
  children,
}: {
  email?: string | null;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  /** Disparador a medida. Si no se pasa, se usa la burbuja suelta. */
  children?: React.ReactNode;
}) {
  const { theme, setTheme } = useTheme();
  const [signingOut, setSigningOut] = React.useState(false);

  function onSignOut() {
    setSigningOut(true);
    submitSignOut();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {children ?? (
            <button
              type="button"
              aria-label="Cuenta, tema y sesión"
              className="rounded-full transition-opacity hover:opacity-80 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <UserBubble email={email} />
            </button>
          )}
        </DropdownMenuTrigger>

        <DropdownMenuContent side={side} align={align} className="min-w-64">
          <div className="flex items-center gap-3 px-2.5 py-3">
            <UserBubble email={email} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium leading-tight">
                {displayNameFromEmail(email)}
              </p>
              <p
                className="truncate font-mono text-[11px] text-muted-foreground"
                title={email ?? undefined}
              >
                {email ?? "sesión sin correo"}
              </p>
            </div>
          </div>

          <DropdownMenuSeparator />

          <DropdownMenuLabel>Apariencia</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={theme}
            onValueChange={(value) => setTheme(value as Theme)}
          >
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
              <DropdownMenuRadioItem key={value} value={value}>
                <Icon />
                {label}
                {value === "system" ? (
                  <DropdownMenuShortcut className="mr-6">auto</DropdownMenuShortcut>
                ) : null}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            variant="destructive"
            disabled={signingOut}
            onSelect={(event) => {
              // Sin esto, Radix cierra el menú y desmonta el item antes de que
              // el formulario llegue a enviarse.
              event.preventDefault();
              onSignOut();
            }}
          >
            <LogOut />
            {signingOut ? "Cerrando sesión…" : "Cerrar sesión"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
