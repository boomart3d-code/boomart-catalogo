// Browser checks for category URLs, native mobile sharing and clipboard fallback.
// Serve the repo locally and set NODE_PATH to an existing Playwright installation.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const base = process.env.BOOMART_TEST_BASE_URL || "http://127.0.0.1:4173";
const executablePath = process.env.BOOMART_TEST_CHROME ||
  (process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : undefined);
const expected = slug => `https://boomart.pe/categoria/${slug}/?src=compartir`;

async function run() {
  const browser = await chromium.launch({ headless: true, executablePath });
  try {
    for (const scenario of ["desktop", "mobile", "cancel", "denied", "fallback", "unavailable"]) {
      const mobile = ["mobile", "cancel", "denied"].includes(scenario);
      const context = await browser.newContext({ viewport: { width: mobile ? 390 : 1366, height: 844 },
        isMobile: mobile, hasTouch: mobile, permissions: ["clipboard-read", "clipboard-write"] });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/*", route => new URL(route.request().url()).origin === new URL(base).origin
        ? route.continue() : route.abort());
      await page.addInitScript(({ scenario }) => {
        window.categoryProbe = { native: [], writes: [], fallback: 0 };
        Object.defineProperty(navigator, "share", { configurable: true, value: async data => {
          window.categoryProbe.native.push(data);
          if (scenario === "cancel") throw new DOMException("Cancelled", "AbortError");
          if (scenario !== "mobile") throw new DOMException("Denied", "NotAllowedError");
        }});
        const write = navigator.clipboard.writeText.bind(navigator.clipboard);
        Object.defineProperty(navigator.clipboard, "writeText", { configurable: true, value: async text => {
          window.categoryProbe.writes.push(text);
          if (["fallback", "unavailable"].includes(scenario)) throw new DOMException("Denied", "NotAllowedError");
          return write(text);
        }});
        const exec = document.execCommand.bind(document);
        document.execCommand = command => {
          window.categoryProbe.fallback++;
          return scenario === "unavailable" ? false : exec(command);
        };
      }, { scenario });
      await page.goto(`${base}/categoria/halloween/?excluir=1&producto=templo-aries&buscar=atena`);
      const share = page.locator("[data-category-share]");
      await share.click();
      await share.waitFor({ state: "visible" });
      await page.waitForFunction(() => !document.querySelector("[data-category-share]").disabled);
      const feedback = page.locator(".category-share-feedback");
      const probe = await page.evaluate(() => window.categoryProbe);
      if (scenario === "mobile" || scenario === "cancel") {
        assert.equal(probe.native.length, 1);
        assert.equal(probe.native[0].url, expected("halloween"));
        assert.equal(probe.native[0].text.includes(expected("halloween")), false);
        assert.equal(probe.writes.length, 0);
        assert.equal(await feedback.textContent(), "");
      } else if (scenario === "unavailable") {
        assert.equal(await feedback.locator("input").inputValue(), expected("halloween"));
        assert.doesNotMatch(await feedback.textContent(), /copiado/);
      } else {
        assert.match(await feedback.textContent(), /Enlace copiado/);
        assert.equal(await page.evaluate(() => navigator.clipboard.readText()), expected("halloween"));
      }
      if (!mobile) assert.equal(probe.native.length, 0);
      if (scenario === "fallback") {
        assert.equal(probe.fallback, 1);
        assert.equal(await page.locator("textarea[readonly]").count(), 0);
        assert.equal(await share.evaluate(button => document.activeElement === button), true);
      }
      if (scenario === "desktop") {
        const dir = path.join(__dirname, "..", "categoria");
        const slugs = fs.readdirSync(dir).filter(slug => fs.existsSync(path.join(dir, slug, "index.html")));
        for (const slug of slugs) {
          await page.goto(`${base}/categoria/${slug}/?excluir=1`);
          await page.locator("[data-category-share]").click();
          await page.waitForFunction(() => document.querySelector(".category-share-feedback").textContent.includes("Enlace copiado"));
          // The old series URL is an existing alias of the figures catalogue.
          assert.equal(await page.evaluate(() => navigator.clipboard.readText()),
            expected(slug === "series-y-peliculas" ? "figuras-coleccionables" : slug));
        }
        await page.goto(`${base}/?excluir=1`);
        await page.locator("#filterRow [data-filter='Saint Seiya']").waitFor();
        assert.equal(await page.locator("#categoryShareRow").isVisible(), false);
        await page.locator("#filterRow [data-filter='Saint Seiya']").click();
        await page.locator("#searchInput").fill("no hay resultados para esto");
        await page.locator("#shareCategory").click();
        await page.waitForFunction(() => document.querySelector("#categoryShareRow .category-share-feedback").textContent.includes("Enlace copiado"));
        assert.equal(await page.evaluate(() => navigator.clipboard.readText()), expected("saint-seiya"));
        await page.locator("#filterRow [data-filter='🎃 Halloween']").click();
        assert.equal(await page.locator("#categoryShareRow .category-share-feedback").textContent(), "");
        await page.locator("#shareCategory").click();
        await page.waitForFunction(() => !document.querySelector("#shareCategory").disabled);
        assert.equal(await page.evaluate(() => navigator.clipboard.readText()), expected("halloween"));
        await page.locator("#clearFilters").click();
        assert.equal(await page.locator("#categoryShareRow").isVisible(), false);
        for (const [route, slug] of [["Halloween", "halloween"], ["saintseiya", "saint-seiya"]]) {
          await page.goto(`${base}/${route}/?excluir=1`);
          await page.locator("#categoryShareRow:not([hidden])").waitFor();
          await page.locator("#shareCategory").click();
          await page.waitForFunction(() => !document.querySelector("#shareCategory").disabled);
          assert.equal(await page.evaluate(() => navigator.clipboard.readText()), expected(slug));
        }
        console.log(`PASS ${slugs.length} category pages, home filter changes, empty search and both campaigns`);
      }
      assert.deepEqual(errors, []);
      console.log(`PASS category sharing: ${scenario}`);
      await context.close();
    }
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
