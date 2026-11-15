-- Medicion propia de boomart.pe: "Polos que mas gustan" para el panel privado.
--
-- Igual que panel_entradas(): solo responde al correo del administrador y lee
-- web_eventos (que el navegador no puede leer directamente). Por cada polo de
-- /polos/ devuelve cuantas personas lo tienen guardado con el corazon, en
-- cuantas visitas se abrio su ficha y en cuantas se agrego al carrito.
--
-- Corazones: cuenta visitantes (vid), no toques. De cada visitante y polo vale
-- su ULTIMO toque del periodo: si termino en "me_gusta" suma uno; si lo quito
-- ("quitar_me_gusta"), no suma. Asi nadie infla un polo tocando muchas veces.
--
-- Requiere que la Edge Function `track` acepte los tipos me_gusta y
-- quitar_me_gusta (supabase/functions/track/index.ts).
--
-- La tabla tambien debe aceptarlos: web_eventos_tipo_chk los incluye desde la
-- migracion analitica_web_eventos_tipos_me_gusta (15-nov-2026; ver la lista en
-- schema_analitica.sql). Sin eso, el lote entero que trae un corazon se rechaza.

create or replace function public.panel_polos_gustan(
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
  if p_hasta <= p_desde or p_hasta - p_desde > interval '3650 days' then
    raise exception 'Rango de fechas invalido' using errcode = '22023';
  end if;

  with ev as (
    select id, creado, vid, sid, tipo, producto
    from public.web_eventos
    where creado >= p_desde and creado < p_hasta
      and host in ('boomart.pe', 'www.boomart.pe')
      and pagina like '/polos%'
      and producto is not null and producto <> ''
      and tipo in ('me_gusta', 'quitar_me_gusta', 'ver_producto', 'agregar_carrito')
      and ((not p_solo_peru) or public.panel_es_peru(pais, tz))
  ),
  ultimo as (
    select distinct on (vid, producto) producto, tipo
    from ev
    where tipo in ('me_gusta', 'quitar_me_gusta')
    order by vid, producto, creado desc, id desc
  ),
  corazones as (
    select producto, count(*) as n
    from ultimo
    where tipo = 'me_gusta'
    group by producto
  ),
  actividad as (
    select
      producto,
      count(distinct sid) filter (where tipo = 'ver_producto') as vistas,
      count(distinct sid) filter (where tipo = 'agregar_carrito') as agregados
    from ev
    group by producto
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'producto', a.producto,
      'corazones', coalesce(c.n, 0),
      'vistas', a.vistas,
      'agregados', a.agregados
    )
    order by coalesce(c.n, 0) desc, a.agregados desc, a.vistas desc, a.producto
  ), '[]'::jsonb)
  into v_res
  from actividad a
  left join corazones c using (producto);

  return v_res;
end;
$$;

revoke all on function public.panel_polos_gustan(timestamptz, timestamptz, boolean) from public, anon;
grant execute on function public.panel_polos_gustan(timestamptz, timestamptz, boolean) to authenticated;
