// Vista local aislada del formulario real; datos ficticios, sin Supabase ni Meta.
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname,"..");
const types = {".html":"text/html; charset=utf-8",".js":"text/javascript",".mjs":"text/javascript",".css":"text/css",".json":"application/json",".png":"image/png",".svg":"image/svg+xml"};
http.createServer(async (req,res) => {
  try {
    const url = new URL(req.url,"http://localhost");
    if (url.pathname === "/functions/v1/meta-purchase") {
      res.writeHead(200,{"Content-Type":"application/json"});
      res.end(JSON.stringify(req.method === "GET" ? {configured:false} : {status:"sin_configurar"})); return;
    }
    let relative = decodeURIComponent(url.pathname).replace(/^\//,"");
    if (relative.endsWith("/")) relative += "index.html";
    const file = path.resolve(root,relative);
    if (!file.startsWith(root+path.sep)) {res.writeHead(403);res.end();return;}
    let data = await fs.readFile(file);
    if (relative.replaceAll("\\","/") === "panel/clientes/index.html") {
      data = data.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,"")
        .replace("</body>",`<script type="module">
          import '/panel/clientes/payments.js?v=1';
          window.BOOMART_SUPABASE={url:location.origin,publishableKey:'demo'};
          const rows=[{id:'11111111-1111-4111-8111-111111111111',status:'complete',full_name:'Cliente de demostración'}];
          const saved=[];
          const client={auth:{getSession:async()=>({data:{session:{access_token:'demo'}}})},rpc:async(name,args)=>{
            if(name==='meta_compras_admin')return {data:saved};
            saved.push({id:'22222222-2222-4222-8222-222222222222',submission_id:rows[0].id,pedido:args.p_pedido,
              total:args.p_productos.reduce((n,p)=>n+p.item_price*p.quantity,0),abonado:args.p_abonado,medio:args.p_medio,estado:'pendiente'});
            return {data:saved[0].id};
          }};
          document.querySelector('#loading').hidden=true;document.querySelector('#portal').hidden=false;
          const render=()=>{document.querySelector('#list').innerHTML='<article class="record"><h2>Cliente de demostración</h2><p>Formulario local · ningún dato real</p><div class="actions"></div></article>';window.dispatchEvent(new CustomEvent('boomart:records',{detail:{rows,client}}));};
          document.querySelector('#refresh').onclick=render;render();
          </script></body>`);
    }
    res.writeHead(200,{"Content-Type":types[path.extname(file)]||"application/octet-stream"});res.end(data);
  } catch {res.writeHead(404);res.end("No encontrado");}
}).listen(4176,"127.0.0.1",()=>console.log("Payments QA http://127.0.0.1:4176/panel/clientes/"));
