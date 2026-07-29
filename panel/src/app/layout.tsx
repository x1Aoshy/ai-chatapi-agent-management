import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";

import { ThemeProvider, THEME_STORAGE_KEY } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

/**
 * Fuente de display, solo para la marca.
 *
 * Space Grotesk tiene carácter suficiente para funcionar como logotipo sin
 * romper la sobriedad del resto: la interfaz sigue siendo Inter.
 */
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["500", "700"],
});

/*
 * El panel muestra uptimes, latencias, bytes y logs: media interfaz es texto
 * que solo se lee bien con ancho fijo. Una mono de verdad —y no la del sistema,
 * distinta en cada máquina— hace que las columnas de números cuadren siempre
 * igual y que el visor de logs se vea como una terminal, no como un párrafo.
 */
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-panel",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "x1Aoshy API Panel",
    template: "%s · x1Aoshy API Panel",
  },
  description: "Panel de administración del asistente de WhatsApp.",
};

export const viewport: Viewport = {
  // La barra del navegador sigue al tema: sin esto, el panel oscuro aparece en
  // móvil recortado por una franja blanca.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbfa" },
    { media: "(prefers-color-scheme: dark)", color: "#08090a" },
  ],
};

/*
 * Aplica el tema antes del primer pintado.
 *
 * El servidor no sabe qué tema tiene guardado el usuario, así que sin esto el
 * navegador pinta un fotograma con el tema por defecto antes de que React
 * hidrate: el flash blanco clásico. El script es bloqueante a propósito —son
 * microsegundos— y va en <head> para correr antes de que exista el <body>.
 */
const THEME_SCRIPT = `(function(){try{var s=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY
)});var r=document.documentElement;var t=(s==="light"||s==="dark")?s:(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");r.classList.add(t);r.style.colorScheme=t;r.dataset.theme=s||"system";}catch(e){var d=document.documentElement;d.classList.add("dark");d.style.colorScheme="dark";}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
