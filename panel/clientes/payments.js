// Studio es la fuente de ventas y abonos. Este módulo solo refleja sus datos.
import {studioPaymentView} from "./studio-payment-model.mjs?v=1";
const $ = s => document.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money = v => new Intl.NumberFormat("es-PE",{style:"currency",currency:"PEN"}).format(Number(v));
const date = v => new Date(v).toLocaleString("es-PE",{timeZone:"America/Lima",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"});
let generation = 0;
window.addEventListener("boomart:records", async event => {
  const mine = ++generation;
  const {client, rows} = event.detail;
  const ids = rows.map(r=>r.id);
  try {
    const [linked, history] = await Promise.all([
      client.rpc("panel_pagos_desde_studio",{p_submissions:ids}),
      client.rpc("meta_compras_admin",{p_submissions:ids}),
    ]);
    if (mine !== generation) return;
    $("#paymentsConnection").textContent = linked.error
      ? "No se pudo actualizar el estado de Studio. Pulsa Actualizar."
      : "Ventas y abonos se registran en Studio y se reflejan aquí automáticamente.";
    [...$("#list").querySelectorAll(".record")].forEach((card,index)=>{
      const row = rows[index];
      card.querySelectorAll(".paymentHistory, .studioPayment").forEach(el=>el.remove());
      card.querySelector("[data-confirm-payment]")?.remove();
      if (!row) return;
      const orders = (linked.data || []).filter(o=>o.submission_id === row.id);
      if (orders.length) {
        const block = document.createElement("div");block.className="studioPayment paymentHistory";
        block.innerHTML = orders.map(o=>{
          const view = studioPaymentView(o);
          return `<div><strong>Pedido web ${esc(o.codigo)}</strong> <span class="pill ${view.paid ? "ok" : ""}">${esc(view.label)}</span>
            ${o.nv && view.financial ? `<small>Venta vinculada automáticamente: ${esc(o.nv)}</small>` : ""}
            ${view.financial ? `<small>Total ${esc(money(o.total))} · Abonado ${esc(money(o.abonado))} · Saldo ${esc(money(o.saldo))}</small>` : ""}
            ${view.note ? `<small>${esc(view.note)}</small>` : ""}
            ${o.sincronizado_en ? `<small>Datos de Studio actualizados: ${esc(date(o.sincronizado_en))}</small>` : ""}</div>`;
        }).join("");
        card.append(block);
      }
      const old = (history.data || []).filter(p=>p.submission_id===row.id);
      if (old.length) {
        const block=document.createElement("div");block.className="paymentHistory";
        block.innerHTML=old.map(p=>`<div><small>Medición Meta anterior · ${esc(p.pedido)} · ${esc(p.estado)}</small>
          ${["pendiente","error","enviando"].includes(p.estado) ? `<button data-retry="${esc(p.id)}">Reintentar envío a Meta</button>` : ""}</div>`).join("");
        block.querySelectorAll("[data-retry]").forEach(button=>{button.onclick=async()=>{
          button.disabled=true;
          try {
            const session=await client.auth.getSession();
            if (!session.data.session) throw new Error("Vuelve a iniciar sesión.");
            const cfg=window.BOOMART_SUPABASE;
            const response=await fetch(`${cfg.url}/functions/v1/meta-purchase`,{method:"POST",
              headers:{Authorization:`Bearer ${session.data.session.access_token}`,apikey:cfg.publishableKey,"Content-Type":"application/json"},body:JSON.stringify({id:button.dataset.retry})});
            const result=await response.json();
            if (!response.ok) throw new Error(result.error || "No se pudo reintentar.");
            $("#paymentsConnection").textContent=result.status==="enviado" ? "Meta recibió la medición." : "El envío de medición sigue pendiente.";
          } catch(e) {$("#paymentsConnection").textContent=e.message;}
          finally {button.disabled=false;}
        };});card.append(block);
      }
    });
  } catch (_) {
    if (mine===generation) $("#paymentsConnection").textContent="No se pudo actualizar el estado de Studio. Pulsa Actualizar.";
  }
});
