const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const base=process.env.BOOMART_TEST_BASE_URL||'http://127.0.0.1:4173';
const output=process.env.BOOMART_TEST_OUTPUT||path.resolve(__dirname,'../docs/skin-picker');
const product=JSON.parse(fs.readFileSync('data/products.json','utf8')).find(p=>p.id==='skins-zelda-nintendo-switch-2');
const skins=product.modelOptions.filter(m=>!m.addon&&m.id!=='set-11');
async function pick(page,model){
 const mode=model.id==='set-11'?'all':model.addon?'extra':'pack';
 await page.locator(`[data-skin-mode="${mode}"]`).click();
 if(mode!=='all')await page.locator(`[data-skin-choice="${skins.findIndex(m=>m.id===model.id.replace(/^extra-/,''))}"]`).click();
}
(async()=>{
 fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 let checks=0;
 try{
  for(const width of [320,390,1280])for(const staticPage of [false,true]){
   const context=await browser.newContext({viewport:{width,height:844},isMobile:width<721,hasTouch:width<721});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',r=>{const u=new URL(r.request().url());return u.origin===new URL(base).origin||/^(fonts.googleapis.com|fonts.gstatic.com)$/.test(u.hostname)?r.continue():r.abort();});
   const url=staticPage?'/producto/'+product.id+'/?excluir=1':'/?producto='+product.id+'&excluir=1';
   await page.goto(base+url,{waitUntil:'load'});
   await page.locator('.skin-picker').waitFor();
   await page.evaluate(()=>document.fonts.ready);
   assert.equal(await page.locator('.skin-swatches button').count(),11);
   assert.equal(await page.locator((staticPage?'[data-pp-model]':'[data-model-option]')+':visible').count(),0);
   const h=await page.locator('.skin-picker').evaluate(el=>el.getBoundingClientRect().height);
   assert(h<650,`Picker too tall at ${width}: ${h}`);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   for(const model of product.modelOptions){
    await pick(page,model);
    const preview=page.locator('.skin-preview img');
    await preview.evaluate(img=>img.decode());
    const expected=path.basename(model.gallery[0],'.webp');
    assert((await preview.getAttribute('src')).includes(expected));
    const mode=model.id==='set-11'?'all':model.addon?'extra':'pack';
    assert.equal(await page.locator(`[data-skin-mode="${mode}"]`).getAttribute('aria-pressed'),'true');
    if(staticPage){
     assert((await page.locator('#ppShop').getAttribute('href')).includes('modelo='+model.id));
     assert((await page.locator('#ppShare').getAttribute('data-url')).includes('modelo='+model.id));
     assert((await page.locator('#ppMain').getAttribute('src')).includes(expected));
    }else{
     assert.equal(await page.locator('#modalPricing .add-to-cart').getAttribute('data-variant'),model.id);
     assert((await page.locator('#modalImageWrap img').getAttribute('src')).includes(expected));
     assert((await page.locator('#modalPricing [data-add-to-cart]').getAttribute('data-price-label')).includes('S/'+model.regularPrice));
     const wa=new URL(await page.locator('#shareProductWa').getAttribute('href'));
     assert(wa.searchParams.get('text').includes(model.name));
    }
    checks++;
   }
   await pick(page,product.modelOptions.find(m=>m.id==='ojo-sheikah'));
   await page.locator('[data-skin-choice="2"]').focus();
   await page.keyboard.press('ArrowRight');
   assert.equal(await page.locator('[data-skin-choice="3"]').getAttribute('aria-pressed'),'true');
   await page.locator('[data-skin-zoom]').click();
   await page.locator('.skin-zoom[open]').waitFor();
   assert((await page.locator('.skin-zoom img').getAttribute('src')).includes('ojo-rojo'));
   await page.keyboard.press('Escape');
   await page.locator('.skin-zoom').waitFor({state:'detached'});
   if(width===390){
    if(!staticPage)await page.locator('#productModal').evaluate(el=>el.scrollTop+=document.querySelector('.skin-picker').getBoundingClientRect().top-64);
    else await page.locator('.skin-picker').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(output,staticPage?'static-mobile.png':'modal-mobile.png')});
   }
   if(!staticPage){
    // Product switch must not lose the reusable notice moved into the disclosure.
    await page.evaluate(()=>{history.replaceState({},'','?producto=soporte-mando-wolverine&excluir=1');dispatchEvent(new PopStateEvent('popstate'));});
    assert.match(await page.locator('#modalNotice').textContent(),/No incluye el mando/);
    assert(await page.locator('#modalNotice').isVisible());
    assert(await page.locator('#modalDescription').isVisible());
    assert.equal(await page.locator('#modalPricing').getAttribute('class'),'');
   }
   assert.deepEqual(errors,[]);
   console.log(`PASS ${width}px ${staticPage?'static':'modal'}; picker ${Math.round(h)}px`);
   await context.close();
  }
  // Local-only cart checks: no orders, customers or outgoing messages.
  if(!base.startsWith('https:')){
   const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
   const page=await context.newPage();
   await page.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());
   for(const id of ['navi','extra-korok','set-11']){
    await page.goto(base+'/?producto='+product.id+'&modelo='+id+'&excluir=1');
    await page.locator('.skin-picker').waitFor();
    assert.equal(await page.locator('#modalPricing .add-to-cart').getAttribute('data-variant'),id);
    await page.locator('#modalPricing [data-add-to-cart]').click();
    const state=await page.evaluate(()=>window.BoomartCart.getState());
    const line=state.lines.find(l=>l.variantKey===id);
    assert(line);assert.equal(line.unitPrice,product.modelOptions.find(m=>m.id===id).regularPrice);
   }
   await context.close();
   console.log('PASS cart pack/extra/set and selected-model deep links');
  }
  console.log(`PASS ${checks} visual model/viewport/page combinations, keyboard, images, prices, WhatsApp and links`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
