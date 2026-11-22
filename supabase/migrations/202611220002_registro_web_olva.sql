-- Registro de la tienda (checkout y «Mi cuenta»): forma de entrega «Envío por Olva».
--
-- Complementa 202611220001 (formulario /registro-cliente/). Olva reutiliza las columnas
-- shalom_* de clientes_web para su tienda o agente, igual que en customer_profile_submissions.
-- Solo agrega el valor 'olva'; no toca filas existentes ni permisos. Se puede aplicar más
-- de una vez.
begin;

alter table public.clientes_web
  drop constraint if exists clientes_web_delivery_method_check;
alter table public.clientes_web
  add constraint clientes_web_delivery_method_check
  check (delivery_method in ('', 'indriver', 'pickup', 'shalom', 'olva'));

-- Conserva completa la función vigente: solo cambia las dos expresiones que nombran la
-- forma de entrega. Si alguna no se reconoce, aborta sin aplicar nada.
do $$
declare
  firma constant text := 'public.registro_web_guardar(text,jsonb,text)';
  cambio record;
  definicion text;
  nueva text;
begin
  for cambio in
    select * from (values
      ($rx$v_delivery\s+not\s+in\s*\(\s*''\s*,\s*'indriver'\s*,\s*'pickup'\s*,\s*'shalom'\s*\)$rx$,
       $new$v_delivery not in ('', 'indriver', 'pickup', 'shalom', 'olva')$new$,
       $ya$'shalom', 'olva')$ya$),
      -- Los datos de agencia se conservan con Shalom y con Olva; con otra entrega se vacían.
      ($rx$v_delivery\s*<>\s*'shalom'\s+then\s+v_sname\s*:=$rx$,
       $new$v_delivery not in ('shalom', 'olva') then v_sname :=$new$,
       $ya$v_delivery not in ('shalom', 'olva') then v_sname :=$ya$)
    ) as c(patron, reemplazo, ya_aplicado)
  loop
    definicion := pg_get_functiondef(firma::regprocedure);
    nueva := regexp_replace(definicion, cambio.patron, cambio.reemplazo, 'g');
    if nueva = definicion and position(cambio.ya_aplicado in definicion) = 0 then
      raise exception 'Regla de entrega no reconocida en %: %', firma, cambio.patron;
    end if;
    if nueva <> definicion then execute nueva; end if;
  end loop;
end;
$$;

commit;
