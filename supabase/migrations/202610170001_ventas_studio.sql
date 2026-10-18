-- Ventas de BoomArt Studio en la nube (pedido de Adrián, 2026-10-17).
--
-- Studio (la app de escritorio, fuente de verdad) sube aquí un RESUMEN de cada venta
-- — número NV, fecha, cliente, productos, total, abonos, estado y origen (venta web
-- validada desde un pedido W-XXXXX o venta directa) — para que el portal privado
-- boomart.pe/panel/clientes/ muestre sin trabajo manual qué ventas tiene cada cliente.
-- Solo lectura para el portal: nunca se edita una venta desde la web.
--
-- Seguridad: RLS forzado sin políticas. Studio escribe con la clave de servicio; el
-- portal leerá con funciones solo-administrador (etapa 2). Liviano: sin fotos ni PDFs.

create table if not exists public.ventas_studio (
  nv text primary key check (nv ~ '^NV-[0-9]{5,}$'),
  sale_id integer not null unique,
  vendido_en timestamptz not null,
  mes text not null check (mes ~ '^[0-9]{4}-[0-9]{2}$'),     -- 'YYYY-MM' (hora de Lima) para la vista mensual
  cliente_nombre text not null default '',
  cliente_telefono text not null default '',                   -- solo dígitos, como en Studio
  cliente_doc_tipo text not null default '',
  cliente_documento text not null default '',
  cliente_correo text not null default '',
  registro_codigo text not null default '',                    -- BA-XXXX-XXXX si el cliente vino del registro web
  productos jsonb not null default '[]'::jsonb,                -- [{nombre, cantidad, precio, subtotal, web_id}]
  total numeric(10, 2) not null default 0,
  abonado numeric(10, 2) not null default 0,
  saldo numeric(10, 2) not null default 0,
  abonos jsonb not null default '[]'::jsonb,                   -- [{fecha, monto, medio, nota}]
  medio_pago text not null default '',
  estado text not null default '',
  estado_pago text not null default '',
  entrega text not null default '',
  fecha_prometida text not null default '',
  origen text not null default 'directa' check (origen in ('web', 'directa')),
  pedido_web text not null default '',                         -- W-XXXXX cuando origen = 'web'
  eliminada boolean not null default false,                    -- se borró en Studio
  huella text not null default '',                             -- hash del resumen (evita re-subir lo mismo)
  sincronizado_en timestamptz not null default now()
);
create index if not exists ventas_studio_mes_idx on public.ventas_studio(mes, vendido_en desc) where not eliminada;
create index if not exists ventas_studio_telefono_idx on public.ventas_studio(cliente_telefono);
create index if not exists ventas_studio_documento_idx on public.ventas_studio(cliente_documento);

alter table public.ventas_studio enable row level security;
alter table public.ventas_studio force row level security;
revoke all on public.ventas_studio from public, anon, authenticated;
grant select, insert, update on public.ventas_studio to service_role;
