import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFile(path.join(root, file), "utf8");
const products = JSON.parse(await read("data/products.json"));
const catalog = JSON.parse(await read("catalogo.json"));
const google = await read("feed-google.xml");
const meta = await read("feed-meta.csv");
const appSource = await read("src/app.js");
const official = (p) => p.templePricing?.temple ?? p.regularPrice;
let checks = 0;
function check(fn) { fn(); checks++; }

check(() => assert.equal(catalog.count, products.length));
check(() => assert.equal(products.find(p => p.id === "castillo-de-hogwarts").regularPrice, 80));
check(() => assert.doesNotMatch(google + meta, /sale_price/));
check(() => assert.doesNotMatch(appSource, /offerPrice|discountPercent|cardBadge|<del>/));

const csvLine = (line) => [...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)]
  .map(match => match[1].replace(/""/g, '"'));
const [headerLine, ...rowLines] = meta.trim().split(/\r?\n/);
const header = headerLine.split(",");
const rows = rowLines.map(csvLine);
const metaPrices = new Map(rows.map(row => [row[header.indexOf("id")], row[header.indexOf("price")]]));
const googleItems = new Map([...google.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(match => [
  match[1].match(/<g:id>(.*?)<\/g:id>/)[1],
  match[1].match(/<g:price>(.*?)<\/g:price>/)[1],
]));

const storage = new Map();
const window = {
  BOOMART_PRODUCTS: products,
  localStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  },
};
vm.runInNewContext(await read("src/cart.js"), { window, console });
const cart = window.BoomartCart;
const pricingContext = vm.createContext({ formatPrice: n => `S/${n}` });
const priceMarkup = appSource.slice(appSource.indexOf("const priceMarkup ="), appSource.indexOf("// Tarjeta de la grilla"));
vm.runInContext(`${priceMarkup}\nthis.renderPrice = priceMarkup;`, pricingContext);

for (const product of products) {
  check(() => assert.equal("offerPrice" in product || "offer" in product, false, product.id));
  check(() => assert.ok(official(product) > 0, product.id));
  check(() => assert.equal(catalog.products.find(p => p.id === product.id)?.priceFrom, official(product), product.id));
  const money = `${official(product).toFixed(2)} PEN`;
  check(() => assert.equal(metaPrices.get(product.id), money, product.id));
  check(() => assert.equal(googleItems.get(product.id), money, product.id));
  const html = await read(`producto/${product.id}/index.html`);
  check(() => assert.doesNotMatch(html, /class="was"|Precio oferta|sale_price/, product.id));
  check(() => assert.ok(html.includes(`property="product:price:amount" content="${official(product)}"`), product.id));
  check(() => assert.doesNotMatch(pricingContext.renderPrice(product), /<del>|oferta|antes/i));

  for (const variant of product.templePricing ? Object.keys(product.templePricing) : [null]) {
    cart.clear();
    cart.add(product.id, variant, 2);
    check(() => assert.equal(cart.getState().totals.total, 2 * (variant ? product.templePricing[variant] : product.regularPrice), `${product.id}/${variant}`));
  }
}

// El cupón de bienvenida no forma parte del precio oficial del catálogo.
cart.clear();
storage.set("boomart_customer_v1", JSON.stringify({ couponEligible: true }));
cart.add("castillo-de-hogwarts", null, 1);
check(() => assert.equal(cart.getState().totals.total, 72));
check(() => assert.equal(cart.getState().totals.subtotal, 80));
check(() => assert.equal(JSON.parse(storage.get("boomart_cart_v1"))[0].unitPrice, undefined));

const luminance = rgb => rgb.map(c => c / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4)
  .reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
const contrast = (luminance([244, 240, 232]) + .05) / (luminance([81, 76, 70]) + .05);
check(() => assert.ok(contrast >= 7));
const css = await read("src/styles.css");
check(() => assert.match(css, /\.landing \.hero \.lead,[\s\S]*?color: #514c46;/));
check(() => assert.match(css, /\.landing \.hero \.button\.secondary \{[\s\S]*?color: var\(--gallery-carbon\);/));
console.log(`OK: ${checks} comprobaciones; ${products.length} productos, feeds, fichas, carrito, cupón conservado y contraste ${contrast.toFixed(2)}:1.`);
