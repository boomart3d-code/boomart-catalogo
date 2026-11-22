/* Polos: el registro se descarga al entrar al checkout, no al explorar el catálogo.
 * Conserva la interfaz que ya consume checkout.js; datos, pagos y RPC son los mismos.
 */
(() => {
  'use strict';
  if (window.BoomartRegistro) return;
  const scripts = new Map();
  let pending;
  function script(src) {
    if (scripts.has(src)) return scripts.get(src);
    const task = new Promise((resolve, reject) => {
      const element = document.createElement('script');
      element.src = src; element.async = true;
      const fail = () => { scripts.delete(src); element.remove(); reject(new Error('Registro no disponible')); };
      const timer = setTimeout(fail, 15000);
      element.onload = () => { clearTimeout(timer); resolve(); };
      element.onerror = () => { clearTimeout(timer); fail(); };
      document.head.append(element);
    });
    scripts.set(src, task);
    return task;
  }
  async function registration() {
    if (window.BoomartRegistro !== bridge) return window.BoomartRegistro;
    if (!pending) pending = (async () => {
      if (!window.supabase?.createClient) await script('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js');
      if (!window.supabase?.createClient) throw new Error('Registro no disponible');
      await script('/src/registro-web.js?v=6');
      if (window.BoomartRegistro === bridge) throw new Error('Registro no disponible');
      return window.BoomartRegistro;
    })().catch(error => { pending = null; throw error; });
    return pending;
  }
  const bridge = {
    isLoaded: () => false,
    profile: () => null,
    async loadProfile() {
      try { const reg = await registration(); return await reg.loadProfile(); }
      catch { return null; } // checkout.js mostrará el estado recuperable de render().
    },
    render(container, options) {
      if (window.BoomartRegistro !== bridge) return window.BoomartRegistro.render(container, options);
      const message = document.createElement('p');
      message.className = 'form-error';
      message.textContent = 'No pudimos cargar el registro. Revisa tu conexión y vuelve a intentarlo. Tu carrito sigue guardado.';
      const retry = document.createElement('button');
      retry.type = 'button'; retry.className = 'button secondary'; retry.textContent = 'Volver a intentar';
      retry.onclick = async () => {
        retry.disabled = true; message.textContent = 'Cargando el registro…';
        await bridge.loadProfile();
        if (container.isConnected) bridge.render(container, options);
      };
      const help = document.createElement('a');
      help.href = 'https://wa.me/51925666542'; help.className = 'link-button'; help.textContent = 'Consultar por WhatsApp';
      container.replaceChildren(message, retry, help);
    }
  };
  window.BoomartRegistro = bridge;
  // Los enlaces de confirmación de correo mantienen su comportamiento anterior.
  if (new URLSearchParams(location.search).has('confirmar')) bridge.loadProfile();
})();
