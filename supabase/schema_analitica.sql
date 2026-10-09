-- Medicion propia y anonima de boomart.pe (entrega 1: recoleccion).
--
-- Cada fila es UN evento (visita, producto visto, agregado al carrito, clic en
-- WhatsApp, tiempo activo...). No se guarda nombre, correo, telefono ni IP.
-- Lo unico que identifica a alguien es un codigo aleatorio guardado en su
-- navegador (vid = visitante, sid = sesion), que no sirve para saber quien es.
--
-- Las filas SOLO las escribe la Edge Function `track` (con la service role).
-- RLS esta activada y NO hay politicas: el navegador (anon/authenticated) no
-- puede leer ni escribir esta tabla directamente. La lectura para el panel
-- privado va en la entrega 2, con funciones que comprueban el correo de Adrian.

create table if not exists public.web_eventos (
  id          bigint generated always as identity primary key,
  creado      timestamptz not null default now(),
  vid         text not null,
  sid         text not null,
  pv          text,
  tipo        text not null,
  producto    text,
  boton       text,
  origen      text,
  valor       numeric(10,2),
  cantidad    integer,
  seg         integer,
  scroll      integer,
  extra       jsonb,
  host        text,
  pagina      text,
  landing     text,
  fuente      text,
  medio       text,
  campana     text,
  ref         text,
  dispositivo text,
  tz          text,
  idioma      text,
  humano      boolean not null default false,
  nuevo       boolean not null default false,
  constraint web_eventos_tipo_chk check (tipo in (
    'visita', 'ver_producto', 'filtrar', 'buscar', 'agregar_carrito',
    'abrir_carrito', 'iniciar_compra', 'pedido_whatsapp', 'clic_whatsapp',
    'compartir', 'tiempo'
  ))
);

comment on table public.web_eventos is
  'Eventos anonimos de uso de boomart.pe (visitas, productos vistos, carrito, WhatsApp, tiempo). Solo la Edge Function track escribe; el panel privado lee con funciones que validan el correo del administrador.';

create index if not exists web_eventos_creado_idx on public.web_eventos (creado);
create index if not exists web_eventos_sid_idx on public.web_eventos (sid);
create index if not exists web_eventos_tipo_creado_idx on public.web_eventos (tipo, creado);

alter table public.web_eventos enable row level security;
revoke all on public.web_eventos from anon, authenticated;
-- Las tablas nuevas de este proyecto NO traen permisos automaticos para la
-- service role: sin esta linea la Edge Function `track` recibe "permission denied".
grant select, insert, update, delete on public.web_eventos to service_role;
