-- Pruebas de registro_web_* (correr dentro de begin ... rollback, después de la migración).
do $$
declare
  t1 text := repeat('a', 64);  -- navegador 1
  t2 text := repeat('b', 64);  -- navegador 2 (otro dispositivo)
  t3 text := repeat('c', 64);  -- navegador de otra persona
  r jsonb; c public.clientes_web%rowtype; n int; v_err text;
  base jsonb := jsonb_build_object('full_name', 'Prueba  Registro Web', 'phone', '+51 987 654 321',
     'email', 'Prueba@Ejemplo.com', 'document_type', 'dni', 'document_number', '12345678');
begin
  -- 1) Registro mínimo (sin entrega) se acepta y crea código + correos pendientes.
  r := public.registro_web_guardar(t1, base, 'checkout');
  assert (r ->> 'nuevo')::boolean, 'debe ser nuevo';
  select * into c from public.clientes_web where phone = '987654321';
  assert c.email = 'prueba@ejemplo.com' and c.full_name = 'Prueba Registro Web', 'normaliza datos';
  assert c.import_code like 'BA-____-____', 'genera código';
  assert (select status from public.customer_profile_submissions where id = c.submission_id) = 'complete', 'solicitud completa';
  assert (select count(*) from public.clientes_web_correos where cliente_id = c.id and enviado_en = 'epoch') = 2, 'bienvenida + aviso pendientes';
  assert (r -> 'perfil' ->> 'cupon_disponible')::boolean, 'cupón disponible';

  -- 2) Obligatorios.
  begin
    perform public.registro_web_guardar(t3, base - 'email', '');
    raise exception 'debió fallar sin correo';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.registro_web_guardar(t3, base || '{"document_number":"123"}', '');
    raise exception 'debió fallar DNI corto';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.registro_web_guardar(t3, base || '{"phone":"12345"}', '');
    raise exception 'debió fallar teléfono';
  exception when sqlstate '22023' then null; end;

  -- 3) Mismo documento con otro WhatsApp: rechazado. Mismo WhatsApp con otro documento: rechazado.
  begin
    perform public.registro_web_guardar(t3, base || '{"phone":"912345678"}', '');
    raise exception 'debió fallar documento con otro teléfono';
  exception when sqlstate '22023' then get stacked diagnostics v_err = message_text;
    assert v_err like 'Este documento%', v_err; end;
  begin
    perform public.registro_web_guardar(t3, base || '{"document_number":"87654321"}', '');
    raise exception 'debió fallar teléfono con otro documento';
  exception when sqlstate '22023' then get stacked diagnostics v_err = message_text;
    assert v_err like 'Este WhatsApp%', v_err; end;

  -- 4) Otro dispositivo con mismo WhatsApp + documento: recupera el mismo registro, sin código nuevo.
  r := public.registro_web_guardar(t2, base, '');
  assert not (r ->> 'nuevo')::boolean, 'no debe crear otro';
  assert (select count(*) from public.clientes_web where document_number = '12345678') = 1, 'un solo cliente';
  assert (select count(*) from public.customer_profile_submissions where phone = '987654321') = 1, 'una sola solicitud';

  -- 5) Agregar entrega Shalom mientras no está importado: actualiza la misma solicitud.
  r := public.registro_web_guardar(t2, base || '{"delivery_method":"shalom","shalom_name":"Agencia X","shalom_address":"Av. 1","shalom_department":"Lima","shalom_province":"Lima","shalom_district":"Ate","local_address":"no se guarda"}', '');
  select * into c from public.clientes_web where phone = '987654321';
  assert c.shalom_name = 'Agencia X' and c.local_address = '', 'solo guarda datos de la opción';
  assert (select shalom_name from public.customer_profile_submissions where id = c.submission_id) = 'Agencia X', 'solicitud actualizada';
  assert (select count(*) from public.customer_profile_submissions where phone = '987654321') = 1, 'sigue una solicitud';

  -- 6) Ya importado + cambio de datos: código nuevo y aviso de actualización.
  perform public.registro_cliente_marcar_importado(c.submission_id, 'prueba');
  r := public.registro_web_guardar(t1, base || '{"delivery_method":"pickup"}', '');
  select * into c from public.clientes_web where phone = '987654321';
  assert (select count(*) from public.customer_profile_submissions where phone = '987654321') = 2, 'nueva solicitud tras importar';
  assert exists (select 1 from public.clientes_web_correos where cliente_id = c.id and tipo = 'aviso_actualizacion' and ref = c.import_code), 'aviso de actualización';
  -- Guardar sin cambios no crea nada.
  r := public.registro_web_guardar(t1, base || '{"delivery_method":"pickup"}', '');
  assert (select count(*) from public.customer_profile_submissions where phone = '987654321') = 2, 'sin cambios no crea solicitud';

  -- 7) Perfil, carrito, pedido y cupón de un solo uso.
  assert (public.registro_web_perfil(t2) ->> 'full_name') = 'Prueba Registro Web', 'perfil por token';
  assert public.registro_web_perfil(t3) is null, 'token desconocido sin perfil';
  assert public.registro_web_carrito(t1, '[{"productId":"templo-aries","quantity":1}]'::jsonb), 'carrito';
  r := public.registro_web_pedido(t1, true);
  assert (r ->> 'cupon_aplicado')::boolean, 'primer cupón aplica';
  r := public.registro_web_pedido(t2, true);
  assert not (r ->> 'cupon_aplicado')::boolean, 'segundo cupón no aplica';
  select * into c from public.clientes_web where phone = '987654321';
  assert c.pedidos_web = 2 and c.ultimo_pedido_en is not null and c.carrito = '[]'::jsonb, 'pedido registrado';
  assert not (public.registro_web_perfil(t1) ->> 'cupon_disponible')::boolean, 'cupón ya usado';

  -- 8) Confirmación de correo con el token del correo de bienvenida.
  r := public.registro_web_confirmar((select ref from public.clientes_web_correos where cliente_id = c.id and tipo = 'bienvenida'));
  assert (r ->> 'ok')::boolean, 'confirma';
  assert (select correo_confirmado_en is not null from public.clientes_web where id = c.id), 'marcado confirmado';
  assert not (public.registro_web_confirmar(repeat('z', 48)) ->> 'ok')::boolean, 'token falso no confirma';

  raise notice 'registro_web: todas las pruebas pasaron';
end $$;
