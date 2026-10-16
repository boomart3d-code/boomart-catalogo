-- Pruebas de registro_web_pedido_enviar / pedidos_web (correr dentro de begin ... rollback,
-- después de las migraciones 202610150001 y 202610160001).
do $$
declare
  t1 text := repeat('p', 64);
  t2 text := repeat('q', 64);
  r jsonb; c public.clientes_web%rowtype; p public.pedidos_web%rowtype; n int;
  base jsonb := jsonb_build_object('full_name', 'Prueba Pedido Web', 'phone', '+51 987 600 111',
     'email', 'pedido@ejemplo.com', 'document_type', 'dni', 'document_number', '87600111',
     'delivery_method', 'pickup');
  pedido jsonb := jsonb_build_object(
     'codigo', 'W-AB2CD', 'metodo', 'yape', 'metodo_label', 'Yape', 'modalidad', 'total',
     'tarjeta', false, 'destino', 'Recojo coordinado', 'total', 270, 'monto_a_pagar', 270,
     'items', jsonb_build_array(
        jsonb_build_object('id', 'templo-aries', 'nombre', 'Templo de Aries', 'variante', 'Combo', 'variante_clave', 'combo', 'cantidad', 2, 'precio', 100),
        jsonb_build_object('id', 'tiara-de-ikki-de-fenix-saint-seiya', 'nombre', 'Tiara de Ikki', 'cantidad', 1, 'precio', 100)));
begin
  perform public.registro_web_guardar(t1, base, 'checkout');
  select * into c from public.clientes_web where phone = '987600111';
  update public.clientes_web set carrito = '[{"x":1}]'::jsonb where id = c.id;

  -- 1) Token inválido / pedido mal formado: no guarda nada.
  assert not (public.registro_web_pedido_enviar(t2, false, pedido) ->> 'ok')::boolean, 'token desconocido';
  assert (public.registro_web_pedido_enviar(t1, false, pedido || '{"codigo":"W-0O1IL"}') ->> 'error') = 'codigo', 'código con letras ambiguas';
  assert (public.registro_web_pedido_enviar(t1, false, pedido || '{"items":[]}') ->> 'error') = 'items', 'sin productos';
  assert (public.registro_web_pedido_enviar(t1, false, pedido || jsonb_build_object('items',
          jsonb_build_array(jsonb_build_object('id','x','nombre','x','cantidad',0,'precio',10)))) ->> 'error') = 'items', 'cantidad 0';
  assert (public.registro_web_pedido_enviar(t1, false, pedido || jsonb_build_object('items',
          jsonb_build_array(jsonb_build_object('id','x','nombre','x','cantidad','dos','precio',10)))) ->> 'error') = 'items', 'cantidad no numérica';
  assert (select count(*) from public.pedidos_web where cliente_id = c.id) = 0, 'nada guardado';

  -- 2) Pedido con cupón: total recalculado en el servidor (300 - 10 % = 270), sin alertas.
  r := public.registro_web_pedido_enviar(t1, true, pedido);
  assert (r ->> 'ok')::boolean and r ->> 'codigo' = 'W-AB2CD' and (r ->> 'cupon_aplicado')::boolean, r::text;
  select * into p from public.pedidos_web where codigo = 'W-AB2CD';
  assert p.estado = 'por_validar' and p.subtotal = 300 and p.descuento = 30 and p.total = 270 and p.cupon, 'montos';
  assert jsonb_array_length(p.items) = 2 and (p.items -> 0 ->> 'subtotal')::numeric = 200, 'líneas';
  assert p.cliente ->> 'document_number' = '87600111' and p.cliente ->> 'phone' = '987600111', 'foto del cliente';
  assert coalesce(array_length(p.alertas, 1), 0) = 0, 'sin alertas: ' || p.alertas::text;
  select * into c from public.clientes_web where id = c.id;
  assert c.cupon_usado_en is not null and c.pedidos_web = 1 and c.carrito = '[]'::jsonb, 'cupón consumido y carrito vacío';
  assert exists (select 1 from public.clientes_web_correos where cliente_id = c.id and tipo = 'aviso_pedido'
                  and ref = 'W-AB2CD' and enviado_en = 'epoch'), 'aviso pendiente para BoomArt';

  -- 3) Reintento del mismo código: no duplica.
  r := public.registro_web_pedido_enviar(t1, true, pedido);
  assert (r ->> 'repetido')::boolean, 'idempotente';
  assert (select count(*) from public.pedidos_web where cliente_id = c.id) = 1, 'un solo pedido';

  -- 4) Segundo pedido pidiendo el cupón otra vez + total manipulado: alertas, sin descuento.
  r := public.registro_web_pedido_enviar(t1, true, pedido || '{"codigo":"W-ZZ9XY","total":1}');
  select * into p from public.pedidos_web where codigo = 'W-ZZ9XY';
  assert not p.cupon and p.total = 300 and array_length(p.alertas, 1) = 2, p.alertas::text;

  -- 5) Con tarjeta el cupón no aplica y no se consume.
  r := public.registro_web_pedido_enviar(t1, false, pedido || '{"codigo":"W-TA7JT","tarjeta":true}');
  select * into p from public.pedidos_web where codigo = 'W-TA7JT';
  assert p.pago_con_tarjeta and not p.cupon and p.total = 300 and not p.pago_verificado, 'tarjeta';

  -- 6) Código de otro cliente: no se pisa.
  perform public.registro_web_guardar(t2, base || '{"phone":"987600222","document_number":"87600222","email":"otro@ejemplo.com"}', 'checkout');
  assert (public.registro_web_pedido_enviar(t2, false, pedido) ->> 'error') = 'codigo_ocupado', 'código ajeno';

  -- 7) Freno: máximo 10 por hora.
  for n in 1..12 loop
    r := public.registro_web_pedido_enviar(t2, false, pedido || jsonb_build_object('codigo', 'W-RL' || chr(64 + n) || 'AA'));
  end loop;
  assert (select count(*) from public.pedidos_web where cliente_id <> c.id) = 10, 'freno anti-abuso';
  assert r ->> 'error' = 'demasiados', r::text;

  -- 8) El navegador no puede leer la tabla.
  assert not has_table_privilege('anon', 'public.pedidos_web', 'select'), 'anon sin lectura';
  assert not has_table_privilege('authenticated', 'public.pedidos_web', 'insert'), 'authenticated sin escritura';

  raise notice 'pedidos_web: todas las pruebas OK';
end;
$$;
