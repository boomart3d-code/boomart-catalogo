/*
 * Configuracion publica del portal de socios (proyecto Supabase "boomart-socios", NO el de la tienda).
 * Estos valores son seguros de publicar: la clave "publishable" esta pensada para el navegador y el acceso real
 * lo controlan las reglas de seguridad (RLS) y la funcion `socios-portal`. NUNCA pongas aqui una clave secreta.
 * Si cambias `apiUrl`, cambia tambien `connect-src` en la politica de contenido de index.html.
 */
window.SOCIOS_PORTAL = {
  apiUrl: "https://ugywzvnokdsikiczvwdx.supabase.co",
  publishableKey: "sb_publishable_YEJVfTTVnofdHXkF0ADznA_qtxXrZ7p",
  loginDomain: "socios.boomart.invalid"
};
