-- Medicion propia de boomart.pe (entrega 5: ubicacion por IP con base propia).
--
-- Supabase NO entrega pais/region/ciudad en el pedido (solo la IP), asi que la
-- Edge Function `track` busca la IP en dos tablas propias cargadas con DB-IP
-- Lite (https://db-ip.com, licencia CC BY 4.0: se cita al pie del panel):
--   geo_ip_pais  rangos IP -> pais (todo el mundo)
--   geo_ip_peru  rangos IP de Peru -> region y ciudad
-- La IP solo se usa en memoria para la busqueda: NO se guarda en ninguna tabla.
--
-- IPv4 se guarda como entero de 32 bits. IPv6: primeros 48 bits (paises, bigint)
-- y primeros 64 bits (Peru, numeric).
--
-- Cargado en produccion el 2026-10-14 (dbip-country-lite-2026-10 y dbip-city-lite-2026-10):
--   geo_ip_pais 708.152 filas · geo_ip_peru 11.346 filas.
-- Para refrescar los datos (opcional, DB-IP publica una version cada mes) ver
-- supabase/geoip/LEEME.md.

create table if not exists public.geo_ip_pais (
  fam  smallint not null,          -- 4 = IPv4, 6 = IPv6
  ini  bigint   not null,
  fin  bigint   not null,
  pais char(2)  not null
);
create table if not exists public.geo_ip_peru (
  fam    smallint      not null,
  ini    numeric(20,0) not null,
  fin    numeric(20,0) not null,
  region text,
  ciudad text
);
comment on table public.geo_ip_pais is 'Rangos IP -> pais (DB-IP Lite, CC BY 4.0, db-ip.com). Solo la funcion geo_ip() la lee.';
comment on table public.geo_ip_peru is 'Rangos IP de Peru -> region y ciudad (DB-IP Lite, CC BY 4.0, db-ip.com). Solo la funcion geo_ip() la lee.';

alter table public.geo_ip_pais enable row level security;
alter table public.geo_ip_peru enable row level security;
grant select, insert, update, delete on public.geo_ip_pais, public.geo_ip_peru to service_role;

-- (Durante una carga se abre una ventana temporal de insercion para anon; ver LEEME.md.
--  Al terminar se cierra: sin politicas ni permisos para anon/authenticated.)
revoke all on public.geo_ip_pais, public.geo_ip_peru from anon, authenticated;

create index if not exists geo_ip_pais_busqueda_idx on public.geo_ip_pais (fam, ini);
create index if not exists geo_ip_peru_busqueda_idx on public.geo_ip_peru (fam, ini);

-- Busqueda. p_k48: IPv4 entero de 32 bits o primeros 48 bits de la IPv6.
-- p_k64: IPv4 entero de 32 bits o primeros 64 bits de la IPv6 (Peru).
create or replace function public.geo_ip(p_fam smallint, p_k48 bigint, p_k64 numeric)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_region text;
  v_ciudad text;
  v_pais   text;
  v_hay_pe boolean := false;
begin
  select x.region, x.ciudad, true
    into v_region, v_ciudad, v_hay_pe
  from (
    select region, ciudad, fin
    from public.geo_ip_peru
    where fam = p_fam and ini <= p_k64
    order by ini desc
    limit 1
  ) x
  where x.fin >= p_k64;

  if coalesce(v_hay_pe, false) then
    return jsonb_build_object('pais', 'PE', 'region', v_region, 'ciudad', v_ciudad);
  end if;

  select trim(x.pais)
    into v_pais
  from (
    select pais, fin
    from public.geo_ip_pais
    where fam = p_fam and ini <= p_k48
    order by ini desc
    limit 1
  ) x
  where x.fin >= p_k48;

  return jsonb_build_object('pais', v_pais, 'region', null, 'ciudad', null);
end;
$$;

-- Solo la Edge Function `track` (service role) puede llamarla.
revoke all on function public.geo_ip(smallint, bigint, numeric) from public, anon, authenticated;
grant execute on function public.geo_ip(smallint, bigint, numeric) to service_role;
