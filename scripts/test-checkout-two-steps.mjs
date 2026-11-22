import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const read = name => readFile(new URL(name, root), "utf8").then(text => text.replace(/\r\n/g, "\n"));
const checkout = await read("src/checkout.js");
const registration = await read("src/registro-web.js");
const products = JSON.parse(await read("data/products.json"));

test("portada y campañas tienen dos pantallas de compra y una confirmación", async () => {
  for (const file of ["index.html", "Halloween/index.html", "saintseiya/index.html"]) {
    const html = await read(file);
    const steps = [...html.matchAll(/class="checkout-step" data-step="([^"]+)"/g)].map(m => m[1]);
    assert.deepEqual(steps, ["customer", "payment", "done"], file);
    assert.match(html, /Paso 1 de 2/);
    assert.match(html, /Paso 2 de 2/);
    assert.doesNotMatch(html, /Paso [123] de 3|data-back-to="summary"|data-go-to="payment"|id="documentFields"/);
    const payment = html.slice(html.indexOf('data-step="payment"'), html.indexOf('data-step="done"'));
    for (const id of ["summaryLines", "summaryTotal", "summaryAdvance", "summaryBalance", "paymentAdvanceAmount", "summaryCustomer", "confirmWhatsapp"]) {
      assert.ok(payment.includes(`id="${id}"`), `${file}/${id}`);
    }
    assert.match(payment, /data-back-to="customer"/);
    assert.match(html, /valida cada pago de forma manual/);
  }
});

test("se conservan contacto, correo, documento y campos de entrega condicionales", () => {
  for (const field of ["full_name", "phone", "email", "document_type", "document_number"]) {
    assert.match(registration, new RegExp(`name="${field}"[^>]*required`), field);
  }
  for (const method of ["indriver", "shalom", "pickup"]) {
    assert.ok(registration.includes(`data-delivery="${method}" hidden`));
  }
  assert.match(registration, /requireDelivery/);
  assert.match(registration, /aria-describedby="reg-document-hint-/);
  assert.match(checkout, /No necesitas crear una contraseña/);
  assert.match(checkout, /submitLabel: "Revisar pedido y pago"/);
});

const phoneSource = registration.slice(registration.indexOf("const normalizePhone ="), registration.indexOf("// ---------- Perfil"));
const validateSource = registration.slice(registration.indexOf("function validate("), registration.indexOf("  /*\n   * Pinta", registration.indexOf("function validate(")));
const validation = vm.createContext({});
vm.runInContext(`${phoneSource}\n${validateSource}`, validation);
const valid = { full_name: "Cliente de Prueba", phone: "900000001", email: "cliente@example.test", document_type: "dni", document_number: "00000001", delivery_method: "pickup" };

test("validaciones: datos obligatorios, DNI, CE, pasaporte y modalidad de entrega", () => {
  assert.equal(validation.validate(valid, true), null);
  for (const [field, value] of [["full_name", "a"], ["phone", "123"], ["email", "sin-correo"], ["document_number", "123"], ["delivery_method", ""]]) {
    assert.equal(validation.validate({ ...valid, [field]: value }, true)[0], field);
  }
  for (const [document_type, document_number] of [["ce", "123456789"], ["pasaporte", "AB123456"]]) {
    assert.equal(validation.validate({ ...valid, document_type, document_number }, true), null);
    assert.equal(validation.validate({ ...valid, document_type, document_number: "123" }, true)[0], "document_number");
  }
  assert.equal(validation.validate({ ...valid, phone: "+51 900 000 001" }, true), null);
  assert.equal(validation.validate({ ...valid, delivery_method: "" }, false), null, "Mi cuenta conserva entrega opcional");
});

const cartSource = await read("src/cart.js");
const planSource = checkout.slice(checkout.indexOf("function paymentPlan("), checkout.indexOf("function refreshPaymentAmounts("));
const summarySource = checkout.slice(checkout.indexOf("function renderSummaryStep("), checkout.indexOf("  const paymentDisclaimerEl"));
const refreshSource = checkout.slice(checkout.indexOf("function refreshPaymentAmounts("), checkout.indexOf("function renderPaymentStep("));
function paymentContext(coupon) {
  const storage = new Map();
  const window = { BOOMART_PRODUCTS: products, localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) } };
  vm.runInNewContext(cartSource, { window, document: { body: { classList: { contains: () => false } } } });
  storage.set("boomart_customer_v1", JSON.stringify({ couponEligible: coupon }));
  window.BoomartCart.add("castillo-de-hogwarts", null, 1);
  window.BoomartCart.add("templo-aries", "combo", 1);
  const ctx = { window, polos: false, card: false, payMode: "advance", customer: { name: "Cliente de Prueba", phone: "900000001", email: "cliente@example.test", destination: "lima", deliveryMethod: "indriver" },
    CHECKOUT: { deliveryTerms: { lima: { summary: "Entrega local", balanceCondition: "Saldo pendiente de validación" } } },
    destinationLabel: () => 'Destino <img src=x onerror="alert(1)">',
    money: n => `S/${Number(n || 0).toFixed(2)}`,
    esc: s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]),
    document: { querySelectorAll: () => [] },
  };
  for (const key of ["summaryLinesEl", "summaryCouponRow", "summaryDiscountRow", "summarySubtotalEl", "summaryDiscountEl", "summaryTotalEl", "summaryAdvanceEl", "summaryBalanceEl", "summaryCustomerEl", "summaryShippingLabel", "summaryShippingValue", "deliveryTermsEl", "paymentAdvanceAmountEl"]) ctx[key] = { textContent: "", innerHTML: "", hidden: false };
  ctx.isCardPayment = () => ctx.card;
  vm.createContext(ctx);
  vm.runInContext(`${planSource}\n${summarySource}\n${refreshSource}`, ctx);
  return ctx;
}

test("resumen, monto a pagar y saldo coinciden con cupón, sin cupón, tarjeta, reserva y pago total", () => {
  for (const coupon of [false, true]) {
    const ctx = paymentContext(coupon);
    for (const card of [false, true, false]) {
      for (const payMode of ["advance", "full"]) {
        Object.assign(ctx, { card, payMode });
        ctx.refreshPaymentAmounts();
        const total = coupon && !card ? 189 : 210;
        const pay = payMode === "full" ? total : total / 2;
        assert.equal(ctx.summaryTotalEl.textContent, ctx.money(total));
        assert.equal(ctx.summaryAdvanceEl.textContent, ctx.money(pay));
        assert.equal(ctx.paymentAdvanceAmountEl.textContent, ctx.money(pay));
        assert.equal(ctx.summaryBalanceEl.textContent, ctx.money(total - pay));
        assert.equal(ctx.summaryDiscountRow.hidden, !(coupon && !card));
        assert.equal(ctx.summaryCouponRow.hidden, !(coupon && !card));
      }
    }
  }
});

test("el resumen trata el destino como texto y no describe envío cuando se elige recojo", () => {
  const ctx = paymentContext(false);
  ctx.refreshPaymentAmounts();
  assert.ok(ctx.deliveryTermsEl.innerHTML.includes("&lt;img"));
  assert.equal(ctx.deliveryTermsEl.innerHTML.includes("<img"), false);
  ctx.customer.deliveryMethod = "pickup";
  ctx.refreshPaymentAmounts();
  assert.equal(ctx.summaryShippingLabel.textContent, "Recojo");
  assert.equal(ctx.summaryShippingValue.textContent, "Previa coordinación");
  assert.match(ctx.deliveryTermsEl.innerHTML, /horario de recojo/);
  assert.doesNotMatch(ctx.deliveryTermsEl.innerHTML, /Entrega local/);
});

test("Olva: opción de entrega propia que comparte el bloque de agencia con Shalom", () => {
  assert.ok(registration.includes('name="delivery_method" value="olva"'));
  assert.match(registration, /olva-agencias\.json/);
  assert.match(registration, /const block = m === "olva" \? "shalom" : m;/);
  // deliveryFromProfile traduce un perfil Olva a destino provincias, con su tipo de punto.
  const fn = registration.slice(registration.indexOf("function deliveryFromProfile("), registration.indexOf("  async function loadProfile("));
  const ctx = vm.createContext({ kind: "" });
  vm.runInContext(`function olvaKind() { return kind; }\n${fn}`, ctx);
  const perfil = { delivery_method: "olva", shalom_name: "AGENTE CARAVELI", shalom_address: "AV. PERU NRO 104", shalom_department: "Arequipa", shalom_province: "Caraveli", shalom_district: "Caraveli" };
  ctx.kind = "Agente";
  const agente = ctx.deliveryFromProfile(perfil);
  assert.equal(agente.method, "olva");
  assert.equal(agente.destination, "provincias");
  assert.equal(agente.olvaKind, "Agente");
  assert.equal(agente.provDepartment, "Arequipa");
  assert.match(agente.label, /^Olva \(agente\) — AGENTE CARAVELI — Caraveli, Caraveli, Arequipa$/);
  ctx.kind = "";
  assert.match(ctx.deliveryFromProfile(perfil).label, /^Olva — AGENTE CARAVELI/);
  assert.equal(ctx.deliveryFromProfile({ ...perfil, delivery_method: "shalom" }).method, "shalom");
  assert.match(ctx.deliveryFromProfile({ ...perfil, delivery_method: "shalom" }).label, /^Shalom — /);
});

test("Olva: condiciones propias y aviso de pago del envío antes del despacho con agentes", async () => {
  const config = {};
  vm.runInNewContext(await read("src/checkout-config.js"), { window: config });
  const terms = config.BOOMART_CHECKOUT.deliveryTerms;
  assert.match(terms.olva.summary, /por Olva/);
  assert.match(terms.olva.balanceCondition, /clave de recojo/);
  assert.doesNotMatch(JSON.stringify(terms.olva), /Shalom|S\/\s*\d/, "sin mencionar Shalom ni montos de envío");
  assert.match(terms.provincias.summary, /por Shalom/, "Shalom conserva sus condiciones");

  const ctx = paymentContext(false);
  ctx.CHECKOUT = { deliveryTerms: terms };
  ctx.destinationLabel = () => "Olva — punto de prueba";
  const html = (deliveryMethod, olvaKind, destination = "provincias") => {
    Object.assign(ctx.customer, { deliveryMethod, olvaKind, destination });
    ctx.refreshPaymentAmounts();
    return ctx.deliveryTermsEl.innerHTML;
  };
  const agente = html("olva", "Agente");
  assert.ok(agente.includes(ctx.esc(terms.olva.summary)));
  assert.ok(agente.includes(ctx.esc(terms.olva.agentNote)), "con agente se avisa el pago previo del envío");
  const tienda = html("olva", "Tienda");
  assert.ok(tienda.includes(ctx.esc(terms.olva.balanceCondition)));
  assert.equal(tienda.includes("agente Olva: los agentes"), false, "con tienda no hay aviso de agente");
  assert.equal(tienda.includes(ctx.esc(terms.olva.agentNoteUnknown)), false);
  assert.ok(html("olva", "").includes(ctx.esc(terms.olva.agentNoteUnknown)), "sin saber el tipo, aviso general");
  const shalom = html("shalom", "");
  assert.ok(shalom.includes(ctx.esc(terms.provincias.summary)));
  assert.equal(/Olva/.test(shalom.replace("Olva — punto de prueba", "")), false, "Shalom no muestra textos de Olva");
});

test("no se crea una compra confirmada desde el checkout; los pedidos siguen por validar", () => {
  assert.match(checkout, /boomart:order-sent/);
  assert.doesNotMatch(checkout, /event_name\s*:\s*["']Purchase|confirmado_en|meta_compra_confirmar/);
  assert.match(registration, /registro_web_pedido_enviar/);
  assert.match(registration, /registro_web_guardar/);
});
