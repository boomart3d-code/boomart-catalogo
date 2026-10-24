-- Lectura privada, sin datos personales ni cambios a pedidos/clientes.
create or replace function public.panel_recorridos(
  p_desde timestamptz, p_hasta timestamptz, p_solo_peru boolean default true,
  p_sid text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare resultado jsonb;
begin
  if not public.panel_es_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_hasta <= p_desde then
    raise exception 'Rango invalido' using errcode = '22023';
  end if;
  if p_sid is not null then
    -- La selección debe pertenecer al rango y filtro del panel.
    if not exists (select 1 from public.web_eventos e where e.sid = p_sid
      and e.creado >= p_desde and e.creado < p_hasta
      and e.host in ('boomart.pe','www.boomart.pe')
      and e.tipo in ('abrir_carrito','iniciar_compra','pedido_whatsapp','clic_whatsapp')
      and (not p_solo_peru or public.panel_es_peru(e.pais,e.tz))) then
      return '[]'::jsonb;
    end if;
    select coalesce(jsonb_agg(to_jsonb(x) order by x.creado,x.id),'[]'::jsonb) into resultado
    from (select e.id,e.creado,e.tipo,e.producto,e.boton,e.origen,e.valor,e.cantidad,
      e.extra,e.pagina,e.landing,e.fuente,e.medio,e.campana,e.ref,e.dispositivo,
      e.pais,e.region,e.ciudad,e.tz,e.idioma
      from public.web_eventos e where e.sid = p_sid
      and e.host in ('boomart.pe','www.boomart.pe')
      and e.creado < p_hasta
      and e.tipo <> 'tiempo' order by e.creado,e.id limit 501) x;
    return resultado;
  end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.ultima desc),'[]'::jsonb) into resultado
  from (select e.sid, min(e.creado) inicio,max(e.creado) ultima,
    (array_agg(e.fuente order by e.creado))[1] fuente,
    (array_agg(e.landing order by e.creado))[1] landing,
    bool_or(e.tipo='abrir_carrito') carrito,
    bool_or(e.tipo='iniciar_compra') inicio_compra,
    bool_or(e.tipo='pedido_whatsapp') pedido,
    bool_or(e.tipo='clic_whatsapp') whatsapp
    from public.web_eventos e where e.creado >= p_desde and e.creado < p_hasta
    and e.host in ('boomart.pe','www.boomart.pe')
    and (not p_solo_peru or public.panel_es_peru(e.pais,e.tz))
    group by e.sid
    having bool_or(e.tipo in ('abrir_carrito','iniciar_compra','pedido_whatsapp','clic_whatsapp'))
    order by max(e.creado) desc limit 100) x;
  return resultado;
end;
$$;
revoke all on function public.panel_recorridos(timestamptz,timestamptz,boolean,text) from public,anon;
grant execute on function public.panel_recorridos(timestamptz,timestamptz,boolean,text) to authenticated;
