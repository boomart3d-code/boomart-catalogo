-- Pruebas de «Envío por Olva» en el registro de la tienda (migración 202611220002).
-- Se ejecutan con run-registro-web-olva.sh en una base DESCARTABLE; nunca en producción.
do $$
declare
  t1 text := repeat('o', 64);
  t2 text := repeat('p', 64);
  r jsonb; c public.clientes_web%rowtype; s public.customer_profile_submissions%rowtype; n int;
  base jsonb := jsonb_build_object('full_name', 'Cliente Olva Web', 'phone', '+51 911 222 333',
     'email', 'olva@ejemplo.com', 'document_type', 'dni', 'document_number', '87654321');
  olva jsonb := '{"delivery_method":"olva","shalom_name":"TIENDA CHACHAPOYAS","shalom_address":"JR. ORTIZ ARRIETA 270","shalom_department":"Amazonas","shalom_province":"Chachapoyas","shalom_district":"Chachapoyas","local_address":"no se guarda"}';
begin
  -- 1) Olva se acepta y conserva los datos de agencia (y descarta los de envío local).
  r := public.registro_web_guardar(t1, base || olva, 'checkout');
  assert (r ->> 'nuevo')::boolean, 'debe crear el cliente';
  select * into c from public.clientes_web where phone = '911222333';
  assert c.delivery_method = 'olva', 'guarda la forma de entrega olva';
  assert c.shalom_name = 'TIENDA CHACHAPOYAS' and c.shalom_address = 'JR. ORTIZ ARRIETA 270'
     and c.shalom_department = 'Amazonas' and c.shalom_province = 'Chachapoyas' and c.shalom_district = 'Chachapoyas',
     'conserva la agencia Olva';
  assert c.local_address = '', 'no guarda datos de envío local';
  assert r -> 'perfil' ->> 'delivery_method' = 'olva' and r -> 'perfil' ->> 'shalom_name' = 'TIENDA CHACHAPOYAS',
     'el perfil devuelto trae Olva y su agencia';

  -- 2) La solicitud para Studio queda con Olva y la misma agencia.
  select * into s from public.customer_profile_submissions where id = c.submission_id;
  assert s.delivery_method = 'olva' and s.shalom_name = 'TIENDA CHACHAPOYAS' and s.status = 'complete',
     'la solicitud para Studio también es Olva';

  -- 3) Cambiar a envío local vacía la agencia; volver a Shalom funciona como antes.
  r := public.registro_web_guardar(t1, base || '{"delivery_method":"indriver","local_district":"Miraflores","local_address":"Av. Lima 123","shalom_name":"no se guarda"}', '');
  select * into c from public.clientes_web where phone = '911222333';
  assert c.delivery_method = 'indriver' and c.shalom_name = '' and c.local_address = 'Av. Lima 123', 'con InDrive se vacía la agencia';
  r := public.registro_web_guardar(t1, base || '{"delivery_method":"shalom","shalom_name":"Agencia X","shalom_address":"Av. 1","shalom_department":"Lima","shalom_province":"Lima","shalom_district":"Ate"}', '');
  select * into c from public.clientes_web where phone = '911222333';
  assert c.delivery_method = 'shalom' and c.shalom_name = 'Agencia X', 'Shalom sigue funcionando';
  r := public.registro_web_guardar(t1, base || '{"delivery_method":"pickup","shalom_name":"no se guarda"}', '');
  select * into c from public.clientes_web where phone = '911222333';
  assert c.delivery_method = 'pickup' and c.shalom_name = '', 'con recojo se vacía la agencia';

  -- 4) Una forma de entrega desconocida se sigue rechazando (función y tabla).
  begin
    perform public.registro_web_guardar(t2, jsonb_build_object('full_name', 'Otra Persona', 'phone', '922333444',
      'email', 'otra@ejemplo.com', 'document_type', 'dni', 'document_number', '11223344', 'delivery_method', 'dhl'), '');
    raise exception 'debió rechazar dhl';
  exception when sqlstate '22023' then null; end;
  begin
    update public.clientes_web set delivery_method = 'dhl' where id = c.id;
    raise exception 'la tabla debió rechazar dhl';
  exception when check_violation then null; end;

  -- 5) Sigue habiendo una sola función y con los mismos permisos.
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'registro_web_guardar';
  assert n = 1, 'no se duplica la función';
  assert has_function_privilege('anon', 'public.registro_web_guardar(text,jsonb,text)', 'execute'), 'anon conserva el permiso';

  raise notice 'registro_web Olva: todas las pruebas pasaron';
end $$;
