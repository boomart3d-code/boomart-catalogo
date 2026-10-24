const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {PGlite}=require('D:/BOOMART-EQUIPO/tmp/qa-recorridos/node_modules/@electric-sql/pglite');
(async()=>{
 const db=new PGlite();
 // Stub de aleatoriedad SOLO en memoria; producción usa pgcrypto.
 await db.exec(`create role anon;create role authenticated;create schema extensions;
 create function extensions.gen_random_bytes(n integer) returns bytea language sql volatile as $$select decode(substr(md5(random()::text),1,n*2),'hex')$$;
 create table public.customer_profile_submissions(id uuid default gen_random_uuid(),import_code text unique,token text unique);
 create table public.clientes_web(id uuid);
 create function public._customer_random_code(p_prefix text,p_chars integer) returns text language sql volatile set search_path='' as $$select p_prefix||upper(substr(translate(encode(extensions.gen_random_bytes(12),'hex'),'01','XY'),1,p_chars))$$;
 create function public.registro_cliente_guardar(p_token text,p_data jsonb,p_complete boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
 declare v_code text;begin
 select import_code into v_code from public.customer_profile_submissions where token=p_token;
 if v_code is null and p_complete then
 v_code:=public._customer_random_code('BA-', 4) || '-' || public._customer_random_code('', 4);
 insert into public.customer_profile_submissions(import_code,token) values(v_code,p_token) on conflict(token) do update set import_code=excluded.import_code;
 end if;
 return jsonb_build_object('import_code',v_code);end;$$;
 create function public._registro_web_nueva_solicitud(c public.clientes_web) returns public.customer_profile_submissions language plpgsql security definer set search_path='' as $$
 declare s public.customer_profile_submissions; v_code text;begin
 v_code:=public._customer_random_code('BA-',4)||'-'||public._customer_random_code('',4);
 insert into public.customer_profile_submissions(import_code) values(v_code) returning * into s;return s;end;$$;
 revoke all on function public.registro_cliente_guardar(text,jsonb,boolean) from public;grant execute on function public.registro_cliente_guardar(text,jsonb,boolean) to anon;
 insert into public.customer_profile_submissions(import_code,token) values('BA-AB23-CD45','existing'),(null,'draft');`);
 const before=(await db.query('select * from public.customer_profile_submissions order by token')).rows;
 const migration=fs.readFileSync('supabase/migrations/202610240003_codigos_cliente_cortos.sql','utf8');
 await db.exec(migration);
 assert.deepEqual((await db.query('select * from public.customer_profile_submissions order by token')).rows,before);
 let r=await db.query("select public.registro_cliente_guardar('existing','{}',true) r");assert.equal(r.rows[0].r.import_code,'BA-AB23-CD45');
 r=await db.query("select public.registro_cliente_guardar('draft','{}',true) r");assert.match(r.rows[0].r.import_code,/^BA-\d{5}$/);
 r=await db.query("select (public._registro_web_nueva_solicitud(row(null)::public.clientes_web)).import_code code");assert.match(r.rows[0].code,/^BA-\d{5}$/);
 await db.exec("do $$begin for i in 1..500 loop perform public.registro_cliente_guardar('fake-'||i,'{}',true);end loop;end;$$");
 r=await db.query("select count(*) n,count(distinct import_code) d from public.customer_profile_submissions where import_code is not null");assert.equal(r.rows[0].n,r.rows[0].d);
 await db.exec(migration); // Idempotente, sin renumerar lo ya emitido.
 assert.equal((await db.query("select import_code from public.customer_profile_submissions where token='existing'")).rows[0].import_code,'BA-AB23-CD45');
 await db.exec("insert into public.customer_profile_submissions(import_code) values('BA-01234') on conflict do nothing;create or replace function extensions.gen_random_bytes(n integer) returns bytea language sql volatile as $$select decode('0001020304','hex')$$;");
 await assert.rejects(db.query('select public._customer_import_code_short()'),/No se pudo generar/);
 r=await db.query("select has_function_privilege('anon','public._customer_import_code_short()','EXECUTE') private,has_function_privilege('anon','public.registro_cliente_guardar(text,jsonb,boolean)','EXECUTE') form");assert.equal(r.rows[0].private,false);assert.equal(r.rows[0].form,true);
 await db.close();
 const source=fs.readFileSync('registro-cliente/copiar-codigo.js','utf8');
 async function testCopy(clipboard,exec,expected){
  let copied,selected=false;const window={getSelection:()=>({removeAllRanges(){},addRange(){selected=true}})};
  const document={body:{append(){}},createElement:()=>({setAttribute(){},style:{},focus(){},select(){},setSelectionRange(){},remove(){}}),execCommand:()=>exec,createRange:()=>({selectNodeContents(){}})};
  vm.runInNewContext(source,{window,document,navigator:{clipboard:clipboard?{writeText:async c=>{if(clipboard==='fail')throw Error();copied=c;}}:undefined}});
  const btn={focus(){}},status={};assert.equal(await window.BoomartCopiarCodigo('BA-48273',btn,status,{}),expected);
  if(clipboard===true)assert.equal(copied,'BA-48273');if(!expected)assert.equal(selected,true);
 }
 await testCopy(true,false,true);await testCopy('fail',true,true);await testCopy(false,false,false);
 console.log('OK: antiguos intactos, nuevos cortos en ambos flujos, 500 únicos, colisiones, permisos y copia con fallback.');
})().catch(e=>{console.error(e);process.exitCode=1});
