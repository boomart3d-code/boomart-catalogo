// Real computed foreground/background contrast, including transparent overlays.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const base=process.env.BOOMART_TEST_BASE_URL||'http://127.0.0.1:4173';
const output=process.env.BOOMART_TEST_OUTPUT||path.resolve(__dirname,'../docs/mobile-product-fix/contrast');
const products=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../data/products.json'),'utf8'));
async function contrast(page){return page.evaluate(()=>{
  const rgba=s=>s.match(/[\d.]+/g).map(Number);
  const over=(a,b)=>[...a.slice(0,3).map((v,i)=>v*(a[3]??1)+b[i]*(1-(a[3]??1))),1];
  const lum=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
  const rows=[];
  const walker=document.createTreeWalker(document.querySelector('.modal-info'),NodeFilter.SHOW_TEXT);
  let node;
  while(node=walker.nextNode()){
    if(!node.textContent.trim())continue;
    const el=node.parentElement,style=getComputedStyle(el);
    if(!el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})||el.closest('svg'))continue;
    let bg=[255,255,255,1];
    const chain=[];for(let p=el;p;p=p.parentElement)chain.push(p);
    for(const p of chain.reverse())bg=over(rgba(getComputedStyle(p).backgroundColor),bg);
    let fg=over(rgba(style.color),bg);
    const ratio=(Math.max(lum(fg),lum(bg))+.05)/(Math.min(lum(fg),lum(bg))+.05);
    rows.push({element:el.id||el.className||el.tagName,text:node.textContent.trim().slice(0,60),foreground:style.color,background:bg.slice(0,3).map(Math.round),ratio:+ratio.toFixed(2)});
  }
  return rows;
});}
(async()=>{
 fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const failures=[],rows=[];
 try{
  for(const width of [390,1366]){
   const context=await browser.newContext({viewport:{width,height:844},isMobile:width===390,hasTouch:width===390});
   const page=await context.newPage();
   await page.route('**/*',r=>{const u=new URL(r.request().url());return u.origin===new URL(base).origin||/^(fonts.googleapis.com|fonts.gstatic.com)$/.test(u.hostname)?r.continue():r.abort();});
   await page.goto(base+'/?producto=templo-tauro&excluir=1',{waitUntil:'load'});
   await page.locator('#productModal[open]').waitFor();
   await page.evaluate(()=>document.fonts.ready);
   for(const p of products){
    await page.evaluate(id=>{history.replaceState({},'','?producto='+id+'&excluir=1');dispatchEvent(new PopStateEvent('popstate'));},p.id);
    const states=[null,...(p.signPicker?['[data-pick-mode="signos"]','[data-sign="aries"]']:[])];
    for(const selector of states){
     if(selector)await page.locator('#productModal '+selector).click();
     const measured=await contrast(page);
     rows.push(...measured.map(r=>({width,product:p.id,state:selector,...r})));
     failures.push(...measured.filter(r=>r.ratio<4.5).map(r=>({width,product:p.id,...r})));
    }
    if(width===390&&['templo-tauro','casco-de-pegaso-saint-seiya'].includes(p.id)){
     await page.locator('#productModal').evaluate(el=>el.scrollTop=el.scrollHeight);
     await page.screenshot({path:path.join(output,p.id+'.png')});
    }
   }
   await context.close();
  }
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({base,textChecks:rows.length,minContrast:Math.min(...rows.map(r=>r.ratio)),failures,rows},null,2));
  assert.equal(failures.length,0,JSON.stringify(failures.slice(0,12)));
  console.log(`PASS ${products.length} products x mobile/desktop; ${rows.length} text checks; minimum ${Math.min(...rows.map(r=>r.ratio))}:1`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
