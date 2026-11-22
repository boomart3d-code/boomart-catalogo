-- Registro público de clientes (/registro-cliente/): nueva forma de entrega «Envío por Olva».
--
-- Olva es una opción más de envío a provincia. Reutiliza las columnas shalom_* (nombre y
-- dirección de la agencia, departamento, provincia y distrito), igual que BoomArt Studio:
-- con delivery_method = 'olva' esas columnas describen la tienda o agente Olva elegido.
--
-- Solo agrega el valor 'olva'. No toca filas existentes, permisos, ni el registro de la
-- tienda (clientes_web / registro_web_guardar), que sigue con indriver | pickup | shalom.
-- Se puede aplicar más de una vez.
begin;

alter table public.customer_profile_submissions
  drop constraint if exists customer_profile_submissions_delivery_method_check;
alter table public.customer_profile_submissions
  add constraint customer_profile_submissions_delivery_method_check
  check (delivery_method in ('', 'indriver', 'pickup', 'shalom', 'olva'));

-- Conserva completas las funciones vigentes (incluido el generador de códigos cortos de
-- 202610240003): solo cambia las expresiones que nombran la forma de entrega. Si alguna no
-- se reconoce, aborta sin aplicar nada.
do $$
declare
  cambio record;
  definicion text;
  nueva text;
begin
  for cambio in
    select * from (values
      ('public.registro_cliente_guardar(text,jsonb,boolean)',
       $rx$v_delivery\s+not\s+in\s*\(\s*''\s*,\s*'indriver'\s*,\s*'pickup'\s*,\s*'shalom'\s*\)$rx$,
       $new$v_delivery not in ('', 'indriver', 'pickup', 'shalom', 'olva')$new$),
      ('public._registro_cliente_error(text,text,text,text,text,text,text,text,text,text,text,text)',
       $rx$p_delivery\s*=\s*'shalom'\s+and\s*\($rx$,
       $new$p_delivery in ('shalom', 'olva') and ($new$),
      ('public._registro_cliente_error(text,text,text,text,text,text,text,text,text,text,text,text)',
       $rx$return\s+'Elige tu agencia Shalom de la lista'\s*;$rx$,
       $new$return case when p_delivery = 'olva' then 'Elige tu tienda o agente Olva de la lista' else 'Elige tu agencia Shalom de la lista' end;$new$)
    ) as c(firma, patron, reemplazo)
  loop
    definicion := pg_get_functiondef(cambio.firma::regprocedure);
    nueva := regexp_replace(definicion, cambio.patron, cambio.reemplazo, 'g');
    if nueva = definicion and position('''olva''' in definicion) = 0 then
      raise exception 'Regla de entrega no reconocida: %', cambio.firma;
    end if;
    if nueva <> definicion then execute nueva; end if;
  end loop;
end;
$$;

commit;
