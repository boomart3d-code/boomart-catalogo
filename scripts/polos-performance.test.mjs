import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile,stat} from 'node:fs/promises';
const source=await readFile(new URL('../polos/registro-loader.js',import.meta.url),'utf8');
function browser({fail=false,search=''}={}){
  const requested=[],rendered=[];
  const actual={loadProfile:async()=>({full_name:'Cliente de prueba'}),render:(...args)=>rendered.push(args)};
  const window={};
  const document={createElement:tag=>({tag,remove(){}}),head:{append(element){
    requested.push(element.src);
    queueMicrotask(()=>{
      if(fail){fail=false;element.onerror();return;}
      if(element.src.includes('supabase-js'))window.supabase={createClient(){}};
      else window.BoomartRegistro=actual;
      element.onload();
    });
  }}};
  vm.runInNewContext(source,{window,document,location:{search},URLSearchParams,setTimeout,clearTimeout});
  return {window,bridge:window.BoomartRegistro,requested,rendered,actual};
}
test('explorar no descarga registro; dos intentos simultáneos comparten la descarga',async()=>{
  const b=browser();assert.deepEqual(b.requested,[]);
  const [a,c]=await Promise.all([b.bridge.loadProfile(),b.bridge.loadProfile()]);
  assert.equal(a.full_name,c.full_name);assert.equal(b.requested.length,2);
  assert.match(b.requested[0],/supabase-js/);assert.match(b.requested[1],/registro-web/);
  assert.equal(b.window.BoomartRegistro,b.actual);
});
test('un fallo de red ofrece reintento y recupera el mismo formulario sin perder opciones',async()=>{
  const b=browser({fail:true});assert.equal(await b.bridge.loadProfile(),null);
  const container={isConnected:true,replaceChildren(...nodes){this.children=nodes;}};
  const options={context:'checkout',requireDelivery:true};b.bridge.render(container,options);
  assert.match(container.children[0].textContent,/carrito sigue guardado/);
  await container.children[1].onclick();
  assert.equal(b.requested.length,3);assert.equal(b.rendered[0][0],container);assert.equal(b.rendered[0][1],options);
});
test('un enlace de confirmación carga el registro aun sin abrir el carrito',async()=>{
  const b=browser({search:'?confirmar=prueba-local'});
  await new Promise(setImmediate);assert.equal(b.window.BoomartRegistro,b.actual);
});
test('la portada entrega foto prioritaria y fuentes locales, sin registro pesado al inicio',async()=>{
  const html=await readFile(new URL('../polos/index.html',import.meta.url),'utf8');
  assert.match(html,/<a class="vitrina-foto actual" data-polo-id="[^"]+" data-photo="[^"]+"/);
  assert.match(html,/fetchpriority="high"/);assert.match(html,/src="registro-loader.js\?v=/);
  assert.doesNotMatch(html,/<script[^>]+src="(?:https:[^"]*supabase|[^\"]*registro-web\.js)/);
  assert.doesNotMatch(html,/fonts\.(?:googleapis|gstatic)\.com/);
  const css=await readFile(new URL('../polos/fonts.css',import.meta.url),'utf8');
  for(const file of css.matchAll(/url\('([^']+)'\)/g))await stat(new URL('../polos/'+file[1],import.meta.url));
});
