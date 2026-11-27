// Sirve el sitio y apunta NODE_PATH a una instalación de Playwright.
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium, expect } = require("playwright/test");

const base = process.env.BOOMART_TEST_BASE_URL || "http://127.0.0.1:4271";
const article = base + "/radar/pegaso-seiya-primera-armadura-myth-cloth-ex/";
const moderation = base + "/radar/moderacion/";
const photo = path.resolve(__dirname, "../assets/boomart-mark-32.png");

async function signIn(page, email) {
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByRole("button", { name: "Entrar en la vista de prueba" }).click();
  await page.getByRole("button", { name: "Cerrar sesión" }).waitFor();
}

async function run() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.BOOMART_TEST_CHROME ||
      (process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : undefined),
  });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));

    await page.goto(base + "/radar/");
    const leadPhoto = page.locator(".radar-feature img");
    await expect(leadPhoto).toHaveAttribute("src", "/assets/radar/prensa/atena-original-color-bandai.jpg");
    assert.ok(await leadPhoto.evaluate(img => img.complete && img.naturalWidth > 0));
    await page.getByRole("link", { name: "Leer la nota" }).click();
    await expect(page.locator(".radar-article-cover figcaption")).toContainText("Bandai Spirits");
    const preview = await page.locator('meta[property="og:image"]').getAttribute("content");
    assert.ok(preview.endsWith("/atena-original-color-bandai.jpg"));
    await page.goto(base + "/radar/");
    await page.getByLabel("Buscar una nota").fill("BLOKEES");
    await expect(page.locator("#radar-cards article:visible")).toHaveCount(1);
    await page.getByLabel("Buscar una nota").clear();
    await page.getByLabel("Tema").selectOption("manga");
    const mangaCards = page.locator("#radar-cards article:visible");
    assert.ok(await mangaCards.count() > 0);
    assert.ok((await mangaCards.evaluateAll(cards => cards.map(card => card.dataset.section))).every(section => section === "manga"));
    await page.getByLabel("Buscar una nota").fill("figura-inexistente");
    await expect(page.getByRole("status")).toHaveText("No encontramos notas con esos filtros.");
    await page.goto(article);
    await expect(page.locator("[data-entries]")).toContainText("Aún no hay aportes");

    await signIn(page, "lector@demo.test");
    await page.getByRole("radio", { name: "5 de 5 estrellas" }).check();
    await page.getByRole("button", { name: "Guardar voto" }).click();
    await expect(page.locator("[data-rating-result]")).toContainText("5 / 5 · 1 voto");
    await page.getByRole("radio", { name: "4 de 5 estrellas" }).check();
    await page.getByRole("button", { name: "Guardar voto" }).click();
    await expect(page.locator("[data-rating-result]")).toContainText("4 / 5 · 1 voto");

    await page.getByLabel("Alias público").fill("Fénix de prueba");
    await page.getByLabel("Tu aporte").fill("Esta es mi foto de prueba del rincón del Santuario.");
    await page.getByLabel("Foto de tu colección (opcional)").setInputFiles(photo);
    await page.getByLabel("Tengo permiso para publicar esta fotografía.").check();
    await page.getByRole("button", { name: "Enviar a revisión" }).click();
    await expect(page.locator("[data-status]")).toContainText("pendiente de revisión");
    await expect(page.locator("[data-entries] img")).toHaveCount(0);

    await page.goto(moderation);
    await expect(page.locator("[data-status]")).toContainText("reservado al equipo");
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await signIn(page, "moderacion@demo.test");
    await expect(page.locator("[data-queue] img")).toHaveCount(1);
    await page.getByRole("button", { name: "Aprobar", exact: true }).click();
    await expect(page.locator("[data-status]")).toContainText("Aporte aprobado.");
    await page.getByRole("button", { name: "Cerrar sesión" }).click();

    await page.goto(article);
    await expect(page.locator("[data-entries]")).toContainText("Fénix de prueba");
    await expect(page.locator("[data-entries] img")).toHaveCount(1);
    await signIn(page, "otro-lector@demo.test");
    await page.getByRole("button", { name: "Responder" }).click();
    await expect(page.locator("[data-reply-label]")).toContainText("Fénix de prueba");
    await page.getByLabel("Alias público").fill("Dragón de prueba");
    await page.getByLabel("Tu aporte").fill("Quiero saber cómo iluminaste la escena.");
    await page.getByRole("button", { name: "Enviar a revisión" }).click();
    await expect(page.locator("[data-status]")).toContainText("pendiente de revisión");

    await page.getByRole("button", { name: "Reportar", exact: true }).click();
    await page.getByLabel("Motivo del reporte").selectOption("privacidad");
    await page.getByRole("button", { name: "Enviar reporte" }).click();
    await expect(page.locator("[data-entries]")).toContainText("Reporte recibido");

    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await page.goto(moderation);
    await signIn(page, "moderacion@demo.test");
    await expect(page.locator("[data-queue]")).toContainText("Datos personales");
    await page.getByRole("button", { name: "Aprobar", exact: true }).click();
    await expect(page.locator("[data-status]")).toContainText("Aporte aprobado.");
    await page.goto(article);
    await expect(page.locator(".radar-entry-reply")).toContainText("Dragón de prueba");

    await page.goto(moderation);
    await page.getByRole("button", { name: "Ocultar", exact: true }).click();
    await expect(page.locator("[data-status]")).toContainText("retirado");
    await page.goto(article);
    await expect(page.locator("[data-entries]")).toContainText("Aún no hay aportes");
    assert.deepEqual(errors, []);

    const editorial = await browser.newPage();
    await editorial.route("**/radar-demo.js?v=1", (route) => route.fulfill({
      contentType: "text/javascript",
      body: `export function demoApi() {
        return { preview: true, watch() {}, session: async () => null,
          discussion: async () => { throw { code: "PGRST202" }; }
        };
      }`,
    }));
    await editorial.goto(article);
    await expect(editorial.getByRole("heading", { name: "Fuentes" })).toBeVisible();
    await expect(editorial.locator("[data-status]")).toContainText("aún no está habilitada");
    await expect(editorial.locator("[data-sign-in]")).toBeHidden();
    await editorial.close();

    for (const width of [320, 390, 1366]) {
      const context = await browser.newContext({ viewport: { width, height: 800 }, javaScriptEnabled: false });
      const readOnly = await context.newPage();
      for (const url of [base + "/radar/", article]) {
        const response = await readOnly.goto(url, { waitUntil: "domcontentloaded" });
        assert.equal(response.status(), 200);
        await expect(readOnly.locator("h1")).toHaveCount(1);
        const overflow = await readOnly.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        assert.ok(overflow <= 1, url + " desborda a " + width + " px");
      }
      await expect(readOnly.getByRole("heading", { name: "Fuentes" })).toBeVisible();
      await context.close();
    }
    console.log("Radar: filtros, estrellas, foto, aprobación, respuesta, reporte y ocultación. Lectura sin JavaScript en 320, 390 y 1366 px.");
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
