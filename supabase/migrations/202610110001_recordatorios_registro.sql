-- Recordatorio unico, 24 horas despues del registro, para clientes que aun
-- no completaron un pedido. La Edge Function usa service_role; el navegador
-- no necesita acceso a esta tabla.
create table if not exists public.recordatorios_registro (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  tipo text not null default 'registro_24h' check (tipo = 'registro_24h'),
  enviado_en timestamptz not null default now(),
  unique (cliente_id, tipo)
);

comment on table public.recordatorios_registro is
  'Evita repetir el correo sutil enviado 24 horas despues del registro.';

alter table public.recordatorios_registro enable row level security;
grant select, insert on public.recordatorios_registro to service_role;
