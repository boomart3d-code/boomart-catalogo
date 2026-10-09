-- Medicion propia de boomart.pe (entrega 2: lectura para el panel privado).
--
-- El panel (boomart.pe/panel/) NO lee la tabla web_eventos directamente (no
-- tiene permisos): llama a estas dos funciones, que comprueban el correo del
-- usuario que inicio sesion con enlace magico. Solo boomart.3d@gmail.com
-- recibe datos; cualquier otra cuenta (p. ej. un cliente registrado en la web)
-- recibe "No autorizado".

create or replace function public.panel_es_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = 'boomart.3d@gmail.com';
$$;

create or replace function public.panel_resumen(
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
  ses0 as (
    select
      sid,
      min(creado) as inicio,
      (array_agg(vid order by creado))[1] as vid,
      (array_agg(fuente order by creado))[1] as fuente,
      (array_agg(medio order by creado))[1] as medio,
      (array_agg(campana order by creado))[1] as campana,
      (array_agg(dispositivo order by creado))[1] as dispositivo,
      (array_agg(tz order by creado))[1] as tz,
      bool_or(humano) as humano,
      bool_or(nuevo) as nuevo,
      count(*) filter (where tipo = 'ver_producto') as n_ver,
      count(distinct producto) filter (where tipo = 'ver_producto') as n_prod,
      count(*) filter (where tipo = 'agregar_carrito') as n_add,
      count(*) filter (where tipo = 'abrir_carrito') as n_cart,
      count(*) filter (where tipo = 'iniciar_compra') as n_ini,
      count(*) filter (where tipo = 'pedido_whatsapp') as n_ped,
      count(*) filter (where tipo = 'clic_whatsapp') as n_wa,
      count(*) filter (where tipo = 'clic_whatsapp' and producto is not null) as n_wa_prod,
      count(*) filter (where tipo = 'compartir') as n_comp
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
  ses as (
    select s.*, coalesce(t.seg, 0) as seg,
           (s.tz is null or s.tz = '' or s.tz = 'America/Lima') as peru
    from ses0 s
    left join tiempo t using (sid)
  ),
  cls as (
    select s.*,
      case
        when n_add > 0 or n_wa_prod > 0 or n_ini > 0 or n_ped > 0 then 'intencion'
        when n_prod >= 2 or n_comp > 0 or n_wa > 0 or n_cart > 0 then 'interesado'
        when n_ver > 0 or seg >= 10 then 'curioso'
        else 'rebote'
      end as clase
    from ses s
    where (not p_solo_peru) or s.peru
  )
  select jsonb_build_object(
    'generado', now(),
    'solo_peru', p_solo_peru,
    'sesiones_total', (select count(*) from ses),
    'fuera_peru', (select count(*) from ses where not peru),
    'kpi', (select jsonb_build_object(
        'sesiones', count(*),
        'visitantes', count(distinct vid),
        'nuevos', count(distinct vid) filter (where nuevo),
        'con_interaccion', count(*) filter (where humano),
        'seg_promedio', coalesce(round(avg(seg) filter (where humano))::int, 0),
        'seg_mediana', coalesce(round(percentile_cont(0.5) within group (order by seg) filter (where humano))::int, 0)
      ) from cls),
    'embudo', (select jsonb_build_object(
        'entraron', count(*),
        'interaccion', count(*) filter (where humano),
        'vieron_producto', count(*) filter (where n_ver > 0),
        'agregaron', count(*) filter (where n_add > 0),
        'iniciaron', count(*) filter (where n_ini > 0),
        'pedido', count(*) filter (where n_ped > 0),
        'wa_clic', count(*) filter (where n_wa > 0),
        'wa_producto', count(*) filter (where n_wa_prod > 0)
      ) from cls),
    'clases', (select coalesce(jsonb_object_agg(clase, n), '{}'::jsonb)
               from (select clase, count(*) as n from cls group by clase) c),
    'tiempo', (select jsonb_build_object(
        'menos10', count(*) filter (where seg < 10),
        'de10a30', count(*) filter (where seg >= 10 and seg < 30),
        'de30a60', count(*) filter (where seg >= 30 and seg < 60),
        'de1a3', count(*) filter (where seg >= 60 and seg < 180),
        'mas3', count(*) filter (where seg >= 180)
      ) from cls),
    'fuentes', (select coalesce(jsonb_agg(f order by (f ->> 'sesiones')::int desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'fuente', coalesce(fuente, 'directo'),
          'medio', coalesce(medio, ''),
          'campana', coalesce(campana, ''),
          'sesiones', count(*),
          'visitantes', count(distinct vid),
          'interaccion', count(*) filter (where humano),
          'seg_promedio', coalesce(round(avg(seg) filter (where humano))::int, 0),
          'vieron', count(*) filter (where n_ver > 0),
          'agregaron', count(*) filter (where n_add > 0),
          'wa', count(*) filter (where n_wa > 0),
          'pedido', count(*) filter (where n_ped > 0),
          'intencion', count(*) filter (where clase = 'intencion')
        ) as f
        from cls
        group by fuente, medio, campana
        order by count(*) desc
        limit 40
      ) q),
    'productos', (select coalesce(jsonb_agg(p order by (p ->> 'vistas')::int desc, (p ->> 'agregados')::int desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'producto', e.producto,
          'vistas', count(distinct e.sid) filter (where e.tipo = 'ver_producto'),
          'agregados', count(distinct e.sid) filter (where e.tipo = 'agregar_carrito'),
          'unidades', coalesce(sum(e.cantidad) filter (where e.tipo = 'agregar_carrito'), 0),
          'wa', count(distinct e.sid) filter (where e.tipo = 'clic_whatsapp'),
          'compartidos', count(distinct e.sid) filter (where e.tipo = 'compartir')
        ) as p
        from ev e
        join cls c on c.sid = e.sid
        where e.producto is not null
        group by e.producto
        order by count(distinct e.sid) filter (where e.tipo = 'ver_producto') desc
        limit 60
      ) q),
    'dias', (select coalesce(jsonb_agg(d order by d ->> 'dia'), '[]'::jsonb) from (
        select jsonb_build_object(
          'dia', to_char((inicio at time zone 'America/Lima')::date, 'YYYY-MM-DD'),
          'sesiones', count(*),
          'visitantes', count(distinct vid),
          'interaccion', count(*) filter (where humano),
          'intencion', count(*) filter (where clase = 'intencion')
        ) as d
        from cls
        group by (inicio at time zone 'America/Lima')::date
      ) q),
    'horas', (select coalesce(jsonb_agg(h order by (h ->> 'hora')::int), '[]'::jsonb) from (
        select jsonb_build_object(
          'hora', extract(hour from inicio at time zone 'America/Lima')::int,
          'sesiones', count(*)
        ) as h
        from cls
        group by extract(hour from inicio at time zone 'America/Lima')
      ) q),
    'dispositivos', (select coalesce(jsonb_object_agg(coalesce(dispositivo, '?'), n), '{}'::jsonb)
                     from (select dispositivo, count(*) as n from cls group by dispositivo) q),
    'whatsapp_botones', (select coalesce(jsonb_agg(b order by (b ->> 'clics')::int desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'boton', coalesce(e.boton, 'otro'),
          'clics', count(*),
          'sesiones', count(distinct e.sid)
        ) as b
        from ev e
        join cls c on c.sid = e.sid
        where e.tipo = 'clic_whatsapp'
        group by e.boton
      ) q),
    'busquedas', (select coalesce(jsonb_agg(b order by (b ->> 'veces')::int desc), '[]'::jsonb) from (
        select jsonb_build_object('texto', lower(e.extra ->> 'q'), 'veces', count(*)) as b
        from ev e
        join cls c on c.sid = e.sid
        where e.tipo = 'buscar' and e.extra ->> 'q' is not null
        group by lower(e.extra ->> 'q')
        order by count(*) desc
        limit 10
      ) q),
    'categorias', (select coalesce(jsonb_agg(b order by (b ->> 'veces')::int desc), '[]'::jsonb) from (
        select jsonb_build_object('categoria', e.extra ->> 'categoria', 'veces', count(*)) as b
        from ev e
        join cls c on c.sid = e.sid
        where e.tipo = 'filtrar' and e.extra ->> 'categoria' is not null
        group by e.extra ->> 'categoria'
        order by count(*) desc
        limit 10
      ) q)
  ) into v_res;

  return v_res;
end;
$$;

revoke all on function public.panel_es_admin() from public, anon;
revoke all on function public.panel_resumen(timestamptz, timestamptz, boolean) from public, anon;
grant execute on function public.panel_es_admin() to authenticated;
grant execute on function public.panel_resumen(timestamptz, timestamptz, boolean) to authenticated;
