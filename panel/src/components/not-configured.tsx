import { PlugZap, Unplug } from "lucide-react";

import { Card } from "@/components/ui/card";

const ENV_VARS = ["AGENT_API_URL", "AGENT_API_KEY"] as const;

/**
 * Estado que ve el panel recién desplegado, antes de existir el middleware del
 * servidor. Es el primer estado real del producto, no un caso raro: merece una
 * pantalla que diga qué falta y qué hacer, no un error genérico en rojo.
 *
 * Se distingue "sin configurar" (503, falta el entorno) de "no responde" (el
 * middleware existe pero está caído o inalcanzable): la acción a tomar es
 * distinta y confundirlas hace perder media hora.
 */
export function NotConfigured({
  error,
  action,
}: {
  /** Mensaje del servidor. `null` significa "falta configuración" (503). */
  error?: string | null;
  action?: React.ReactNode;
}) {
  const unreachable = Boolean(error);
  const Icon = unreachable ? Unplug : PlugZap;

  return (
    <Card className="ticked bg-hatch">
      <div className="flex flex-col items-start gap-4 bg-card/60 p-6 sm:p-8">
        <span className="flex size-9 items-center justify-center border border-border bg-background text-muted-foreground">
          <Icon className="size-4" />
        </span>

        <div className="space-y-1.5">
          <p className="eyebrow">
            {unreachable ? "Servidor inalcanzable" : "Panel sin configurar"}
          </p>
          <h2 className="text-base font-medium tracking-tight">
            {unreachable
              ? "El middleware no ha respondido"
              : "Falta conectar el panel con el servidor"}
          </h2>
          <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">
            {unreachable
              ? "El panel sí tiene configurada la conexión, pero la petición no llegó a buen puerto. Comprueba que el middleware está levantado en el servidor y que el puerto 5001 acepta tráfico desde el panel."
              : "El panel habla con la infraestructura a través del middleware del servidor. Hasta que estas dos variables de entorno estén definidas en el despliegue, no hay nada que mostrar."}
          </p>
        </div>

        {unreachable ? (
          <p className="max-w-xl border-l-2 border-destructive/40 bg-destructive/5 px-3 py-2 font-mono text-[11px] leading-relaxed text-destructive">
            {error}
          </p>
        ) : (
          <ul className="space-y-1">
            {ENV_VARS.map((name) => (
              <li
                key={name}
                className="flex items-center gap-2 font-mono text-xs text-muted-foreground"
              >
                <span className="size-1 bg-muted-foreground" aria-hidden="true" />
                {name}
              </li>
            ))}
          </ul>
        )}

        {action}
      </div>
    </Card>
  );
}
