-- Confirmaciones manuales para medición. No crea ventas ni abonos en Studio.
begin;

create table public.meta_compras_confirmadas (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid references public.customer_profile_submissions(id) on delete set null,
  pedido text not null unique check (pedido ~ '^[A-Z0-9]{3,60}$'),
  productos jsonb not null check (jsonb_typeof(productos) = 'array'),
  total numeric(12,2) not null check (total > 0 and total <= 100000),
  abonado numeric(12,2) not null check (abonado > 0 and abonado <= total),
  medio text not null check (medio in ('yape','plin','interbank','bcp','efectivo','otro')),
  referencia text not null check (length(referencia) between 3 and 100),
  email_hash text not null,
  phone_hash text not null,
  confirmado_por uuid not null,
  confirmado_en timestamptz not null default now(),
  estado text not null default 'pendiente' check (estado in ('pendiente','enviando','enviado','error','vencido')),
  intentos integer not null default 0,
  lease uuid,
  lease_until timestamptz,
  enviado_en timestamptz,
  error_codigo text
);
alter table public.meta_compras_confirmadas enable row level security;
alter table public.meta_compras_confirmadas force row level security;
revoke all on public.meta_compras_confirmadas from public, anon, authenticated;
grant select, insert, update on public.meta_compras_confirmadas to service_role;
create index meta_compras_submission_idx on public.meta_compras_confirmadas(submission_id, confirmado_en desc);

-- La transacción serializa por número normalizado, incluso entre dos sesiones.
create function public.meta_compra_confirmar(p_submission uuid, p_pedido text,
  p_productos jsonb, p_abonado numeric, p_medio text, p_referencia text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_cliente public.customer_profile_submissions%rowtype;
  v_existente public.meta_compras_confirmadas%rowtype;
  v_pedido text := regexp_replace(upper(trim(coalesce(p_pedido,''))), '[^A-Z0-9]', '', 'g');
  v_productos jsonb;
  v_total numeric := 0;
  v_item jsonb;
  v_email text;
  v_phone text;
  v_id uuid;
begin
  if not public.panel_es_admin() or auth.uid() is null then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if length(v_pedido) not between 3 and 60 or p_medio is null
     or p_medio not in ('yape','plin','interbank','bcp','efectivo','otro')
     or length(trim(coalesce(p_referencia,''))) not between 3 and 100
     or p_productos is null or jsonb_typeof(p_productos) <> 'array' then
    raise exception 'Completa el pedido, el medio y la referencia del abono' using errcode = '22023';
  end if;
  if jsonb_array_length(p_productos) not between 1 and 50 then
    raise exception 'Elige entre 1 y 50 productos' using errcode = '22023';
  end if;
  for v_item in select value from jsonb_array_elements(p_productos) loop
    if jsonb_typeof(v_item) <> 'object' or coalesce(v_item->>'id','') !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
       or length(v_item->>'id') > 120
       or coalesce(v_item->>'quantity','') !~ '^[1-9][0-9]{0,2}$'
       or coalesce(v_item->>'item_price','') !~ '^[0-9]{1,6}(\.[0-9]{1,2})?$' then
      raise exception 'Producto, cantidad o precio no válido' using errcode = '22023';
    end if;
    if (v_item->>'item_price')::numeric <= 0 then
      raise exception 'El precio debe ser mayor que cero' using errcode = '22023';
    end if;
    v_total := v_total + (v_item->>'quantity')::integer * (v_item->>'item_price')::numeric;
  end loop;
  if (select count(distinct value->>'id') from jsonb_array_elements(p_productos)) <> jsonb_array_length(p_productos) then
    raise exception 'Agrupa las unidades del mismo producto en una sola línea' using errcode = '22023';
  end if;
  if v_total > 100000 or p_abonado is null or p_abonado <= 0 or p_abonado > v_total or round(p_abonado,2) <> p_abonado then
    raise exception 'El abono debe ser mayor que cero y no superar el total de productos' using errcode = '22023';
  end if;
  select jsonb_agg(jsonb_build_object('id', x->>'id', 'quantity', (x->>'quantity')::integer,
    'item_price', (x->>'item_price')::numeric) order by x->>'id') into v_productos
    from jsonb_array_elements(p_productos) x;
  perform pg_advisory_xact_lock(hashtextextended(v_pedido, 0));
  select * into v_existente from public.meta_compras_confirmadas where pedido = v_pedido;
  if found then
    if v_existente.submission_id = p_submission and v_existente.productos = v_productos
       and v_existente.abonado = p_abonado and v_existente.medio = p_medio
       and v_existente.referencia = trim(p_referencia) then return v_existente.id; end if;
    raise exception 'Ese pedido ya está registrado con otros datos. Revisa su confirmación.' using errcode = '23505';
  end if;
  select * into v_cliente from public.customer_profile_submissions where id = p_submission for share;
  if not found or v_cliente.status not in ('complete','whatsapp_opened','imported') then
    raise exception 'Selecciona un registro completo y vigente' using errcode = '22023';
  end if;
  v_email := lower(trim(v_cliente.email));
  v_phone := regexp_replace(v_cliente.phone, '[^0-9]', '', 'g');
  if length(v_phone) = 9 and v_phone like '9%' then v_phone := '51' || v_phone; end if;
  if v_email = '' or length(v_phone) not between 10 and 15 then
    raise exception 'El registro necesita correo y teléfono válidos' using errcode = '22023';
  end if;
  insert into public.meta_compras_confirmadas(submission_id,pedido,productos,total,abonado,medio,referencia,
    email_hash,phone_hash,confirmado_por)
  values(p_submission,v_pedido,v_productos,v_total,p_abonado,p_medio,trim(p_referencia),
    encode(extensions.digest(v_email,'sha256'),'hex'),encode(extensions.digest(v_phone,'sha256'),'hex'),auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.meta_compra_confirmar(uuid,text,jsonb,numeric,text,text) from public, anon;
grant execute on function public.meta_compra_confirmar(uuid,text,jsonb,numeric,text,text) to authenticated;

create function public.meta_compras_admin(p_submissions uuid[])
returns table(id uuid,submission_id uuid,pedido text,productos jsonb,total numeric,abonado numeric,
  medio text,referencia text,confirmado_en timestamptz,estado text,enviado_en timestamptz,error_codigo text)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.panel_es_admin() then raise exception 'No autorizado' using errcode = '42501'; end if;
  if coalesce(array_length(p_submissions,1),0) > 250 then raise exception 'Demasiados registros' using errcode = '22023'; end if;
  return query select c.id,c.submission_id,c.pedido,c.productos,c.total,c.abonado,c.medio,c.referencia,
    c.confirmado_en,c.estado,c.enviado_en,c.error_codigo
    from public.meta_compras_confirmadas c where c.submission_id = any(p_submissions)
    order by c.confirmado_en desc;
end;
$$;
revoke all on function public.meta_compras_admin(uuid[]) from public, anon;
grant execute on function public.meta_compras_admin(uuid[]) to authenticated;

-- Un solo envío concurrente. Un timeout se reintenta con el MISMO event_id.
create function public.meta_compra_tomar(p_id uuid)
returns setof public.meta_compras_confirmadas
language plpgsql security definer set search_path = '' as $$
begin
  update public.meta_compras_confirmadas set estado = 'vencido',error_codigo = 'EVENTO_VENCIDO',lease = null,lease_until = null
    where id = p_id and estado <> 'enviado' and confirmado_en < now() - interval '7 days';
  return query update public.meta_compras_confirmadas set estado = 'enviando',intentos = intentos + 1,
    lease = gen_random_uuid(),lease_until = now() + interval '2 minutes',error_codigo = null
    where id = p_id and confirmado_en >= now() - interval '7 days' and intentos < 20
      and (estado in ('pendiente','error') or (estado = 'enviando' and lease_until < now())) returning *;
end;
$$;
revoke all on function public.meta_compra_tomar(uuid) from public, anon, authenticated;
grant execute on function public.meta_compra_tomar(uuid) to service_role;

create function public.meta_compra_resultado(p_id uuid,p_lease uuid,p_ok boolean,p_error text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if p_ok is null then raise exception 'Resultado no válido' using errcode = '22023'; end if;
  update public.meta_compras_confirmadas set estado = case when p_ok then 'enviado' else 'error' end,
    enviado_en = case when p_ok then now() else null end,
    error_codigo = case when p_ok then null else left(coalesce(p_error,'META_ERROR'),80) end,
    lease = null,lease_until = null
    where id = p_id and estado = 'enviando' and lease = p_lease returning id into v_id;
  return v_id is not null;
end;
$$;
revoke all on function public.meta_compra_resultado(uuid,uuid,boolean,text) from public, anon, authenticated;
grant execute on function public.meta_compra_resultado(uuid,uuid,boolean,text) to service_role;

comment on table public.meta_compras_confirmadas is 'Confirmación manual de pedidos reales para Meta. No es contabilidad ni crea ventas en Studio. Sin nombres, DNI, direcciones ni fotos de vouchers.';
commit;
