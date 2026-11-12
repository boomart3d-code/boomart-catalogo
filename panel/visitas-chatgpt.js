(function () {
  "use strict";
  const fecha = new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima", dateStyle: "short", timeStyle: "medium",
  });
  const dispositivos = { movil: "Celular", pc: "Computadora", tablet: "Tablet" };
  let canal = "";

  window.BoomartVisitasChatgpt = (sb, args, root, nombreEntrada) => {
    root.innerHTML = `
      <h2>Entradas desde ChatGPT <small>una fila por visita · hora de Lima</small></h2>
      <p class="note">Puedes ver también las visitas que salieron sin interactuar. Un pedido por WhatsApp aún requiere confirmación de pago.</p>
      <label>Origen <select>
        <option value="">Todos los de ChatGPT</option>
        <option value="anuncio">ChatGPT Ads</option>
        <option value="referido">ChatGPT orgánico</option>
      </select></label>
      <div class="tbl-wrap"><table>
        <thead><tr><th>Fecha y hora</th><th>Origen</th><th>Página de entrada</th><th>Dispositivo</th><th>Actividad</th></tr></thead>
        <tbody></tbody>
      </table></div>
      <p class="note" role="status"></p>
      <button class="btn small" type="button" hidden>Ver más entradas</button>`;

    const filtro = root.querySelector("select");
    const tabla = root.querySelector("tbody");
    const estado = root.querySelector("[role=status]");
    const siguiente = root.querySelector("button");
    filtro.value = canal;
    let cursor = null;
    let solicitud = 0;

    const cargar = async () => {
      const turno = ++solicitud;
      siguiente.hidden = true;
      estado.textContent = "Cargando entradas de ChatGPT…";
      const p = { ...args, p_canal: filtro.value || null };
      if (cursor) Object.assign(p, { p_antes: cursor.creado, p_antes_id: cursor.id });

      try {
        const { data, error } = await sb.rpc("panel_visitas_chatgpt", p);
        if (!root.isConnected || turno !== solicitud) return;
        if (error) throw error;
        const visitas = data?.visitas || [];
        visitas.forEach(v => {
          const tr = tabla.insertRow();
          tr.insertCell().textContent = fecha.format(new Date(v.creado));
          const origen = tr.insertCell();
          origen.textContent = v.canal === "anuncio" ? "ChatGPT Ads" : "ChatGPT orgánico";
          if (v.campana) {
            const campana = document.createElement("span");
            campana.className = "sub";
            campana.textContent = `Campaña ${v.campana}`;
            origen.append(campana);
          }
          tr.insertCell().textContent = nombreEntrada(v.landing).t;
          tr.insertCell().textContent = dispositivos[v.dispositivo] || "—";
          const acciones = [];
          if (v.productos) acciones.push(`${v.productos} producto${v.productos === 1 ? "" : "s"} visto${v.productos === 1 ? "" : "s"}`);
          if (v.carrito) acciones.push("Agregó al carrito");
          if (v.compra) acciones.push("Inició compra");
          if (v.pedido) acciones.push("Abrió WhatsApp con el pedido");
          else if (v.whatsapp) acciones.push("Clic a WhatsApp");
          tr.insertCell().textContent = acciones.join(" · ") || (v.interaccion ? "Interactuó" : "Sin interacción registrada");
        });
        cursor = visitas.at(-1) || cursor;
        siguiente.hidden = !data?.hay_mas;
        siguiente.textContent = "Ver más entradas";
        estado.textContent = tabla.rows.length
          ? `${tabla.rows.length} entradas mostradas`
          : "Aún no hay entradas de este origen en el período.";
      } catch (error) {
        if (!root.isConnected || turno !== solicitud) return;
        estado.textContent = "No se pudieron cargar las entradas de ChatGPT.";
        siguiente.textContent = "Reintentar";
        siguiente.hidden = false;
      }
    };

    filtro.addEventListener("change", () => {
      canal = filtro.value;
      cursor = null;
      tabla.replaceChildren();
      cargar();
    });
    siguiente.addEventListener("click", cargar);
    cargar();
  };
})();
