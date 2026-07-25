"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BookOpen,
  LayoutDashboard,
  LogOut,
  Menu,
  Network,
  Settings,
  Terminal,
  X,
} from "lucide-react";

import { Signature, Wordmark } from "@/components/wordmark";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/training", label: "Entrenamiento", icon: BookOpen },
  { href: "/connections", label: "Conexiones", icon: Network },
  { href: "/logs", label: "Logs", icon: Terminal },
  { href: "/settings", label: "Ajustes", icon: Settings },
] as const;

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-px p-2">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        // "/" solo coincide de forma exacta; el resto también en sus subrutas.
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);

        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 text-sm transition-colors",
              active
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            )}
          >
            <Icon className="size-4 shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function NavFooter({ email }: { email?: string }) {
  return (
    <div className="border-t border-border p-2">
      {email ? (
        <p
          className="truncate px-3 pb-2 pt-1 text-xs text-muted-foreground"
          title={email}
        >
          {email}
        </p>
      ) : null}
      <form action="/api/auth/signout" method="post">
        <button
          type="submit"
          className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
        >
          <LogOut className="size-4 shrink-0" />
          Cerrar sesión
        </button>
      </form>

      <Signature className="px-3 pb-1 pt-3" />
    </div>
  );
}

export function Nav({ email }: { email?: string }) {
  const pathname = usePathname();

  /*
   * Se guarda la ruta desde la que se abrió el menú, no un booleano.
   *
   * Así, al navegar, `open` pasa a false por sí solo —la ruta ya no coincide—
   * en lugar de necesitar un efecto que lo cierre. En móvil el menú tapa la
   * pantalla entera, y dejarlo abierto ocultaría la página recién abierta.
   */
  const [openedFrom, setOpenedFrom] = useState<string | null>(null);
  const open = openedFrom === pathname;

  const setOpen = (next: boolean) => setOpenedFrom(next ? pathname : null);

  // Escape cierra, como cualquier capa superpuesta.
  useEffect(() => {
    if (!open) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenedFrom(null);
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* Barra superior, solo en pantallas estrechas. */}
      <header className="flex h-14 items-center justify-between border-b border-border px-4 md:hidden">
        <Wordmark />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir menú"
          className="p-2 text-muted-foreground transition-colors hover:text-foreground"
        >
          <Menu className="size-5" />
        </button>
      </header>

      {/* Barra lateral fija a partir de tablet. */}
      <aside className="hidden h-full w-56 shrink-0 flex-col border-r border-border md:flex">
        <div className="flex h-14 items-center border-b border-border px-5">
          <Wordmark />
        </div>
        <NavLinks />
        <NavFooter email={email} />
      </aside>

      {/* Panel deslizante en móvil. */}
      {open ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/70"
          />
          <div className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-border bg-background animate-in slide-in-from-left duration-200">
            <div className="flex h-14 items-center justify-between border-b border-border px-5">
              <Wordmark />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar menú"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-5" />
              </button>
            </div>
            <NavLinks onNavigate={() => setOpen(false)} />
            <NavFooter email={email} />
          </div>
        </div>
      ) : null}
    </>
  );
}
