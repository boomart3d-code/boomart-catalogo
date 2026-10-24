/* Solo usa la sesión autenticada del panel. No consulta tablas de clientes. */
(function () {
  "use strict";
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const fecha = v => new Date(v).toLocaleString("es-PE", {timeZone:"America/Lima"});
  const etiquetas = {visita:"Entró a la página",ver_producto:"Vio producto",agregar_carrito:"Agregó al carrito",abrir_carrito:"Abrió el carrito",iniciar_compra:"Inició la compra",pedido_whatsapp:"Pulsó enviar pedido a WhatsApp",clic_whatsapp:"Pulsó WhatsApp",compartir:"Compartió",filtrar:"Filtró productos",buscar:"Buscó"};
  window.BoomartRecorridos = async (sb, args, root, nombre) => {
    root.textContent = "Cargando recorridos…";
    let r;
    try { r = await sb.rpc("panel_recorridos", args); } catch (_) { r = {error:true}; }
    if (!root.isConnected) return;
    if (r.error) { root.textContent = "No se pudo cargar el detalle de recorridos. El resto del panel sigue disponible."; return; }
    const rows = Array.isArray(r.data) ? r.data : [];
    root.innerHTML = `<h2>Carritos y salidas a WhatsApp</h2><p>Hasta 100 sesiones recientes del rango y filtro elegidos. Horas de Lima. Un clic no confirma envío del mensaje ni pago. Cada sesión representa un navegador, no una identidad comprobada.</p>${rows.length ? "" : "<p>No hay recorridos en este rango.</p>"}`;
    rows.forEach((s, i) => {
      const d = document.createElement("details"); d.className = "card";
      d.innerHTML = `<summary><strong>Visita ${i+1} · ${esc(fecha(s.ultima))}</strong> · ${esc(s.fuente || "Sin origen registrado")} · ${s.pedido ? "Salida del pedido a WhatsApp" : s.inicio_compra ? "Inició compra" : s.carrito ? "Abrió carrito" : "Clic de WhatsApp"}</summary><div class="recorrido-detalle"></div>`;
      let loaded = false, loading = false;
      d.addEventListener("toggle", async () => {
        if (!d.open || loaded || loading) return;
        loading = true;
        const box = d.querySelector(".recorrido-detalle"); box.textContent = "Cargando detalle…";
        try {
          const res = await sb.rpc("panel_recorridos", {...args,p_sid:s.sid});
          if (res.error) throw res.error;
          const eventos = Array.isArray(res.data) ? res.data : [];
          const first = eventos[0] || {};
          const geo = eventos.find(e => e.pais || e.region || e.ciudad) || {};
          const dato = (label, value) => `<li><strong>${esc(label)}:</strong> ${esc(value || "No registrado")}</li>`;
          box.innerHTML = `<ul>${dato("Entrada",first.landing)}${dato("Fuente",first.fuente)}${dato("Medio",first.medio)}${dato("Campaña",first.campana)}${dato("Referente",first.ref)}${dato("Ubicación aproximada por IP",[geo.ciudad,geo.region,geo.pais].filter(Boolean).join(", "))}${dato("Dispositivo",first.dispositivo)}${dato("Idioma",first.idioma)}${dato("Zona horaria del navegador",first.tz)}</ul><p>La ubicación no es una dirección de entrega ni garantiza provincia exacta. «Directo» significa que no se recibió un origen identificable.</p><ol>${eventos.slice(0,500).map(e => `<li><strong>${esc(fecha(e.creado))} · ${esc(etiquetas[e.tipo] || e.tipo)}</strong>${e.producto ? ` · ${esc(nombre(e.producto))}` : ""}${e.cantidad != null ? ` · ${esc(e.cantidad)} unidades` : ""}${e.valor != null ? ` · S/ ${esc(e.valor)}` : ""}<br><small>${esc(e.pagina || "")}${e.boton ? ` · botón: ${esc(e.boton)}` : ""}${e.extra?.pedido ? ` · pedido: ${esc(e.extra.pedido)}` : ""}${e.extra?.cupon ? ` · cupón aplicado: ${esc(e.extra.cupon)}` : ""}${e.extra?.metodo ? ` · método: ${esc(e.extra.metodo)}` : ""}</small>${Array.isArray(e.extra?.items) ? `<ul>${e.extra.items.filter(p=>p && typeof p === "object").map(p=>`<li>${esc(nombre(p.id))} · ${esc(p.cantidad)} unidades${p.variante ? ` · ${esc(p.variante)}` : ""}</li>`).join("")}</ul>${e.extra.items_truncados === "si" ? "<small>Carrito con más de 20 líneas: listado parcial.</small>" : ""}` : ""}</li>`).join("")}</ol>${eventos.length>500 ? "<p>Se muestran los primeros 500 eventos.</p>" : ""}`;
          loaded = true;
        } catch (_) { box.textContent = "No se pudo cargar. Cierra y vuelve a abrir para reintentar."; }
        finally { loading = false; }
      });
      root.append(d);
    });
  };
})();
