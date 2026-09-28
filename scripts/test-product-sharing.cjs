// Regression in Chrome: real clipboard on desktop, simulated native sharing
// on mobile. Serve the repository locally; set NODE_PATH to Playwright's
// installation when it is not installed in this repository.
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const base = process.env.BOOMART_TEST_BASE_URL || "http://127.0.0.1:8767";
const expected = "https://boomart.pe/producto/templo-aries/";
const executablePath = process.env.BOOMART_TEST_CHROME ||
  (process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : undefined);

async function run() {
  const browser = await chromium.launch({ headless: true, executablePath });
  let passed = 0;
  try {
    for (const scenario of ["desktop", "fallback", "unavailable", "mobile", "mobile-cancel", "mobile-denied"]) {
      const mobile = scenario.startsWith("mobile");
      const context = await browser.newContext({
        viewport: mobile ? { width: 390, height: 844 } : { width: 1366, height: 768 },
        hasTouch: mobile, isMobile: mobile,
        permissions: ["clipboard-read", "clipboard-write"],
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("**/*", route =>
        new URL(route.request().url()).origin === new URL(base).origin
          ? route.continue() : route.abort());
      await page.addInitScript(({ scenario }) => {
        window.shareProbe = { nativeCalls: [], fallbackCalls: [] };
        Object.defineProperty(navigator, "share", { configurable: true, value: async data => {
          window.shareProbe.nativeCalls.push(data);
          if (scenario === "mobile-cancel") throw new DOMException("Cancelled", "AbortError");
          if (scenario !== "mobile") throw new DOMException("Denied", "NotAllowedError");
        }});
        if (scenario === "fallback" || scenario === "unavailable") {
          Object.defineProperty(navigator.clipboard, "writeText", { configurable: true, value: async () => {
            throw new DOMException("Denied", "NotAllowedError");
          }});
        }
        const exec = document.execCommand.bind(document);
        document.execCommand = command => {
          const active = document.activeElement;
          window.shareProbe.fallbackCalls.push({ command, text: active.value,
            insideDialog: !!active.closest("dialog[open]") });
          return scenario === "unavailable" ? false : exec(command);
        };
      }, { scenario });
      await page.goto(`${base}/?producto=templo-aries`);
      await page.locator("#productModal[open]").waitFor();
      await page.locator("#shareProduct").click();
      if (scenario === "desktop" || scenario === "fallback" || scenario === "mobile-denied") {
        await page.locator("#shareFeedback").waitFor({ state: "visible" });
        assert.match(await page.locator("#shareFeedback").textContent(), /Enlace copiado/);
        assert.equal(await page.evaluate(() => navigator.clipboard.readText()), expected);
      } else if (scenario === "unavailable") {
        await page.locator("#shareFeedback").waitFor({ state: "visible" });
        assert.match(await page.locator("#shareFeedback").textContent(), /WhatsApp/);
        assert.doesNotMatch(await page.locator("#shareFeedback").textContent(), /copiado/);
      }
      const probe = await page.evaluate(() => window.shareProbe);
      if (!mobile) assert.equal(probe.nativeCalls.length, 0, "Desktop must not delegate to the native share sheet");
      if (scenario === "fallback") {
        assert.equal(probe.fallbackCalls.length, 1);
        assert.equal(probe.fallbackCalls[0].insideDialog, true);
        assert.equal(probe.fallbackCalls[0].text, expected);
        assert.equal(await page.locator("textarea[readonly]").count(), 0, "Temporary copy field must be removed");
        assert.equal(await page.evaluate(() => document.activeElement.id), "shareProduct");
      }
      if (scenario === "mobile" || scenario === "mobile-cancel") {
        assert.equal(probe.nativeCalls.length, 1);
        assert.equal(probe.fallbackCalls.length, 0);
        assert.equal(await page.locator("#shareFeedback").isVisible(), false);
        assert.equal(probe.nativeCalls[0].url, expected);
        assert.equal(probe.nativeCalls[0].text.includes(expected), false, "Share URL must not be duplicated in text");
      }
      assert.equal(await page.locator("#productModal").evaluate(dialog => dialog.open), true);
      assert.deepEqual(errors, []);

      if (scenario === "desktop") {
        assert.match(await page.locator("#shareProduct").textContent(), /Copiar enlace/);
        assert.equal(await page.locator("#shareProductWa").getAttribute("href").then(href =>
          decodeURIComponent(href).includes(expected)), true);
        await page.screenshot({ path: process.env.BOOMART_TEST_SCREENSHOT || "share-desktop.png" });
        await page.locator("#closeModal").click();
        await page.locator('[data-share="templo-aries"]').click();
        await page.locator('[data-share="templo-aries"].is-copied').waitFor();
        assert.equal(await page.evaluate(() => navigator.clipboard.readText()), expected);
        assert.equal(await page.evaluate(() => window.shareProbe.nativeCalls.length), 0);
      }
      console.log(`PASS ${scenario}`);
      passed++;
      await context.close();
    }
    console.log(`PASS ${passed}/6 scenarios: modal, card, clipboard, fallback, native mobile, cancellation and errors`);
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
