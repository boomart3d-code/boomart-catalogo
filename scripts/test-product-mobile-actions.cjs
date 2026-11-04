// Regression: reaching the bottom must expose real, clickable share/WhatsApp
// controls above the cart, including after text/viewport/bar-height changes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const base = process.env.BOOMART_TEST_BASE_URL || 'http://127.0.0.1:4173';
const output = process.env.BOOMART_TEST_OUTPUT || path.resolve(__dirname, '../docs/mobile-product-fix');
const products = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../data/products.json'), 'utf8'));
const ids = products.map(p => p.id);
const representative = ['escultura-de-atena-saint-seiya', 'templo-aries', ...products.filter(p => p.signPicker || p.modelOptions || p.notice || p.video).map(p => p.id)];
const sizes = [[320,640],[360,740],[390,844],[414,896],[700,600],[720,540],[768,600],[844,390],[1050,700],[1366,768]];

async function bottom(page) {
  await page.evaluate(() => {
    const info = document.querySelector('.modal-info');
    info.scrollTop = info.scrollHeight;
    const dialog = document.querySelector('#productModal');
    dialog.scrollTop = dialog.scrollHeight;
  });
}
async function inspect(page) {
  return page.evaluate(() => {
    const dialog = document.querySelector('#productModal').getBoundingClientRect();
    const bar = document.querySelector('#productModal .add-to-cart-row').getBoundingClientRect();
    const fixed = getComputedStyle(document.querySelector('#productModal .add-to-cart-row')).position === 'fixed';
    const buttons = ['shareProduct', 'shareProductWa'].map(id => {
      const el = document.getElementById(id), r = el.getBoundingClientRect();
      const points = [[r.left+4,r.top+4],[r.right-4,r.bottom-4],[(r.left+r.right)/2,(r.top+r.bottom)/2]];
      return {id, top:r.top,bottom:r.bottom, height:r.height,
        visible:r.top>=dialog.top && r.bottom<=dialog.bottom && (!fixed || r.bottom <= bar.top-12),
        clickable:points.every(([x,y])=>el.contains(document.elementFromPoint(x,y)))};
    });
    return {buttons, barHeight:bar.height, overflow:document.querySelector('#productModal').scrollWidth > innerWidth+1};
  });
}
async function open(page,id) {
  await page.evaluate(id => {
    history.replaceState({}, '', '?producto='+encodeURIComponent(id)+'&excluir=1');
    dispatchEvent(new PopStateEvent('popstate'));
  }, id);
  await page.waitForFunction(id => document.querySelector('#productModal[open]') && new URL(document.querySelector('link[rel=canonical]').href).pathname.includes(id),id);
}

(async()=>{
  fs.mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({headless:true,executablePath:process.env.BOOMART_TEST_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const results=[], failures=[];
  try {
    for(const [width,height] of sizes) {
      const context=await browser.newContext({viewport:{width,height},isMobile:width<1051,hasTouch:width<1051,permissions:['clipboard-read','clipboard-write']});
      const page=await context.newPage();
      await page.route('**/*',route=>{
        const u=new URL(route.request().url());
        return u.origin===new URL(base).origin || /^(fonts.googleapis.com|fonts.gstatic.com)$/.test(u.hostname) ? route.continue():route.abort();
      });
      await page.addInitScript(()=>Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{window.lastShared=data;}}));
      await page.goto(base+'/?producto=escultura-de-atena-saint-seiya&excluir=1',{waitUntil:'load'});
      await page.locator('#productModal[open]').waitFor();
      await page.evaluate(()=>document.fonts.ready);
      for(const id of width===390 ? ids : [...new Set(representative)]) {
        await open(page,id);
        await bottom(page);
        const result=await inspect(page);
        results.push({width,height,id,...result});
        if(result.overflow || result.buttons.some(b=>!b.visible||!b.clickable)) failures.push(results.at(-1));
      }
      await open(page,'escultura-de-atena-saint-seiya');
      await bottom(page);
      if(width===390) {
        await page.locator('#shareProduct').click();
        assert.equal(await page.evaluate(()=>lastShared.url),'https://boomart.pe/producto/escultura-de-atena-saint-seiya/?src=compartir');
        const inquiry=new URL(await page.locator('#shareProductWa').getAttribute('href'));
        assert.equal(inquiry.hostname,'wa.me');
        assert.match(inquiry.searchParams.get('text'),/Escultura de la Diosa Atena/);
        await page.screenshot({path:path.join(output,'mobile-after.png')});
        // Emulate a taller safe area / wrapped purchase button. Observer must
        // update the reserved space; a hard-coded padding would fail here.
        await page.addStyleTag({content:'.product-modal .add-to-cart-row{padding-bottom:85px!important}html{font-size:22px}'});
        await page.waitForFunction(()=>parseFloat(document.querySelector('#productModal').style.getPropertyValue('--product-cart-height'))>120);
        await bottom(page);
        const enlarged=await inspect(page);
        assert(enlarged.buttons.every(b=>b.visible&&b.clickable),JSON.stringify(enlarged));
        console.log('PASS taller purchase bar and enlarged text');
      }
      // Static product URLs must also expose sharing, inquiry and the store link.
      await page.goto(base+'/producto/escultura-de-atena-saint-seiya/?excluir=1',{waitUntil:'load'});
      await page.locator('#ppShare').scrollIntoViewIfNeeded();
      assert(await page.locator('#ppShare').isVisible());
      await page.locator('#ppShare').click();
      assert(await page.locator('.pp-cta a[href*="wa.me"]').isVisible());
      console.log(`Checked ${width}x${height}`);
      await context.close();
    }
    fs.writeFileSync(path.join(output,'actions-results.json'),JSON.stringify({base,checks:results.length,failures,results},null,2));
    assert.deepEqual(failures,[],`${failures.length} hidden/covered action groups`);
    console.log(`PASS ${results.length} product/viewports; sharing URL, WhatsApp inquiry, static page and resizing`);
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
