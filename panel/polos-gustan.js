(function () {
  "use strict";
  const fmt = (n) => Number(n || 0).toLocaleString("es-PE");

  // Nombres de los polos (catalogo publico de /polos/). Se pide una sola vez.
  let catalogo = null;
  const pedirCatalogo = () => {
    if (!catalogo) {
      catalogo = fetch("../polos/data/polos.json", { cache: "no-cache" })
        .then((r) => (r.ok ? r.json() : {}))
        .then((d) => (Array.isArray(d.productos) ? d.productos : []))
        .catch(() => []);
    }
    return catalogo;
  };

  window.BoomartPolosGustan = async (sb, args, root) => {
    root.innerHTML = `
      <h2>Polos que más gustan <small>corazones, fichas abiertas y carrito por modelo</small></h2>
      <div class="tbl-wrap"><table>
        <thead><tr><th>Polo</th><th>Corazones</th><th>Abrieron la ficha</th><th>Agregaron al carrito</th></tr></thead>
        <tbody></tbody>
      </table></div>
      <p class="note" role="status">Cargando los polos…</p>`;
    const tabla = root.querySelector("tbody");
    const estado = root.querySelector("[role=status]");

    try {
      const [{ data, error }, polos] = await Promise.all([sb.rpc("panel_polos_gustan", args), pedirCatalogo()]);
      if (!root.isConnected) return;
      if (error) throw error;

      const sinDatos = { corazones: 0, vistas: 0, agregados: 0 };
      const medidos = new Map((Array.isArray(data) ? data : []).map((r) => [r.producto, r]));
      const filas = polos.map((p) => ({ ...sinDatos, ...medidos.get(p.id), nombre: p.nombre }));
      // Un polo medido que ya no esta en el catalogo se muestra con su codigo.
      const enCatalogo = new Set(polos.map((p) => p.id));
      medidos.forEach((r, id) => { if (!enCatalogo.has(id)) filas.push({ ...sinDatos, ...r, nombre: id }); });
      // Los empates conservan el orden del catalogo.
      filas.sort((a, b) => b.corazones - a.corazones || b.agregados - a.agregados || b.vistas - a.vistas);

      filas.forEach((f) => {
        const tr = tabla.insertRow();
        tr.insertCell().textContent = f.nombre;
        const corazones = document.createElement("strong");
        corazones.textContent = fmt(f.corazones);
        tr.insertCell().append(corazones);
        tr.insertCell().textContent = fmt(f.vistas);
        tr.insertCell().textContent = fmt(f.agregados);
      });

      const total = filas.reduce((suma, f) => suma + Number(f.corazones || 0), 0);
      estado.textContent = total
        ? `${total === 1 ? "1 corazón" : `${fmt(total)} corazones`} en el período. Cada persona cuenta una vez por polo y deja de contar si quita el corazón.`
        : "Todavía nadie marcó un corazón en este período. Cada persona cuenta una vez por polo.";
    } catch (error) {
      if (!root.isConnected) return;
      estado.textContent = "No se pudieron cargar los corazones de los polos.";
    }
  };
})();
