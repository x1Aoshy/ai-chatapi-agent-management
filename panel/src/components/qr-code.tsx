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
      margin: 2,
      width: size,
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
  }, [value, size]);

  if (error) {
    return (
      <div
        className={cn(
          "flex items-center justify-center border border-border bg-muted text-xs text-muted-foreground",
          className
        )}
        style={{ width: size, height: size }}
      >
        No se pudo dibujar el código
      </div>
    );
  }

  if (!svg) {
    return (
      <div
        className={cn("animate-pulse bg-muted", className)}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className={cn("border border-border bg-white p-3 [&>svg]:block", className)}
      style={{ width: size, height: size }}
      // El SVG lo genera la librería a partir del texto del código, no viene
      // del servidor: no hay HTML de terceros que pueda inyectarse aquí.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
