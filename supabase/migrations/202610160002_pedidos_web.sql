-- Pedidos web "por validar" (pedido de Adrián, 2026-10-16).
--
-- Cuando un cliente registrado envía su pedido desde boomart.pe, el pedido se
-- GUARDA aquí con un código W-XXXXX (el mismo que va en su mensaje de WhatsApp)
-- y estado 'por_validar'. NO es una venta: BoomArt Studio lo muestra en su
-- bandeja "Pedidos web por validar" y Adrián decide (validar y crear la venta,
-- esperar el pago o descartar). A BoomArt le llega un correo de aviso.
--
-- Más adelante (Culqi) el pago con tarjeta lo confirmará el servidor
-- (pago_verificado / pago_ref), nunca el navegador.
--
-- Seguridad: la tabla no se lee ni escribe desde el navegador (RLS forzado, sin
-- políticas); solo la función registro_web_pedido_enviar (con el token del
-- registro) inserta, y Studio lee/actualiza con la clave de servicio.

create table if not exists public.pedidos_web (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique check (codigo ~ '^W-[A-HJ-NP-Z2-9]{5}$'),
  cliente_id uuid not null references public.clientes_web(id) on delete restrict,
  estado text not null default 'por_validar'
    check (estado in ('por_validar', 'esperando_pago', 'validado', 'descartado')),
  items jsonb not null,
  subtotal numeric(10, 2) not null default 0,
  descuento numeric(10, 2) not null default 0,
  total numeric(10, 2) not null default 0,
  cupon boolean not null default false,
  metodo_pago text not null default '',
  metodo_pago_label text not null default '',
  modalidad text not null default 'total' check (modalidad in ('total', 'adelanto')),
  monto_a_pagar numeric(10, 2) not null default 0,
  pago_con_tarjeta boolean not null default false,
  destino text not null default '',
  cliente jsonb not null,                    -- foto de los datos del cliente al momento del pedido
  alertas text[] not null default '{}',      -- inconsistencias detectadas por el servidor
  pago_verificado boolean not null default false,
  pago_ref text not null default '',
  pago_pasarela text not null default '',
  studio_nv text not null default '',        -- NV-00120 al validarlo en Studio
  motivo text not null default '',           -- motivo de descarte / nota de Studio
  revisado_en timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists pedidos_web_estado_idx on public.pedidos_web(estado, creado_en desc);
create index if not exists pedidos_web_cliente_idx on public.pedidos_web(cliente_id, creado_en desc);

alter table public.pedidos_web enable row level security;
alter table public.pedidos_web force row level security;
revoke all on public.pedidos_web from public, anon, authenticated;
grant select, insert, update on public.pedidos_web to service_role;

-- Nuevo tipo de correo: aviso de pedido web a BoomArt (ref = código W-).
alter table public.clientes_web_correos drop constraint if exists clientes_web_correos_tipo_check;
alter table public.clientes_web_correos add constraint clientes_web_correos_tipo_check
  check (tipo in ('bienvenida', 'aviso_registro', 'aviso_actualizacion', 'aviso_pedido',
                  'remarketing_2h', 'remarketing_24h', 'remarketing_48h'));

-- Guarda el pedido (y hace lo mismo que registro_web_pedido: detiene el
-- remarketing, consume el cupón si correspondía y vacía el carrito guardado).
-- Idempotente por código: si el navegador reintenta, no se duplica.
create or replace function public.registro_web_pedido_enviar(p_token text, p_cupon boolean, p_pedido jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_hash text; c public.clientes_web%rowtype; v_code text; v_items jsonb := '[]'::jsonb;
  v_item jsonb; v_qty integer; v_unit numeric; v_sub_cents bigint := 0; v_desc_cents bigint;
  v_alertas text[] := '{}'; v_cupon boolean := false; v_existing public.pedidos_web%rowtype;
  v_subtotal numeric; v_descuento numeric; v_total numeric; v_modalidad text; v_tarjeta boolean;
  v_recientes integer;
begin
  if p_token is null or length(p_token) < 32 or length(p_token) > 128 then
    return jsonb_build_object('ok', false, 'error', 'token');
  end if;
  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');
  select w.* into c from public.clientes_web w
    join public.clientes_web_tokens t on t.cliente_id = w.id
   where t.token_hash = v_hash;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'token'); end if;

  if p_pedido is null or jsonb_typeof(p_pedido) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'pedido');
  end if;
  v_code := upper(coalesce(p_pedido->>'codigo', ''));
  if v_code !~ '^W-[A-HJ-NP-Z2-9]{5}$' then
    return jsonb_build_object('ok', false, 'error', 'codigo');
  end if;

  -- Reintento del mismo pedido: devolver lo ya guardado.
  select * into v_existing from public.pedidos_web where codigo = v_code;
  if v_existing.id is not null then
    if v_existing.cliente_id = c.id then
      return jsonb_build_object('ok', true, 'codigo', v_existing.codigo, 'repetido', true);
    end if;
    return jsonb_build_object('ok', false, 'error', 'codigo_ocupado');
  end if;

  -- Freno anti-abuso: como máximo 10 pedidos por cliente en una hora.
  select count(*) into v_recientes from public.pedidos_web
   where cliente_id = c.id and creado_en > now() - interval '1 hour';
  if v_recientes >= 10 then
    return jsonb_build_object('ok', false, 'error', 'demasiados');
  end if;

  if jsonb_typeof(p_pedido->'items') <> 'array'
     or jsonb_array_length(p_pedido->'items') < 1 or jsonb_array_length(p_pedido->'items') > 60 then
    return jsonb_build_object('ok', false, 'error', 'items');
  end if;
  for v_item in select * from jsonb_array_elements(p_pedido->'items') loop
    begin
      v_qty := (v_item->>'cantidad')::integer;
      v_unit := round((v_item->>'precio')::numeric, 2);
    exception when others then
      return jsonb_build_object('ok', false, 'error', 'items');
    end;
    if v_qty is null or v_qty < 1 or v_qty > 999 or v_unit is null or v_unit < 0 or v_unit > 100000
       or length(coalesce(v_item->>'id', '')) > 120 or length(coalesce(v_item->>'nombre', '')) > 200
       or length(coalesce(v_item->>'variante', '')) > 120 then
      return jsonb_build_object('ok', false, 'error', 'items');
    end if;
    v_sub_cents := v_sub_cents + round(v_unit * 100)::bigint * v_qty;
    v_items := v_items || jsonb_build_object(
      'id', left(coalesce(v_item->>'id', ''), 120),
      'nombre', left(coalesce(v_item->>'nombre', ''), 200),
      'variante', left(coalesce(v_item->>'variante', ''), 120),
      'variante_clave', left(coalesce(v_item->>'variante_clave', ''), 120),
      'cantidad', v_qty,
      'precio', v_unit,
      'subtotal', round(v_unit * v_qty, 2));
  end loop;

  v_subtotal := v_sub_cents / 100.0;
  v_tarjeta := coalesce((p_pedido->>'tarjeta')::boolean, false);
  v_modalidad := case when p_pedido->>'modalidad' = 'adelanto' then 'adelanto' else 'total' end;

  -- Cupón: solo si el cliente lo pidió, no es con tarjeta y aún no lo había usado.
  if coalesce(p_cupon, false) and not v_tarjeta then
    update public.clientes_web set cupon_usado_en = now() where id = c.id and cupon_usado_en is null;
    v_cupon := found;
    if not v_cupon then
      v_alertas := array_append(v_alertas, 'El cliente pidió el cupón del 10 %, pero ya lo había usado antes.'::text);
    end if;
  end if;
  v_desc_cents := case when v_cupon then round(v_sub_cents * 0.10)::bigint else 0 end;
  v_descuento := v_desc_cents / 100.0;
  v_total := (v_sub_cents - v_desc_cents) / 100.0;

  if abs(coalesce((p_pedido->>'total')::numeric, -1) - v_total) > 0.05 then
    v_alertas := array_append(v_alertas, format('El total que vio el cliente (S/ %s) no coincide con el calculado (S/ %s).',
                                      coalesce(p_pedido->>'total', '?'), to_char(v_total, 'FM999990.00')));
  end if;

  insert into public.pedidos_web (codigo, cliente_id, items, subtotal, descuento, total, cupon,
                                  metodo_pago, metodo_pago_label, modalidad, monto_a_pagar, pago_con_tarjeta,
                                  destino, cliente, alertas)
  values (v_code, c.id, v_items, v_subtotal, v_descuento, v_total, v_cupon,
          left(coalesce(p_pedido->>'metodo', ''), 40), left(coalesce(p_pedido->>'metodo_label', ''), 80),
          v_modalidad, greatest(0, least(coalesce(round((p_pedido->>'monto_a_pagar')::numeric, 2), 0), 100000)),
          v_tarjeta, left(coalesce(p_pedido->>'destino', ''), 400),
          jsonb_build_object(
            'full_name', c.full_name, 'phone', c.phone, 'email', c.email,
            'document_type', c.document_type, 'document_number', c.document_number,
            'delivery_method', c.delivery_method,
            'local_address', c.local_address, 'local_district', c.local_district, 'local_reference', c.local_reference,
            'shalom_name', c.shalom_name, 'shalom_address', c.shalom_address,
            'shalom_department', c.shalom_department, 'shalom_province', c.shalom_province,
            'shalom_district', c.shalom_district, 'import_code', c.import_code),
          v_alertas);

  update public.clientes_web
     set ultimo_pedido_en = now(), pedidos_web = pedidos_web + 1, carrito = '[]'::jsonb
   where id = c.id;

  insert into public.clientes_web_correos(cliente_id, tipo, ref, enviado_en)
  values (c.id, 'aviso_pedido', v_code, 'epoch') on conflict do nothing;
  perform public._registro_web_disparar_correos(c.id);

  return jsonb_build_object('ok', true, 'codigo', v_code, 'cupon_aplicado', v_cupon);
exception when others then
  return jsonb_build_object('ok', false, 'error', 'interno');
end;
$$;
revoke all on function public.registro_web_pedido_enviar(text, boolean, jsonb) from public;
grant execute on function public.registro_web_pedido_enviar(text, boolean, jsonb) to anon, authenticated;
