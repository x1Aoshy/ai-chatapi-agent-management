import {
  BookOpen,
  LayoutDashboard,
  Network,
  Settings,
  Terminal,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  /** Se lee en la barra lateral expandida y en la paleta de comandos. */
  hint: string;
  icon: LucideIcon;
}

/**
 * Único origen de la navegación: la barra lateral, el cajón móvil y la paleta
 * de comandos leen de aquí. Añadir una sección es tocar solo esta lista.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  {
    href: "/",
    label: "Dashboard",
    hint: "Estado de los servicios y del proceso",
    icon: LayoutDashboard,
  },
  {
    href: "/training",
    label: "Entrenamiento",
    hint: "Prompt de sistema e historial de versiones",
    icon: BookOpen,
  },
  {
    href: "/connections",
    label: "Conexiones",
    hint: "WhatsApp, servicios externos y memoria en Redis",
    icon: Network,
  },
  {
    href: "/logs",
    label: "Logs",
    hint: "Salida de PM2 en vivo",
    icon: Terminal,
  },
  {
    href: "/settings",
    label: "Ajustes",
    hint: "Variables de entorno y reinicio del bot",
    icon: Settings,
  },
] as const;

/** "/" solo coincide de forma exacta; el resto también en sus subrutas. */
export function isActivePath(href: string, pathname: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/**
 * Iniciales para la burbuja de usuario.
 *
 * Del correo se usa solo la parte local, partida por los separadores habituales
 * (`.`, `_`, `-`, `+`): "ana.perez@…" da "AP" y "operador@…" da "OP". Nunca
 * devuelve vacío, para que la burbuja no aparezca como un círculo en blanco.
 */
export function initialsFromEmail(email?: string | null) {
  const local = email?.split("@")[0]?.trim() ?? "";
  if (!local) return "··";

  const parts = local.split(/[._+-]+/).filter(Boolean);

  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  return local.slice(0, 2).toUpperCase();
}

/** Nombre legible a partir del correo, para la cabecera del menú de usuario. */
export function displayNameFromEmail(email?: string | null) {
  const local = email?.split("@")[0]?.trim();
  if (!local) return "Operador";

  return local
    .split(/[._+-]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}
