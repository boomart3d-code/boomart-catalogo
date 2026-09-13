/*
 * Configuracion de conexion a Supabase (cuentas de cliente, Fase 1).
 * Estos dos valores son seguros de publicar: la "anon/publishable key" esta
 * pensada para usarse en el navegador -- el acceso real esta controlado por
 * las reglas de seguridad (RLS) que ya quedaron activadas en las tablas.
 * NUNCA pongas aqui la "secret key" -- esa es solo para Boomart Studio.
 */
window.BOOMART_SUPABASE = {
  url: "https://sasqusmvysbvqiggdmuj.supabase.co",
  publishableKey: "sb_publishable_ie_uGbcbwp7JE3Ss04ZDhw_G-tzKLU2"
};
