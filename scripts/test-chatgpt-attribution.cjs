const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const test = require("node:test");
const { webcrypto } = require("node:crypto");
const tracker = fs.readFileSync("src/track.js", "utf8");
const storage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};

function navigate(path, localStorage, sessionStorage, options = {}) {
  const batches = [];
  const listeners = new Map();
  const location = new URL(path, "https://boomart.pe");
  const window = {
    location, localStorage, sessionStorage, crypto: webcrypto, fbq() {},
    performance: { getEntriesByType: () => [{ type: options.type || "navigate" }] },
    addEventListener: (name, listener) => listeners.set(name, listener),
  };
  class Blob {
    constructor([body]) { this.body = body; }
  }
  class DateAtNavigation extends Date {
    static now() { return options.now || 100_000; }
  }
  const navigator = {
    sendBeacon: (_endpoint, blob) => { batches.push(JSON.parse(blob.body)); return true; },
  };
  const document = { referrer: options.referrer || "", addEventListener() {} };
  vm.runInNewContext(tracker, {
    window, document, navigator, URL, URLSearchParams, Blob, Date: DateAtNavigation,
    setInterval() {}, setTimeout() {}, clearTimeout() {},
  });
  const sentOnLoad = batches.length;
  window.BoomartTrack.flush?.();
  return { batches, sentOnLoad, listeners };
}

test("a new ChatGPT Ads arrival starts a new session even with a previous source", () => {
  const local = storage();
  const tab = storage();
  const organic = navigate("/", local, tab, { referrer: "https://chatgpt.com/" }).batches[0];
  assert.equal(organic.fu, "chatgpt");
  const url = "/producto/maceta-david/?utm_source=chatgpt_ads&utm_campaign=cmpn_prueba&oppref=ficticio";
  const { batches, sentOnLoad } = navigate(url, local, tab, { now: 102_000 });
  const ad = batches[0];
  assert.equal(sentOnLoad, 1);
  assert.equal(ad.evs[0].t, "visita");
  assert.notEqual(ad.sid, organic.sid);
  assert.equal(ad.vid, organic.vid);
  assert.equal(ad.fu, "chatgpt_ads");
  assert.equal(ad.me, "cpc");
  assert.equal(ad.ca, "cmpn_prueba");
  assert.equal(ad.land, "/producto/maceta-david/");
  assert.doesNotMatch(JSON.stringify(batches), /ficticio|oppref/);

  const reload = navigate(url, local, tab, { type: "reload", now: 104_000 }).batches[0];
  assert.equal(reload.sid, ad.sid);
  const secondClick = navigate(url, local, tab, { now: 106_000 }).batches[0];
  assert.notEqual(secondClick.sid, ad.sid);
  const internal = navigate("/?producto=maceta-david", local, tab, {
    referrer: "https://boomart.pe/producto/maceta-david/", now: 108_000,
  }).batches[0];
  assert.equal(internal.sid, secondClick.sid);
  assert.equal(internal.land, secondClick.land);
});

test("an older tab keeps its source without overwriting a newer ad session", () => {
  const local = storage();
  const firstTab = storage();
  const old = navigate("/", local, firstTab, { referrer: "https://www.google.com/" }).batches[0];
  const ad = navigate("/producto/maceta-david/?oppref=ficticio", local, storage(), { now: 102_000 }).batches[0];
  const oldTabNavigation = navigate("/nosotros.html", local, firstTab, {
    referrer: "https://boomart.pe/", now: 108_000,
  }).batches[0];
  assert.equal(oldTabNavigation.sid, old.sid);
  assert.equal(oldTabNavigation.fu, "google");
  assert.equal(JSON.parse(local.getItem("boomart_ses")).id, ad.sid);
  assert.equal(ad.fu, "chatgpt_ads");
});

test("source-only ChatGPT links and ad previews stay distinct", () => {
  const organic = navigate("/?utm_source=chatgpt.com", storage(), storage()).batches[0];
  assert.equal(organic.fu, "chatgpt");
  assert.equal(organic.me, "referido");
  const paid = navigate("/?utm_source=chatgpt_ads&utm_campaign=cmpn_prueba", storage(), storage()).batches[0];
  assert.equal(paid.fu, "chatgpt_ads");
  assert.equal(paid.ca, "cmpn_prueba");
  assert.equal(navigate("/?oppref=preview_mock&utm_source=chatgpt_ads", storage(), storage()).batches.length, 0);
});
