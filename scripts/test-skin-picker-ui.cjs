const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const { chromium } = require("playwright");
const base = process.env.BOOMART_TEST_BASE_URL || "http://127.0.0.1:4173";
const output =
  process.env.BOOMART_TEST_OUTPUT ||
  path.resolve(__dirname, "../docs/skin-pack");
const product = JSON.parse(fs.readFileSync("data/products.json", "utf8")).find(
  (p) => p.id === "skins-zelda-nintendo-switch-2",
);
const skins = product.modelOptions.filter((m) => !m.addon && m.id !== "set-11");
async function choose(page, index) {
  await page.locator(`[data-skin-choice="${index}"]`).click();
}
async function total(page, staticPage) {
  return staticPage
    ? Number(
        (await page.locator('[data-skin-mode][aria-pressed="true"] strong').textContent()).replace(
          "S/",
          "",
        ),
      )
    : Number(
        (
          await page
            .locator("#modalPricing [data-add-to-cart]")
            .getAttribute("data-price-label")
        )
          .split("S/")
          .at(-1),
      );
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  });
  let cases = 0;
  try {
    for (const width of [320, 390, 1280])
      for (const staticPage of [false, true]) {
        const context = await browser.newContext({
          viewport: { width, height: 844 },
          isMobile: width < 721,
          hasTouch: width < 721,
        });
        const page = await context.newPage(),
          errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await page.route("**/*", (r) => {
          const u = new URL(r.request().url());
          return u.origin === new URL(base).origin ||
            /^(fonts.googleapis.com|fonts.gstatic.com)$/.test(u.hostname)
            ? r.continue()
            : r.abort();
        });
        await page.addInitScript(() =>
          Object.defineProperty(navigator, "share", {
            configurable: true,
            value: async (data) => {
              window.lastShare = data;
            },
          }),
        );
        await page.goto(
          base +
            (staticPage
              ? "/producto/" + product.id + "/?excluir=1"
              : "/?producto=" + product.id + "&excluir=1"),
          { waitUntil: "load" },
        );
        await page.locator(".skin-picker").waitFor();
        await page.evaluate(() => document.fonts.ready);
        assert.equal(
          await page.getByRole("button", { name: /Solo skin/i }).count(),
          0,
        );
        assert.equal(await page.locator("[data-skin-mode]").count(), 2);
        assert.equal(await page.locator(".skin-swatches button").count(), 11);
        assert(
          (await page
            .locator(".skin-picker")
            .evaluate((e) => e.getBoundingClientRect().height)) < 720,
        );
        assert.equal(await total(page, staticPage), 50);
        for (let i = 0; i < skins.length; i++) {
          await choose(page, i);
          const preview = page.locator(".skin-preview img");
          await preview.evaluate((e) => e.decode());
          assert(
            (await preview.getAttribute("src")).includes(
              path.basename(skins[i].gallery[0], ".webp"),
            ),
          );
          assert.equal(await total(page, staticPage), 50);
          if (!staticPage)
            assert.equal(
              await page
                .locator("#modalPricing .add-to-cart")
                .getAttribute("data-variant"),
              skins[i].id,
            );
          cases++;
        }
        // The first design is included; two distinct additional themes total 90.
        await choose(page, 5);
        await page.locator('[data-skin-stage="extras"]').click();
        await choose(page, 7);
        assert.equal(await total(page, staticPage), 70);
        await choose(page, 10);
        assert.equal(await total(page, staticPage), 90);
        await choose(page, 5);
        assert.equal(
          await total(page, staticPage),
          90,
          "Included design cannot be charged twice",
        );
        const wa = new URL(
          await page
            .locator(staticPage ? "#ppWhatsapp" : "#shareProductWa")
            .getAttribute("href"),
        );
        assert(wa.searchParams.get("text").includes("S/90"));
        assert(wa.searchParams.get("text").includes("Korok"));
        assert(wa.searchParams.get("text").includes("Majora"));
        if (staticPage) {
          const link = new URL(
            await page.locator("#ppShop").getAttribute("href"),
          );
          assert.equal(link.searchParams.get("modelo"), "navi");
          assert.equal(link.searchParams.get("skins"), "korok,majora");
          assert(
            new URL(
              await page.locator("#ppShare").getAttribute("data-url"),
            ).searchParams.get("skins") === "korok,majora",
          );
        } else {
          assert.equal(
            await page
              .locator("#modalPricing .add-to-cart")
              .getAttribute("data-variant"),
            "navi,extra-korok,extra-majora",
          );
          if (width === 390) {
            await page.locator("#shareProduct").click();
            const shared = await page.evaluate(() => lastShare);
            assert.equal(
              new URL(shared.url).searchParams.get("skins"),
              "korok,majora",
            );
            assert(shared.text.includes("S/90"));
          }
        }
        await choose(page, 7);
        assert.equal(await total(page, staticPage), 70);
        await choose(page, 7);
        assert.equal(await total(page, staticPage), 90);
        cases += 5;
        if (width === 390) {
          if (!staticPage)
            await page
              .locator("#productModal")
              .evaluate((el) => (el.scrollTop = el.scrollHeight));
          else await page.locator(".skin-picker").scrollIntoViewIfNeeded();
          await page.screenshot({
            path: path.join(
              output,
              staticPage ? "static-90.png" : "modal-90.png",
            ),
          });
        }
        // Eleven distinct designs automatically use the confirmed 200 collection.
        for (let i = 0; i < skins.length; i++)
          if (i !== 5 && i !== 7 && i !== 10) await choose(page, i);
        assert.equal(await total(page, staticPage), 200);
        if (!staticPage)
          assert.equal(
            await page
              .locator("#modalPricing .add-to-cart")
              .getAttribute("data-variant"),
            "set-11",
          );
        await page.locator('[data-skin-mode="all"]').click();
        assert.match(
          await page.locator(".skin-mode-note").textContent(),
          /S\/200/,
        );
        await page.locator("[data-skin-zoom]").click();
        await page.locator(".skin-zoom[open]").waitFor();
        await page.keyboard.press("Escape");
        await page.locator(".skin-zoom").waitFor({ state: "detached" });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth + 1,
          ),
          false,
        );
        assert.deepEqual(errors, []);
        cases += 2;
        console.log(
          `PASS ${width}px ${staticPage ? "static" : "modal"}:50/70/90/200, selection, links and zoom`,
        );
        await context.close();
      }
    if (!base.startsWith("https:")) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      });
      const page = await context.newPage();
      await page.route("**/*", (r) =>
        new URL(r.request().url()).origin === new URL(base).origin
          ? r.continue()
          : r.abort(),
      );
      for (const [query, expected] of [
        ["modelo=navi", 50],
        ["modelo=navi&skins=korok", 70],
        ["modelo=navi&skins=korok,majora", 90],
        ["modelo=set-11", 200],
        ["modelo=extra-korok", 50],
      ]) {
        await page.goto(
          base + "/?producto=" + product.id + "&" + query + "&excluir=1",
        );
        await page.locator(".skin-picker").waitFor();
        await page.evaluate(() => window.BoomartCart.clear());
        await page.locator("#modalPricing [data-add-to-cart]").click();
        let state = await page.evaluate(() => window.BoomartCart.getState());
        assert.equal(state.totals.subtotal, expected);
        assert(
          state.lines.some(
            (l) =>
              !product.modelOptions.find((m) => m.id === l.variantKey).addon,
          ),
        );
        if (expected === 90) {
          state = await page.evaluate(
            (id) => window.BoomartCart.remove(id, "navi"),
            product.id,
          );
          assert.equal(state.lines.length, 0);
        }
        cases++;
      }
      await context.close();
      console.log(
        "PASS cart totals50/70/90/200; legacy-extra link requires50; removing base removes extras",
      );
    }
    console.log(`PASS ${cases} UI/pack/viewport/page checks`);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
