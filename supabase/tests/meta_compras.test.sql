-- SOLO en base meta_purchase_test, descartable. Sin red, sin compras reales.
\set ON_ERROR_STOP on
do $$ begin if current_database() <> 'meta_purchase_test' then raise exception 'Solo base descartable meta_purchase_test'; end if; end $$;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists auth;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
create or replace function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
create or replace function public.panel_es_admin() returns boolean language sql stable set search_path='' as $$ select lower(coalesce(auth.jwt()->>'email',''))='boomart.3d@gmail.com' $$;
create table public.customer_profile_submissions(id uuid primary key, status text, email text, phone text);
insert into public.customer_profile_submissions values('11111111-1111-4111-8111-111111111111','complete','Cliente@Example.com','987654321');
\i /tmp/202610160001_pagos_confirmados_meta.sql
create function public.test_ok(ok boolean,msg text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FALLA: %',msg; end if; raise notice 'OK: %',msg; end $$;
grant execute on function public.panel_es_admin(),auth.uid(),auth.jwt(),public.test_ok(boolean,text) to authenticated,anon,service_role;
grant usage on schema auth to authenticated,anon,service_role;
create function public.test_confirm(p_abono numeric default 50,p_productos jsonb default '[{"id":"templo-aries","quantity":1,"item_price":100}]',p_ref text default 'OP-TEST') returns uuid language sql as $$
 select public.meta_compra_confirmar('11111111-1111-4111-8111-111111111111','NV-2026-001',p_productos,p_abono,'yape',p_ref) $$;
grant execute on function public.test_confirm(numeric,jsonb,text) to authenticated,anon;

do $$ declare err text; begin
 set local role anon;
 begin perform public.test_confirm(); exception when others then err:=sqlstate; end;
 perform public.test_ok(err='42501','anónimo no confirma compras'); reset role;
 set local role authenticated;
 perform set_config('request.jwt.claims','{"email":"cliente@example.com","sub":"22222222-2222-4222-8222-222222222222"}',true);
 begin perform public.test_confirm(); err:=null; exception when others then err:=sqlstate; end;
 perform public.test_ok(err='42501','otro usuario no confirma compras');
 begin perform 1 from public.meta_compras_confirmadas; err:=null; exception when others then err:=sqlstate; end;
 perform public.test_ok(err='42501','usuario no lee tabla privada');
 begin perform public.meta_compra_tomar('11111111-1111-4111-8111-111111111111');err:=null;exception when others then err:=sqlstate;end;
 perform public.test_ok(err='42501','administración de envío reservada al servicio'); reset role;
end $$;
do $$ declare a uuid; b uuid; err text; begin
 set local role authenticated;
 perform set_config('request.jwt.claims','{"email":"boomart.3d@gmail.com","sub":"33333333-3333-4333-8333-333333333333"}',true);
 a:=public.test_confirm();b:=public.test_confirm();
 perform public.test_ok(a=b,'doble clic devuelve la misma confirmación');
 perform public.test_ok((select count(*)=1 from public.meta_compras_admin(array['11111111-1111-4111-8111-111111111111'::uuid])),'historial privado disponible');
 begin perform public.test_confirm(51);err:=null;exception when others then err:=sqlstate;end;
 perform public.test_ok(err='23505','el mismo pedido con abono distinto no sobrescribe');
 begin perform public.test_confirm(150);err:=null;exception when others then err:=sqlstate;end;
 perform public.test_ok(err='22023','rechaza abono superior al total');
 begin perform public.test_confirm(0);err:=null;exception when others then err:=sqlstate;end;
 perform public.test_ok(err='22023','rechaza cero');
 begin perform public.test_confirm(50.001);err:=null;exception when others then err:=sqlstate;end;
 perform public.test_ok(err='22023','rechaza fracciones de centavo');
 begin perform public.test_confirm(50,'[{"id":"templo-aries","quantity":1.5,"item_price":100}]');err:=null;exception when others then err:=sqlstate;end;
 perform public.test_ok(err='22023','rechaza unidades fraccionarias');
 begin perform public.test_confirm(50,'[{"id":"templo-aries","quantity":1,"item_price":100},{"id":"templo-aries","quantity":1,"item_price":100}]');err:=null;exception when others then err:=sqlstate;end;
 perform public.test_ok(err='22023','rechaza líneas duplicadas');
 begin perform public.test_confirm(50,'[]');err:=null;exception when others then err:=sqlstate;end;
 perform public.test_ok(err='22023','rechaza compra sin productos');
 reset role;
 perform public.test_ok((select total=100 and abonado=50 and pedido='NV2026001' from public.meta_compras_confirmadas where id=a),'total y abono separados y pedido normalizado');
 perform public.test_ok((select email_hash=encode(extensions.digest('cliente@example.com','sha256'),'hex') and phone_hash=encode(extensions.digest('51987654321','sha256'),'hex') from public.meta_compras_confirmadas where id=a),'correo y teléfono normalizados y hasheados');
end $$;
do $$ declare a uuid; first_row public.meta_compras_confirmadas; n int; ok boolean; begin
 select id into a from public.meta_compras_confirmadas limit 1;
 set local role service_role;
 select * into first_row from public.meta_compra_tomar(a);
 perform public.test_ok(first_row.estado='enviando' and first_row.lease is not null,'primer envío toma un lease');
 select count(*) into n from public.meta_compra_tomar(a);
 perform public.test_ok(n=0,'segundo envío concurrente no toma el pedido');
 ok:=public.meta_compra_resultado(a,gen_random_uuid(),true);
 perform public.test_ok(not ok,'acuse con lease ajeno se rechaza');
 ok:=public.meta_compra_resultado(a,first_row.lease,false,'META_NETWORK');
 perform public.test_ok(ok,'fallo de red guardado');
 select * into first_row from public.meta_compra_tomar(a);
 perform public.test_ok(first_row.intentos=2,'reintento usa el mismo registro');
 ok:=public.meta_compra_resultado(a,first_row.lease,true);
 select count(*) into n from public.meta_compra_tomar(a);
 perform public.test_ok(ok and n=0,'compra enviada no se vuelve a enviar');
 reset role;
 delete from public.customer_profile_submissions;
 perform public.test_ok((select count(*)=1 and bool_and(submission_id is null) from public.meta_compras_confirmadas),'depuración de cliente conserva compra y deduplicación');
end $$;
