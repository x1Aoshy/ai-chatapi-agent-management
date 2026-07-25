import { createBrowserClient } from "@supabase/ssr";

/**
 * Cliente de Supabase para componentes de navegador.
 *
 * Solo usa la clave anónima, que es pública por diseño: la autorización real la
 * imponen las políticas RLS en Supabase, no el secreto del cliente.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
