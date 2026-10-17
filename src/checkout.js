/*
 * Interfaz del carrito y del recorrido de pedido (datos -> resumen y pago ->
 * WhatsApp). Depende de window.BoomartCart (cart.js) y window.BOOMART_CHECKOUT
 * (checkout-config.js), ya cargados antes de este archivo. No modifica products.js/app.js
 * mas alla de los enganches ya agregados ahi (data-add-to-cart, etc.).
 */
(function () {
  "use strict";

  const CHECKOUT = window.BOOMART_CHECKOUT || {};
  const money = (value) => `S/${Number(value || 0).toFixed(2)}`;
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // Medicion propia (src/track.js). Siempre opcional: nunca debe romper el carrito.
  const trackEvt = (name, props) => {
    try {
      if (window.BoomartTrack) window.BoomartTrack.event(name, props);
    } catch (e) { /* nada */ }
  };
  const trackCart = (name, extra) => {
    try {
      const totals = window.BoomartCart.getState().totals;
      trackEvt(name, Object.assign({ c: totals.itemCount, v: totals.total }, extra || {}));
    } catch (e) { /* nada */ }
  };

  // Mismo criterio que app.js: en pantalla se pide el .webp (mas liviano); el
  // .jpg original queda intacto para og:image. Ver scripts/optimize-images.mjs.
  const webpSrc = (src) =>
    src && src.startsWith("assets/products/") ? src.replace(/\.(jpe?g|png)$/i, ".webp") : src;

  // Recuerda nombre y destino del cliente en este mismo navegador/dispositivo
  // (localStorage), para autocompletar el formulario en su proxima visita. No
  // sincroniza entre dispositivos distintos: eso requeriria cuentas de usuario
  // y un servidor, que esta web no tiene.
  const CUSTOMER_STORAGE_KEY = "boomart_customer_v1";

  function safeCustomerStorage() {
    try {
      const testKey = "__boomart_storage_test__";
      window.localStorage.setItem(testKey, "1");
      window.localStorage.removeItem(testKey);
      return window.localStorage;
    } catch (err) {
      return null;
    }
  }

  const customerStorage = safeCustomerStorage();

  function loadSavedCustomer() {
    if (!customerStorage) return null;
    try {
      const raw = customerStorage.getItem(CUSTOMER_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch (err) {
      return null;
    }
  }

  function saveCustomer(data) {
    if (!customerStorage) return;
    try {
      // Fusiona en vez de reemplazar: account.js guarda aqui mismo datos que
      // este formulario no conoce (isAccountCustomer, docType, docNumber) --
      // sobrescribir todo el objeto los borraria sin querer.
      const existing = loadSavedCustomer() || {};
      customerStorage.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify({ ...existing, ...data }));
    } catch (err) {
      // almacenamiento no disponible (modo privado, cuota llena, etc.) -- el
      // formulario sigue funcionando, solo no se recuerda para la proxima visita.
    }
  }

  const cartToggle = document.querySelector("#cartToggle");
  const cartFloatToggle = document.querySelector("#cartFloatToggle");
  const cartCountFloatEl = document.querySelector("#cartCountFloat");
  const cartDrawer = document.querySelector("#cartDrawer");
  const cartBackdrop = document.querySelector("#cartBackdrop");
  const closeCartBtn = document.querySelector("#closeCart");
  const cartLinesEl = document.querySelector("#cartLines");
  const cartCouponRow = document.querySelector("#cartCouponRow");
  const cartSubtotalDisplay = document.querySelector("#cartSubtotalDisplay");
  const cartDiscountRow = document.querySelector("#cartDiscountRow");
  const cartDiscountDisplay = document.querySelector("#cartDiscountDisplay");
  const cartTotalDisplay = document.querySelector("#cartTotalDisplay");
  const cartCountEl = document.querySelector("#cartCount");
  const startCheckoutBtn = document.querySelector("#startCheckout");
  const clearCartBtn = document.querySelector("#clearCartBtn");
  const cartToast = document.querySelector("#cartToast");

  const checkoutDialog = document.querySelector("#checkoutDialog");
  const closeCheckoutBtn = document.querySelector("#closeCheckout");
  const summaryLinesEl = document.querySelector("#summaryLines");
  const summaryCouponRow = document.querySelector("#summaryCouponRow");
  const summarySubtotalEl = document.querySelector("#summarySubtotal");
  const summaryDiscountRow = document.querySelector("#summaryDiscountRow");
  const summaryDiscountEl = document.querySelector("#summaryDiscount");
  const summaryTotalEl = document.querySelector("#summaryTotal");
  const summaryAdvanceEl = document.querySelector("#summaryAdvance");
  const summaryBalanceEl = document.querySelector("#summaryBalance");
  const summaryCustomerEl = document.querySelector("#summaryCustomer");
  const summaryShippingLabel = document.querySelector("#summaryShippingLabel");
  const summaryShippingValue = document.querySelector("#summaryShippingValue");
  const deliveryTermsEl = document.querySelector("#deliveryTerms");
  const paymentAdvanceAmountEl = document.querySelector("#paymentAdvanceAmount");
  const paymentDetailEl = document.querySelector("#paymentDetail");
  const confirmWhatsappBtn = document.querySelector("#confirmWhatsapp");
  const reopenWhatsappLink = document.querySelector("#reopenWhatsapp");

  const customer = {
    name: "",
    lastName: "",
    phone: "",
    email: "",
    destination: null,
    limaDistrict: "",
    provDepartment: "",
    provProvince: "",
    addressDetail: ""
  };
  let selectedPaymentMethod = null;
  let payMode = "advance"; // "advance" (reserva 50%) | "full" (pago total 100%)

  // ---------- Carrito: badge + panel lateral ----------

  const cartLineMarkup = (line) => `
    <div class="cart-line" data-line-product="${line.productId}" data-line-variant="${line.variantKey || ""}">
      <div class="cart-line-media">
        ${line.image ? `<img src="${webpSrc(line.image)}" alt="${line.name}" loading="lazy" decoding="async">` : ""}
      </div>
      <div class="cart-line-info">
        <p class="cart-line-name">${line.name}</p>
        ${line.variantLabel ? `<p class="cart-line-variant">${line.variantLabel}</p>` : ""}
        <p class="cart-line-price">${money(line.unitPrice)} c/u</p>
        <div class="qty-stepper small" role="group" aria-label="Cantidad de ${line.name}">
          <button type="button" class="qty-btn" data-cart-qty-decrease aria-label="Quitar una unidad">−</button>
          <span class="qty-value">${line.quantity}</span>
          <button type="button" class="qty-btn" data-cart-qty-increase aria-label="Agregar una unidad">+</button>
        </div>
      </div>
      <div class="cart-line-end">
        <strong>${money(line.subtotal)}</strong>
        <button type="button" class="link-button" data-cart-remove aria-label="Quitar ${line.name} del carrito">Quitar</button>
      </div>
    </div>
  `;

  const renderCart = (state) => {
    const cartState = state || window.BoomartCart.getState();

    cartCountEl.textContent = String(cartState.totals.itemCount);
    cartCountEl.hidden = cartState.totals.itemCount === 0;
    cartCountFloatEl.textContent = String(cartState.totals.itemCount);
    cartCountFloatEl.hidden = cartState.totals.itemCount === 0;

    if (!cartState.lines.length) {
      cartLinesEl.innerHTML = `<p class="cart-empty">Tu carrito está vacío. Agrega productos desde el catálogo.</p>`;
    } else {
      cartLinesEl.innerHTML = cartState.lines.map(cartLineMarkup).join("");
    }

    const couponApplied = Boolean(cartState.totals.couponApplied);
    cartCouponRow.hidden = !couponApplied;
    cartDiscountRow.hidden = !couponApplied;
    if (couponApplied) {
      cartSubtotalDisplay.textContent = money(cartState.totals.subtotal);
      cartDiscountDisplay.textContent = `-${money(cartState.totals.discount)}`;
    }
    cartTotalDisplay.textContent = money(cartState.totals.total);
    startCheckoutBtn.disabled = cartState.lines.length === 0;
  };

  const openCart = () => {
    cartDrawer.hidden = false;
    cartBackdrop.hidden = false;
    cartToggle.setAttribute("aria-expanded", "true");
    cartFloatToggle.setAttribute("aria-expanded", "true");
    closeCartBtn.focus();
  };

  const closeCart = () => {
    cartDrawer.hidden = true;
    cartBackdrop.hidden = true;
    cartToggle.setAttribute("aria-expanded", "false");
    cartFloatToggle.setAttribute("aria-expanded", "false");
    cartToggle.focus();
  };

  // Aviso breve arriba al agregar un producto: NO abre el panel completo, para que
  // el cliente pueda seguir viendo y explorando todo el catalogo sin interrupcion.
  let toastHideTimer = null;
  let toastCollapseTimer = null;
  const showAddedToast = (addedQty, line, itemCount) => {
    clearTimeout(toastHideTimer);
    clearTimeout(toastCollapseTimer);
    const variantPart = line.variantLabel ? ` (${line.variantLabel})` : "";
    cartToast.innerHTML = `
      <span>Agregado: <strong>${addedQty}x ${line.name}${variantPart}</strong> · ${itemCount} producto${itemCount === 1 ? "" : "s"} en el carrito</span>
      <span class="cart-toast-actions">
        <button type="button" class="cart-toast-keep" data-toast-keep>Seguir comprando</button>
        <button type="button" class="cart-toast-view" data-toast-view-cart>Ver carrito</button>
      </span>
    `;
    cartToast.hidden = false;
    // doble via para que aparezca aunque rAF este pausado (pestana en 2do plano).
    requestAnimationFrame(() => cartToast.classList.add("is-visible"));
    setTimeout(() => cartToast.classList.add("is-visible"), 30);
    toastHideTimer = setTimeout(() => {
      cartToast.classList.remove("is-visible");
      toastCollapseTimer = setTimeout(() => {
        cartToast.hidden = true;
      }, 240);
    }, 4200);
  };

  const hideToast = () => {
    clearTimeout(toastHideTimer);
    clearTimeout(toastCollapseTimer);
    cartToast.classList.remove("is-visible");
    cartToast.hidden = true;
  };

  cartToast.addEventListener("click", (event) => {
    if (event.target.closest("[data-toast-view-cart]")) {
      hideToast();
      trackCart("abrir_carrito", { o: "aviso" });
      openCart();
    } else if (event.target.closest("[data-toast-keep]")) {
      hideToast();
    }
  });

  cartToggle.addEventListener("click", () => {
    if (cartDrawer.hidden) {
      trackCart("abrir_carrito", { o: "encabezado" });
      openCart();
    } else closeCart();
  });
  cartFloatToggle.addEventListener("click", () => {
    if (cartDrawer.hidden) {
      trackCart("abrir_carrito", { o: "flotante" });
      openCart();
    } else closeCart();
  });
  closeCartBtn.addEventListener("click", closeCart);
  cartBackdrop.addEventListener("click", closeCart);

  clearCartBtn.addEventListener("click", () => {
    if (window.BoomartCart.getState().lines.length === 0) return;
    if (window.confirm("¿Vaciar todo el carrito?")) {
      window.BoomartCart.clear();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !cartDrawer.hidden) closeCart();
  });

  // Delegado: agregar al carrito desde cualquier tarjeta o el modal de producto.
  document.addEventListener("click", (event) => {
    const container = event.target.closest(".add-to-cart");
    if (!container) return;
    const productId = container.dataset.product;

    const variantOption = event.target.closest("[data-variant-option]");
    if (variantOption) {
      container.dataset.variant = variantOption.dataset.variantOption;
      container.querySelectorAll("[data-variant-option]").forEach((btn) => {
        const selected = btn === variantOption;
        btn.classList.toggle("is-selected", selected);
        btn.setAttribute("aria-pressed", String(selected));
      });
      const addBtn = container.querySelector("[data-add-to-cart]");
      if (addBtn) {
        addBtn.disabled = false;
        // Mantiene al dia el resumen "Opcion · precio" del boton (ver app.js).
        const optionName = variantOption.querySelector("span")?.textContent.trim();
        const optionPrice = variantOption.querySelector("strong")?.textContent.trim();
        if (optionName && optionPrice) addBtn.dataset.priceLabel = `${optionName} · ${optionPrice}`;
      }
      return;
    }

    const qtyValueEl = container.querySelector("[data-qty-value]");
    if (event.target.closest("[data-qty-increase]")) {
      qtyValueEl.textContent = String(Number(qtyValueEl.textContent) + 1);
      return;
    }
    if (event.target.closest("[data-qty-decrease]")) {
      qtyValueEl.textContent = String(Math.max(1, Number(qtyValueEl.textContent) - 1));
      return;
    }

    const addBtn = event.target.closest("[data-add-to-cart]");
    if (addBtn) {
      const variantKey = container.dataset.variant || null;
      const qty = Number(qtyValueEl.textContent) || 1;
      const state = window.BoomartCart.add(productId, variantKey, qty);
      qtyValueEl.textContent = "1";
      const addedLine = state.lines.find(
        (line) => line.productId === productId && (line.variantKey || null) === variantKey
      );

      const fromModal = Boolean(addBtn.closest("#productModal"));
      trackEvt("agregar_carrito", {
        p: productId,
        c: qty,
        v: addedLine ? Number(addedLine.unitPrice) * qty : 0,
        o: fromModal ? "ficha" : "tarjeta",
        d: variantKey ? { variante: variantKey } : undefined,
      });

      // Feedback inmediato en el propio boton: "Agregado ✓" y bloqueo breve.
      const originalLabel = addBtn.textContent.trim();
      addBtn.classList.add("is-added");
      addBtn.textContent = "Agregado ✓";
      addBtn.disabled = true;
      if (!fromModal) {
        setTimeout(() => {
          addBtn.classList.remove("is-added");
          addBtn.textContent = originalLabel;
          addBtn.disabled = false;
        }, 1500);
      }

      const productModal = document.querySelector("#productModal");
      if (fromModal && productModal && productModal.open) {
        // Se deja ver el "Agregado ✓" en la ficha, se cierra, y recién ahí
        // aparece el aviso (si no, queda tapado por la ficha abierta).
        setTimeout(() => {
          document.dispatchEvent(new CustomEvent("boomart:dismiss-product"));
          if (addedLine) showAddedToast(qty, addedLine, state.totals.itemCount);
        }, 850);
      } else if (addedLine) {
        showAddedToast(qty, addedLine, state.totals.itemCount);
      }
    }
  });

  // Delegado: acciones dentro de las lineas del carrito (cantidad, quitar).
  cartLinesEl.addEventListener("click", (event) => {
    const line = event.target.closest("[data-line-product]");
    if (!line) return;
    const productId = line.dataset.lineProduct;
    const variantKey = line.dataset.lineVariant || null;

    if (event.target.closest("[data-cart-remove]")) {
      window.BoomartCart.remove(productId, variantKey);
      return;
    }
    if (event.target.closest("[data-cart-qty-increase]") || event.target.closest("[data-cart-qty-decrease]")) {
      const current = window.BoomartCart.getState().lines.find(
        (l) => l.productId === productId && (l.variantKey || null) === variantKey
      );
      if (!current) return;
      const delta = event.target.closest("[data-cart-qty-increase]") ? 1 : -1;
      window.BoomartCart.setQuantity(productId, variantKey, current.quantity + delta);
    }
  });

  window.BoomartCart.subscribe(renderCart);
  renderCart();
  // El carrito puede traer productos guardados de una visita anterior antes de que
  // el catalogo (data/products.json) termine de cargar; se vuelve a pintar cuando
  // ya esta listo para no mostrar el carrito vacio por error.
  document.addEventListener("boomart:products-ready", () => renderCart());

  // ---------- Checkout: pasos ----------

  const steps = Array.from(document.querySelectorAll(".checkout-step"));
  const showStep = (name) => {
    steps.forEach((section) => {
      section.hidden = section.dataset.step !== name;
    });
    const progress = checkoutDialog.querySelector(".checkout-progress");
    if (progress) {
      progress.hidden = name === "done";
      progress.querySelectorAll("[data-checkout-progress]").forEach((item) => {
        const active = item.dataset.checkoutProgress === name;
        item.classList.toggle("is-active", active);
        item.classList.toggle("is-complete", name === "payment" && item.dataset.checkoutProgress === "customer");
        if (active) item.setAttribute("aria-current", "step");
        else item.removeAttribute("aria-current");
      });
    }
    const shell = checkoutDialog.querySelector(".checkout-shell");
    if (shell) shell.scrollTop = 0;
    const heading = checkoutDialog.querySelector(`.checkout-step[data-step="${name}"] h2`);
    if (checkoutDialog.open && heading) heading.focus();
  };

  // ---------- Paso 1: datos del pedido (registro operativo conservado) ----------
  // Pedido de Adrián (2026-10-15): el paso 1 es el formulario de registro de
  // src/registro-web.js (mismos datos que /registro-cliente/, con el buscador de
  // agencias Shalom). Si ya se registró en este navegador, aparece prellenado
  // para confirmar o corregir. Al guardar, el servidor genera el código para
  // Studio y envía los correos; aquí solo se pasan los datos al resumen.
  const checkoutRegTitle = document.querySelector("#checkoutRegTitle");
  const checkoutRegHint = document.querySelector("#checkoutRegHint");
  const checkoutRegistroEl = document.querySelector("#checkoutRegistro");

  function applyRegistration(perfil) {
    const reg = window.BoomartRegistro;
    const d = reg ? reg.deliveryFromProfile(perfil) : {};
    customer.name = perfil.full_name || "";
    customer.lastName = "";
    customer.phone = perfil.phone || "";
    customer.email = perfil.email || "";
    customer.destination = d.destination || null;
    customer.limaDistrict = d.limaDistrict || "";
    customer.provDepartment = d.provDepartment || "";
    customer.provProvince = d.provProvince || "";
    customer.addressDetail = d.addressDetail || "";
    customer.deliveryLabel = d.label || "";
    customer.deliveryMethod = d.method || "";
    customer.docType = perfil.document_type || "";
    customer.docNumber = perfil.document_number || "";
  }

  function renderCustomerStep() {
    const reg = window.BoomartRegistro;
    if (!checkoutRegistroEl) return;
    if (!reg) {
      checkoutRegistroEl.innerHTML = `<p class="form-error">No pudimos cargar el registro en este momento. Revisa tu conexión o escríbenos por WhatsApp al 925 666 542 y te ayudamos con tu pedido.</p>`;
      return;
    }
    const registered = Boolean(reg.profile());
    checkoutRegTitle.textContent = registered ? "Revisa los datos de tu pedido" : "Completa los datos de tu pedido";
    checkoutRegHint.textContent = registered
      ? "Ya completamos tus datos guardados. Puedes corregirlos antes de revisar el pago."
      : "Los necesitamos para registrar tu pedido, preparar tu comprobante y coordinar la entrega. No necesitas crear una contraseña.";
    const cartContext = document.querySelector("#checkoutCartContext");
    if (cartContext) {
      const totals = window.BoomartCart.getState().totals;
      cartContext.textContent = `${totals.itemCount} producto${totals.itemCount === 1 ? "" : "s"} · Total de productos: ${money(totals.total)} · En el siguiente paso verás el pago y tu cupón, si corresponde.`;
    }
    reg.render(checkoutRegistroEl, {
      context: "checkout",
      requireDelivery: true,
      submitLabel: "Revisar pedido y pago",
      onSaved: (result) => {
        applyRegistration(result.perfil || reg.profile() || {});
        renderPaymentStep();
        showStep("payment");
      }
    });
  }

  const openCheckout = async () => {
    if (window.BoomartCart.getState().lines.length === 0) return;
    trackCart("iniciar_compra");
    closeCart();
    showStep("customer");
    if (window.BoomartRegistro && !window.BoomartRegistro.isLoaded()) {
      checkoutRegistroEl.innerHTML = `<p class="field-hint">Cargando…</p>`;
      checkoutDialog.showModal();
      await window.BoomartRegistro.loadProfile();
    } else if (window.BoomartRegistro) {
      // Refresca el cupón desde el servidor (pudo usarse en otro dispositivo).
      window.BoomartRegistro.loadProfile();
    }
    renderCustomerStep();
    if (!checkoutDialog.open) checkoutDialog.showModal();
    const first = checkoutRegistroEl.querySelector("input");
    if (first) first.focus();
  };

  startCheckoutBtn.addEventListener("click", openCheckout);
  closeCheckoutBtn.addEventListener("click", () => checkoutDialog.close());
  // A diferencia del modal de producto, este dialogo de varios pasos NO se cierra al
  // hacer clic fuera de su contenido: un clic apenas desviado del boton no debe botar
  // los datos que el cliente ya lleno. Solo se cierra con la X o "Cerrar"/"Volver".
  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-checkout]")) checkoutDialog.close();
    if (event.target.closest("[data-back-to-cart]")) {
      checkoutDialog.close();
      openCart();
    }
    const backTo = event.target.closest("[data-back-to]");
    if (backTo) showStep(backTo.dataset.backTo);
  });

  function destinationLabel() {
    if (customer.deliveryLabel) return customer.deliveryLabel;
    if (!customer.destination) return "Por coordinar por WhatsApp";
    const base =
      customer.destination === "lima"
        ? `Lima y Callao — Distrito: ${customer.limaDistrict}`
        : `Provincias — ${customer.provDepartment} / ${customer.provProvince}`;
    return customer.addressDetail ? `${base} — ${customer.addressDetail}` : base;
  }

  function renderSummaryStep() {
    const state = window.BoomartCart.getState();
    const plan = paymentPlan(state);
    summaryLinesEl.innerHTML = state.lines
      .map(
        (line) => `
          <div class="summary-line">
            <span>${line.quantity}x ${esc(line.name)}${line.variantLabel ? ` (${esc(line.variantLabel)})` : ""}</span>
            <strong>${money(line.subtotal)}</strong>
          </div>
        `
      )
      .join("");
    const couponApplied = plan.couponApplied;
    summaryCouponRow.hidden = !couponApplied;
    summaryDiscountRow.hidden = !couponApplied;
    if (couponApplied) {
      summarySubtotalEl.textContent = money(state.totals.subtotal);
      summaryDiscountEl.textContent = `-${money(state.totals.discount)}`;
    }
    summaryTotalEl.textContent = money(plan.base);
    summaryAdvanceEl.textContent = money(plan.pay);
    summaryBalanceEl.textContent = money(plan.balance);
    if (summaryCustomerEl) {
      summaryCustomerEl.textContent = [customer.name, `WhatsApp: ${customer.phone}`, `Correo: ${customer.email}`].join(" · ");
    }
    const pickup = customer.deliveryMethod === "pickup";
    if (summaryShippingLabel) summaryShippingLabel.textContent = pickup ? "Recojo" : "Envío";
    if (summaryShippingValue) summaryShippingValue.textContent = pickup ? "Previa coordinación" : "Costo por coordinar, no incluido";

    const terms = (CHECKOUT.deliveryTerms || {})[customer.destination];
    deliveryTermsEl.innerHTML = pickup
      ? `<p class="delivery-terms-title">${esc(destinationLabel())}</p><p>Coordinaremos por WhatsApp la fecha y el horario de recojo.</p>`
      : terms
      ? `
        <p class="delivery-terms-title">${esc(destinationLabel())}</p>
        <p>${esc(terms.summary)}</p>
        <p>${esc(terms.balanceCondition)}</p>
      `
      : "";
  }

  const paymentDisclaimerEl = document.querySelector("#paymentDisclaimer");
  const doneTextEl = document.querySelector("#doneText");
  const DISCLAIMER_DEFAULT = paymentDisclaimerEl ? paymentDisclaimerEl.textContent : "";
  const CONFIRM_LABEL_DEFAULT = confirmWhatsappBtn.textContent;
  const DONE_TEXT_DEFAULT = doneTextEl ? doneTextEl.innerHTML : "";

  const selectedMethodConfig = () => (CHECKOUT.paymentMethods || {})[selectedPaymentMethod] || {};
  const isCardPayment = () => selectedMethodConfig().type === "link";

  // Monto segun el metodo y la modalidad elegidos. El cupon de bienvenida solo
  // rige para Yape/Plin/transferencia: con tarjeta (enlace de pago, que tiene
  // comision) se cobra el subtotal sin descuento.
  function paymentPlan(state) {
    const t = state.totals;
    const card = isCardPayment();
    const baseCents = Math.round((card ? t.subtotal : t.total) * 100);
    const advanceCents = Math.round(baseCents * t.advanceRate);
    return {
      card,
      couponApplied: Boolean(t.couponApplied) && !card,
      couponSkipped: Boolean(t.couponApplied) && card,
      base: baseCents / 100,
      advance: advanceCents / 100,
      full: baseCents / 100,
      pay: (payMode === "full" ? baseCents : advanceCents) / 100,
      balance: (payMode === "full" ? 0 : baseCents - advanceCents) / 100
    };
  }

  function refreshPaymentAmounts() {
    const plan = paymentPlan(window.BoomartCart.getState());
    paymentAdvanceAmountEl.textContent = money(plan.pay);
    document.querySelectorAll("[data-pay-mode-amount]").forEach((el) => {
      el.textContent = money(el.dataset.payModeAmount === "full" ? plan.full : plan.advance);
    });
    renderSummaryStep();
  }

  function renderPaymentStep() {
    selectedPaymentMethod = null;
    payMode = "advance";
    document.querySelectorAll("[data-pay-mode]").forEach((btn) => {
      const on = btn.dataset.payMode === "advance";
      btn.classList.toggle("is-selected", on);
      btn.setAttribute("aria-pressed", String(on));
    });
    refreshPaymentAmounts();
    paymentDisclaimerEl.textContent = DISCLAIMER_DEFAULT;
    confirmWhatsappBtn.textContent = CONFIRM_LABEL_DEFAULT;
    confirmWhatsappBtn.disabled = true;
    document.querySelectorAll("[data-payment-method]").forEach((btn) => {
      btn.classList.remove("is-selected");
      btn.setAttribute("aria-pressed", "false");
    });
    paymentDetailEl.innerHTML = "";

  }

  document.querySelectorAll("[data-payment-method]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedPaymentMethod = button.dataset.paymentMethod;
      document.querySelectorAll("[data-payment-method]").forEach((btn) => {
        const selected = btn === button;
        btn.classList.toggle("is-selected", selected);
        btn.setAttribute("aria-pressed", String(selected));
      });
      renderPaymentDetail();
    });
  });

  document.querySelectorAll("[data-pay-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      payMode = button.dataset.payMode === "full" ? "full" : "advance";
      document.querySelectorAll("[data-pay-mode]").forEach((btn) => {
        const selected = btn === button;
        btn.classList.toggle("is-selected", selected);
        btn.setAttribute("aria-pressed", String(selected));
      });
      if (selectedPaymentMethod) renderPaymentDetail();
      else refreshPaymentAmounts();
    });
  });

  function renderPaymentDetail() {
      refreshPaymentAmounts();
      const plan = paymentPlan(window.BoomartCart.getState());
      const methodKey = selectedPaymentMethod;
      const method = (CHECKOUT.paymentMethods || {})[methodKey] || {};
      const label = method.label || methodKey;
      const holderHtml = method.holder ? `<p class="payment-holder">Titular: <strong>${method.holder}</strong></p>` : "";

      const copyRow = (rowLabel, value, copyLabel) => `
        <div class="payment-phone-box">
          <p>${rowLabel}</p>
          <div class="payment-phone-row">
            <strong class="payment-phone-number">${value}</strong>
            <button type="button" class="button secondary" data-copy-value="${value}">${copyLabel}</button>
          </div>
        </div>
      `;

      paymentDisclaimerEl.textContent = DISCLAIMER_DEFAULT;
      confirmWhatsappBtn.textContent = CONFIRM_LABEL_DEFAULT;

      if (method.type === "link" && method.available) {
        const gateway = method.gateway || "nuestra pasarela de pago";
        const couponNote = plan.couponSkipped
          ? `<p class="payment-coupon-note">🎁 El cupón de bienvenida (-10%) se aplica únicamente a pagos por Yape, Plin o transferencia bancaria. Con tarjeta se paga el precio sin descuento. Tu cupón sigue disponible para otra compra.</p>`
          : "";
        paymentDetailEl.innerHTML = `
          <div class="payment-qr payment-card-link">
            <p><strong>Pago seguro con tarjeta de crédito o débito</strong> a través de <strong>${gateway}</strong>.</p>
            <p>Pagarás <strong>${money(plan.pay)}</strong> (${payMode === "full" ? "pago total" : "reserva del 50%"}). Te enviaremos por WhatsApp un enlace de pago de ${gateway} por ese monto exacto. Ingresas los datos de tu tarjeta solo en la página de ${gateway}: BoomArt nunca ve ni guarda los datos de tu tarjeta.</p>
            ${couponNote}
          </div>
        `;
        paymentDisclaimerEl.textContent = `Tu pedido queda pendiente hasta que se confirme el pago realizado en el enlace de ${gateway}.`;
        confirmWhatsappBtn.textContent = "Solicitar enlace de pago por WhatsApp";
      } else if (method.type === "account" && method.available && method.accountNumber) {
        paymentDetailEl.innerHTML = `
          <div class="payment-qr payment-account">
            ${holderHtml}
            ${copyRow(`Número de cuenta ${label}:`, method.accountNumber, "Copiar cuenta")}
            ${method.cci ? copyRow("CCI (transferencia interbancaria):", method.cci, "Copiar CCI") : ""}
          </div>
        `;
      } else if (method.type !== "account" && method.available && method.qrImage) {
        paymentDetailEl.innerHTML = `
          <div class="payment-qr">
            <a href="${method.qrImage}" target="_blank" rel="noreferrer" aria-label="Ver código QR de ${label} en tamaño completo">
              <img src="${method.qrImage}" alt="Código QR de ${label} de BoomArt">
            </a>
            <a class="button secondary" href="${method.qrImage}" download="${label}-BoomArt-QR.jpg">Descargar código QR</a>
            <p class="payment-qr-hint">¿Pagas desde este mismo celular? Descarga el QR o mantenlo presionado para guardarlo, y ábrelo desde ${label}.</p>
            ${holderHtml}
            ${method.phone ? copyRow(`O búscala directamente en ${label} con este número:`, method.phone, "Copiar número") : ""}
          </div>
        `;
      } else {
        const missingWhat = method.type === "account" ? `El número de cuenta ${label}` : method.type === "link" ? "El pago con tarjeta" : `El QR de ${label}`;
        paymentDetailEl.innerHTML = `
          <div class="payment-qr payment-qr-missing">
            <p>${missingWhat} todavía no está disponible en la web. Continúa y coordina el pago de tu adelanto directamente por WhatsApp.</p>
          </div>
        `;
      }
      confirmWhatsappBtn.disabled = false;
  }

  paymentDetailEl.addEventListener("click", async (event) => {
    const copyBtn = event.target.closest("[data-copy-value]");
    if (!copyBtn) return;
    const value = copyBtn.dataset.copyValue;
    const originalLabel = copyBtn.textContent;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Respaldo para navegadores sin Clipboard API (o sin permiso): selecciona
      // el texto manualmente y usa el comando de copia clasico. El truco de
      // posicionarlo fuera de pantalla (en vez de opacity:0) es necesario para
      // que Safari/iOS permita seleccionarlo.
      const helper = document.createElement("textarea");
      helper.value = value;
      helper.setAttribute("readonly", "");
      helper.style.position = "absolute";
      helper.style.left = "-9999px";
      document.body.appendChild(helper);
      const range = document.createRange();
      range.selectNodeContents(helper);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      helper.setSelectionRange(0, value.length);
      document.execCommand("copy");
      selection.removeAllRanges();
      document.body.removeChild(helper);
    }
    copyBtn.textContent = "¡Copiado!";
    setTimeout(() => {
      copyBtn.textContent = originalLabel;
    }, 1800);
  });

  const DOC_TYPE_LABELS = { dni: "DNI", ce: "Carnet de Extranjería", pasaporte: "Pasaporte" };

  // Código del pedido web (W-XXXXX). Se genera AQUÍ, en el mismo clic, porque
  // WhatsApp tiene que abrirse sin esperar al servidor (si no, el navegador
  // bloquea la ventana). Sin I/O/0/1 para que se lea y dicte sin errores; el
  // servidor lo valida y no permite repetidos.
  const ORDER_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  function newOrderCode() {
    const bytes = new Uint32Array(5);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 1e9);
    }
    return "W-" + Array.from(bytes, (n) => ORDER_CODE_ALPHABET[n % ORDER_CODE_ALPHABET.length]).join("");
  }

  function orderPayload(state, plan, code) {
    const method = selectedMethodConfig();
    return {
      codigo: code,
      metodo: selectedPaymentMethod || "",
      metodo_label: (method && (method.label || method.gateway)) || selectedPaymentMethod || "",
      modalidad: payMode === "full" ? "total" : "adelanto",
      tarjeta: Boolean(plan.card),
      destino: destinationLabel(),
      total: plan.card ? state.totals.subtotal : state.totals.total,
      monto_a_pagar: plan.pay,
      items: state.lines.map((line) => ({
        id: line.productId,
        nombre: line.name,
        variante: line.variantLabel || "",
        variante_clave: line.variantKey || "",
        cantidad: line.quantity,
        precio: line.unitPrice
      }))
    };
  }

  function buildCardMessage(state, plan) {
    const items = state.lines
      .map((line) => {
        const variantPart = line.variantLabel ? ` (${line.variantLabel})` : "";
        return `- ${line.quantity}x ${line.name}${variantPart} — ${money(line.unitPrice)} c/u — Subtotal ${money(line.subtotal)}`;
      })
      .join("\n");
    const values = {
      nombre: customer.name,
      apellido: customer.lastName,
      pedido: `${items}\nTotal de productos: ${money(plan.base)}`,
      modalidad: payMode === "full" ? "pago total (100%)" : "reserva del 50%",
      monto: money(plan.pay),
      pasarela: selectedMethodConfig().gateway || "la pasarela de pago",
      destino: destinationLabel(),
      correo: customer.email
    };
    const template = Array.isArray(CHECKOUT.cardPaymentMessage) ? CHECKOUT.cardPaymentMessage : [];
    return template.join("\n").replace(/\{(\w+)\}/g, (m, key) => (key in values ? values[key] : m));
  }

  function buildOrderMessage(state, code) {
    const plan = paymentPlan(state);
    if (plan.card) return `${buildCardMessage(state, plan)}

Código de pedido: ${code}`;
    const methodLabel = ((CHECKOUT.paymentMethods || {})[selectedPaymentMethod] || {}).label || selectedPaymentMethod || "el metodo elegido";

    const itemLines = state.lines
      .map((line) => {
        const variantPart = line.variantLabel ? ` (${line.variantLabel})` : "";
        return `- ${line.quantity}x ${line.name}${variantPart} — ${money(line.unitPrice)} c/u — Subtotal ${money(line.subtotal)}`;
      })
      .join("\n");

    const docType = customer.docType;
    const docNumber = customer.docNumber;
    const docLine = docType && docNumber ? [`Documento para boleta: ${DOC_TYPE_LABELS[docType] || docType} ${docNumber}`] : [];
    const couponLines = state.totals.couponApplied
      ? [
          `Subtotal: ${money(state.totals.subtotal)}`,
          `Cupón de bienvenida (-10%): -${money(state.totals.discount)}`
        ]
      : [];

    return [
      `Hola, BoomArt. Soy ${`${customer.name} ${customer.lastName}`.trim()} y quiero realizar este pedido:`,
      `Código de pedido: ${code}`,
      "",
      itemLines,
      "",
      ...couponLines,
      `Total de productos: ${money(state.totals.total)}`,
      payMode === "full"
        ? `Pago total (100%): ${money(plan.pay)}`
        : `Adelanto del 50%: ${money(plan.pay)}`,
      payMode === "full"
        ? `He realizado el pago total mediante ${methodLabel}.`
        : `He realizado el adelanto mediante ${methodLabel}.`,
      `Destino: ${destinationLabel()}`,
      `WhatsApp: ${customer.phone}`,
      `Correo: ${customer.email}`,
      ...docLine,
      "",
      `Ahora les comparto el voucher de mi pago por ${methodLabel}.`
    ].join("\n");
  }

  confirmWhatsappBtn.addEventListener("click", () => {
    if (!selectedPaymentMethod) return;
    const state = window.BoomartCart.getState();
    if (!state.lines.length) return;

    const code = newOrderCode();
    const message = buildOrderMessage(state, code);
    const number = CHECKOUT.whatsappNumber || "";
    const url = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;

    const plan = paymentPlan(state);
    if (doneTextEl) {
      const codeHtml = `<span class="order-code">Tu código de pedido: <strong>${code}</strong></span>`;
      doneTextEl.innerHTML = codeHtml + (plan.card
        ? `Se abrió WhatsApp con tu solicitud ya redactada. Revisa el mensaje y pulsa <strong>Enviar</strong>. Te responderemos con tu enlace de pago de ${selectedMethodConfig().gateway || "la pasarela"} por ${money(plan.pay)}. Tu pedido queda pendiente hasta que se confirme el pago.`
        : DONE_TEXT_DEFAULT);
    }
    reopenWhatsappLink.href = url;
    window.open(url, "_blank", "noopener");
    trackEvt("pedido_whatsapp", {
      c: state.totals.itemCount,
      v: state.totals.total,
      d: { metodo: selectedPaymentMethod, cupon: plan.couponApplied ? "si" : "no" },
    });
    document.dispatchEvent(
      new CustomEvent("boomart:order-sent", {
        detail: { couponApplied: plan.couponApplied, pedido: orderPayload(state, plan, code) }
      })
    );
    showStep("done");
  });
})();
