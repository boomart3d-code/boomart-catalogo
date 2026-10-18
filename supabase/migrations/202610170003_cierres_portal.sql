-- Cierre de ventas desde el portal / app «BA Ventas» (pedido de Adrián, 2026-10-17).
--
-- Cuando Adrián (o Mónica) está fuera de la laptop — en Shalom haciendo el envío, o el cliente
-- abona el saldo final — toca «FINALIZAR (ya pagó + ya se envió)» en boomart.pe/panel/clientes/.
-- Eso NO modifica la venta: deja un CIERRE PENDIENTE (tabla cierres_portal). Al abrirse,
-- BoomArt Studio lo recoge, registra el abono del saldo, finaliza la venta (Shalom: solo cierra
-- la gestión) y envía solo el correo con el PDF de la nota final. Studio sigue siendo la fuente
-- de verdad; la web nunca genera PDFs ni toca montos.
--
-- Además: Studio sube sus medios de pago y cuentas (ventas_studio_ajustes) para que el portal
-- ofrezca las mismas opciones, y dos datos más por venta (código de país del WhatsApp y si ya
-- está finalizada) para armar el mensaje de WhatsApp y saber cuándo mostrar el botón.

alter table public.ventas_studio add column if not exists cliente_pais text not null default '51';
alter table public.ventas_studio add column if not exists finalizada boolean not null default false;

create table if not exists public.ventas_studio_ajustes (
  id smallint primary key default 1 check (id = 1),
  datos jsonb not null default '{}'::jsonb,                   -- {medios: [], cuentas: [], medio_cuenta: {}, resenas: ''}
  actualizado_en timestamptz not null default now()
);
alter table public.ventas_studio_ajustes enable row level security;
alter table public.ventas_studio_ajustes force row level security;
revoke all on public.ventas_studio_ajustes from public, anon, authenticated;
grant select, insert, update on public.ventas_studio_ajustes to service_role;

create table if not exists public.cierres_portal (
  id uuid primary key default gen_random_uuid(),
  nv text not null check (nv ~ '^NV-[0-9]{5,}$'),
  sale_id integer not null,
  medio text not null check (length(btrim(medio)) between 1 and 60),
  cuenta text not null default '',
  fecha date not null,
  saldo numeric(10, 2) not null default 0,                     -- saldo que veía el portal al cerrar
  total numeric(10, 2) not null default 0,
  creado_en timestamptz not null default now(),
  creado_por text not null default '',
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'aplicado', 'ya_cerrada', 'error', 'anulado')),
  aplicado_en timestamptz,
  detalle text not null default ''
);
-- Una venta solo puede tener UN cierre pendiente a la vez (evita doble toque / dos teléfonos).
create unique index if not exists cierres_portal_pendiente_uidx on public.cierres_portal(nv) where estado = 'pendiente';
create index if not exists cierres_portal_estado_idx on public.cierres_portal(estado, creado_en);

alter table public.cierres_portal enable row level security;
alter table public.cierres_portal force row level security;
revoke all on public.cierres_portal from public, anon, authenticated;
grant select, insert, update on public.cierres_portal to service_role;

-- Opciones de pago para el formulario del portal.
create or replace function public.ventas_studio_ajustes_portal()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.panel_es_admin() then raise exception 'No autorizado' using errcode = '42501'; end if;
  return coalesce((select a.datos from public.ventas_studio_ajustes a where a.id = 1), '{}'::jsonb);
end;
$$;

-- Registrar el cierre (queda pendiente hasta que Studio lo aplique).
create or replace function public.ventas_studio_cerrar(p_nv text, p_medio text, p_cuenta text, p_fecha date)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v public.ventas_studio; v_hoy date := (now() at time zone 'America/Lima')::date; v_id uuid;
begin
  if not public.panel_es_admin() then raise exception 'No autorizado' using errcode = '42501'; end if;
  select * into v from public.ventas_studio s where s.nv = upper(btrim(coalesce(p_nv, ''))) and not s.eliminada;
  if not found then raise exception 'No existe esa venta' using errcode = 'P0002'; end if;
  if v.finalizada then raise exception 'Esta venta ya está finalizada en Studio' using errcode = '22023'; end if;
  if length(btrim(coalesce(p_medio, ''))) = 0 then raise exception 'Elige el medio de pago' using errcode = '22023'; end if;
  if p_fecha is null or p_fecha > v_hoy or p_fecha < v_hoy - 60 then
    raise exception 'Fecha no válida' using errcode = '22023';
  end if;
  begin
    insert into public.cierres_portal(nv, sale_id, medio, cuenta, fecha, saldo, total, creado_por)
    values (v.nv, v.sale_id, btrim(p_medio), btrim(coalesce(p_cuenta, '')), p_fecha, v.saldo, v.total,
            coalesce(auth.jwt() ->> 'email', ''))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Esta venta ya tiene un cierre pendiente' using errcode = '23505';
  end;
  return jsonb_build_object('id', v_id, 'nv', v.nv);
end;
$$;

-- Deshacer un cierre por error, mientras Studio todavía no lo aplicó.
create or replace function public.ventas_studio_cierre_anular(p_nv text)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.panel_es_admin() then raise exception 'No autorizado' using errcode = '42501'; end if;
  update public.cierres_portal c set estado = 'anulado', aplicado_en = now(),
         detalle = 'Anulado desde el portal por ' || coalesce(auth.jwt() ->> 'email', '')
   where c.nv = upper(btrim(coalesce(p_nv, ''))) and c.estado = 'pendiente';
  return found;
end;
$$;

-- La lista de ventas ahora trae: correo, país del WhatsApp, si está finalizada y el cierre pendiente.
drop function if exists public.ventas_studio_mes(text, text, text, integer, integer);
create function public.ventas_studio_mes(
  p_mes text, p_filtro text default 'todas', p_buscar text default '', p_offset integer default 0, p_limit integer default 20)
returns table(nv text, vendido_en timestamptz, cliente_nombre text, cliente_telefono text, cliente_doc_tipo text,
              cliente_documento text, productos jsonb, total numeric, abonado numeric, saldo numeric, abonos jsonb,
              medio_pago text, estado text, estado_pago text, entrega text, fecha_prometida text, origen text,
              pedido_web text, cliente_correo text, cliente_pais text, finalizada boolean, cierre jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare v_q text := btrim(coalesce(p_buscar, '')); v_digits text; v_nv text;
begin
  if not public.panel_es_admin() then raise exception 'No autorizado' using errcode = '42501'; end if;
  if p_mes !~ '^[0-9]{4}-[0-9]{2}$' then raise exception 'Mes inválido' using errcode = '22023'; end if;
  v_digits := regexp_replace(v_q, '\D', '', 'g');
  v_nv := case when v_q ~* '^\s*n\s*[vb]?[\s.#:-]*0*[0-9]{1,6}\s*$' or v_q ~ '^\s*0*[0-9]{1,6}\s*$'
               then 'NV-' || lpad(ltrim(v_digits, '0'), 5, '0') end;
  return query
    select v.nv, v.vendido_en, v.cliente_nombre, v.cliente_telefono, v.cliente_doc_tipo, v.cliente_documento,
           v.productos, v.total, v.abonado, v.saldo, v.abonos, v.medio_pago, v.estado, v.estado_pago, v.entrega,
           v.fecha_prometida, v.origen, v.pedido_web, v.cliente_correo, v.cliente_pais, v.finalizada,
           (select jsonb_build_object('medio', c.medio, 'cuenta', c.cuenta, 'fecha', c.fecha, 'creado_en', c.creado_en,
                                      'creado_por', c.creado_por)
              from public.cierres_portal c where c.nv = v.nv and c.estado = 'pendiente' limit 1)
      from public.ventas_studio v
     where not v.eliminada
       -- Una búsqueda por NV, teléfono o documento encuentra las ventas de cualquier mes.
       and (v.mes = p_mes or (v_nv is not null and v.nv = v_nv)
            or (length(v_digits) >= 7 and (v.cliente_telefono = right(v_digits, 9) or v.cliente_documento = v_digits)))
       and case coalesce(p_filtro, 'todas')
             when 'web' then v.origen = 'web'
             when 'directa' then v.origen = 'directa'
             when 'saldo' then v.saldo > 0.009
             else true end
       and (v_q = ''
            or (v_nv is not null and v.nv = v_nv)
            or v.cliente_nombre ilike '%' || v_q || '%'
            or (length(v_digits) >= 6 and (v.cliente_telefono like '%' || v_digits || '%' or v.cliente_documento like '%' || v_digits || '%'))
            or v.pedido_web ilike '%' || v_q || '%')
     order by v.vendido_en desc
     offset greatest(coalesce(p_offset, 0), 0)
     limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;

revoke all on function public.ventas_studio_ajustes_portal() from public, anon;
revoke all on function public.ventas_studio_cerrar(text, text, text, date) from public, anon;
revoke all on function public.ventas_studio_cierre_anular(text) from public, anon;
revoke all on function public.ventas_studio_mes(text, text, text, integer, integer) from public, anon;
grant execute on function public.ventas_studio_ajustes_portal() to authenticated;
grant execute on function public.ventas_studio_cerrar(text, text, text, date) to authenticated;
grant execute on function public.ventas_studio_cierre_anular(text) to authenticated;
grant execute on function public.ventas_studio_mes(text, text, text, integer, integer) to authenticated;
