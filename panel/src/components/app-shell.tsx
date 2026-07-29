"use client";

import { CommandPalette } from "@/components/command-palette";
import { MobileTopBar, SidebarRail } from "@/components/sidebar";
import { HealthProvider } from "@/hooks/use-health";

/**
 * Armazón de la zona autenticada.
 *
 * Es cliente porque el carril necesita saber la ruta activa y su estado de
 * hover, pero `children` sigue llegando ya renderizado desde el servidor: pasar
 * Server Components como prop no los convierte en cliente. El shell no bloquea
 * nada del contenido.
 */
export function AppShell({
  email,
  children,
}: {
  email?: string | null;
  children: React.ReactNode;
}) {
  return (
    <HealthProvider>
      {/*
       * `h-dvh` y no `h-screen`: en móvil, `vh` cuenta la barra del navegador
       * como si no existiera y el pie del panel queda debajo de ella.
       */}
      <div className="flex h-dvh overflow-hidden">
        <SidebarRail email={email} />

        <div className="flex min-w-0 flex-1 flex-col">
          <MobileTopBar email={email} />
          <main className="flex-1 overflow-y-auto overflow-x-hidden">
            {children}
          </main>
        </div>

        <CommandPalette />
      </div>
    </HealthProvider>
  );
}
