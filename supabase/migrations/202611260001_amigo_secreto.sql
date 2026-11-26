-- Amigo Secreto por correo (pedido de Adrián, 2026-11-26).
--
-- boomart.pe/amigo-secreto/ puede enviar los resultados por correo desde contacto@boomart.pe.
-- Lo maneja la Edge Function amigo-secreto (service role); estas tablas NO son públicas:
-- RLS activo sin políticas y sin permisos para anon/authenticated.
--
--  * amigo_secreto_sorteos: el intercambio y su organizador. El organizador confirma su correo
--    antes de que salga cualquier correo a participantes (evita usar la página para spam).
--  * amigo_secreto_participantes: nombre, correo y a quién le regala (por orden). Solo sirven
--    para enviar el sorteo; se borran solos (borrar_en) después del intercambio.
--  * contactos_marketing: SOLO quienes aceptan recibir ofertas de BoomArt desde el botón del
--    correo (Ley 29733: consentimiento de cada titular). Guarda el texto aceptado y permite baja.
--
-- Se puede aplicar más de una vez.
begin;

create extension if not exists pgcrypto;

create table if not exists public.amigo_secreto_sorteos (
  id uuid primary key default gen_random_uuid(),
  creado_en timestamptz not null default now(),
  evento text not null check (char_length(evento) between 1 and 80),
  tipo text not null default 'otro'
    check (tipo in ('familia', 'oficina', 'colegio', 'universidad', 'amigos', 'otro')),
  fecha date,
  presupuesto integer check (presupuesto is null or presupuesto between 0 and 100000),
  nota text not null default '' check (char_length(nota) <= 300),
  -- 'secreto': nadie ve las parejas (tampoco el organizador). 'admin': el organizador las ve.
  modo text not null check (modo in ('secreto', 'admin')),
  organizador_nombre text not null check (char_length(organizador_nombre) between 1 and 60),
  organizador_email text not null
    check (char_length(organizador_email) <= 254 and organizador_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  confirmar_hash text not null unique,
  confirmar_vence timestamptz not null,
  confirmado_en timestamptz,
  enviado_en timestamptz,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'enviando', 'enviado', 'error')),
  ip_huella text not null default '',
  borrar_en timestamptz not null
);

create index if not exists amigo_secreto_sorteos_ip_idx on public.amigo_secreto_sorteos (ip_huella, creado_en);
create index if not exists amigo_secreto_sorteos_org_idx on public.amigo_secreto_sorteos (organizador_email, creado_en);
create index if not exists amigo_secreto_sorteos_borrar_idx on public.amigo_secreto_sorteos (borrar_en);

create table if not exists public.amigo_secreto_participantes (
  id uuid primary key default gen_random_uuid(),
  sorteo_id uuid not null references public.amigo_secreto_sorteos (id) on delete cascade,
  orden smallint not null check (orden between 0 and 59),
  nombre text not null check (char_length(nombre) between 1 and 40),
  email text not null
    check (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  regala_a smallint not null check (regala_a between 0 and 59 and regala_a <> orden),
  ofertas_hash text not null unique,
  enviado_en timestamptz,
  envio_error text not null default '',
  unique (sorteo_id, orden)
);

create index if not exists amigo_secreto_participantes_sorteo_idx on public.amigo_secreto_participantes (sorteo_id);

create table if not exists public.contactos_marketing (
  id uuid primary key default gen_random_uuid(),
  email text not null unique
    check (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  nombre text not null default '' check (char_length(nombre) <= 60),
  fuente text not null check (char_length(fuente) <= 40),
  consentimiento_en timestamptz not null default now(),
  consentimiento_texto text not null,
  baja_hash text not null unique,
  baja_en timestamptz
);

alter table public.amigo_secreto_sorteos enable row level security;
alter table public.amigo_secreto_participantes enable row level security;
alter table public.contactos_marketing enable row level security;

revoke all on public.amigo_secreto_sorteos from anon, authenticated;
revoke all on public.amigo_secreto_participantes from anon, authenticated;
revoke all on public.contactos_marketing from anon, authenticated;

-- En este proyecto las tablas nuevas no reciben permisos automáticos: solo la función
-- (service role) lee y escribe, igual que reclamos y clientes_web_correos.
grant select, insert, update, delete on public.amigo_secreto_sorteos to service_role;
grant select, insert, update, delete on public.amigo_secreto_participantes to service_role;
grant select, insert, update, delete on public.contactos_marketing to service_role;

commit;
