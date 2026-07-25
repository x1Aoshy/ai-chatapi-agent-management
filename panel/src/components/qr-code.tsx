"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

import { cn } from "@/lib/utils";

/**
 * Dibuja el QR con la paleta del panel.
 *
 * Evolution devuelve su propio PNG en los verdes y azules de WhatsApp, que
 * desentona con todo lo demás. Aquí se parte del texto en crudo del código y se
 * pinta en monocromo.
 *
 * Los módulos van oscuros sobre blanco y no al revés: es el contraste que
 * esperan los lectores de QR, y un código invertido falla en bastantes
 * teléfonos. El blanco se limita al propio código, enmarcado, en lugar de
 * teñir la interfaz.
 */
export function QrCanvas({
  value,
  size = 240,
  className,
}: {
  value: string;
  size?: number;
  className?: string;
}) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;

    QRCode.toString(value, {
      type: "svg",
      // Alta corrección de errores: tolera reflejos y suciedad en la pantalla.
      errorCorrectionLevel: "H",
      // Zona de silencio mínima. El margen visual lo pone el marco de fuera;
      // duplicarlo aquí solo encogería los módulos y costaría legibilidad.
      margin: 1,
      color: {
        dark: "#0a0a0aff",
        light: "#ffffffff",
      },
    })
      .then((markup) => {
        if (active) {
          setSvg(markup);
          setError(false);
        }
      })
      .catch(() => {
        if (active) setError(true);
      });

    return () => {
      active = false;
    };
  }, [value]);

  /*
   * El marco lleva el relleno y el borde; la caja interior lleva el tamaño.
   *
   * Antes iban juntos: el div medía `size` Y tenía padding, mientras el SVG
   * medía también `size`, así que se desbordaba y el código aparecía corrido.
   * Separándolos, el SVG escala al 100% de una caja cuyo tamaño sí es exacto.
   */
  const frame = "inline-block shrink-0 border border-border bg-white p-3";

  if (error) {
    return (
      <div className={cn(frame, "bg-muted", className)}>
        <div
          className="flex items-center justify-center text-center text-xs text-muted-foreground"
          style={{ width: size, height: size }}
        >
          No se pudo dibujar el código
        </div>
      </div>
    );
  }

  return (
    <div className={cn(frame, className)}>
      {svg ? (
        <div
          className="[&>svg]:block [&>svg]:h-full [&>svg]:w-full"
          style={{ width: size, height: size }}
          // El SVG lo genera la librería a partir del texto del código, no
          // viene del servidor: no hay HTML de terceros que pueda inyectarse.
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div
          className="animate-pulse bg-muted"
          style={{ width: size, height: size }}
        />
      )}
    </div>
  );
}
