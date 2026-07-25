import { redirect } from "next/navigation";

import { Nav } from "@/components/nav";
import { createClient } from "@/lib/supabase/server";

/**
 * Shell autenticado. proxy.ts ya redirige al tráfico sin sesión, pero se
 * vuelve a comprobar aquí para obtener el usuario que se muestra en la barra
 * lateral y para no depender de una sola capa.
 *
 * En móvil el layout es una columna (barra superior + contenido); a partir de
 * tablet, dos columnas con la barra lateral fija. Nav resuelve las dos formas.
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
    <div className="flex h-screen flex-col overflow-hidden md:flex-row">
      <Nav email={user.email} />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
