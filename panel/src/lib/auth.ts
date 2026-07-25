import { createClient } from "@/lib/supabase/server";

/**
 * Exige una sesión válida en un route handler.
 *
 * El middleware ya redirige a /login al tráfico sin sesión, pero esto es
 * defensa en profundidad: el matcher del middleware es una regex y un cambio
 * descuidado podría dejar /api fuera. Los handlers hablan con la
 * infraestructura usando la API key, así que no pueden depender de una sola
 * capa de control.
 *
 * Devuelve una Response con 401 cuando no hay sesión, o null si la hay.
 */
export async function requireUser(): Promise<Response | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json(
      { error: "No autenticado.", status: 401 },
      { status: 401 }
    );
  }

  return null;
}
