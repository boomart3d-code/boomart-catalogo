// PostgreSQL real embebido (PGlite), únicamente datos sintéticos en memoria.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {PGlite} = require('D:/BOOMART-EQUIPO/tmp/qa-recorridos/node_modules/@electric-sql/pglite');
(async()=>{
 const db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role;
 create schema auth; create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object('email',current_setting('test.email',true))$$;`);
 await db.exec(fs.readFileSync('supabase/schema_analitica.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/schema_analitica_panel.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/schema_analitica_geo.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/202610240001_panel_recorridos.sql','utf8'));
 await db.exec(`insert into public.web_eventos (vid,sid,tipo,host,creado,pais,fuente,producto,extra) values
 ('fake1','fake-session-1','visita','boomart.pe','2026-10-23 23:00Z','PE','instagram',null,null),
 ('fake1','fake-session-1','abrir_carrito','boomart.pe','2026-10-24 12:00Z','PE','instagram',null,null),
 ('fake1','fake-session-1','pedido_whatsapp','boomart.pe','2026-10-24 12:01Z','PE','instagram',null,'{"pedido":"W-TEST1","cupon":"si"}'),
 ('fake2','fake-session-2','clic_whatsapp','boomart.pe','2026-10-24 12:02Z','CL','tiktok',null,null),
 ('fake3','fake-session-3','visita','boomart.pe','2026-10-24 12:03Z','PE','directo',null,null);`);
 const args="'2026-10-24T05:00Z','2026-10-25T05:00Z'";
 await db.exec("set test.email='otro@example.invalid'");
 await assert.rejects(db.query(`select public.panel_recorridos(${args})`),/No autorizado/);
 await db.exec("set test.email='boomart.3d@gmail.com'");
 let r=await db.query(`select public.panel_recorridos(${args}) data`);
 assert.equal(r.rows[0].data.length,1); assert.equal(r.rows[0].data[0].pedido,true);
 r=await db.query(`select public.panel_recorridos(${args},false) data`);assert.equal(r.rows[0].data.length,2);
 r=await db.query(`select public.panel_recorridos(${args},true,'fake-session-1') data`);
 assert.equal(r.rows[0].data.length,3);assert.equal(r.rows[0].data[0].fuente,'instagram');
 assert.equal(r.rows[0].data[2].extra.pedido,'W-TEST1');
 r=await db.query(`select public.panel_recorridos(${args},true,'fake-session-2') data`);assert.deepEqual(r.rows[0].data,[]);
 await assert.rejects(db.query(`select public.panel_recorridos(null,null)`),/Rango invalido/);
 r=await db.query("select has_function_privilege('anon','public.panel_recorridos(timestamptz,timestamptz,boolean,text)','EXECUTE') ok");assert.equal(r.rows[0].ok,false);
 let handler, box={}; const root={isConnected:true,innerHTML:'',append:d=>{root.row=d}};
 const window={};const document={createElement:()=>({addEventListener:(n,f)=>handler=f,querySelector:()=>box,open:true})};
 vm.runInNewContext(fs.readFileSync('panel/recorridos.js','utf8'),{window,document});
 let calls=0;await window.BoomartRecorridos({rpc:async()=>({data:++calls===1?[{sid:'synthetic',ultima:'2026-10-24T12:00Z',fuente:'<img src=x onerror=1>',pedido:true}]:[{creado:'2026-10-24T12:00Z',tipo:'pedido_whatsapp',extra:{pedido:'<script>x</script>',items:[{id:'mini',cantidad:1}]}}]})},{},root,x=>x);
 assert.ok(!root.row.innerHTML.includes('<img'));await handler();assert.ok(box.innerHTML.includes('&lt;script&gt;'));assert.ok(box.innerHTML.includes('mini'));
 assert.ok(box.innerHTML.includes('Pasos de compra'));assert.ok(!box.innerHTML.includes('Zona horaria'));assert.ok(!box.innerHTML.includes('Referente'));
 await handler();assert.equal(calls,2);
 await db.close();console.log('OK: autorización, filtros, recorrido histórico, código, escape HTML y carga diferida.');
})().catch(e=>{console.error(e);process.exitCode=1});
