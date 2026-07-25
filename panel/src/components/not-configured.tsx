import { AlertTriangle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Estado que ve el panel recién desplegado, antes de existir el middleware del
 * servidor. Es el primer estado real del producto, no un caso raro: merece un
 * mensaje que explique qué falta en lugar de un error genérico.
 */
export function NotConfigured({ error }: { error?: string | null }) {
  return (
    <Alert variant="warning">
      <AlertTriangle />
      <AlertTitle>Sin conexión con el servidor</AlertTitle>
      <AlertDescription>
        {error ??
          "Define AGENT_API_URL y AGENT_API_KEY en las variables de entorno para que el panel pueda hablar con el middleware del servidor."}
      </AlertDescription>
    </Alert>
  );
}
