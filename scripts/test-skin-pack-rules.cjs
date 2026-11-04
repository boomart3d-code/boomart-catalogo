const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm");
const products = JSON.parse(fs.readFileSync("data/products.json", "utf8"));
const product = products.find((p) => p.id === "skins-zelda-nintendo-switch-2");
const skins = product.modelOptions.filter((m) => !m.addon && m.id !== "set-11");
function fixture(items = []) {
  const storage = new Map([["boomart_cart_v1", JSON.stringify(items)]]);
  const context = {
    window: {
      BOOMART_PRODUCTS: products,
      localStorage: {
        getItem: (k) => storage.get(k) || null,
        setItem: (k, v) => storage.set(k, v),
        removeItem: (k) => storage.delete(k),
      },
    },
    document: { dispatchEvent() {}, addEventListener() {} },
    CustomEvent: class {},
    console,
  };
  vm.runInNewContext(fs.readFileSync("src/cart.js", "utf8"), context);
  return { cart: context.window.BoomartCart, storage };
}
const { cart } = fixture();
let cases = 0;
for (const skin of skins) {
  cart.clear();
  cart.add(product.id, "extra-" + skin.id, 1);
  assert.equal(cart.getState().lines.length, 0);
  cases++;
  const others = skins.filter((m) => m.id !== skin.id);
  for (let count = 0; count <= 10; count++) {
    cart.clear();
    cart.addSkinPack(
      product.id,
      { base: skin.id, extras: others.slice(0, count).map((m) => m.id) },
      1,
    );
    const state = cart.getState();
    assert.equal(state.totals.subtotal, count === 10 ? 200 : 50 + 20 * count);
    assert(
      state.lines.some(
        (l) => !product.modelOptions.find((m) => m.id === l.variantKey).addon,
      ),
    );
    if (count === 10) {
      assert.equal(state.lines.length, 1);
      assert.equal(state.lines[0].variantKey, "set-11");
    }
    cases++;
  }
}
cart.clear();
cart.addSkinPack(product.id, { base: "navi", extras: ["korok", "majora"] }, 2);
assert.equal(cart.getState().totals.subtotal, 180);
cart.clear();
cart.addSkinPack(
  product.id,
  { base: "navi", extras: ["korok", "korok", "navi"] },
  1,
);
assert.equal(cart.getState().totals.subtotal, 70);
cart.remove(product.id, "navi");
assert.equal(cart.getState().lines.length, 0);
cart.add("mascara-calavera", "con-cuernos:nino", 1);
cart.addSkinPack(product.id, { base: "navi", extras: ["korok"] }, 1);
cart.setQuantity(product.id, "navi", 0);
assert.equal(cart.getState().lines.length, 1);
assert.equal(cart.getState().lines[0].unitPrice, 135);
cart.clear();
cart.addSkinPack(product.id, { base: "extra-navi", extras: [] }, 1);
assert.equal(cart.getState().lines.length, 0);
cart.addSkinPack(product.id, { base: "navi", extras: ["inventado"] }, 1);
assert.equal(cart.getState().lines.length, 0);
cart.addSkinPack(product.id, { base: "set-11", extras: [] }, 1);
assert.equal(cart.getState().totals.subtotal, 200);
for (const variant of ["extra-korok", "extra-korok:invalido"]) {
  const old = fixture([{ productId: product.id, variant, quantity: 1 }]);
  assert.equal(old.cart.getState().lines.length, 0);
  assert.equal(JSON.parse(old.storage.get("boomart_cart_v1")).length, 0);
  const firstAction = fixture([
    { productId: product.id, variant, quantity: 1 },
  ]);
  firstAction.cart.addSkinPack(product.id, { base: "navi", extras: [] }, 1);
  assert.equal(firstAction.cart.getState().totals.subtotal, 50);
}
const legacy = fixture([
  { productId: "visor-de-cyclops", variant: "nino", quantity: 1 },
]);
assert.equal(legacy.cart.getState().lines[0].unitPrice, 90);
console.log(
  `PASS ${cases} base/design/count rules: 50/70/90; collection200; no orphan extras; deduplication, removal, reload, quantity and other products`,
);
