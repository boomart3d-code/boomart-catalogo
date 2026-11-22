-- Seguimiento público de pedidos (/seguimiento/): envío por Olva.
--
-- Agrega el método 'olva' y la etapa 'enviado_olva' (paso «Enviado por Olva», equivalente
-- a 'enviado_shalom'). Solo amplía las listas permitidas: no toca filas existentes ni
-- permisos. Se puede aplicar más de una vez.
begin;

alter table public.seguimiento_pedidos drop constraint if exists seguimiento_pedidos_etapa_check;
alter table public.seguimiento_pedidos add constraint seguimiento_pedidos_etapa_check check (etapa in (
  'tomado', 'fabricacion', 'postproduccion', 'pintado', 'empaquetado',
  'listo_envio', 'listo_recojo', 'enviado_shalom', 'enviado_olva', 'cerrado'
));

alter table public.seguimiento_pedidos drop constraint if exists seguimiento_pedidos_metodo_envio_check;
alter table public.seguimiento_pedidos add constraint seguimiento_pedidos_metodo_envio_check
  check (metodo_envio in ('local', 'recojo', 'shalom', 'olva'));

commit;
