begin;
-- Únicamente se llama al emitir códigos futuros; no modifica filas existentes.
create or replace function public._customer_import_code_short()
returns text language plpgsql volatile set search_path='' as $$
declare v_code text; v_random bytea; intento integer;
begin
  -- Serializa asignaciones concurrentes; la restricción UNIQUE sigue vigente.
  perform pg_advisory_xact_lock(hashtextextended('boomart:customer-short-code',0));
  for intento in 1..100 loop
    v_random := extensions.gen_random_bytes(5);
    select 'BA-' || string_agg((get_byte(v_random,i)%10)::text,'' order by i)
      into v_code from generate_series(0,4) i;
    if not exists(select 1 from public.customer_profile_submissions where import_code=v_code) then
      return v_code;
    end if;
  end loop;
  raise exception 'No se pudo generar el código. Intenta nuevamente.' using errcode='22023';
end;
$$;
revoke all on function public._customer_import_code_short() from public,anon,authenticated;

-- Conserva completas las validaciones vigentes de ambos formularios. Solo cambia
-- la expresión que genera un código nuevo; si no coincide, aborta sin aplicar.
do $$
declare firma text; definicion text; nueva text;
  patron text := $rx$public\._customer_random_code\('BA-',\s*4\)\s*\|\|\s*'-'\s*\|\|\s*public\._customer_random_code\('',\s*4\)$rx$;
begin
  foreach firma in array array['public.registro_cliente_guardar(text,jsonb,boolean)',
    'public._registro_web_nueva_solicitud(public.clientes_web)'] loop
    definicion := pg_get_functiondef(firma::regprocedure);
    nueva := regexp_replace(definicion,patron,'public._customer_import_code_short()','g');
    if nueva=definicion and position('public._customer_import_code_short()' in definicion)=0 then
      raise exception 'Generador no reconocido: %',firma;
    end if;
    if nueva<>definicion then execute nueva; end if;
  end loop;
end;
$$;
commit;
