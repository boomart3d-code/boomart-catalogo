/* Servidor de prueba LOCAL: datos ficticios, RPC en memoria y WhatsApp
   interceptado. No registra clientes/pedidos ni envía correos o eventos reales.
   Uso: node scripts/serve-checkout-test.mjs [puerto] */
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.argv[2] || 8770);
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon" };

const bootstrap = `(() => {
  const scenario = new URL(location.href).searchParams.get('scenario') || 'new';
  let profile = scenario === 'saved' ? {
    full_name:'Cliente de Prueba',phone:'900000001',email:'cliente@example.test',
    document_type:'dni',document_number:'00000001',delivery_method:'pickup',
    local_address:'',local_district:'',local_reference:'',shalom_name:'',shalom_address:'',
    shalom_department:'',shalom_province:'',shalom_district:'',cupon_disponible:true
  } : null;
  let failSave = scenario === 'error', saves = 0, orders = 0, opened = 0;
  localStorage.clear(); sessionStorage.clear();
  localStorage.setItem('boomart_cart_v1',JSON.stringify([
    {productId:'castillo-de-hogwarts',variant:null,quantity:1},
    {productId:'templo-aries',variant:'combo',quantity:1}
  ]));
  function status() {
    const el = document.getElementById('checkoutTestStatus');
    if (el) el.textContent = 'PRUEBA LOCAL · Sin conexión real · Guardados: '+saves+' · Pedidos: '+orders+' · WhatsApp interceptados: '+opened;
  }
  addEventListener('DOMContentLoaded',() => {
    const el = document.createElement('aside'); el.id='checkoutTestStatus'; el.setAttribute('role','status');
    el.style.cssText='position:fixed;bottom:0;left:0;right:0;z-index:2147483647;padding:4px;background:#fff;color:#111;font:11px sans-serif;text-align:center';
    document.body.appendChild(el); status();
  });
  window.open = () => { opened++; status(); return {}; };
  if (scenario !== 'unavailable') window.supabase = { createClient:() => ({ rpc:async(name,args) => {
    if (name === 'registro_web_perfil') return {data:profile,error:null};
    if (name === 'registro_web_guardar') {
      if (failSave) { failSave=false; return {data:null,error:{code:'TEST'}}; }
      const nuevo=!profile, d=args.p_data, local=d.delivery_method==='indriver', agency=d.delivery_method==='shalom';
      profile={...d,local_district:local?d.local_district:'',local_address:local?d.local_address:'',local_reference:local?d.local_reference:'',
        shalom_name:agency?d.shalom_name:'',shalom_address:agency?d.shalom_address:'',shalom_department:agency?d.shalom_department:'',
        shalom_province:agency?d.shalom_province:'',shalom_district:agency?d.shalom_district:'',cupon_disponible:true};
      saves++; status(); return {data:{nuevo,perfil:profile},error:null};
    }
    if (name === 'registro_web_pedido_enviar') { orders++; if(profile)profile.cupon_disponible=false; status(); return {data:{ok:true},error:null}; }
    return {data:{ok:true},error:null};
  }}) };
})();`;

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Security-Policy", "default-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; form-action 'none'; frame-src 'none'");
    if (url.pathname === "/__test-bootstrap.js") {
      res.setHeader("Content-Type", "text/javascript; charset=utf-8"); res.end(bootstrap); return;
    }
    const decoded = decodeURIComponent(url.pathname);
    if (decoded.split("/").some(part => part.startsWith("."))) { res.writeHead(403).end(); return; }
    let file = path.resolve(root, "." + decoded);
    if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    if ((await stat(file)).isDirectory()) file = path.join(file, "index.html");
    let content = await readFile(file);
    if (path.extname(file) === ".html") {
      content = content.toString().replace(/<script\b[^>]*src=["']https?:[^"']*["'][^>]*>\s*<\/script>/gi, "")
        .replace(/<script\b[^>]*src=["'][^"']*src\/track\.js[^"']*["'][^>]*>\s*<\/script>/gi, "")
        .replace("<head>", '<head><script src="/__test-bootstrap.js"></script>');
    }
    res.setHeader("Content-Type", (mime[path.extname(file)] || "application/octet-stream") + (/[.](html|js|css|json|svg)$/.test(file) ? "; charset=utf-8" : ""));
    res.end(content);
  } catch { res.writeHead(404).end("Not found"); }
});
server.listen(port, "127.0.0.1", () => console.log(`Prueba aislada: http://127.0.0.1:${port}/ · escenario nuevo, ?scenario=saved, ?scenario=error, ?scenario=unavailable`));
