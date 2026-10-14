-- Pruebas del registro público de clientes (migraciones 202610140001 y 202610140002).
-- Se ejecutan en una base descartable (imagen de Supabase Postgres) con run-registro-clientes.sh.
-- NUNCA contra producción: borran y recrean las dos tablas.
\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;

drop table if exists public.customer_profile_events, public.customer_profile_submissions cascade;
drop schema if exists t cascade;

-- En Supabase real auth.jwt() lo crea GoTrue; aquí se define igual para la base descartable.
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;
grant execute on function auth.jwt() to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;

create or replace function public.panel_es_admin()
returns boolean language sql stable set search_path = '' as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = 'boomart.3d@gmail.com';
$$;

\i /tmp/202610140001_registro_clientes.sql
\i /tmp/202610140002_registro_clientes_endurecer.sql

create schema t;
grant usage on schema t to anon, authenticated, service_role;
create or replace function t.ok(c boolean, m text) returns void language plpgsql as $$
begin
  if c is not true then raise exception 'FALLA: %', m; end if;
  raise notice '  [ok] %', m;
end $$;
grant execute on function t.ok(boolean, text) to anon, authenticated, service_role;

-- datos válidos de base; cada prueba cambia lo que necesita
create or replace function t.datos(p jsonb default '{}') returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'full_name', 'María Pérez López', 'phone', '+51 987 721 954', 'email', 'maria@ejemplo.com',
    'document_type', 'dni', 'document_number', '12345678', 'delivery_method', 'indriver',
    'local_address', 'Av. Lima 123', 'local_district', 'Miraflores', 'consent', true) || p;
$$;
grant execute on function t.datos(jsonb) to anon, authenticated, service_role;

-- ejecuta un registro_cliente_guardar y devuelve el mensaje de error (o NULL si salió bien)
create or replace function t.error_guardar(p_token text, p_data jsonb, p_complete boolean) returns text
language plpgsql as $$
begin
  perform public.registro_cliente_guardar(p_token, p_data, p_complete);
  return null;
exception when others then
  return sqlerrm;
end $$;
grant execute on function t.error_guardar(text, jsonb, boolean) to anon, authenticated, service_role;

\echo '== 1. Borrador y teléfono'
do $$ declare r jsonb; s public.customer_profile_submissions; begin
  set local role anon;
  r := public.registro_cliente_guardar(repeat('a', 32), t.datos('{"document_type":"","document_number":"","email":"","delivery_method":""}'), false);
  reset role;
  perform t.ok(r ->> 'status' = 'draft' and r ->> 'import_code' is null and (r ->> 'draft_ref') like 'BOR-%', 'borrador creado sin código importable');
  select * into s from public.customer_profile_submissions where draft_ref = r ->> 'draft_ref';
  perform t.ok(s.phone = '987721954', '"+51 987 721 954" se guarda como 987721954');
  perform t.ok(public._registro_cliente_telefono('0051987721954') = '987721954', '0051… también se normaliza');
  perform t.ok(public._registro_cliente_telefono('987 721 954') = '987721954', 'teléfono sin prefijo queda igual');
  perform t.ok(public._registro_cliente_telefono('+1 415 555 0100') = '14155550100', 'número extranjero no se toca');
end $$;

\echo '== 2. Completar: código y validaciones iguales a Studio'
do $$ declare r jsonb; r2 jsonb; begin
  set local role anon;
  r := public.registro_cliente_guardar(repeat('b', 32), t.datos(), true);
  perform t.ok(r ->> 'status' = 'complete' and (r ->> 'import_code') ~ '^BA-[A-FXY2-9]{4}-[A-FXY2-9]{4}$', 'registro completo con código BA-XXXX-XXXX');
  r2 := public.registro_cliente_guardar(repeat('b', 32), t.datos(), true);
  perform t.ok(r2 ->> 'import_code' = r ->> 'import_code', 'completar de nuevo conserva el mismo código');
  perform t.ok(t.error_guardar(repeat('c', 32), t.datos('{"document_type":"ce","document_number":"12345"}'), true) like '%carné de extranjería%', 'carné de 5 caracteres se rechaza (Studio pide 9-12)');
  perform t.ok(t.error_guardar(repeat('d', 32), t.datos('{"document_type":"pasaporte","document_number":"12345"}'), true) like '%pasaporte%', 'pasaporte de 5 caracteres se rechaza (Studio pide 6-12)');
  perform t.ok(t.error_guardar(repeat('e', 32), t.datos('{"document_type":"ce","document_number":"001-23456"}'), true) like '%carné%', 'carné de 9 caracteres con guion cuenta solo letras y números (8)');
  perform t.ok(t.error_guardar(repeat('f', 32), t.datos('{"document_type":"ce","document_number":"001234567"}'), true) is null, 'carné de 9 caracteres se acepta');
  perform t.ok(t.error_guardar(repeat('g', 32), t.datos('{"document_type":"pasaporte","document_number":"ab123456"}'), true) is null, 'pasaporte de 8 caracteres se acepta');
  perform t.ok(t.error_guardar(repeat('h', 32), t.datos('{"document_number":"1234567"}'), true) like '%8 dígitos%', 'DNI de 7 dígitos se rechaza');
  perform t.ok(t.error_guardar(repeat('i', 32), t.datos('{"document_number":"12.345.678"}'), true) is null, 'DNI con puntos se normaliza y se acepta');
  perform t.ok(t.error_guardar(repeat('j', 32), t.datos('{"email":"a@b.c"}'), true) like '%correo%', 'correo con dominio de 1 letra se rechaza');
  perform t.ok(t.error_guardar(repeat('k', 32), t.datos('{"full_name":"Al"}'), true) like '%nombre%', 'nombre muy corto se rechaza');
  perform t.ok(t.error_guardar(repeat('l', 32), t.datos('{"delivery_method":""}'), true) like '%recibirás%', 'sin forma de entrega se rechaza');
  perform t.ok(t.error_guardar(repeat('m', 32), t.datos('{"local_district":""}'), true) like '%distrito%', 'InDrive sin distrito se rechaza');
  perform t.ok(t.error_guardar(repeat('n', 32), t.datos('{"delivery_method":"shalom","shalom_name":"Terminal","shalom_address":"Av. X 1","shalom_province":"Arequipa"}'), true) like '%Shalom%', 'Shalom sin departamento se rechaza');
  perform t.ok(t.error_guardar(repeat('o', 32), t.datos('{"delivery_method":"shalom","shalom_name":"Terminal","shalom_address":"Av. X 1","shalom_department":"Arequipa","shalom_province":"Arequipa","shalom_district":"Cercado"}'), true) is null, 'Shalom con todos los datos se acepta');
  perform t.ok(t.error_guardar(repeat('p', 32), t.datos('{"delivery_method":"pickup"}'), true) is null, 'recojo no pide dirección');
  perform t.ok(t.error_guardar(repeat('q', 32), t.datos('{"consent":false}'), true) like '%aceptar%', 'sin consentimiento se rechaza');
  perform t.ok(t.error_guardar('corto', t.datos(), true) = 'Registro no válido', 'token corto se rechaza');
  perform t.ok(t.error_guardar(repeat('r', 32), t.datos('{"phone":"12345"}'), false) like '%teléfono%', 'teléfono de 5 dígitos se rechaza');
  reset role;
end $$;

\echo '== 3. Un registro completo no se degrada'
do $$ declare r jsonb; s public.customer_profile_submissions; begin
  set local role anon;
  -- autoguardado parcial (recarga + solo el teléfono) sobre el registro completo 'bbb…'
  r := public.registro_cliente_guardar(repeat('b', 32), jsonb_build_object('phone', '987721954', 'consent', true), false);
  reset role;
  perform t.ok((r ->> 'kept')::boolean and r ->> 'status' = 'complete', 'el autoguardado parcial se ignora (kept = true)');
  select * into s from public.customer_profile_submissions where import_code = r ->> 'import_code';
  perform t.ok(s.full_name = 'María Pérez López' and s.email = 'maria@ejemplo.com' and s.document_number = '12345678', 'nombre, correo y documento siguen intactos');
  set local role anon;
  r := public.registro_cliente_guardar(repeat('b', 32), t.datos('{"local_address":"Jr. Nueva 456"}'), false);
  reset role;
  select * into s from public.customer_profile_submissions where import_code = r ->> 'import_code';
  perform t.ok(not (r ->> 'kept')::boolean and s.local_address = 'Jr. Nueva 456', 'una corrección completa y válida SÍ se aplica');
  perform t.ok(s.status = 'complete' and s.import_code = r ->> 'import_code', 'y el registro sigue completo con el mismo código');
end $$;

\echo '== 4. Permisos'
do $$ declare m text; r jsonb; v_id uuid; begin
  select id into v_id from public.customer_profile_submissions where import_code is not null order by created_at limit 1;
  set local role anon;
  begin perform 1 from public.customer_profile_submissions limit 1; m := null; exception when others then m := sqlstate; end;
  perform t.ok(m = '42501', 'anon NO puede leer la tabla');
  begin perform * from public.registro_clientes_admin('', '', 5); m := null; exception when others then m := sqlstate; end;
  perform t.ok(m = '42501', 'anon NO puede usar la bandeja');
  begin perform public.registro_cliente_revocar(v_id, 'x'); m := null; exception when others then m := sqlstate; end;
  perform t.ok(m = '42501', 'anon NO puede revocar');
  begin perform public.registro_cliente_marcar_importado(v_id, 'x'); m := null; exception when others then m := sqlstate; end;
  perform t.ok(m = '42501', 'anon NO puede marcar como importado');
  begin perform public.registro_clientes_depurar(); m := null; exception when others then m := sqlstate; end;
  perform t.ok(m = '42501', 'anon NO puede ejecutar la limpieza');
  reset role;

  set local role authenticated;
  perform set_config('request.jwt.claims', '{"role":"authenticated","email":"cliente@ejemplo.com"}', true);
  begin perform * from public.registro_clientes_admin('', '', 5); m := null; exception when others then m := sqlerrm; end;
  perform t.ok(m = 'No autorizado', 'un usuario cualquiera con sesión NO ve la bandeja');
  begin perform public.registro_cliente_revocar(v_id, 'x'); m := null; exception when others then m := sqlerrm; end;
  perform t.ok(m = 'No autorizado', 'un usuario cualquiera con sesión NO puede revocar');
  begin perform public.registro_cliente_marcar_importado(v_id, 'x'); m := null; exception when others then m := sqlstate; end;
  perform t.ok(m = '42501', 'un usuario con sesión NO puede marcar como importado');
  reset role;

  set local role authenticated;
  perform set_config('request.jwt.claims', '{"role":"authenticated","email":"boomart.3d@gmail.com"}', true);
  perform t.ok((select count(*) from public.registro_clientes_admin('', '', 50)) >= 3, 'el administrador ve la bandeja');
  perform t.ok((select count(*) from public.registro_clientes_admin('complete', 'BA-', 50)) >= 1, 'el administrador filtra por estado y código');
  reset role;
end $$;

\echo '== 5. Marcar importado y revocar'
do $$ declare v_id uuid; v_id2 uuid; ok1 boolean; ok2 boolean; m text; ev int; r jsonb; begin
  select id into v_id from public.customer_profile_submissions where edit_token_hash = encode(extensions.digest(repeat('b', 32), 'sha256'), 'hex');
  select id into v_id2 from public.customer_profile_submissions where import_code is not null and id <> v_id order by draft_ref limit 1;

  set local role service_role;
  ok1 := public.registro_cliente_marcar_importado(v_id, 'BoomArt Studio');
  ok2 := public.registro_cliente_marcar_importado(v_id, 'BoomArt Studio');
  reset role;
  perform t.ok(ok1 and not ok2, 'Studio marca importado una sola vez (la segunda devuelve false)');
  select count(*) into ev from public.customer_profile_events where submission_id = v_id and event_type = 'imported' and actor = 'studio';
  perform t.ok(ev = 1, 'queda 1 evento "imported" en el historial');
  perform t.ok((select status from public.customer_profile_submissions where id = v_id) = 'imported'
               and (select imported_at from public.customer_profile_submissions where id = v_id) is not null, 'estado importado con fecha');

  set local role anon;
  m := t.error_guardar(repeat('b', 32), t.datos(), false);
  reset role;
  -- el token 'bbb…' pertenece al primer registro completo, el que se importó arriba
  perform t.ok(m = 'Este registro ya no se puede modificar', 'un registro importado ya no se modifica desde la web');

  set local role authenticated;
  perform set_config('request.jwt.claims', '{"role":"authenticated","email":"boomart.3d@gmail.com"}', true);
  ok1 := public.registro_cliente_revocar(v_id2, 'cliente equivocado');
  ok2 := public.registro_cliente_revocar(v_id2, 'otra vez');
  reset role;
  perform t.ok(ok1 and not ok2, 'el administrador revoca una vez (la segunda devuelve false)');
  perform t.ok((select detail ->> 'motivo' from public.customer_profile_events where submission_id = v_id2 and event_type = 'revoked') = 'cliente equivocado', 'el motivo queda en el historial');
  set local role service_role;
  ok1 := public.registro_cliente_marcar_importado(v_id2, 'BoomArt Studio');
  reset role;
  perform t.ok(not ok1, 'un registro revocado no se puede importar');
end $$;

\echo '== 6. Eventos, tope por registro y tope global'
do $$ declare n int; v_hash text; begin
  set local role anon;
  perform public.registro_cliente_guardar(repeat('z', 32), t.datos('{"document_type":"","document_number":"","email":"","delivery_method":""}'), false);
  perform public.registro_cliente_guardar(repeat('z', 32), t.datos('{"full_name":"María P","document_type":"","document_number":"","email":"","delivery_method":""}'), false);
  perform public.registro_cliente_guardar(repeat('z', 32), t.datos('{"full_name":"María Pé","document_type":"","document_number":"","email":"","delivery_method":""}'), false);
  reset role;
  v_hash := encode(extensions.digest(repeat('z', 32), 'sha256'), 'hex');
  select count(*) into n from public.customer_profile_events e join public.customer_profile_submissions s on s.id = e.submission_id
   where s.edit_token_hash = v_hash and e.event_type = 'draft_saved';
  perform t.ok(n = 1, '3 autoguardados seguidos dejan 1 solo evento draft_saved');

  update public.customer_profile_submissions set version = 400 where edit_token_hash = v_hash;
  perform t.ok((select t.error_guardar(repeat('z', 32), t.datos(), false)) like '%demasiados cambios%', 'tope de 400 guardados por registro');

  insert into public.customer_profile_submissions(draft_ref, edit_token_hash, consent_at)
  select 'TOP-' || g, 'hash-top-' || g, now() from generate_series(1, 300) g;
  set local role anon;
  perform t.ok(t.error_guardar(repeat('y', 32), t.datos(), false) like '%muchas solicitudes%', 'tope global: 300 registros nuevos por hora');
  perform t.ok(t.error_guardar(repeat('z', 32), t.datos(), false) like '%demasiados cambios%', 'un registro existente no depende del tope global');
  reset role;
  delete from public.customer_profile_submissions where draft_ref like 'TOP-%';
end $$;

\echo '== 7. Limpieza por plazos'
do $$ declare r jsonb; n int; begin
  delete from public.customer_profile_submissions;
  insert into public.customer_profile_submissions(draft_ref, edit_token_hash, consent_at, status, full_name, phone, email, document_type, document_number, import_code, completed_at, updated_at, imported_at) values
   ('BOR-VIEJO1', 'h1', now(), 'draft', 'Borrador Viejo', '987000001', '', '', '', null, null, now() - interval '8 days', null),
   ('BOR-NUEVO1', 'h2', now(), 'draft', 'Borrador Nuevo', '987000002', '', '', '', null, null, now() - interval '2 days', null),
   ('BOR-COMPL1', 'h3', now(), 'complete', 'Completo Viejo', '987000003', 'a@b.pe', 'dni', '11111111', 'BA-AAAA-BBBB', now() - interval '31 days', now() - interval '31 days', null),
   ('BOR-COMPL2', 'h4', now(), 'complete', 'Completo Nuevo', '987000004', 'c@d.pe', 'dni', '22222222', 'BA-CCCC-DDDD', now() - interval '3 days', now() - interval '3 days', null),
   ('BOR-WAPP1', 'h5', now(), 'whatsapp_opened', 'Wapp Viejo', '987000005', 'e@f.pe', 'dni', '33333333', 'BA-EEEE-FFFF', now() - interval '40 days', now() - interval '40 days', null),
   ('BOR-IMP1', 'h6', now(), 'imported', 'Importado Viejo', '987000006', 'g@h.pe', 'dni', '44444444', 'BA-2222-3333', now() - interval '100 days', now() - interval '100 days', now() - interval '95 days'),
   ('BOR-IMP2', 'h7', now(), 'imported', 'Importado Nuevo', '987000007', 'i@j.pe', 'dni', '55555555', 'BA-4444-5555', now() - interval '10 days', now() - interval '10 days', now() - interval '9 days'),
   ('BOR-REV1', 'h8', now(), 'revoked', 'Revocado Viejo', '987000008', 'k@l.pe', 'dni', '66666666', 'BA-6666-7777', now() - interval '120 days', now() - interval '100 days', null);
  set local role anon;
  r := null;
  begin r := public.registro_clientes_depurar(); exception when others then r := null; end;
  reset role;
  perform t.ok(r is null, 'anon no puede ejecutar la limpieza');
  set local role service_role;
  r := public.registro_clientes_depurar();
  reset role;
  perform t.ok((r ->> 'borradores_borrados')::int = 1, 'se borra el borrador de 8 días');
  perform t.ok((r ->> 'vencidos')::int = 2, 'los completos y "WhatsApp abierto" de 30+ días pasan a vencido');
  perform t.ok((r ->> 'importados_borrados')::int = 1, 'se borra el importado de 95 días');
  perform t.ok((r ->> 'antiguos_borrados')::int = 1, 'se borra el revocado de 100 días');
  perform t.ok(exists (select 1 from public.customer_profile_submissions where draft_ref = 'BOR-NUEVO1'), 'el borrador reciente se conserva');
  perform t.ok(exists (select 1 from public.customer_profile_submissions where draft_ref = 'BOR-COMPL2' and status = 'complete' and full_name = 'Completo Nuevo'), 'el completo reciente se conserva intacto');
  perform t.ok(exists (select 1 from public.customer_profile_submissions where draft_ref = 'BOR-IMP2'), 'el importado reciente se conserva');
  perform t.ok(exists (select 1 from public.customer_profile_submissions where draft_ref = 'BOR-COMPL1' and status = 'expired'
                        and full_name = '' and phone = '' and email = '' and document_number = '' and import_code = 'BA-AAAA-BBBB'), 'el vencido pierde los datos personales y conserva código y fechas');
  perform t.ok(not exists (select 1 from public.customer_profile_submissions where status = 'draft' and draft_ref = 'BOR-VIEJO1'), 'no queda el borrador viejo');
  r := public.registro_clientes_depurar();
  perform t.ok((r ->> 'vencidos')::int = 0 and (r ->> 'borradores_borrados')::int = 0, 'correr la limpieza dos veces no cambia nada más');
end $$;

\echo '== TODAS LAS PRUEBAS PASARON =='
