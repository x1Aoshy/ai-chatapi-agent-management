import { redirect } from "next/navigation";

/**
 * /knowledge se fusionó con /training.
 *
 * Se deja la redirección en vez de borrar la ruta: quien tuviera la página
 * guardada en marcadores llegaría a un 404 sin saber que ahora vive dentro de
 * Entrenamiento.
 */
export default function KnowledgeRedirect() {
  redirect("/training");
}
