/*
 * Interfaz del carrito y del recorrido de pedido (carrito -> datos -> resumen ->
 * pago -> WhatsApp). Depende de window.BoomartCart (cart.js) y window.BOOMART_CHECKOUT
 * (checkout-config.js), ya cargados antes de este archivo. No modifica products.js/app.js
 * mas alla de los enganches ya agregados ahi (data-add-to-cart, etc.).
 */
(function () {
  "use strict";

  const CHECKOUT = window.BOOMART_CHECKOUT || {};
  const money = (value) => `S/${Number(value || 0).toFixed(2)}`;

  const cartToggle = document.querySelector("#cartToggle");
  const cartDrawer = document.querySelector("#cartDrawer");
  const cartBackdrop = document.querySelector("#cartBackdrop");
  const closeCartBtn = document.querySelector("#closeCart");
  const cartLinesEl = document.querySelector("#cartLines");
  const cartTotalDisplay = document.querySelector("#cartTotalDisplay");
  const cartCountEl = document.querySelector("#cartCount");
  const startCheckoutBtn = document.querySelector("#startCheckout");
  const clearCartBtn = document.querySelector("#clearCartBtn");
  const cartToast = document.querySelector("#cartToast");

  const checkoutDialog = document.querySelector("#checkoutDialog");
  const closeCheckoutBtn = document.querySelector("#closeCheckout");
  const customerForm = document.querySelector("#customerForm");
  const customerNameInput = document.querySelector("#customerName");
  const customerFormError = document.querySelector("#customerFormError");
  const destinationFieldsLima = document.querySelector('[data-destination-fields="lima"]');
  const destinationFieldsProv = document.querySelector('[data-destination-fields="provincias"]');
  const limaDistrictInput = document.querySelector("#limaDistrict");
  const provDepartmentInput = document.querySelector("#provDepartment");
  const provProvinceInput = document.querySelector("#provProvince");
  const provDistrictInput = document.querySelector("#provDistrict");
  const summaryLinesEl = document.querySelector("#summaryLines");
  const summaryTotalEl = document.querySelector("#summaryTotal");
  const summaryAdvanceEl = document.querySelector("#summaryAdvance");
  const summaryBalanceEl = document.querySelector("#summaryBalance");
  const deliveryTermsEl = document.querySelector("#deliveryTerms");
  const paymentAdvanceAmountEl = document.querySelector("#paymentAdvanceAmount");
  const paymentDetailEl = document.querySelector("#paymentDetail");
  const confirmWhatsappBtn = document.querySelector("#confirmWhatsapp");
  const reopenWhatsappLink = document.querySelector("#reopenWhatsapp");

  const customer = { name: "", destination: null, limaDistrict: "", provDepartment: "", provProvince: "", provDistrict: "" };
  let selectedPaymentMethod = null;

  // ---------- Carrito: badge + panel lateral ----------

  const cartLineMarkup = (line) => `
    <div class="cart-line" data-line-product="${line.productId}" data-line-variant="${line.variantKey || ""}">
      <div class="cart-line-media">
        ${line.image ? `<img src="${line.image}" alt="${line.name}" loading="lazy">` : ""}
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

    if (!cartState.lines.length) {
      cartLinesEl.innerHTML = `<p class="cart-empty">Tu carrito está vacío. Agrega productos desde el catálogo.</p>`;
    } else {
      cartLinesEl.innerHTML = cartState.lines.map(cartLineMarkup).join("");
    }

    cartTotalDisplay.textContent = money(cartState.totals.total);
    startCheckoutBtn.disabled = cartState.lines.length === 0;
  };

  const openCart = () => {
    cartDrawer.hidden = false;
    cartBackdrop.hidden = false;
    cartToggle.setAttribute("aria-expanded", "true");
    closeCartBtn.focus();
  };

  const closeCart = () => {
    cartDrawer.hidden = true;
    cartBackdrop.hidden = true;
    cartToggle.setAttribute("aria-expanded", "false");
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
      <button type="button" class="cart-toast-view" data-toast-view-cart>Ver carrito</button>
    `;
    cartToast.hidden = false;
    requestAnimationFrame(() => cartToast.classList.add("is-visible"));
    toastHideTimer = setTimeout(() => {
      cartToast.classList.remove("is-visible");
      toastCollapseTimer = setTimeout(() => {
        cartToast.hidden = true;
      }, 240);
    }, 2600);
  };

  cartToast.addEventListener("click", (event) => {
    if (event.target.closest("[data-toast-view-cart]")) {
      clearTimeout(toastHideTimer);
      clearTimeout(toastCollapseTimer);
      cartToast.classList.remove("is-visible");
      cartToast.hidden = true;
      openCart();
    }
  });

  cartToggle.addEventListener("click", () => {
    if (cartDrawer.hidden) openCart();
    else closeCart();
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
      if (addBtn) addBtn.disabled = false;
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

    if (event.target.closest("[data-add-to-cart]")) {
      const variantKey = container.dataset.variant || null;
      const qty = Number(qtyValueEl.textContent) || 1;
      const state = window.BoomartCart.add(productId, variantKey, qty);
      qtyValueEl.textContent = "1";
      const addedLine = state.lines.find(
        (line) => line.productId === productId && (line.variantKey || null) === variantKey
      );
      if (addedLine) showAddedToast(qty, addedLine, state.totals.itemCount);
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
  };

  const openCheckout = () => {
    if (window.BoomartCart.getState().lines.length === 0) return;
    closeCart();
    customerFormError.hidden = true;
    showStep("customer");
    checkoutDialog.showModal();
    customerNameInput.focus();
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
    const goTo = event.target.closest("[data-go-to]");
    if (goTo && goTo.dataset.goTo === "payment") {
      renderPaymentStep();
      showStep("payment");
    }
  });

  // Destino (Lima/Callao vs Provincias)
  document.querySelectorAll("[data-destination]").forEach((button) => {
    button.addEventListener("click", () => {
      const value = button.dataset.destination;
      customer.destination = value;
      document.querySelectorAll("[data-destination]").forEach((btn) => {
        const selected = btn.dataset.destination === value;
        btn.classList.toggle("is-selected", selected);
        btn.setAttribute("aria-pressed", String(selected));
      });
      destinationFieldsLima.hidden = value !== "lima";
      destinationFieldsProv.hidden = value !== "provincias";
    });
  });

  customerForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = customerNameInput.value.trim();

    if (!name) return showFormError("Ingresa tu nombre.");
    if (!customer.destination) return showFormError("Elige tu destino: Lima y Callao o Provincias.");

    if (customer.destination === "lima") {
      customer.limaDistrict = limaDistrictInput.value.trim();
      if (!customer.limaDistrict) return showFormError("Ingresa tu distrito.");
    } else {
      customer.provDepartment = provDepartmentInput.value.trim();
      customer.provProvince = provProvinceInput.value.trim();
      customer.provDistrict = provDistrictInput.value.trim();
      if (!customer.provDepartment || !customer.provProvince || !customer.provDistrict) {
        return showFormError("Ingresa departamento, provincia y distrito.");
      }
    }

    customer.name = name;
    customerFormError.hidden = true;
    renderSummaryStep();
    showStep("summary");
  });

  function showFormError(message) {
    customerFormError.textContent = message;
    customerFormError.hidden = false;
  }

  function destinationLabel() {
    if (customer.destination === "lima") {
      return `Lima y Callao — Distrito: ${customer.limaDistrict}`;
    }
    return `Provincias — ${customer.provDepartment} / ${customer.provProvince} / ${customer.provDistrict}`;
  }

  function renderSummaryStep() {
    const state = window.BoomartCart.getState();
    summaryLinesEl.innerHTML = state.lines
      .map(
        (line) => `
          <div class="summary-line">
            <span>${line.quantity}x ${line.name}${line.variantLabel ? ` (${line.variantLabel})` : ""}</span>
            <strong>${money(line.subtotal)}</strong>
          </div>
        `
      )
      .join("");
    summaryTotalEl.textContent = money(state.totals.total);
    summaryAdvanceEl.textContent = money(state.totals.advance);
    summaryBalanceEl.textContent = money(state.totals.balance);

    const terms = (CHECKOUT.deliveryTerms || {})[customer.destination];
    deliveryTermsEl.innerHTML = terms
      ? `
        <p class="delivery-terms-title">${destinationLabel()}</p>
        <p>${terms.summary}</p>
        <p>${terms.balanceCondition}</p>
      `
      : "";
  }

  function renderPaymentStep() {
    const state = window.BoomartCart.getState();
    paymentAdvanceAmountEl.textContent = money(state.totals.advance);
    selectedPaymentMethod = null;
    confirmWhatsappBtn.disabled = true;
    document.querySelectorAll("[data-payment-method]").forEach((btn) => {
      btn.classList.remove("is-selected");
      btn.setAttribute("aria-pressed", "false");
    });
    paymentDetailEl.innerHTML = "";
  }

  document.querySelectorAll("[data-payment-method]").forEach((button) => {
    button.addEventListener("click", () => {
      const methodKey = button.dataset.paymentMethod;
      selectedPaymentMethod = methodKey;
      document.querySelectorAll("[data-payment-method]").forEach((btn) => {
        const selected = btn === button;
        btn.classList.toggle("is-selected", selected);
        btn.setAttribute("aria-pressed", String(selected));
      });

      const method = (CHECKOUT.paymentMethods || {})[methodKey] || {};
      if (method.available && method.qrImage) {
        paymentDetailEl.innerHTML = `
          <div class="payment-qr">
            <img src="${method.qrImage}" alt="Código QR de ${method.label || methodKey} de BoomArt">
            ${method.holder ? `<p class="payment-holder">Titular: <strong>${method.holder}</strong></p>` : ""}
            ${method.phone ? `<p class="payment-phone">También puedes buscar el número <strong>${method.phone}</strong> directamente en ${method.label || methodKey}.</p>` : ""}
          </div>
        `;
      } else {
        paymentDetailEl.innerHTML = `
          <div class="payment-qr payment-qr-missing">
            <p>El QR de ${method.label || methodKey} todavía no está disponible en la web. Continúa y coordina el pago de tu adelanto directamente por WhatsApp.</p>
          </div>
        `;
      }
      confirmWhatsappBtn.disabled = false;
    });
  });

  function buildOrderMessage(state) {
    const methodLabel = ((CHECKOUT.paymentMethods || {})[selectedPaymentMethod] || {}).label || selectedPaymentMethod || "el metodo elegido";
    const terms = (CHECKOUT.deliveryTerms || {})[customer.destination] || { balanceCondition: "" };

    const itemLines = state.lines
      .map((line) => {
        const variantPart = line.variantLabel ? ` (${line.variantLabel})` : "";
        return `- ${line.quantity}x ${line.name}${variantPart} — ${money(line.unitPrice)} c/u — Subtotal ${money(line.subtotal)}`;
      })
      .join("\n");

    return [
      `Hola, BoomArt. Soy ${customer.name} y quiero realizar este pedido:`,
      "",
      itemLines,
      "",
      `Total de productos: ${money(state.totals.total)}`,
      `Adelanto del 50%: ${money(state.totals.advance)}`,
      `He realizado el adelanto mediante ${methodLabel}, pendiente de su validación.`,
      `Saldo de productos: ${money(state.totals.balance)}`,
      `Destino: ${destinationLabel()}`,
      "Envío: costo por coordinar, no incluido.",
      terms.balanceCondition,
      "Les envío a continuación mi comprobante para validar el adelanto e iniciar la fabricación."
    ].join("\n");
  }

  confirmWhatsappBtn.addEventListener("click", () => {
    if (!selectedPaymentMethod) return;
    const state = window.BoomartCart.getState();
    if (!state.lines.length) return;

    const message = buildOrderMessage(state);
    const number = CHECKOUT.whatsappNumber || "";
    const url = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;

    reopenWhatsappLink.href = url;
    window.open(url, "_blank", "noopener");
    showStep("done");
  });
})();
