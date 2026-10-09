-- Medicion propia de boomart.pe: "Por pagina de entrada" para el panel privado.
--
-- Igual que panel_resumen(): solo responde al correo del administrador y lee
-- web_eventos (que el navegador no puede leer directamente). Devuelve, por
-- cada pagina/enlace de entrada (landing), cuantas visitas llegaron y que
-- hicieron (interaccion, tiempo, producto visto, carrito, WhatsApp, pedido).

create or replace function public.panel_entradas(
  p_desde timestamptz,
  p_hasta timestamptz,
  p_solo_peru boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_res jsonb;
begin
  if not public.panel_es_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_hasta <= p_desde or p_hasta - p_desde > interval '92 days' then
    raise exception 'Rango de fechas invalido' using errcode = '22023';
  end if;

  with ev as (
    select * from public.web_eventos
    where creado >= p_desde and creado < p_hasta
      and host in ('boomart.pe', 'www.boomart.pe')
  ),
  ses as (
    select
      sid,
      (array_agg(vid order by creado))[1] as vid,
      (array_agg(coalesce(landing, '/') order by creado))[1] as landing,
      (array_agg(tz order by creado))[1] as tz,
      bool_or(humano) as humano,
      count(*) filter (where tipo = 'ver_producto') as n_ver,
      count(*) filter (where tipo = 'agregar_carrito') as n_add,
      count(*) filter (where tipo = 'iniciar_compra') as n_ini,
      count(*) filter (where tipo = 'pedido_whatsapp') as n_ped,
      count(*) filter (where tipo = 'clic_whatsapp') as n_wa,
      count(*) filter (where tipo = 'clic_whatsapp' and producto is not null) as n_wa_prod
    from ev
    group by sid
  ),
  tiempo as (
    select sid, sum(m)::int as seg
    from (
      select sid, pv, max(seg) as m from ev where tipo = 'tiempo' group by sid, pv
    ) x
    group by sid
  ),
  f as (
    select s.*, coalesce(t.seg, 0) as seg
    from ses s
    left join tiempo t using (sid)
    where (not p_solo_peru) or s.tz is null or s.tz = '' or s.tz = 'America/Lima'
  )
  select coalesce(jsonb_agg(r order by (r ->> 'sesiones')::int desc), '[]'::jsonb)
  into v_res
  from (
    select jsonb_build_object(
      'landing', landing,
      'sesiones', count(*),
      'visitantes', count(distinct vid),
      'interaccion', count(*) filter (where humano),
      'seg_promedio', coalesce(round(avg(seg) filter (where humano))::int, 0),
      'vieron', count(*) filter (where n_ver > 0),
      'agregaron', count(*) filter (where n_add > 0),
      'wa', count(*) filter (where n_wa > 0),
      'pedido', count(*) filter (where n_ped > 0),
      'intencion', count(*) filter (where n_add > 0 or n_wa_prod > 0 or n_ini > 0 or n_ped > 0)
    ) as r
    from f
    group by landing
    order by count(*) desc
    limit 40
  ) q;

  return v_res;
end;
$$;

revoke all on function public.panel_entradas(timestamptz, timestamptz, boolean) from public, anon;
grant execute on function public.panel_entradas(timestamptz, timestamptz, boolean) to authenticated;
