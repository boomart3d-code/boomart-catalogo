-- Portal boomart.pe/panel/clientes/: lectura de las ventas de Studio (pedido de Adrián, 2026-10-17).
-- Solo la cuenta administradora (panel_es_admin). Vista por MES y de 20 en 20 para no cargar la web.

-- Ventas de un mes, más recientes primero. p_filtro: todas | web | directa | saldo.
create or replace function public.ventas_studio_mes(
  p_mes text, p_filtro text default 'todas', p_buscar text default '', p_offset integer default 0, p_limit integer default 20)
returns table(nv text, vendido_en timestamptz, cliente_nombre text, cliente_telefono text, cliente_doc_tipo text,
              cliente_documento text, productos jsonb, total numeric, abonado numeric, saldo numeric, abonos jsonb,
              medio_pago text, estado text, estado_pago text, entrega text, fecha_prometida text, origen text,
              pedido_web text)
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
           v.fecha_prometida, v.origen, v.pedido_web
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

-- Resumen del mes (cabecera de la pestaña «Ventas»).
create or replace function public.ventas_studio_resumen_mes(p_mes text)
returns table(ventas integer, total numeric, abonado numeric, saldo numeric, web integer, directas integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.panel_es_admin() then raise exception 'No autorizado' using errcode = '42501'; end if;
  return query
    select count(*)::int, coalesce(sum(v.total), 0), coalesce(sum(v.abonado), 0), coalesce(sum(v.saldo), 0),
           (count(*) filter (where v.origen = 'web'))::int, (count(*) filter (where v.origen = 'directa'))::int
      from public.ventas_studio v where not v.eliminada and v.mes = p_mes;
end;
$$;

-- Meses con ventas (selector), más reciente primero.
create or replace function public.ventas_studio_meses()
returns table(mes text, ventas integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.panel_es_admin() then raise exception 'No autorizado' using errcode = '42501'; end if;
  return query select v.mes, count(*)::int from public.ventas_studio v where not v.eliminada
                group by v.mes order by v.mes desc limit 36;
end;
$$;

-- Para cada registro de cliente del portal: cuántas ventas tiene en Studio y la más reciente
-- (se reconoce por WhatsApp o por documento, igual que Studio reconoce al cliente).
create or replace function public.ventas_studio_de_registros(p_submissions uuid[])
returns table(submission_id uuid, ventas integer, nv text, vendido_en timestamptz, total numeric, abonado numeric,
              saldo numeric, estado text, origen text, pedido_web text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.panel_es_admin() then raise exception 'No autorizado' using errcode = '42501'; end if;
  if coalesce(array_length(p_submissions, 1), 0) > 250 then raise exception 'Demasiados registros' using errcode = '22023'; end if;
  return query
    with r as (
      select s.id,
             right(regexp_replace(coalesce(s.phone, ''), '\D', '', 'g'), 9) as tel,
             upper(regexp_replace(coalesce(s.document_number, ''), '[^0-9A-Za-z]', '', 'g')) as doc
        from public.customer_profile_submissions s where s.id = any(p_submissions)
    ), m as (
      select r.id as sid, v.*
        from r join public.ventas_studio v
          on not v.eliminada
         and ((r.tel <> '' and length(r.tel) >= 7 and v.cliente_telefono = r.tel)
              or (r.doc <> '' and upper(regexp_replace(v.cliente_documento, '[^0-9A-Za-z]', '', 'g')) = r.doc))
    )
    select distinct on (m.sid) m.sid, (count(*) over (partition by m.sid))::int, m.nv, m.vendido_en, m.total,
           m.abonado, m.saldo, m.estado, m.origen, m.pedido_web
      from m order by m.sid, m.vendido_en desc;
end;
$$;

revoke all on function public.ventas_studio_mes(text, text, text, integer, integer) from public, anon;
revoke all on function public.ventas_studio_resumen_mes(text) from public, anon;
revoke all on function public.ventas_studio_meses() from public, anon;
revoke all on function public.ventas_studio_de_registros(uuid[]) from public, anon;
grant execute on function public.ventas_studio_mes(text, text, text, integer, integer) to authenticated;
grant execute on function public.ventas_studio_resumen_mes(text) to authenticated;
grant execute on function public.ventas_studio_meses() to authenticated;
grant execute on function public.ventas_studio_de_registros(uuid[]) to authenticated;
