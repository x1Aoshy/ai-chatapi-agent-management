import { type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/session";

/**
 * Convención `proxy` de Next.js 16, sucesora de `middleware`.
 *
 * Se ejecuta antes que cualquier ruta y es el único punto donde se refresca el
 * token de sesión de Supabase.
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Todas las rutas salvo estáticos e imágenes.
     *
     * `/api` SÍ pasa por aquí a propósito: los route handlers hablan con el
     * servidor AWS usando la API key, así que deben quedar detrás de la sesión
     * igual que las páginas. Dejarlos fuera convertiría el panel en un proxy
     * abierto hacia la infraestructura.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
