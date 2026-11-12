-- Vista privada de entradas anónimas, incluidas las que no tuvieron interacción.
create or replace function public.panel_visitas_chatgpt(
  p_desde timestamptz, p_hasta timestamptz, p_solo_peru boolean default true,
  p_canal text default null, p_antes timestamptz default null, p_antes_id bigint default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare resultado jsonb;
begin
  if not public.panel_es_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_hasta <= p_desde
    or (p_canal is not null and p_canal not in ('anuncio','referido'))
    or ((p_antes is null) <> (p_antes_id is null)) then
    raise exception 'Filtro invalido' using errcode = '22023';
  end if;

  with candidatas as (
    select e.id, e.sid, e.creado, e.campana, e.landing, e.dispositivo,
      case
        when e.fuente in ('chatgpt_ads','chatgpt-ads','openai_ads','openai-ads')
          or (e.fuente in ('chatgpt','chatgpt.com','chat.openai.com','openai','openai.com')
            and e.medio in ('paid','cpc','anuncio','paid_search','paid_social')) then 'anuncio'
        when e.fuente in ('chatgpt','chatgpt.com','chat.openai.com')
          or (e.fuente = 'ia' and e.medio in ('chatgpt.com','chat.openai.com')) then 'referido'
      end canal
    from public.web_eventos e
    where e.tipo = 'visita' and e.host in ('boomart.pe','www.boomart.pe')
      and e.creado >= p_desde and e.creado < p_hasta
      and (not coalesce(p_solo_peru, true) or public.panel_es_peru(e.pais,e.tz))
      and (p_antes is null or (e.creado,e.id) < (p_antes,p_antes_id))
  ), pagina as materialized (
    select c.*
    from candidatas c
    where c.canal is not null and (p_canal is null or c.canal = p_canal)
      and not exists (
        select 1 from public.web_eventos e
        where e.sid = c.sid and e.tipo = 'visita'
          and e.host in ('boomart.pe','www.boomart.pe') and (e.creado,e.id) < (c.creado,c.id)
      )
    order by c.creado desc,c.id desc limit 51
  )
  select jsonb_build_object(
    'hay_mas', (select count(*) > 50 from pagina),
    'visitas', coalesce(jsonb_agg(to_jsonb(fila) - 'orden' order by fila.creado desc,fila.orden desc),'[]'::jsonb)
  ) into resultado
  from (
    select p.id::text id, p.id orden, p.creado, p.canal, p.campana, p.landing, p.dispositivo,
      a.interaccion, a.productos, a.carrito, a.compra, a.whatsapp, a.pedido
    from (select * from pagina order by creado desc,id desc limit 50) p
    cross join lateral (
      select coalesce(bool_or(e.humano),false) interaccion,
        count(distinct e.producto) filter (where e.tipo = 'ver_producto') productos,
        coalesce(bool_or(e.tipo = 'agregar_carrito'),false) carrito,
        coalesce(bool_or(e.tipo = 'iniciar_compra'),false) compra,
        coalesce(bool_or(e.tipo = 'clic_whatsapp'),false) whatsapp,
        coalesce(bool_or(e.tipo = 'pedido_whatsapp'),false) pedido
      from public.web_eventos e
      where e.sid = p.sid and e.host in ('boomart.pe','www.boomart.pe')
        and e.creado < p_hasta
    ) a
  ) fila;
  return resultado;
end;
$$;

revoke all on function public.panel_visitas_chatgpt(timestamptz,timestamptz,boolean,text,timestamptz,bigint) from public,anon;
grant execute on function public.panel_visitas_chatgpt(timestamptz,timestamptz,boolean,text,timestamptz,bigint) to authenticated;
