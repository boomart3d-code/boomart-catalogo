-- Registro de clientes DENTRO de boomart.pe (pedido de Adrián, 2026-10-15).
--
-- Reemplaza el inicio de sesión por enlace mágico de "Mi cuenta": el cliente se
-- registra en una ventana de la propia página (checkout, "Reclama 10 %" o "Mi
-- cuenta"), sin confirmar el correo para poder registrarse. El registro es
-- obligatorio para comprar por la web.
--
--  * Obligatorios: nombre completo, WhatsApp, correo y documento. La forma de
--    entrega y la dirección son opcionales (se invita a llenarlas).
--  * clientes_web es PERMANENTE (a diferencia de customer_profile_submissions,
--    que se depura): guarda el cupón, la confirmación del correo, el carrito y
--    el último pedido para el remarketing.
--  * Cupón de bienvenida (10 %): uno por DOCUMENTO, y cada documento queda ligado
--    a un solo WhatsApp (contacto principal) — el mismo documento con otro número
--    (o el mismo número con otro documento) no se acepta.
--  * Cada registro (y cada cambio de datos después de importado) crea su fila en
--    customer_profile_submissions con código BA-XXXX-XXXX: BoomArt Studio lo importa
--    con el mismo "Importar por código" de siempre, sin cambios.
--  * El navegador se identifica con un token aleatorio (solo se guarda su hash);
--    el mismo WhatsApp + documento desde otro dispositivo recupera el mismo registro.
--  * Correos (bienvenida con "Confirmar mi registro" + aviso a BoomArt con el
--    código): la función los dispara al instante vía pg_net contra la Edge Function
--    `registro-web-correos`, que es idempotente (cada correo sale una sola vez).

create table if not exists public.clientes_web (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null,
  document_type text not null check (document_type in ('dni', 'ce', 'pasaporte')),
  document_number text not null,
  email text not null,
  delivery_method text not null default '' check (delivery_method in ('', 'indriver', 'pickup', 'shalom')),
  local_address text not null default '',
  local_district text not null default '',
  local_reference text not null default '',
  shalom_name text not null default '',
  shalom_address text not null default '',
  shalom_department text not null default '',
  shalom_province text not null default '',
  shalom_district text not null default '',
  submission_id uuid references public.customer_profile_submissions(id) on delete set null,
  import_code text not null default '',
  confirm_token_hash text not null unique,
  correo_confirmado_en timestamptz,
  cupon_usado_en timestamptz,
  carrito jsonb not null default '[]'::jsonb,
  carrito_actualizado_en timestamptz,
  ultimo_pedido_en timestamptz,
  pedidos_web integer not null default 0,
  origen text not null default '',
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  version integer not null default 1
);
create unique index if not exists clientes_web_phone_uq on public.clientes_web(phone);
create unique index if not exists clientes_web_documento_uq on public.clientes_web(document_type, document_number);
create index if not exists clientes_web_creado_idx on public.clientes_web(creado_en);

-- Dispositivos (navegadores) que pueden ver/editar el registro: solo el hash del token.
create table if not exists public.clientes_web_tokens (
  token_hash text primary key,
  cliente_id uuid not null references public.clientes_web(id) on delete cascade,
  creado_en timestamptz not null default now(),
  usado_en timestamptz not null default now()
);
create index if not exists clientes_web_tokens_cliente_idx on public.clientes_web_tokens(cliente_id);

-- Bitácora de correos enviados (bienvenida, avisos a BoomArt, remarketing): evita repetir.
create table if not exists public.clientes_web_correos (
  id bigint generated always as identity primary key,
  cliente_id uuid not null references public.clientes_web(id) on delete cascade,
  tipo text not null check (tipo in ('bienvenida', 'aviso_registro', 'aviso_actualizacion', 'remarketing_2h', 'remarketing_24h', 'remarketing_48h')),
  ref text not null default '',
  enviado_en timestamptz not null default now(),
  unique (cliente_id, tipo, ref)
);

alter table public.clientes_web enable row level security;
alter table public.clientes_web force row level security;
alter table public.clientes_web_tokens enable row level security;
alter table public.clientes_web_tokens force row level security;
alter table public.clientes_web_correos enable row level security;
alter table public.clientes_web_correos force row level security;
revoke all on public.clientes_web, public.clientes_web_tokens, public.clientes_web_correos from public, anon, authenticated;
grant select, insert, update, delete on public.clientes_web, public.clientes_web_tokens, public.clientes_web_correos to service_role;
grant usage, select on sequence public.clientes_web_correos_id_seq to service_role;

-- Perfil que ve el propio cliente (nunca el código ni datos internos).
create or replace function public._registro_web_perfil(c public.clientes_web)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'full_name', c.full_name, 'phone', c.phone, 'email', c.email,
    'document_type', c.document_type, 'document_number', c.document_number,
    'delivery_method', c.delivery_method,
    'local_address', c.local_address, 'local_district', c.local_district, 'local_reference', c.local_reference,
    'shalom_name', c.shalom_name, 'shalom_address', c.shalom_address,
    'shalom_department', c.shalom_department, 'shalom_province', c.shalom_province,
    'shalom_district', c.shalom_district,
    'cupon_disponible', c.cupon_usado_en is null,
    'correo_confirmado', c.correo_confirmado_en is not null,
    'carrito', c.carrito);
$$;
revoke all on function public._registro_web_perfil(public.clientes_web) from public, anon, authenticated;

-- Llama a la Edge Function de correos sin esperar respuesta (pg_net es asíncrono
-- y solo envía si la transacción se confirma). Si falla, el cron la reintenta.
create or replace function public._registro_web_disparar_correos(p_cliente uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_net') then
    perform net.http_post(
      url := 'https://sasqusmvysbvqiggdmuj.supabase.co/functions/v1/registro-web-correos',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('cliente_id', p_cliente));
  end if;
exception when others then
  null; -- nunca impedir el registro por un problema de envío
end;
$$;
revoke all on function public._registro_web_disparar_correos(uuid) from public, anon, authenticated;

-- Crea la fila de customer_profile_submissions (con código BA-) a partir del cliente.
create or replace function public._registro_web_nueva_solicitud(c public.clientes_web)
returns public.customer_profile_submissions language plpgsql security definer set search_path = '' as $$
declare s public.customer_profile_submissions%rowtype; v_code text;
begin
  loop
    begin
      v_code := public._customer_random_code('BA-', 4) || '-' || public._customer_random_code('', 4);
      insert into public.customer_profile_submissions(
        draft_ref, import_code, edit_token_hash, status, consent_at, completed_at,
        full_name, phone, document_type, document_number, email, delivery_method,
        local_address, local_district, local_reference,
        shalom_name, shalom_address, shalom_department, shalom_province, shalom_district)
      values (
        public._customer_random_code('WEB-', 6), v_code,
        encode(extensions.digest(extensions.gen_random_bytes(32), 'sha256'), 'hex'),
        'complete', now(), now(),
        c.full_name, c.phone, c.document_type, c.document_number, c.email, c.delivery_method,
        c.local_address, c.local_district, c.local_reference,
        c.shalom_name, c.shalom_address, c.shalom_department, c.shalom_province, c.shalom_district)
      returning * into s;
      exit;
    exception when unique_violation then null;
    end;
  end loop;
  insert into public.customer_profile_events(submission_id, event_type, actor, detail)
  values (s.id, 'completed', 'customer', jsonb_build_object('origen', 'boomart.pe', 'cliente_web', c.id));
  return s;
end;
$$;
revoke all on function public._registro_web_nueva_solicitud(public.clientes_web) from public, anon, authenticated;

-- Guardar (crear o actualizar) el registro desde la página.
create or replace function public.registro_web_guardar(p_token text, p_data jsonb, p_origen text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_hash text;
  c public.clientes_web%rowtype;
  v_by_token uuid; v_by_doc uuid; v_by_phone uuid;
  v_name text; v_phone text; v_doc_type text; v_doc text; v_email text; v_delivery text;
  v_laddr text; v_ldist text; v_lref text;
  v_sname text; v_saddr text; v_sdep text; v_sprov text; v_sdist text;
  v_nuevo boolean := false;
  v_cambio boolean := false;
  s public.customer_profile_submissions%rowtype;
  v_confirm text;
begin
  if p_token is null or length(p_token) < 32 or length(p_token) > 128 or jsonb_typeof(p_data) is distinct from 'object' then
    raise exception 'Registro no válido' using errcode = '22023';
  end if;

  v_name := left(regexp_replace(trim(coalesce(p_data ->> 'full_name', '')), '\s+', ' ', 'g'), 160);
  v_phone := public._registro_cliente_telefono(p_data ->> 'phone');
  v_doc_type := lower(trim(coalesce(p_data ->> 'document_type', '')));
  v_doc := left(case when v_doc_type = 'dni'
                     then regexp_replace(coalesce(p_data ->> 'document_number', ''), '[^0-9]', '', 'g')
                     else upper(regexp_replace(coalesce(p_data ->> 'document_number', ''), '[^A-Za-z0-9]', '', 'g')) end, 30);
  v_email := left(lower(trim(coalesce(p_data ->> 'email', ''))), 180);
  v_delivery := lower(trim(coalesce(p_data ->> 'delivery_method', '')));
  v_laddr := left(trim(coalesce(p_data ->> 'local_address', '')), 300);
  v_ldist := left(trim(coalesce(p_data ->> 'local_district', '')), 100);
  v_lref  := left(trim(coalesce(p_data ->> 'local_reference', '')), 200);
  v_sname := left(trim(coalesce(p_data ->> 'shalom_name', '')), 180);
  v_saddr := left(trim(coalesce(p_data ->> 'shalom_address', '')), 300);
  v_sdep  := left(trim(coalesce(p_data ->> 'shalom_department', '')), 100);
  v_sprov := left(trim(coalesce(p_data ->> 'shalom_province', '')), 100);
  v_sdist := left(trim(coalesce(p_data ->> 'shalom_district', '')), 100);

  -- Obligatorios (mismas reglas que BoomArt Studio).
  if length(v_name) < 3 then raise exception 'Ingresa tu nombre completo' using errcode = '22023'; end if;
  if length(v_phone) <> 9 or v_phone !~ '^9[0-9]{8}$' then
    raise exception 'Ingresa tu número de WhatsApp (9 dígitos, empieza con 9)' using errcode = '22023';
  end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$' then
    raise exception 'Ingresa un correo válido' using errcode = '22023';
  end if;
  if v_doc_type = 'dni' then
    if v_doc !~ '^[0-9]{8}$' then raise exception 'El DNI debe tener 8 dígitos' using errcode = '22023'; end if;
  elsif v_doc_type = 'ce' then
    if length(v_doc) not between 9 and 12 then raise exception 'El carné de extranjería debe tener entre 9 y 12 caracteres' using errcode = '22023'; end if;
  elsif v_doc_type = 'pasaporte' then
    if length(v_doc) not between 6 and 12 then raise exception 'El pasaporte debe tener entre 6 y 12 caracteres' using errcode = '22023'; end if;
  else
    raise exception 'Elige el tipo de documento' using errcode = '22023';
  end if;

  -- Entrega: opcional. Se guardan solo los datos de la opción elegida.
  if v_delivery not in ('', 'indriver', 'pickup', 'shalom') then
    raise exception 'Datos no válidos' using errcode = '22023';
  end if;
  if v_delivery <> 'indriver' then v_laddr := ''; v_ldist := ''; v_lref := ''; end if;
  if v_delivery <> 'shalom' then v_sname := ''; v_saddr := ''; v_sdep := ''; v_sprov := ''; v_sdist := ''; end if;

  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');
  select cliente_id into v_by_token from public.clientes_web_tokens where token_hash = v_hash;
  select id into v_by_doc from public.clientes_web where document_type = v_doc_type and document_number = v_doc;
  select id into v_by_phone from public.clientes_web where phone = v_phone;

  -- Un documento = un WhatsApp (y viceversa).
  if v_by_doc is not null and v_by_doc is distinct from coalesce(v_by_token, v_by_phone, v_by_doc) then
    raise exception 'Este documento ya está registrado con otro número de WhatsApp. Escríbenos por WhatsApp y te ayudamos.' using errcode = '22023';
  end if;
  if v_by_phone is not null and v_by_phone is distinct from coalesce(v_by_token, v_by_doc, v_by_phone) then
    raise exception 'Este WhatsApp ya está registrado con otro documento. Escríbenos por WhatsApp y te ayudamos.' using errcode = '22023';
  end if;
  if v_by_token is null and v_by_phone is not null and v_by_doc is null then
    raise exception 'Este WhatsApp ya está registrado con otro documento. Escríbenos por WhatsApp y te ayudamos.' using errcode = '22023';
  end if;
  if v_by_token is null and v_by_doc is not null and v_by_phone is null then
    raise exception 'Este documento ya está registrado con otro número de WhatsApp. Escríbenos por WhatsApp y te ayudamos.' using errcode = '22023';
  end if;

  if coalesce(v_by_token, v_by_doc) is null then
    if (select count(*) from public.clientes_web where creado_en > now() - interval '1 hour') >= 300 then
      raise exception 'Hay muchas solicitudes en este momento. Intenta de nuevo en unos minutos.' using errcode = '22023';
    end if;
    v_confirm := encode(extensions.gen_random_bytes(24), 'hex');
    insert into public.clientes_web(full_name, phone, document_type, document_number, email, delivery_method,
      local_address, local_district, local_reference, shalom_name, shalom_address, shalom_department,
      shalom_province, shalom_district, confirm_token_hash, origen)
    values (v_name, v_phone, v_doc_type, v_doc, v_email, v_delivery, v_laddr, v_ldist, v_lref,
      v_sname, v_saddr, v_sdep, v_sprov, v_sdist,
      encode(extensions.digest(v_confirm, 'sha256'), 'hex'), left(coalesce(p_origen, ''), 40))
    returning * into c;
    v_nuevo := true;
    -- Quien ya usó el cupón con una cuenta antigua (login por enlace) no lo repite.
    if exists (select 1 from public.clientes old
                where old.cupon_bienvenida_usado and old.dni is not null
                  and regexp_replace(upper(old.dni), '[^A-Z0-9]', '', 'g') = v_doc) then
      update public.clientes_web set cupon_usado_en = now() where id = c.id returning * into c;
    end if;
  else
    select * into c from public.clientes_web where id = coalesce(v_by_token, v_by_doc) for update;
    if c.version >= 500 then
      raise exception 'Este registro recibió demasiados cambios. Escríbenos por WhatsApp.' using errcode = '22023';
    end if;
    v_cambio := (c.full_name, c.phone, c.document_type, c.document_number, c.email, c.delivery_method,
                 c.local_address, c.local_district, c.local_reference, c.shalom_name, c.shalom_address,
                 c.shalom_department, c.shalom_province, c.shalom_district)
             is distinct from
                (v_name, v_phone, v_doc_type, v_doc, v_email, v_delivery, v_laddr, v_ldist, v_lref,
                 v_sname, v_saddr, v_sdep, v_sprov, v_sdist);
    if v_cambio then
      update public.clientes_web set
        full_name = v_name, phone = v_phone, document_type = v_doc_type, document_number = v_doc,
        email = v_email, delivery_method = v_delivery,
        local_address = v_laddr, local_district = v_ldist, local_reference = v_lref,
        shalom_name = v_sname, shalom_address = v_saddr, shalom_department = v_sdep,
        shalom_province = v_sprov, shalom_district = v_sdist,
        actualizado_en = now(), version = version + 1
      where id = c.id returning * into c;
    end if;
  end if;

  -- Este navegador queda ligado al registro.
  insert into public.clientes_web_tokens(token_hash, cliente_id) values (v_hash, c.id)
  on conflict (token_hash) do update set cliente_id = excluded.cliente_id, usado_en = now();

  -- Código para Studio: nuevo registro, o cambio de datos cuando el anterior ya
  -- no está pendiente (importado / vencido / revocado). Si sigue pendiente se
  -- actualiza en su lugar y el código no cambia.
  if c.submission_id is not null then
    select * into s from public.customer_profile_submissions where id = c.submission_id for update;
  end if;
  if v_nuevo or (v_cambio and (s.id is null or s.status not in ('complete', 'whatsapp_opened'))) then
    s := public._registro_web_nueva_solicitud(c);
    update public.clientes_web set submission_id = s.id, import_code = s.import_code where id = c.id returning * into c;
    insert into public.clientes_web_correos(cliente_id, tipo, ref, enviado_en)
    values (c.id, case when v_nuevo then 'aviso_registro' else 'aviso_actualizacion' end, s.import_code, 'epoch')
    on conflict do nothing;
  elsif v_cambio then
    update public.customer_profile_submissions set
      full_name = c.full_name, phone = c.phone, document_type = c.document_type, document_number = c.document_number,
      email = c.email, delivery_method = c.delivery_method,
      local_address = c.local_address, local_district = c.local_district, local_reference = c.local_reference,
      shalom_name = c.shalom_name, shalom_address = c.shalom_address, shalom_department = c.shalom_department,
      shalom_province = c.shalom_province, shalom_district = c.shalom_district,
      updated_at = now(), version = version + 1
    where id = s.id;
  end if;

  if v_nuevo then
    insert into public.clientes_web_correos(cliente_id, tipo, ref, enviado_en)
    values (c.id, 'bienvenida', v_confirm, 'epoch') on conflict do nothing;
  end if;
  if v_nuevo or v_cambio then
    perform public._registro_web_disparar_correos(c.id);
  end if;

  return jsonb_build_object('ok', true, 'nuevo', v_nuevo, 'perfil', public._registro_web_perfil(c));
end;
$$;
revoke all on function public.registro_web_guardar(text, jsonb, text) from public;
grant execute on function public.registro_web_guardar(text, jsonb, text) to anon, authenticated;

-- Perfil del navegador (para saludar, prellenar y saber si el cupón está disponible).
create or replace function public.registro_web_perfil(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.clientes_web%rowtype; v_hash text;
begin
  if p_token is null or length(p_token) < 32 or length(p_token) > 128 then return null; end if;
  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');
  select w.* into c from public.clientes_web w join public.clientes_web_tokens t on t.cliente_id = w.id
   where t.token_hash = v_hash;
  if not found then return null; end if;
  update public.clientes_web_tokens set usado_en = now() where token_hash = v_hash and usado_en < now() - interval '1 hour';
  return public._registro_web_perfil(c);
end;
$$;
revoke all on function public.registro_web_perfil(text) from public;
grant execute on function public.registro_web_perfil(text) to anon, authenticated;

-- Guarda el carrito actual (para que el remarketing muestre lo que estaba viendo).
create or replace function public.registro_web_carrito(p_token text, p_items jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_hash text; v_id uuid;
begin
  if p_token is null or length(p_token) < 32 or length(p_token) > 128 or jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) > 50 or length(p_items::text) > 8000 then
    return false;
  end if;
  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');
  select cliente_id into v_id from public.clientes_web_tokens where token_hash = v_hash;
  if v_id is null then return false; end if;
  update public.clientes_web set carrito = p_items, carrito_actualizado_en = now() where id = v_id;
  return true;
end;
$$;
revoke all on function public.registro_web_carrito(text, jsonb) from public;
grant execute on function public.registro_web_carrito(text, jsonb) to anon, authenticated;

-- Pedido enviado desde el checkout: detiene el remarketing y, si pidió el cupón,
-- lo consume de forma atómica. Devuelve si el cupón quedó aplicado.
create or replace function public.registro_web_pedido(p_token text, p_cupon boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_hash text; v_id uuid; v_cupon boolean := false;
begin
  if p_token is null or length(p_token) < 32 or length(p_token) > 128 then
    return jsonb_build_object('ok', false);
  end if;
  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');
  select cliente_id into v_id from public.clientes_web_tokens where token_hash = v_hash;
  if v_id is null then return jsonb_build_object('ok', false); end if;
  if coalesce(p_cupon, false) then
    update public.clientes_web set cupon_usado_en = now() where id = v_id and cupon_usado_en is null;
    v_cupon := found;
  end if;
  update public.clientes_web
     set ultimo_pedido_en = now(), pedidos_web = pedidos_web + 1, carrito = '[]'::jsonb
   where id = v_id;
  return jsonb_build_object('ok', true, 'cupon_aplicado', v_cupon);
end;
$$;
revoke all on function public.registro_web_pedido(text, boolean) from public;
grant execute on function public.registro_web_pedido(text, boolean) to anon, authenticated;

-- Botón "Confirmar mi registro" del correo de bienvenida.
create or replace function public.registro_web_confirmar(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_hash text; c public.clientes_web%rowtype;
begin
  if p_token is null or length(p_token) < 32 or length(p_token) > 128 then
    return jsonb_build_object('ok', false);
  end if;
  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');
  update public.clientes_web set correo_confirmado_en = coalesce(correo_confirmado_en, now())
   where confirm_token_hash = v_hash returning * into c;
  if not found then return jsonb_build_object('ok', false); end if;
  return jsonb_build_object('ok', true, 'nombre', split_part(c.full_name, ' ', 1));
end;
$$;
revoke all on function public.registro_web_confirmar(text) from public;
grant execute on function public.registro_web_confirmar(text) to anon, authenticated;
