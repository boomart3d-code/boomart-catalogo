-- Seguimiento web de pedidos (proyecto "seguimiento web de pedidos de
-- BoomArt", Etapa 3). Tabla NUEVA y separada de todo lo de "Studio en el
-- celular" (studio_*, en pausa) y de "Clientes web" (clientes/carritos) --
-- no se reutiliza nada de eso.
--
-- Una fila = un enlace de seguimiento (activo o ya revocado) para UNA venta
-- de Boomart Studio. NUNCA guarda dinero, abonos, telefono, direccion
-- completa ni la clave de Shalom -- Studio nunca manda esos datos aca.
--
-- Como usarlo: pega este archivo completo en el "SQL Editor" de Supabase y
-- dale "Run". Se puede correr mas de una vez sin romper nada.

create table if not exists seguimiento_pedidos (
  -- Este mismo id ES el token del enlace publico
  -- (boomart.pe/seguimiento/?t=<id>) -- no hay una columna de token aparte.
  id uuid primary key default gen_random_uuid(),
  -- Id interno de la venta en Boomart Studio. Solo lo usa Studio para saber
  -- a que venta corresponde esta fila; nunca se expone al publico.
  venta_id integer not null,
  etapa text not null default 'tomado' check (etapa in (
    'tomado', 'fabricacion', 'postproduccion', 'pintado', 'empaquetado',
    'listo_envio', 'listo_recojo', 'enviado_shalom', 'cerrado'
  )),
  -- [{"nombre": "...", "etapa": "..."}] para pedidos con varios productos en
  -- etapas distintas. Vacio si el pedido es de un solo producto.
  productos jsonb not null default '[]'::jsonb,
  metodo_envio text not null check (metodo_envio in ('local', 'recojo', 'shalom')),
  -- A pedido explicito de Adrian (2026-09-23): nombre del cliente y
  -- direccion de envio (o agencia Shalom, ya resuelta por Studio) SI se
  -- muestran en la pagina publica. DNI, correo, telefono y dinero
  -- (abonos/saldos) siguen sin guardarse aca -- Studio nunca los manda.
  nombre_cliente text not null default '',
  direccion_envio text not null default '',
  -- A pedido explicito de Adrian (2026-09-23): si ninguna linea del pedido
  -- lleva pintura (marcado en Taller), la pagina publica oculta el paso "En
  -- pintado" por completo en vez de mostrar un texto confuso.
  pintado_aplica boolean not null default true,
  -- A pedido explicito de Adrian (2026-09-23): precio del pedido, lo ya
  -- abonado y el saldo pendiente SI se muestran -- el considera que no es
  -- informacion sensible y sirve de recordatorio claro al cliente. Nunca
  -- incluye medio de pago ni ningun otro dato de la transaccion.
  precio_total numeric not null default 0,
  precio_abonado numeric not null default 0,
  precio_pendiente numeric not null default 0,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

comment on table seguimiento_pedidos is
  'Enlaces de seguimiento publico de pedidos. El id de cada fila ES el token del enlace.';

create index if not exists idx_seguimiento_venta_id on seguimiento_pedidos (venta_id);
create index if not exists idx_seguimiento_activo on seguimiento_pedidos (activo);

-- ---------------------------------------------------------------------------
-- Seguridad (Row Level Security)
-- A proposito, esta tabla NO tiene ninguna politica para anon/authenticated
-- ni ningun GRANT hacia esos roles: nadie con la clave publica del navegador
-- puede leer ni escribir aca directamente, ni siquiera filas "activas".
-- TODO el acceso -- incluida la lectura publica del cliente cuando abre su
-- enlace -- pasa por la Edge Function "seguimiento", que usa la
-- service_role key solo del lado del servidor y decide a mano que campos
-- exponer (nunca venta_id, nunca nada de dinero).
-- ---------------------------------------------------------------------------
alter table seguimiento_pedidos enable row level security;

-- Sin CREATE POLICY ni GRANT hacia anon/authenticated a proposito: esos
-- roles no pueden tocar esta tabla ni con la clave publica del navegador.
--
-- OJO -- gotcha ya conocido (paso lo mismo con "Clientes web"): crear una
-- tabla por el SQL Editor activa RLS pero NO otorga los permisos base de
-- Postgres a NINGUN rol, ni siquiera a service_role (que "ignora RLS" pero
-- sigue necesitando el GRANT). Sin esto, la Edge Function falla con
-- "permission denied for table seguimiento_pedidos" aunque la clave sea la
-- correcta.
grant select, insert, update, delete on seguimiento_pedidos to service_role;
