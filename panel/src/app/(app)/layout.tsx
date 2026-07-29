import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";

/**
 * Shell autenticado. proxy.ts ya redirige al tráfico sin sesión, pero se
 * vuelve a comprobar aquí para obtener el usuario que se muestra en la barra
 * lateral y para no depender de una sola capa.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <AppShell email={user.email}>{children}</AppShell>;
}
