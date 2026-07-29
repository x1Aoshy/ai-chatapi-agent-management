import { Suspense } from "react";
import type { Metadata } from "next";

import { ThemeToggle } from "@/components/theme-toggle";
import { Signature, Wordmark } from "@/components/wordmark";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Iniciar sesión",
};

export default function LoginPage() {
  return (
    <div className="relative flex min-h-dvh flex-col">
      {/*
       * La rejilla enmascarada es lo único decorativo de todo el panel, y vive
       * solo aquí: el acceso es la única pantalla sin datos que mirar, así que
       * es la única que puede permitirse una textura.
       */}
      <div
        className="bg-grid pointer-events-none absolute inset-0 opacity-70 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]"
        aria-hidden="true"
      />

      <header className="relative flex items-center justify-between px-5 py-5 sm:px-8">
        <Wordmark />
        <ThemeToggle />
      </header>

      <main className="relative flex flex-1 items-center justify-center px-5 py-8">
        <div className="w-full max-w-sm">
          <div className="mb-7 space-y-1.5">
            <p className="eyebrow">Acceso restringido</p>
            <h1 className="text-2xl font-medium tracking-tight">
              Panel de operación
            </h1>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Desde aquí se gobierna el asistente de WhatsApp: instrucciones,
              conocimiento, conexiones, entorno y proceso.
            </p>
          </div>

          <Suspense>
            <LoginForm />
          </Suspense>

          <Signature className="mt-6 text-center" />
        </div>
      </main>

      <footer className="relative px-5 py-5 sm:px-8">
        <p className="eyebrow">
          Sesión gestionada por Supabase · cookies de solo servidor
        </p>
      </footer>
    </div>
  );
}
