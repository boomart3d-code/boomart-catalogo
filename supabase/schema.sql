-- Esquema inicial de Supabase para cuentas de cliente de BoomArt.
-- Fase 0: solo crea las tablas y sus reglas de seguridad. No se conecta
-- todavia a boomart.pe ni a Boomart Studio -- eso son las siguientes fases.
--
-- Como usarlo: pega este archivo completo en el "SQL Editor" de tu proyecto
-- Supabase y dale "Run". Se puede correr mas de una vez sin romper nada
-- (usa "if not exists" / "or replace" donde aplica).

-- ---------------------------------------------------------------------------
-- Clientes
-- Un registro por persona que crea cuenta. Solo nombre y correo son
-- obligatorios (se piden al registrarse); dni y direccion se completan
-- recien cuando el cliente hace su primera compra.
-- ---------------------------------------------------------------------------
create table if not exists clientes (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null,
  apellido text,
  correo text not null unique,
  dni text,
  telefono text,
  -- Direccion de envio: mismo formato que ya usa el checkout de la web
  -- (destino "lima" o "provincias" + los campos de esa opcion).
  destino text check (destino in ('lima', 'provincias')),
  lima_distrito text,
  prov_departamento text,
  prov_provincia text,
  prov_distrito text,
  creado_en timestamptz not null default now()
);

comment on table clientes is 'Cuentas de cliente registradas en boomart.pe. id = mismo id que auth.users.';

-- ---------------------------------------------------------------------------
-- Carritos
-- Snapshot del carrito de un cliente logueado. "items" guarda la misma
-- forma que ya usa el carrito local (productId + variante + cantidad),
-- para poder recalcular precios siempre contra el catalogo vigente.
-- ---------------------------------------------------------------------------
create table if not exists carritos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes (id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  estado text not null default 'activo' check (estado in ('activo', 'completado', 'abandonado')),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

comment on table carritos is 'Historial de carritos por cliente. estado se actualiza cuando compra o cuando se marca abandonado.';

-- ---------------------------------------------------------------------------
-- Recordatorios de carrito abandonado
-- Registra que aviso ya se envio para no repetirlo. La logica de "cuando
-- enviar" (a los X dias, con o sin descuento) se arma en una fase futura;
-- esta tabla solo deja el rastro de lo que ya se mando.
-- ---------------------------------------------------------------------------
create table if not exists recordatorios_carrito (
  id uuid primary key default gen_random_uuid(),
  carrito_id uuid not null references carritos (id) on delete cascade,
  tipo text not null check (tipo in ('recordatorio_1', 'recordatorio_7dias', 'oferta_14dias')),
  codigo_descuento text,
  enviado_en timestamptz not null default now(),
  unique (carrito_id, tipo)
);

comment on table recordatorios_carrito is 'Evita mandar el mismo recordatorio dos veces al mismo carrito.';

-- ---------------------------------------------------------------------------
-- Seguridad (Row Level Security)
-- Sin esto, cualquiera con la anon key podria leer/editar los datos de
-- TODOS los clientes. Con RLS activado, cada cliente logueado solo puede
-- ver y modificar SUS PROPIOS datos. Boomart Studio, mas adelante, usara
-- la service_role key -- esa ignora RLS por diseno, para poder sincronizar.
-- ---------------------------------------------------------------------------
alter table clientes enable row level security;
alter table carritos enable row level security;
alter table recordatorios_carrito enable row level security;

drop policy if exists "cliente ve su propia fila" on clientes;
create policy "cliente ve su propia fila"
  on clientes for select
  using (auth.uid() = id);

drop policy if exists "cliente edita su propia fila" on clientes;
create policy "cliente edita su propia fila"
  on clientes for update
  using (auth.uid() = id);

drop policy if exists "cliente crea su propia fila" on clientes;
create policy "cliente crea su propia fila"
  on clientes for insert
  with check (auth.uid() = id);

drop policy if exists "cliente ve sus propios carritos" on carritos;
create policy "cliente ve sus propios carritos"
  on carritos for select
  using (auth.uid() = cliente_id);

drop policy if exists "cliente gestiona sus propios carritos" on carritos;
create policy "cliente gestiona sus propios carritos"
  on carritos for all
  using (auth.uid() = cliente_id)
  with check (auth.uid() = cliente_id);

-- recordatorios_carrito no tiene politica de cliente: solo el backend
-- (service_role, mas adelante) necesita leerla o escribirla.

-- ---------------------------------------------------------------------------
-- Permisos base (GRANT)
-- IMPORTANTE: RLS solo filtra FILAS, no reemplaza los permisos base de
-- Postgres. Al crear tablas por SQL Editor (a diferencia del editor visual),
-- Supabase no otorga acceso automatico a "anon"/"authenticated" -- sin esto,
-- toda consulta falla con "permission denied for table ..." aunque las
-- politicas de RLS esten bien. recordatorios_carrito NO se otorga aqui a
-- proposito (solo la usara Boomart Studio con la service_role key).
-- ---------------------------------------------------------------------------
grant select, insert, update on clientes to authenticated;
grant select, insert, update, delete on carritos to authenticated;
