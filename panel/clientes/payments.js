import {moneyCents, validatePayment} from "./payments-model.mjs?v=1";

const $ = s => document.querySelector(s);
const dialog = $("#paymentDialog"), form = $("#paymentForm"), lines = $("#paymentLines");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const currency = n => new Intl.NumberFormat("es-PE", {style:"currency", currency:"PEN"}).format(n);
const stateNames = {pendiente:"Pendiente de envío",enviando:"Envío en curso",enviado:"Recibido por Meta",error:"Envío pendiente · reintentar",vencido:"Fuera del plazo de Meta"};
let client, customer, catalog, configured = false, busy = false, generation = 0;
let payments = [];
const catalogReady = fetch("../../data/products.json", {cache:"no-cache"}).then(r => {
  if (!r.ok) throw new Error("No se pudo cargar el catálogo.");
  return r.json();
}).then(data => {catalog = data; return data;});
// Se maneja incluso si la cuenta aún no inició sesión.
catalogReady.catch(() => {});

async function api(method, id) {
  const session = await client.auth.getSession();
  if (!session.data.session) throw new Error("Vuelve a iniciar sesión.");
  const cfg = window.BOOMART_SUPABASE;
  const response = await fetch(`${cfg.url}/functions/v1/meta-purchase`, {
    method, headers:{Authorization:`Bearer ${session.data.session.access_token}`, apikey:cfg.publishableKey,
      "Content-Type":"application/json"}, ...(id ? {body:JSON.stringify({id})} : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "No se pudo conectar con el servicio.");
  return result;
}

async function refresh(rows) {
  const current = ++generation;
  const [list, status] = await Promise.all([
    client.rpc("meta_compras_admin", {p_submissions:rows.map(r => r.id)}),
    api("GET").catch(() => ({configured:false})),
  ]);
  if (current !== generation) return;
  configured = status.configured === true;
  $("#paymentsConnection").textContent = list.error ? "No se pudo consultar el historial de pagos. Actualiza la bandeja."
    : configured ? "Compras conectadas con Meta. Confirma solo abonos verificados en tu cuenta."
    : "Pagos confirmados disponibles. Envío a Meta pendiente de configurar la conexión privada.";
  if (list.error) return;
  payments = list.data || [];
  const cards = [...$("#list").querySelectorAll(".record")];
  rows.forEach((r, index) => {
    const card = cards[index];
    if (!card) return;
    card.querySelector(".paymentHistory")?.remove();
    card.querySelector("[data-confirm-payment]")?.remove();
    if (["complete","whatsapp_opened","imported"].includes(r.status)) {
      const button = document.createElement("button");
      button.textContent = "Pago confirmado";
      button.dataset.confirmPayment = r.id;
      button.onclick = () => openPayment(r).catch(e => {$("#paymentsConnection").textContent = e.message;});
      card.querySelector(".actions").append(button);
    }
    const history = payments.filter(p => p.submission_id === r.id);
    if (history.length) {
      const block = document.createElement("div");
      block.className = "paymentHistory";
      block.innerHTML = history.map(p => `<div><strong>Pedido ${esc(p.pedido)}</strong> · ${esc(currency(p.total))}
        <span class="pill ${p.estado === "enviado" ? "ok" : ""}">${esc(stateNames[p.estado])}</span>
        <small>Abono verificado: ${esc(currency(p.abonado))} · ${esc(p.medio.toUpperCase())}</small>
        ${["pendiente","error","enviando"].includes(p.estado) && configured ? `<button data-retry="${esc(p.id)}">Reintentar envío</button>` : ""}</div>`).join("");
      block.querySelectorAll("[data-retry]").forEach(button => {button.onclick = async () => {
        button.disabled = true;
        try {
          const result = await api("POST", button.dataset.retry);
          $("#paymentsConnection").textContent = result.status === "enviado" ? "Meta recibió la compra." : "La confirmación sigue guardada. Revisa el estado del envío.";
        } catch (e) {$("#paymentsConnection").textContent = e.message;}
        await refresh(rows);
      };});
      card.append(block);
    }
  });
}

window.addEventListener("boomart:records", event => {
  client = event.detail.client;
  refresh(event.detail.rows).catch(() => {$("#paymentsConnection").textContent = "No se pudo consultar los pagos. Actualiza la bandeja.";});
});

function addLine() {
  const row = document.createElement("div");
  row.className = "paymentLine";
  row.innerHTML = `<label>Producto<select class="product" required><option value="">Selecciona una pieza</option>${catalog.map(p =>
    `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}</select></label>
    <label>Unidades<input class="quantity" type="number" min="1" max="999" step="1" value="1" required></label>
    <label>Precio vendido por unidad (S/)<input class="price" type="text" inputmode="decimal" placeholder="100,00" required></label>
    <button type="button" class="removeLine" aria-label="Quitar esta línea de producto">Quitar</button>`;
  row.querySelector(".product").onchange = () => {
    const product = catalog.find(p => p.id === row.querySelector(".product").value);
    const price = product?.price ?? product?.templePricing?.combo;
    row.querySelector(".price").value = price ? Number(price).toFixed(2).replace(".",",") : "";
    updateTotal();
  };
  row.querySelector(".removeLine").onclick = () => {row.remove();updateTotal();};
  row.addEventListener("input", updateTotal);
  lines.append(row);
}

function readLines() {
  return [...lines.children].map(row => ({id:row.querySelector(".product").value,
    quantity:row.querySelector(".quantity").value, item_price:row.querySelector(".price").value}));
}
function updateTotal() {
  try {
    const total = readLines().reduce((sum, p) => sum + moneyCents(p.item_price) * Number(p.quantity), 0);
    $("#paymentTotal").textContent = currency(total / 100);
  } catch {$("#paymentTotal").textContent = "Completa precios y cantidades";}
}
async function openPayment(row) {
  if (busy) return;
  await catalogReady;
  customer = row;
  form.reset();
  [...form.elements].forEach(el => el.disabled = false);
  lines.replaceChildren(); addLine();
  $("#paymentCustomer").textContent = row.full_name;
  $("#paymentMessage").textContent = "";
  $("#paymentTotal").textContent = currency(0);
  $("#paymentSubmit").disabled = false;
  $("#paymentSubmit").textContent = "Confirmar abono y registrar compra";
  $("#paymentCancel").textContent = "Cancelar";
  dialog.showModal();
}
$("#paymentAddLine").onclick = addLine;
$("#paymentCancel").onclick = () => {if (!busy) dialog.close();};
dialog.addEventListener("cancel", e => {if (busy) e.preventDefault();});
form.onsubmit = async event => {
  event.preventDefault();
  if (busy) return;
  const message = $("#paymentMessage"), submit = $("#paymentSubmit");
  let saved = false;
  try {
    const values = validatePayment({pedido:$("#paymentOrder").value, productos:readLines(), abonado:$("#paymentAmount").value,
      medio:$("#paymentMethod").value,referencia:$("#paymentReference").value,verified:$("#paymentVerified").checked},new Set(catalog.map(p => p.id)));
    busy = true; submit.disabled = true;
    // Los inputs quedan congelados hasta terminar; la consulta periódica no altera el formulario.
    [...form.elements].forEach(el => el.disabled = true);
    message.textContent = "Guardando confirmación…";
    const result = await client.rpc("meta_compra_confirmar", {p_submission:customer.id,...values});
    if (result.error) throw new Error(result.error.message);
    saved = true;
    let delivery;
    try {delivery = await api("POST", result.data);} catch {delivery = {status:"error"};}
    message.textContent = delivery.status === "enviado" ? "Abono registrado. Meta recibió la compra."
      : delivery.status === "sin_configurar" ? "Abono registrado. El envío a Meta queda pendiente de configurar la conexión privada."
      : "Abono registrado. Envío pendiente; puedes reintentarlo desde el historial sin duplicar la compra.";
    submit.textContent = "Confirmación guardada";
    $("#refresh").click();
  } catch (e) {message.textContent = e.message;}
  finally {
    busy = false;
    [...form.elements].forEach(el => el.disabled = saved);
    $("#paymentCancel").disabled = false;
    if (saved) $("#paymentCancel").textContent = "Cerrar";
  }
};
