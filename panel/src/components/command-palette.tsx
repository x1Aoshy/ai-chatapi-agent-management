"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  CornerDownLeft,
  LogOut,
  Monitor,
  Moon,
  RefreshCw,
  Search,
  Sun,
  type LucideIcon,
} from "lucide-react";

import { useTheme } from "@/components/theme-provider";
import { useHealth } from "@/hooks/use-health";
import { NAV_ITEMS } from "@/lib/nav";
import { submitSignOut } from "@/lib/sign-out";
import { cn } from "@/lib/utils";

/** Evento propio para abrir la paleta desde cualquier botón del shell. */
export const OPEN_PALETTE_EVENT = "aim:open-command-palette";

interface Command {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: LucideIcon;
  /** Términos extra que también deben encontrar el comando. */
  keywords?: string;
  run: () => void;
}

/** Compara ignorando mayúsculas y tildes: "conexion" encuentra "Conexiones". */
function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * Paleta de comandos.
 *
 * Escrita a mano en lugar de traer `cmdk`: son treinta líneas de teclado y una
 * dependencia menos que auditar en un panel que gobierna infraestructura.
 *
 * Existe porque el carril está plegado por defecto. Con los nombres ocultos, el
 * panel necesita una vía que no dependa de reconocer un icono: ⌘K, escribir
 * tres letras y entrar. Quien lo usa dos veces deja de mirar la barra lateral.
 */
export function CommandPalette() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const health = useHealth();

  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);

  const listRef = React.useRef<HTMLDivElement>(null);

  // Cada apertura y cada cierre empiezan de cero: una búsqueda a medias de hace
  // media hora no es un punto de partida útil.
  const changeOpen = React.useCallback((next: boolean) => {
    setQuery("");
    setActiveIndex(0);
    setOpen(next);
  }, []);

  // Abre con ⌘K / Ctrl+K desde cualquier punto del panel.
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setQuery("");
        setActiveIndex(0);
        setOpen((current) => !current);
      }
    }

    function onOpenRequest() {
      changeOpen(true);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpenRequest);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpenRequest);
    };
  }, [changeOpen]);

  const commands = React.useMemo<Command[]>(() => {
    const navigation: Command[] = NAV_ITEMS.map((item) => ({
      id: `nav:${item.href}`,
      label: item.label,
      hint: item.hint,
      group: "Ir a",
      icon: item.icon,
      keywords: item.hint,
      run: () => router.push(item.href),
    }));

    const appearance: Command[] = [
      {
        id: "theme:light",
        label: "Tema claro",
        group: "Apariencia",
        icon: Sun,
        keywords: "claro light dia blanco tema",
        run: () => setTheme("light"),
      },
      {
        id: "theme:dark",
        label: "Tema oscuro",
        group: "Apariencia",
        icon: Moon,
        keywords: "oscuro dark noche negro tema modo noche",
        run: () => setTheme("dark"),
      },
      {
        id: "theme:system",
        label: "Seguir al sistema",
        group: "Apariencia",
        icon: Monitor,
        keywords: "sistema automatico auto tema",
        run: () => setTheme("system"),
      },
    ];

    const session: Command[] = [
      {
        id: "action:refresh",
        label: "Refrescar el estado de los servicios",
        group: "Acciones",
        icon: RefreshCw,
        keywords: "actualizar recargar health salud estado",
        run: () => health.refresh(),
      },
      {
        id: "action:signout",
        label: "Cerrar sesión",
        group: "Acciones",
        icon: LogOut,
        keywords: "salir logout desconectar",
        run: submitSignOut,
      },
    ];

    return [...navigation, ...appearance, ...session];
  }, [router, setTheme, health]);

  const results = React.useMemo(() => {
    const needle = normalize(query.trim());
    if (!needle) return commands;

    return commands.filter((command) =>
      normalize(
        `${command.label} ${command.keywords ?? ""} ${command.group}`
      ).includes(needle)
    );
  }, [commands, query]);

  /*
   * Al filtrar, la selección vuelve al primer resultado: mantenerla en el
   * índice anterior dejaría marcado un comando que ya no está en la lista.
   *
   * Se ajusta durante el render comparando con el valor anterior —el patrón que
   * documenta React para estado derivado— en lugar de en un efecto, que
   * añadiría un render extra por cada tecla escrita.
   */
  const [lastQuery, setLastQuery] = React.useState(query);

  if (lastQuery !== query) {
    setLastQuery(query);
    setActiveIndex(0);
  }

  // Mantiene visible la fila seleccionada cuando se recorre con el teclado.
  React.useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, results]);

  function runCommand(command: Command) {
    changeOpen(false);
    command.run();
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (results.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const command = results[activeIndex];
      if (command) runCommand(command);
    }
  }

  // Agrupa conservando el orden de aparición de cada grupo.
  const groups = React.useMemo(() => {
    const map = new Map<string, { command: Command; index: number }[]>();

    results.forEach((command, index) => {
      const bucket = map.get(command.group) ?? [];
      bucket.push({ command, index });
      map.set(command.group, bucket);
    });

    return [...map.entries()];
  }, [results]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={changeOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />

        <DialogPrimitive.Content
          onKeyDown={onKeyDown}
          className={cn(
            "fixed left-1/2 top-[12vh] z-50 w-[min(38rem,calc(100vw-2rem))] -translate-x-1/2",
            "border border-border-strong bg-popover text-popover-foreground",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
          )}
        >
          <DialogPrimitive.Title className="sr-only">
            Paleta de comandos
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Busca una sección o ejecuta una acción del panel.
          </DialogPrimitive.Description>

          <div className="flex items-center gap-3 border-b border-border px-4">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar sección o acción…"
              aria-label="Buscar sección o acción"
              className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <kbd className="hidden shrink-0 border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:block">
              ESC
            </kbd>
          </div>

          <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-1.5">
            {results.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-muted-foreground">
                Nada coincide con{" "}
                <span className="font-mono text-foreground">{query}</span>.
              </p>
            ) : (
              groups.map(([group, entries]) => (
                <div key={group} className="pb-1">
                  <p className="eyebrow px-4 py-1.5">{group}</p>
                  {entries.map(({ command, index }) => {
                    const active = index === activeIndex;
                    const Icon = command.icon;
                    const isCurrentTheme =
                      command.id === `theme:${theme}` ||
                      (command.id === "theme:system" && theme === "system");

                    return (
                      <button
                        key={command.id}
                        type="button"
                        data-index={index}
                        onMouseMove={() => setActiveIndex(index)}
                        onClick={() => runCommand(command)}
                        className={cn(
                          "flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors",
                          active
                            ? "bg-accent text-foreground"
                            : "text-muted-foreground"
                        )}
                      >
                        <Icon className="size-4 shrink-0" />
                        <span className="min-w-0 flex-1 truncate">
                          <span
                            className={cn(
                              active ? "text-foreground" : "text-foreground/90"
                            )}
                          >
                            {command.label}
                          </span>
                          {command.hint ? (
                            <span className="ml-2 text-xs text-muted-foreground">
                              {command.hint}
                            </span>
                          ) : null}
                        </span>
                        {isCurrentTheme ? (
                          <span className="eyebrow shrink-0">activo</span>
                        ) : null}
                        {active ? (
                          <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          <div className="flex items-center gap-4 border-t border-border px-4 py-2">
            <Legend keys="↑↓" label="moverse" />
            <Legend keys="↵" label="ejecutar" />
            <Legend keys="⌘K" label="abrir/cerrar" />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Legend({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
      <kbd className="border border-border px-1 py-0.5 font-mono">{keys}</kbd>
      {label}
    </span>
  );
}
