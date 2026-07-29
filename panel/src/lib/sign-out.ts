/**
 * Cierra la sesión.
 *
 * Se envía un POST de formulario y no un `fetch`: así el navegador sigue el
 * 303 hacia /login en la misma navegación y la cookie de Supabase queda
 * descartada antes de que se pinte nada. Con `fetch` habría que encadenar a
 * mano el borrado y la redirección, y una de las dos puede quedarse a medias.
 *
 * El formulario se crea al vuelo en lugar de vivir en el árbol de React porque
 * quien dispara esto son menús y paletas que se desmontan al cerrarse: un
 * `<form>` renderizado desaparecería justo antes de poder enviarse.
 */
export function submitSignOut() {
  const form = document.createElement("form");

  form.method = "post";
  form.action = "/api/auth/signout";
  form.hidden = true;

  document.body.appendChild(form);
  form.submit();
}
