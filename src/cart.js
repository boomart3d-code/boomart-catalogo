/*
 * Estado del carrito de compra. Sin dependencias externas, guarda en localStorage
 * cuando esta disponible (si no, el carrito sigue funcionando solo durante la sesion).
 * Los precios NUNCA se guardan en el carrito: cada linea solo guarda productId +
 * variante + cantidad, y el precio se resuelve siempre contra el catalogo vigente
 * (window.BOOMART_PRODUCTS) al momento de mostrarlo o calcular totales.
 */
(function () {
  "use strict";

  const STORAGE_KEY = "boomart_cart_v1";
  // Cupon de bienvenida (pedido de Adrian, 2026-09-29): 10% para clientes
  // logueados que todavia no lo usaron. La elegibilidad real vive en
  // Supabase; account.js la refleja aqui via localStorage (misma llave
  // "boomart_customer_v1" que ya usa checkout.js) para que este archivo no
  // dependa de Supabase ni de account.js directamente.
  const CUSTOMER_STORAGE_KEY = "boomart_customer_v1";
  const WELCOME_COUPON_RATE = 0.1;
  const listeners = new Set();

  function safeStorage() {
    try {
      const testKey = "__boomart_storage_test__";
      window.localStorage.setItem(testKey, "1");
      window.localStorage.removeItem(testKey);
      return window.localStorage;
    } catch (err) {
      return null;
    }
  }

  const storage = safeStorage();
  let items = loadFromStorage();

  function loadFromStorage() {
    if (!storage) return [];
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((line) => line && typeof line.productId === "string")
        .map((line) => ({
          productId: line.productId,
          variant: line.variant || null,
          quantity: Math.max(1, Math.floor(Number(line.quantity) || 1))
        }));
    } catch (err) {
      return [];
    }
  }

  function persist() {
    if (!storage) return;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (err) {
      // almacenamiento no disponible (modo privado, cuota llena, etc.) -- el carrito
      // sigue funcionando en memoria durante la sesion actual.
    }
  }

  function notify() {
    listeners.forEach((fn) => {
      try {
        fn(getState());
      } catch (err) {
        /* un listener roto no debe tumbar el resto */
      }
    });
  }

  function findProduct(productId) {
    const catalog = window.BOOMART_PRODUCTS || [];
    return catalog.find((product) => product.id === productId) || null;
  }

  // Resuelve nombre, imagen y precio unitario vigente para una variante de producto.
  // variantKey: null para productos simples; "temple" | "pandora" | "combo" para templos.
  function resolveVariant(product, variantKey) {
    if (!product) return null;
    if (product.templePricing) {
      const key = variantKey && product.templePricing[variantKey] != null ? variantKey : null;
      if (!key) return null;
      const labels = { temple: "Templo", pandora: "Pandora Box + pedestal", combo: "Combo (templo + Pandora Box)" };
      return {
        variantKey: key,
        variantLabel: labels[key],
        unitPrice: Number(product.templePricing[key])
      };
    }
    return {
      variantKey: null,
      variantLabel: null,
      unitPrice: Number(product.offerPrice != null ? product.offerPrice : product.regularPrice) || 0
    };
  }

  function toCents(soles) {
    return Math.round(Number(soles || 0) * 100);
  }

  function fromCents(cents) {
    return Number((cents / 100).toFixed(2));
  }

  function lineKey(productId, variantKey) {
    return `${productId}::${variantKey || "-"}`;
  }

  function readCouponEligible() {
    if (!storage) return false;
    try {
      const raw = storage.getItem(CUSTOMER_STORAGE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return Boolean(parsed && parsed.couponEligible);
    } catch (err) {
      return false;
    }
  }

  // Devuelve las lineas del carrito ya resueltas contra el catalogo vigente,
  // descartando silenciosamente productos/variantes que ya no existan.
  function getResolvedLines() {
    const resolved = [];
    items.forEach((line) => {
      const product = findProduct(line.productId);
      if (!product) return;
      const variant = resolveVariant(product, line.variant);
      if (!variant) return;
      const unitCents = toCents(variant.unitPrice);
      const quantity = Math.max(1, Math.floor(line.quantity));
      resolved.push({
        productId: product.id,
        name: product.name,
        category: product.category,
        image: product.image || "",
        variantKey: variant.variantKey,
        variantLabel: variant.variantLabel,
        unitPrice: variant.unitPrice,
        quantity,
        subtotal: fromCents(unitCents * quantity)
      });
    });
    return resolved;
  }

  function getTotals(lines) {
    const resolvedLines = lines || getResolvedLines();
    const subtotalCents = resolvedLines.reduce((sum, line) => sum + toCents(line.unitPrice) * line.quantity, 0);
    const couponApplied = resolvedLines.length > 0 && readCouponEligible();
    const discountCents = couponApplied ? Math.round(subtotalCents * WELCOME_COUPON_RATE) : 0;
    const totalCents = subtotalCents - discountCents;
    const rate = Number((window.BOOMART_CHECKOUT && window.BOOMART_CHECKOUT.advanceRate) || 0.5);
    const advanceCents = Math.round(totalCents * rate);
    const balanceCents = totalCents - advanceCents;
    return {
      itemCount: resolvedLines.reduce((sum, line) => sum + line.quantity, 0),
      subtotal: fromCents(subtotalCents),
      couponApplied,
      discount: fromCents(discountCents),
      total: fromCents(totalCents),
      advance: fromCents(advanceCents),
      balance: fromCents(balanceCents),
      advanceRate: rate
    };
  }

  function getState() {
    const lines = getResolvedLines();
    return { lines, totals: getTotals(lines) };
  }

  function add(productId, variantKey, quantity) {
    const product = findProduct(productId);
    if (!product) return getState();
    const variant = resolveVariant(product, variantKey || null);
    if (!variant) return getState();
    const qty = Math.max(1, Math.floor(Number(quantity) || 1));
    const key = lineKey(productId, variant.variantKey);
    const existing = items.find((line) => lineKey(line.productId, line.variant) === key);
    if (existing) {
      existing.quantity += qty;
    } else {
      items.push({ productId, variant: variant.variantKey, quantity: qty });
    }
    persist();
    notify();
    return getState();
  }

  function setQuantity(productId, variantKey, quantity) {
    const key = lineKey(productId, variantKey || null);
    const qty = Math.floor(Number(quantity) || 0);
    if (qty <= 0) {
      items = items.filter((line) => lineKey(line.productId, line.variant) !== key);
    } else {
      const existing = items.find((line) => lineKey(line.productId, line.variant) === key);
      if (existing) existing.quantity = qty;
    }
    persist();
    notify();
    return getState();
  }

  function remove(productId, variantKey) {
    const key = lineKey(productId, variantKey || null);
    items = items.filter((line) => lineKey(line.productId, line.variant) !== key);
    persist();
    notify();
    return getState();
  }

  function clear() {
    items = [];
    persist();
    notify();
    return getState();
  }

  function subscribe(fn) {
    if (typeof fn !== "function") return () => {};
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  // Fuerza a los suscriptores a repintar con el estado actual, sin cambiar
  // nada del carrito -- lo usa account.js cuando cambia la elegibilidad del
  // cupon de bienvenida (login/registro) para que un carrito ya abierto en
  // pantalla actualice sus totales sin esperar a que se agregue/quite algo.
  function refresh() {
    notify();
  }

  window.BoomartCart = {
    getState,
    getTotals,
    add,
    setQuantity,
    remove,
    clear,
    subscribe,
    refresh,
    // utilidades expuestas para checkout.js (mensaje de WhatsApp, formularios, etc.)
    toCents,
    fromCents
  };
})();
