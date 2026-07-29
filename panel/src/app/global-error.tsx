"use client";

import { useEffect } from "react";

/**
 * Último recorte de seguridad: sustituye al layout raíz cuando el fallo ocurre
 * en él mismo, así que no puede apoyarse en nada del panel —ni en los tokens de
 * `globals.css`, que se importan desde ese layout—. De ahí los estilos en
 * línea: es la única pantalla del proyecto que no puede dar por hecho que el
 * sistema de diseño esté cargado.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[panel] error fatal:", error);
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#08090a",
          color: "#ededed",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <div style={{ maxWidth: "24rem", padding: "1.5rem" }}>
          <p
            style={{
              fontFamily: "ui-monospace, monospace",
              fontSize: "10px",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#8b8d8f",
              margin: 0,
            }}
          >
            Error fatal
          </p>
          <h1 style={{ fontSize: "1rem", fontWeight: 500, margin: "0.5rem 0" }}>
            El panel no ha podido arrancar
          </h1>
          <p
            style={{
              fontSize: "0.75rem",
              lineHeight: 1.6,
              color: "#8b8d8f",
              margin: "0 0 1.25rem",
            }}
          >
            Recarga la página. Si el error persiste, revisa el despliegue: el
            fallo ocurre antes de que el panel llegue a montarse.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              border: "1px solid #2c2f31",
              background: "transparent",
              color: "#ededed",
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
