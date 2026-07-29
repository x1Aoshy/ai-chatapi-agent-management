"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";

import { Mark } from "@/components/mark";
import { UserBubble, UserMenu } from "@/components/user-menu";
import {
  HEALTH_SUMMARY_LABELS,
  summarizeHealth,
  useHealth,
} from "@/hooks/use-health";
import { NAV_ITEMS, isActivePath } from "@/lib/nav";
import { createPersistedStore } from "@/lib/persisted-store";
import { cn } from "@/lib/utils";

/*
 * Anchos del carril. Van escritos enteros y no compuestos a trozos porque
 * Tailwind escanea el código fuente en busca de nombres de clase literales:
 * `"group-hover/rail:" + PANEL` nunca llegaría a generar la regla.
 */
const RAIL_WIDTH = "w-16";
const EXPANDED_WIDTHS =
  "group-hover/rail:w-64 group-focus-within/rail:w-64 group-data-[pinned=true]/rail:w-64";

/** Preferencia de "carril fijado", persistente entre sesiones y pestañas. */
const pinStore = createPersistedStore<boolean>({
  key: "aim.rail-pinned",
  fallback: false,
  parse: (raw) => raw === "true",
  serialize: String,
});

/*
 * La etiqueta de cada fila vive siempre en el DOM y solo se oculta visualmente:
 * así el lector de pantalla siempre tiene el nombre del enlace, aunque el
 * carril esté plegado y solo se vea el icono.
 */
const LABEL_CLASSES =
  "min-w-0 truncate text-sm transition-[opacity,transform] duration-200 ease-panel " +
  "opacity-0 -translate-x-1 " +
  "group-hover/rail:opacity-100 group-hover/rail:translate-x-0 " +
  "group-focus-within/rail:opacity-100 group-focus-within/rail:translate-x-0 " +
  "group-data-[pinned=true]/rail:opacity-100 group-data-[pinned=true]/rail:translate-x-0";

/** Igual que LABEL_CLASSES pero para lo accesorio: aparece un pelo más tarde. */
const TRAILING_CLASSES =
  "shrink-0 transition-opacity duration-200 delay-75 ease-panel opacity-0 " +
  "group-hover/rail:opacity-100 group-focus-within/rail:opacity-100 " +
  "group-data-[pinned=true]/rail:opacity-100 " +
  "pointer-events-none group-hover/rail:pointer-events-auto " +
  "group-focus-within/rail:pointer-events-auto group-data-[pinned=true]/rail:pointer-events-auto";

const SUMMARY_DOT: Record<string, string> = {
  up: "bg-online dot-online-glow",
  degraded: "bg-warning",
  down: "bg-destructive",
  unreachable: "bg-offline",
  loading: "bg-offline animate-blink",
};

function NavRow({
  href,
  label,
  icon: Icon,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group/row relative flex h-11 items-center transition-colors",
        active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
      )}
    >
      {/*
       * Marca de página activa. Un trazo de 2px pegado al borde izquierdo: es
       * lo único que se sigue viendo con el carril plegado a 64px, así que
       * hace de indicador tanto en un estado como en el otro.
       */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-y-0 left-0 w-0.5 bg-foreground transition-transform duration-200 ease-panel",
          active ? "scale-y-100" : "scale-y-0"
        )}
      />
      <span className="flex w-16 shrink-0 items-center justify-center">
        <Icon className="size-[18px]" />
      </span>
      <span className={LABEL_CLASSES}>{label}</span>
    </Link>
  );
}

/**
 * Barra lateral de escritorio.
 *
 * Plegada es un carril de iconos de 64px; al pasar el cursor —o al entrar con
 * el tabulador— se despliega a 256px y aparecen los nombres. El panel
 * desplegado flota por encima del contenido en lugar de empujarlo: si empujara,
 * cada paso del ratón por el borde izquierdo reflowaría la página entera.
 *
 * El pin fija el estado desplegado, y entonces sí ocupa sitio en el layout. Es
 * la única forma de que quien prefiera los nombres siempre visibles no dependa
 * de mantener el ratón encima.
 */
export function SidebarRail({ email }: { email?: string | null }) {
  const pathname = usePathname();
  const health = useHealth();
  const summary = summarizeHealth(health);

  // En el servidor no hay localStorage: el carril se renderiza plegado y salta
  // a su estado real en cuanto React se suscribe al store, sin repintar de más.
  const pinned = React.useSyncExternalStore(
    pinStore.subscribe,
    pinStore.getSnapshot,
    pinStore.getServerSnapshot
  );

  return (
    <aside
      data-pinned={pinned}
      className={cn(
        "group/rail relative z-30 hidden shrink-0 transition-[width] duration-200 ease-panel lg:block",
        pinned ? "w-64" : RAIL_WIDTH
      )}
    >
      <div
        className={cn(
          "absolute inset-y-0 left-0 flex flex-col overflow-hidden border-r border-border bg-background",
          "transition-[width] duration-200 ease-panel",
          RAIL_WIDTH,
          EXPANDED_WIDTHS
        )}
      >
        {/* Cabecera: marca + pin */}
        <div className="flex h-14 shrink-0 items-center border-b border-border">
          <Link
            href="/"
            className="flex h-full min-w-0 flex-1 items-center"
            aria-label="AI Management — ir al dashboard"
          >
            <span className="flex w-16 shrink-0 items-center justify-center">
              <Mark />
            </span>
            <span
              className={cn(
                LABEL_CLASSES,
                "font-medium tracking-tight text-foreground"
              )}
            >
              AI Management
            </span>
          </Link>

          <button
            type="button"
            onClick={() => pinStore.set(!pinned)}
            aria-pressed={pinned}
            title={pinned ? "Soltar la barra lateral" : "Fijar la barra lateral"}
            className={cn(
              TRAILING_CLASSES,
              "mr-3 flex size-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
            )}
          >
            {pinned ? (
              <PanelLeftClose className="size-4" />
            ) : (
              <PanelLeftOpen className="size-4" />
            )}
            <span className="sr-only">
              {pinned ? "Soltar la barra lateral" : "Fijar la barra lateral"}
            </span>
          </button>
        </div>

        {/* Navegación */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2">
          {NAV_ITEMS.map((item) => (
            <NavRow
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={isActivePath(item.href, pathname)}
            />
          ))}
        </nav>

        {/* Pie: estado, comandos y usuario */}
        <div className="shrink-0 border-t border-border">
          <div
            className="flex h-10 items-center"
            title={HEALTH_SUMMARY_LABELS[summary]}
          >
            <span className="flex w-16 shrink-0 items-center justify-center">
              <span
                aria-hidden="true"
                className={cn("size-1.5", SUMMARY_DOT[summary])}
              />
            </span>
            <span className={cn(LABEL_CLASSES, "eyebrow")}>
              {HEALTH_SUMMARY_LABELS[summary]}
            </span>
          </div>

          <button
            type="button"
            onClick={() =>
              window.dispatchEvent(new CustomEvent("aim:open-command-palette"))
            }
            className="flex h-11 w-full items-center text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
          >
            <span className="flex w-16 shrink-0 items-center justify-center">
              <Search className="size-[18px]" />
            </span>
            <span className={cn(LABEL_CLASSES, "text-left")}>Buscar</span>
            <kbd
              className={cn(
                TRAILING_CLASSES,
                "mr-3 border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
              )}
            >
              ⌘K
            </kbd>
          </button>

          <div className="flex h-14 items-center border-t border-border">
            <UserMenu email={email} side="right" align="end">
              <button
                type="button"
                aria-label="Cuenta, tema y sesión"
                className="flex h-full min-w-0 flex-1 items-center text-left transition-colors hover:bg-accent/60"
              >
                <span className="flex w-16 shrink-0 items-center justify-center">
                  <UserBubble email={email} />
                </span>
                <span className={cn(LABEL_CLASSES, "pr-3")}>
                  <span className="block truncate text-xs text-muted-foreground">
                    {email ?? "sesión activa"}
                  </span>
                </span>
              </button>
            </UserMenu>
          </div>
        </div>
      </div>
    </aside>
  );
}

/**
 * Barra superior de móvil.
 *
 * Por debajo de `lg` no hay carril: el ancho no da para 64px permanentes y, en
 * pantalla táctil, "al pasar el cursor" no significa nada. La navegación pasa a
 * un cajón que se abre desde el botón de la izquierda.
 */
export function MobileTopBar({ email }: { email?: string | null }) {
  const pathname = usePathname();
  const health = useHealth();
  const summary = summarizeHealth(health);
  const [open, setOpen] = React.useState(false);

  // Con el cajón abierto, el fondo no debe poder desplazarse.
  React.useEffect(() => {
    if (!open) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-glass px-3 backdrop-blur-md lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir la navegación"
          aria-expanded={open}
          className="flex size-9 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
        >
          <MenuGlyph />
        </button>

        <Link href="/" className="flex min-w-0 items-center gap-2.5">
          <Mark />
          <span className="truncate text-sm font-medium tracking-tight">
            AI Management
          </span>
        </Link>

        <span
          aria-label={HEALTH_SUMMARY_LABELS[summary]}
          title={HEALTH_SUMMARY_LABELS[summary]}
          className={cn("ml-1 size-1.5 shrink-0", SUMMARY_DOT[summary])}
        />

        <div className="ml-auto">
          <UserMenu email={email} side="bottom" align="end" />
        </div>
      </header>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Cerrar la navegación"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
          />

          <div className="animate-rise absolute inset-y-0 left-0 flex w-64 flex-col border-r border-border-strong bg-background">
            <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border px-5">
              <Mark />
              <span className="text-sm font-medium tracking-tight">
                AI Management
              </span>
            </div>

            <nav className="flex-1 overflow-y-auto py-2">
              {NAV_ITEMS.map((item) => {
                const active = isActivePath(item.href, pathname);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex items-center gap-3 py-3 pl-5 pr-4 text-sm transition-colors",
                      active
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground"
                    )}
                  >
                    {active ? (
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-0 left-0 w-0.5 bg-foreground"
                      />
                    ) : null}
                    <item.icon className="size-[18px] shrink-0" />
                    <span className="min-w-0">
                      <span className="block truncate">{item.label}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {item.hint}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </nav>

            <div className="flex items-center gap-2.5 border-t border-border px-5 py-3">
              <span className={cn("size-1.5 shrink-0", SUMMARY_DOT[summary])} />
              <span className="eyebrow">{HEALTH_SUMMARY_LABELS[summary]}</span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** Tres trazos desiguales: el mismo lenguaje de hairlines que el resto. */
function MenuGlyph() {
  return (
    <span aria-hidden="true" className="flex w-4 flex-col gap-1">
      <span className="h-px w-full bg-current" />
      <span className="h-px w-full bg-current" />
      <span className="h-px w-2/3 bg-current" />
    </span>
  );
}
