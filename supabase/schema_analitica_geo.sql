-- Medicion propia de boomart.pe (entrega 4: pais, region y ciudad + historico).
--
-- 1) web_eventos guarda pais / region / ciudad de cada visita. Los pone la Edge
--    Function `track` a partir de los encabezados que agrega Supabase/Cloudflare
--    al pedido; la IP NO se guarda. Las visitas anteriores no tienen estos datos:
--    para ellas el pais se ESTIMA con la zona horaria del equipo (panel_pais_aprox).
-- 2) "Solo Peru" ahora usa el pais por IP cuando existe y, si no, la zona horaria.
-- 3) panel_resumen devuelve: desde cuando hay datos, paises y lugares (sin filtrar
--    por Peru) y ya no limita el rango a 92 dias (boton "Historico").

alter table public.web_eventos add column if not exists pais   text;
alter table public.web_eventos add column if not exists region text;
alter table public.web_eventos add column if not exists ciudad text;

-- ---------------------------------------------------------------------------
-- Ayudas internas (no se exponen al navegador)
-- ---------------------------------------------------------------------------

-- Pais aproximado (codigo ISO de 2 letras) a partir de la zona horaria.
create or replace function public.panel_pais_aprox(p_tz text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_tz is null or p_tz = '' then null
    when p_tz = 'America/Lima' then 'PE'
    when p_tz = 'America/Bogota' then 'CO'
    when p_tz in ('America/Guayaquil', 'Pacific/Galapagos') then 'EC'
    when p_tz = 'America/La_Paz' then 'BO'
    when p_tz in ('America/Santiago', 'America/Punta_Arenas', 'Pacific/Easter') then 'CL'
    when p_tz like 'America/Argentina/%' or p_tz in ('America/Buenos_Aires', 'America/Cordoba', 'America/Mendoza') then 'AR'
    when p_tz = 'America/Asuncion' then 'PY'
    when p_tz = 'America/Montevideo' then 'UY'
    when p_tz = 'America/Caracas' then 'VE'
    when p_tz in ('America/Mexico_City', 'America/Cancun', 'America/Monterrey', 'America/Merida', 'America/Tijuana',
                  'America/Chihuahua', 'America/Hermosillo', 'America/Mazatlan', 'America/Bahia_Banderas',
                  'America/Ciudad_Juarez', 'America/Matamoros', 'America/Ojinaga') then 'MX'
    when p_tz in ('America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix',
                  'America/Anchorage', 'America/Detroit', 'America/Boise', 'America/Juneau', 'America/Adak',
                  'America/Nome', 'America/Sitka', 'America/Menominee', 'Pacific/Honolulu',
                  'US/Eastern', 'US/Central', 'US/Mountain', 'US/Pacific', 'US/Hawaii', 'US/Alaska', 'US/Arizona')
         or p_tz like 'America/Indiana/%' or p_tz like 'America/Kentucky/%' or p_tz like 'America/North_Dakota/%' then 'US'
    when p_tz in ('America/Toronto', 'America/Vancouver', 'America/Edmonton', 'America/Winnipeg', 'America/Halifax',
                  'America/Montreal', 'America/Regina', 'America/St_Johns', 'America/Moncton', 'America/Glace_Bay') then 'CA'
    when p_tz in ('America/Sao_Paulo', 'America/Manaus', 'America/Bahia', 'America/Fortaleza', 'America/Recife',
                  'America/Belem', 'America/Cuiaba', 'America/Campo_Grande', 'America/Rio_Branco', 'America/Maceio',
                  'America/Porto_Velho', 'America/Boa_Vista', 'America/Noronha', 'America/Araguaina') then 'BR'
    when p_tz = 'America/Panama' then 'PA'
    when p_tz = 'America/Costa_Rica' then 'CR'
    when p_tz = 'America/Guatemala' then 'GT'
    when p_tz = 'America/El_Salvador' then 'SV'
    when p_tz = 'America/Tegucigalpa' then 'HN'
    when p_tz = 'America/Managua' then 'NI'
    when p_tz = 'America/Belize' then 'BZ'
    when p_tz = 'America/Havana' then 'CU'
    when p_tz = 'America/Santo_Domingo' then 'DO'
    when p_tz = 'America/Puerto_Rico' then 'PR'
    when p_tz = 'America/Jamaica' then 'JM'
    when p_tz = 'America/Port-au-Prince' then 'HT'
    when p_tz = 'America/Aruba' then 'AW'
    when p_tz = 'America/Curacao' then 'CW'
    when p_tz = 'America/Port_of_Spain' then 'TT'
    when p_tz = 'America/Guyana' then 'GY'
    when p_tz = 'America/Paramaribo' then 'SR'
    when p_tz in ('Europe/Madrid', 'Atlantic/Canary', 'Africa/Ceuta') then 'ES'
    when p_tz = 'Europe/Paris' then 'FR'
    when p_tz in ('Europe/London', 'Europe/Belfast') then 'GB'
    when p_tz = 'Europe/Berlin' then 'DE'
    when p_tz = 'Europe/Rome' then 'IT'
    when p_tz in ('Europe/Lisbon', 'Atlantic/Azores', 'Atlantic/Madeira') then 'PT'
    when p_tz = 'Europe/Amsterdam' then 'NL'
    when p_tz = 'Europe/Brussels' then 'BE'
    when p_tz = 'Europe/Zurich' then 'CH'
    when p_tz = 'Europe/Vienna' then 'AT'
    when p_tz = 'Europe/Stockholm' then 'SE'
    when p_tz = 'Europe/Oslo' then 'NO'
    when p_tz = 'Europe/Copenhagen' then 'DK'
    when p_tz = 'Europe/Helsinki' then 'FI'
    when p_tz = 'Europe/Dublin' then 'IE'
    when p_tz = 'Europe/Warsaw' then 'PL'
    when p_tz = 'Europe/Prague' then 'CZ'
    when p_tz = 'Europe/Athens' then 'GR'
    when p_tz in ('Europe/Moscow', 'Europe/Kaliningrad', 'Europe/Samara') then 'RU'
    when p_tz = 'Europe/Istanbul' then 'TR'
    when p_tz in ('Europe/Kiev', 'Europe/Kyiv') then 'UA'
    when p_tz = 'Europe/Bucharest' then 'RO'
    when p_tz = 'Europe/Budapest' then 'HU'
    when p_tz = 'Asia/Tokyo' then 'JP'
    when p_tz in ('Asia/Shanghai', 'Asia/Chongqing', 'Asia/Urumqi') then 'CN'
    when p_tz = 'Asia/Hong_Kong' then 'HK'
    when p_tz = 'Asia/Singapore' then 'SG'
    when p_tz = 'Asia/Seoul' then 'KR'
    when p_tz in ('Asia/Kolkata', 'Asia/Calcutta') then 'IN'
    when p_tz = 'Asia/Manila' then 'PH'
    when p_tz = 'Asia/Bangkok' then 'TH'
    when p_tz = 'Asia/Jakarta' then 'ID'
    when p_tz = 'Asia/Dubai' then 'AE'
    when p_tz = 'Asia/Riyadh' then 'SA'
    when p_tz in ('Asia/Jerusalem', 'Asia/Tel_Aviv') then 'IL'
    when p_tz = 'Asia/Taipei' then 'TW'
    when p_tz = 'Asia/Kuala_Lumpur' then 'MY'
    when p_tz in ('Asia/Ho_Chi_Minh', 'Asia/Saigon') then 'VN'
    when p_tz = 'Asia/Karachi' then 'PK'
    when p_tz = 'Asia/Dhaka' then 'BD'
    when p_tz like 'Australia/%' then 'AU'
    when p_tz in ('Pacific/Auckland', 'NZ') then 'NZ'
    when p_tz = 'Africa/Johannesburg' then 'ZA'
    when p_tz = 'Africa/Cairo' then 'EG'
    when p_tz = 'Africa/Lagos' then 'NG'
    when p_tz = 'Africa/Nairobi' then 'KE'
    when p_tz = 'Africa/Casablanca' then 'MA'
    else null
  end;
$$;

-- Una visita es "de Peru" si el pais por IP es PE; si no hay pais por IP (visitas
-- anteriores o sin dato), se usa la zona horaria (America/Lima) como antes.
create or replace function public.panel_es_peru(p_pais text, p_tz text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_pais is not null and p_pais <> '' then p_pais = 'PE'
    when p_tz is null or p_tz = '' then true
    else p_tz = 'America/Lima'
  end;
$$;

revoke all on function public.panel_pais_aprox(text) from public, anon, authenticated;
revoke all on function public.panel_es_peru(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- panel_resumen (misma firma que antes)
-- ---------------------------------------------------------------------------

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
  if p_hasta <= p_desde or p_hasta - p_desde > interval '3650 days' then
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
      (array_agg(pais order by creado) filter (where pais is not null and pais <> ''))[1] as pais,
      (array_agg(region order by creado) filter (where region is not null and region <> ''))[1] as region,
      (array_agg(ciudad order by creado) filter (where ciudad is not null and ciudad <> ''))[1] as ciudad,
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
           public.panel_es_peru(s.pais, s.tz) as peru,
           coalesce(s.pais, public.panel_pais_aprox(s.tz)) as pais_fin,
           (s.pais is not null) as pais_exacto
    from ses0 s
    left join tiempo t using (sid)
  ),
  cls0 as (
    select s.*,
      case
        when n_add > 0 or n_wa_prod > 0 or n_ini > 0 or n_ped > 0 then 'intencion'
        when n_prod >= 2 or n_comp > 0 or n_wa > 0 or n_cart > 0 then 'interesado'
        when n_ver > 0 or seg >= 10 then 'curioso'
        else 'rebote'
      end as clase
    from ses s
  ),
  cls as (
    select * from cls0
    where (not p_solo_peru) or peru
  )
  select jsonb_build_object(
    'generado', now(),
    'solo_peru', p_solo_peru,
    'desde_datos', (select min(creado) from public.web_eventos where host in ('boomart.pe', 'www.boomart.pe')),
    'geo_desde', (select min(creado) from public.web_eventos where pais is not null and host in ('boomart.pe', 'www.boomart.pe')),
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
      ) q),
    -- Paises y lugares: NO se filtran por "solo Peru" (se quiere ver todo el mundo).
    'paises', (select coalesce(jsonb_agg(p order by (p ->> 'sesiones')::int desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'pais', pais_fin,
          'sesiones', count(*),
          'visitantes', count(distinct vid),
          'interaccion', count(*) filter (where humano),
          'interesados', count(*) filter (where clase = 'interesado'),
          'intencion', count(*) filter (where clase = 'intencion'),
          'seg_promedio', coalesce(round(avg(seg) filter (where humano))::int, 0),
          'exactas', count(*) filter (where pais_exacto)
        ) as p
        from cls0
        group by pais_fin
        order by count(*) desc
        limit 80
      ) q),
    'lugares', (select coalesce(jsonb_agg(l order by (l ->> 'sesiones')::int desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'pais', pais_fin,
          'region', region,
          'ciudad', ciudad,
          'sesiones', count(*),
          'interaccion', count(*) filter (where humano),
          'intencion', count(*) filter (where clase = 'intencion')
        ) as l
        from cls0
        where pais_exacto
        group by pais_fin, region, ciudad
        order by count(*) desc
        limit 300
      ) q),
    'sin_geo', (select count(*) from cls0 where not pais_exacto)
  ) into v_res;

  return v_res;
end;
$$;

revoke all on function public.panel_resumen(timestamptz, timestamptz, boolean) from public, anon;
grant execute on function public.panel_resumen(timestamptz, timestamptz, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- panel_entradas (misma firma): mismo criterio de "Peru" y sin tope de 92 dias
-- ---------------------------------------------------------------------------

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
  if p_hasta <= p_desde or p_hasta - p_desde > interval '3650 days' then
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
      (array_agg(pais order by creado) filter (where pais is not null and pais <> ''))[1] as pais,
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
    where (not p_solo_peru) or public.panel_es_peru(s.pais, s.tz)
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
