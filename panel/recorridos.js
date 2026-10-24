/* Solo usa la sesión autenticada del panel. No consulta tablas de clientes. */
(function () {
  "use strict";
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const fecha = v => new Date(v).toLocaleString("es-PE", {timeZone:"America/Lima",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"});
  const hora = v => new Date(v).toLocaleTimeString("es-PE", {timeZone:"America/Lima",hour:"2-digit",minute:"2-digit"});
  const origen = v => ({directo:"Origen no identificado",instagram:"Instagram",facebook:"Facebook",tiktok:"TikTok",google:"Google",whatsapp:"WhatsApp",meta:"Meta"}[v] || v || "Origen no identificado");
  const dinero = v => new Intl.NumberFormat("es-PE",{style:"currency",currency:"PEN"}).format(Number(v));
  const detalle = (eventos, nombre) => {
    const pedido = [...eventos].reverse().find(e=>e.tipo === "pedido_whatsapp");
    const inicio = eventos.find(e=>e.tipo === "iniciar_compra");
    const fin = pedido || [...eventos].reverse().find(e=>e.tipo === "clic_whatsapp") || inicio || eventos.at(-1) || {};
    const previos = eventos.filter(e=>new Date(e.creado) <= new Date(fin.creado));
    const first = eventos[0] || {};
    const entrada = previos.find(e=>e.tipo === "visita");
    const geo = fin.pais || fin.ciudad ? fin : previos.find(e=>e.pais || e.ciudad || e.region) || {};
    let pais = geo.pais;
    try { if (pais) pais = new Intl.DisplayNames(["es"],{type:"region"}).of(pais); } catch (_) {}
    const items = Array.isArray(pedido?.extra?.items) ? pedido.extra.items.filter(p=>p && typeof p === "object") : [];
    const agregados = [...new Set(previos.filter(e=>e.tipo === "agregar_carrito" && e.producto).map(e=>nombre(e.producto)))];
    const productos = items.length ? items.map(p=>`${p.cantidad} × ${nombre(p.id)}${p.variante ? ` (${p.variante})` : ""}`).join(" · ") : agregados.join(" · ");
    const idsPedido = new Set(items.length ? items.map(p=>p.id) : previos.filter(e=>e.tipo === "agregar_carrito").map(e=>e.producto));
    const vistos = [...new Set(previos.filter(e=>e.tipo === "ver_producto" && e.producto && !idsPedido.has(e.producto)).map(e=>e.producto))];
    const intereses = `<h3>${pedido ? "También vio antes de enviar el pedido" : "Otros productos que miró"}</h3>${vistos.length ? `<ul class="recorrido-intereses">${vistos.map(id=>`<li>${esc(nombre(id))}</li>`).join("")}</ul>` : '<p class="recorrido-nota">No se registraron otros productos consultados en este recorrido.</p>'}`;
    const dato = (label,value) => value == null || value === "" ? "" : `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;
    const etapas = [["Entró a la web",entrada], ["Agregó al carrito",previos.find(e=>e.tipo === "agregar_carrito")], ["Inició la compra",inicio], [pedido ? "Abrió WhatsApp con el pedido" : "Pulsó WhatsApp",pedido || previos.find(e=>e.tipo === "clic_whatsapp")]].filter(x=>x[1]?.creado);
    const duracion = pedido && entrada?.creado ? Math.max(0,Math.round((new Date(pedido.creado)-new Date(entrada.creado))/60000)) : null;
    return `<dl class="recorrido-datos">${dato(items.length ? "Productos del pedido" : "Productos agregados al carrito",productos)}${dato("Total al salir a WhatsApp",pedido?.valor != null ? dinero(pedido.valor) : null)}${dato("Cantidad total",pedido?.cantidad != null ? `${pedido.cantidad} ${Number(pedido.cantidad) === 1 ? "unidad" : "unidades"}` : null)}${dato("Cupón",pedido?.extra?.cupon === "si" ? "Aplicado" : pedido?.extra?.cupon === "no" ? "No aplicado" : null)}${dato("Método elegido",({yape:"Yape",plin:"Plin",transferencia:"Transferencia",tarjeta:"Tarjeta"}[pedido?.extra?.metodo] || pedido?.extra?.metodo))}${dato("Código del pedido",pedido?.extra?.pedido)}${dato("Procedencia",origen(first.fuente))}${dato("Campaña",first.campana)}${dato("Ubicación aproximada",[geo.ciudad,geo.region,pais].filter(Boolean).join(", "))}${dato("Equipo",({movil:"Celular",pc:"Computadora",tablet:"Tablet"}[first.dispositivo]))}</dl>${intereses}<h3>Pasos de compra</h3><ol class="recorrido-pasos">${etapas.map(([t,e])=>`<li><time>${esc(hora(e.creado))}</time><span>${esc(t)}</span></li>`).join("")}</ol>${duracion != null ? `<p>De la entrada a WhatsApp: <strong>${duracion < 1 ? "menos de 1 minuto" : `${duracion} minutos`}</strong>.</p>` : ""}${pedido ? '<p class="recorrido-nota">El clic a WhatsApp no confirma el envío del mensaje ni el pago.</p>' : ""}${pedido?.extra?.items_truncados === "si" ? '<p>Listado de productos parcial.</p>' : ""}`;
  };
  window.BoomartRecorridos = async (sb, args, root, nombre) => {
    root.textContent = "Cargando recorridos…";
    let r;
    try { r = await sb.rpc("panel_recorridos", args); } catch (_) { r = {error:true}; }
    if (!root.isConnected) return;
    if (r.error) { root.textContent = "No se pudo cargar el detalle de recorridos. El resto del panel sigue disponible."; return; }
    const rows = Array.isArray(r.data) ? r.data : [];
    root.innerHTML = `<h2>Carritos y salidas a WhatsApp</h2><p>Abre una visita para ver el pedido y sus pasos. Horas de Perú.</p>${rows.length ? "" : "<p>No hay recorridos en este rango.</p>"}`;
    rows.forEach((s, i) => {
      const d = document.createElement("details"); d.className = "card";
      d.innerHTML = `<summary><strong>Visita ${i+1} · última actividad: ${esc(fecha(s.ultima))}</strong> · ${esc(origen(s.fuente))} · ${s.pedido ? "Salida del pedido a WhatsApp" : s.inicio_compra ? "Inició compra" : s.carrito ? "Abrió carrito" : "Clic de WhatsApp"}</summary><div class="recorrido-detalle"></div>`;
      let loaded = false, loading = false;
      d.addEventListener("toggle", async () => {
        if (!d.open || loaded || loading) return;
        loading = true;
        const box = d.querySelector(".recorrido-detalle"); box.textContent = "Cargando detalle…";
        try {
          const res = await sb.rpc("panel_recorridos", {...args,p_sid:s.sid});
          if (res.error) throw res.error;
          const eventos = Array.isArray(res.data) ? res.data : [];
          box.innerHTML = detalle(eventos, nombre);
          loaded = true;
        } catch (_) { box.textContent = "No se pudo cargar. Cierra y vuelve a abrir para reintentar."; }
        finally { loading = false; }
      });
      root.append(d);
    });
  };
})();
