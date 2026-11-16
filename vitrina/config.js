/*
 * Configuracion publica de la vitrina (proyecto Supabase "boomart-socios"). Estos valores son seguros de publicar: la clave
 * "publishable" esta pensada para el navegador y el acceso real lo controlan las reglas de seguridad (RLS) y la funcion `vitrina-admin`.
 * NUNCA pongas aqui una clave secreta. Si cambias `apiUrl`, cambia tambien `connect-src` e `img-src` en la politica de contenido de los HTML.
 */
window.VITRINA_CONFIG = {
  apiUrl: "https://ugywzvnokdsikiczvwdx.supabase.co",
  publishableKey: "sb_publishable_YEJVfTTVnofdHXkF0ADznA_qtxXrZ7p",
  loginDomain: "socios.boomart.invalid",
  adminFunctionUrl: "https://ugywzvnokdsikiczvwdx.supabase.co/functions/v1/vitrina-admin"
};
