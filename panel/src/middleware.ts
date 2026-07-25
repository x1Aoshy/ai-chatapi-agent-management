import { type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Todas las rutas salvo estáticos e imágenes.
     *
     * `/api` SÍ pasa por el middleware a propósito: los route handlers hablan
     * con el servidor AWS usando la API key, así que deben quedar detrás de la
     * sesión igual que las páginas. Dejarlos fuera convertiría el panel en un
     * proxy abierto hacia la infraestructura.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
