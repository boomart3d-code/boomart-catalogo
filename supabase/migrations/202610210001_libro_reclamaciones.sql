-- Libro de Reclamaciones virtual de boomart.pe (pedido de Adrian, 2026-10-21).
--
-- Cada fila es una hoja de reclamacion (reclamo o queja). La escribe SOLO la Edge Function
-- `reclamos` (service role): RLS esta activada y NO hay politicas, asi que el navegador
-- (anon/authenticated) no puede leer ni escribir esta tabla. La hoja guarda los datos que
-- exige la normativa de Indecopi: proveedor, consumidor, bien contratado, detalle del
-- reclamo/queja y pedido del consumidor, mas el estado y la respuesta del proveedor.

create table if not exists public.reclamos (
  id              bigint generated always as identity primary key,
  creado          timestamptz not null default now(),
  numero          text unique,
  tipo            text not null check (tipo in ('reclamo', 'queja')),
  nombre          text not null,
  doc_tipo        text not null check (doc_tipo in ('DNI', 'CE', 'PASAPORTE', 'RUC')),
  doc_numero      text not null,
  domicilio       text not null,
  telefono        text not null,
  email           text not null,
  menor_edad      boolean not null default false,
  apoderado       text,
  bien_tipo       text not null check (bien_tipo in ('producto', 'servicio')),
  bien_detalle    text not null,
  pedido_ref      text,
  monto           numeric(10,2),
  detalle         text not null,
  pedido_consumidor text not null,
  acepta_datos    boolean not null default false,
  ip_hash         text,
  estado          text not null default 'recibido' check (estado in ('recibido', 'en_evaluacion', 'respondido')),
  respuesta       text,
  respondido_en   timestamptz,
  correo_enviado  boolean not null default false
);

comment on table public.reclamos is
  'Hojas de reclamacion del Libro de Reclamaciones virtual de boomart.pe. Solo la Edge Function reclamos escribe; se lee con la service role.';

create index if not exists reclamos_creado_idx on public.reclamos (creado);
create index if not exists reclamos_email_idx on public.reclamos (email);
create index if not exists reclamos_iphash_creado_idx on public.reclamos (ip_hash, creado);

alter table public.reclamos enable row level security;
revoke all on public.reclamos from anon, authenticated;
grant select, insert, update, delete on public.reclamos to service_role;
