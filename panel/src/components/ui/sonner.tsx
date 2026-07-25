"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * Toasts en la paleta del sistema: superficie de popover, borde de 1px, sin
 * radio ni sombra. Sonner aplica sus propios estilos por defecto, así que se
 * sobreescriben vía `toastOptions.classNames`.
 */
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            "!rounded-none !border !border-border !bg-popover !text-foreground !shadow-none !font-sans",
          description: "!text-muted-foreground",
          actionButton: "!rounded-none !bg-primary !text-primary-foreground",
          cancelButton: "!rounded-none !bg-secondary !text-secondary-foreground",
          error: "!text-destructive",
          success: "!text-online",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
