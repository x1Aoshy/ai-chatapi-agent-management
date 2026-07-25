"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
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
    const destination = next?.startsWith("/") && !next.startsWith("//") ? next : "/";

    // refresh() re-ejecuta los Server Components con la cookie ya establecida.
    router.replace(destination);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5 border border-border p-6">
      <div className="space-y-1">
        <h1 className="text-sm font-medium">Iniciar sesión</h1>
        <p className="text-xs text-muted-foreground">
          Acceso restringido a operadores del bot.
        </p>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="email">Correo</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          required
          disabled={pending}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Contraseña</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
          disabled={pending}
        />
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        {pending ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  );
}
