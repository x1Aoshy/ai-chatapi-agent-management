"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Brain,
  LayoutDashboard,
  LogOut,
  Network,
  Settings,
  Terminal,
} from "lucide-react";

import { Signature, Wordmark } from "@/components/wordmark";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/training", label: "Entrenamiento", icon: BookOpen },
  { href: "/knowledge", label: "Conocimiento", icon: Brain },
  { href: "/connections", label: "Conexiones", icon: Network },
  { href: "/logs", label: "Logs", icon: Terminal },
  { href: "/settings", label: "Ajustes", icon: Settings },
] as const;

export function Nav({ email }: { email?: string }) {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-border">
      <div className="flex h-14 items-center border-b border-border px-5">
        <Wordmark />
      </div>

      <nav className="flex-1 space-y-px p-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          // "/" solo coincide de forma exacta; el resto también en sus subrutas.
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
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
    </aside>
  );
}
