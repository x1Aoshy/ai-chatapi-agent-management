"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Loader2, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      // No se distingue entre "usuario no existe" y "contraseña incorrecta":
      // hacerlo permitiría enumerar cuentas válidas.
      setError("Credenciales incorrectas.");
      setPending(false);
      return;
    }

    // El destino viene de proxy.ts, que lo guarda al interceptar una ruta
    // protegida. Se fuerza que sea una ruta interna para evitar un open
    // redirect si alguien manipula el parámetro.
    const next = searchParams.get("next");
    const destination =
      next?.startsWith("/") && !next.startsWith("//") ? next : "/";

    // refresh() re-ejecuta los Server Components con la cookie ya establecida.
    router.replace(destination);
    router.refresh();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="ticked space-y-5 border border-border bg-card p-6"
    >
      {error ? (
        <p
          role="alert"
          className="flex items-center gap-2.5 border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs text-destructive"
        >
          <ShieldAlert className="size-4 shrink-0" />
          {error}
        </p>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="email" className="eyebrow">
          Correo
        </Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          autoFocus
          required
          disabled={pending}
          className="font-mono text-xs"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password" className="eyebrow">
          Contraseña
        </Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
          disabled={pending}
          className="font-mono text-xs"
        />
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <ArrowRight className="size-4" />
        )}
        {pending ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  );
}
