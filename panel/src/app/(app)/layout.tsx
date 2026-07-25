import { redirect } from "next/navigation";

import { Nav } from "@/components/nav";
import { createClient } from "@/lib/supabase/server";

/**
 * Shell autenticado. El middleware ya redirige al tráfico sin sesión, pero se
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

  return (
    <div className="flex h-screen overflow-hidden">
      <Nav email={user.email} />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
