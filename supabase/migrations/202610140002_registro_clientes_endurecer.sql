-- Registro público de clientes: endurecimiento (revisión del 14/10/2026).
--
--  * Teléfono: se normaliza a 9 dígitos ("+51 987 654 321" -> 987654321), igual que Studio.
--  * Validación de documento y correo IGUAL a la de BoomArt Studio (DNI 8 dígitos; carné
--    9-12; pasaporte 6-12; correo con dominio de 2+ letras) y Shalom con departamento,
--    provincia, agencia y dirección: ya no se emite un código que Studio luego rechaza.
--  * Un registro ya COMPLETO no se puede degradar con un autoguardado parcial (antes una
--    recarga con solo el teléfono dejaba nombre/correo vacíos con el código aún válido).
--    Una corrección completa y válida sí se acepta.
--  * Topes contra abuso: máx. 300 registros nuevos por hora (global) y 400 guardados por
--    registro; el evento "draft_saved" se anota como máximo cada 5 minutos.
--  * Limpieza automática diaria (pg_cron): borradores 7 días sin actividad; completos sin
--    importar 30 días -> "expired" y se borran los datos personales; importados 90 días;
--    vencidos/revocados 90 días.
--  * Portal: revocar un registro con motivo (queda en el historial).
--  * Studio: marcar como importado en una sola operación atómica, con historial.

create index if not exists customer_profile_created_idx on public.customer_profile_submissions(created_at);

create or replace function public._registro_cliente_telefono(p text)
returns text language sql immutable set search_path = '' as $$
  select case
    when d like '0051%' and length(d) = 13 then substr(d, 5)
    when d like '51%'   and length(d) = 11 then substr(d, 3)
    else d
  end
  from (select regexp_replace(coalesce(p, ''), '[^0-9]+', '', 'g') as d) x;
$$;
revoke all on function public._registro_cliente_telefono(text) from public, anon, authenticated;

-- Devuelve el primer problema encontrado (texto para el cliente) o NULL si el registro está completo.
create or replace function public._registro_cliente_error(
  p_name text, p_phone text, p_doc_type text, p_doc_number text, p_email text, p_delivery text,
  p_local_address text, p_local_district text,
  p_shalom_name text, p_shalom_address text, p_shalom_department text, p_shalom_province text
) returns text language plpgsql immutable set search_path = '' as $$
declare
  v_doc text := regexp_replace(coalesce(p_doc_number, ''), '[^A-Za-z0-9]', '', 'g');
begin
  if length(trim(coalesce(p_name, ''))) < 3 then return 'Ingresa tu nombre completo'; end if;
  if length(coalesce(p_phone, '')) < 9 or length(p_phone) > 15 then return 'Ingresa un teléfono válido'; end if;
  if coalesce(p_email, '') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$' then return 'Ingresa un correo válido'; end if;
  if p_doc_type = 'dni' then
    if coalesce(p_doc_number, '') !~ '^[0-9]{8}$' then return 'El DNI debe tener 8 dígitos'; end if;
  elsif p_doc_type = 'ce' then
    if length(v_doc) not between 9 and 12 then return 'El carné de extranjería debe tener entre 9 y 12 caracteres'; end if;
  elsif p_doc_type = 'pasaporte' then
    if length(v_doc) not between 6 and 12 then return 'El pasaporte debe tener entre 6 y 12 caracteres'; end if;
  else
    return 'Elige el tipo de documento';
  end if;
  if coalesce(p_delivery, '') = '' then return 'Elige cómo recibirás tu pedido'; end if;
  if p_delivery = 'indriver' and (coalesce(p_local_address, '') = '' or coalesce(p_local_district, '') = '') then
    return 'Escribe tu distrito y tu dirección completa';
  end if;
  if p_delivery = 'shalom' and (coalesce(p_shalom_name, '') = '' or coalesce(p_shalom_address, '') = ''
       or coalesce(p_shalom_department, '') = '' or coalesce(p_shalom_province, '') = '') then
    return 'Elige tu agencia Shalom de la lista';
  end if;
  return null;
end;
$$;
revoke all on function public._registro_cliente_error(text,text,text,text,text,text,text,text,text,text,text,text) from public, anon, authenticated;

create or replace function public.registro_cliente_guardar(p_token text, p_data jsonb, p_complete boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v public.customer_profile_submissions%rowtype;
  v_hash text;
  v_name text; v_phone text; v_doc_type text; v_doc text; v_email text; v_delivery text;
  v_laddr text; v_ldist text; v_lref text;
  v_sname text; v_saddr text; v_sdep text; v_sprov text; v_sdist text;
  v_err text;
  v_code text;
  v_keep boolean := false;
begin
  if p_token is null or length(p_token) < 32 or length(p_token) > 128 or jsonb_typeof(p_data) is distinct from 'object' then
    raise exception 'Registro no válido' using errcode = '22023';
  end if;
  if coalesce(p_data -> 'consent' = 'true'::jsonb, false) is not true then
    raise exception 'Debes aceptar el uso de tus datos para registrar el pedido' using errcode = '22023';
  end if;

  v_phone := public._registro_cliente_telefono(p_data ->> 'phone');
  v_doc_type := lower(trim(coalesce(p_data ->> 'document_type', '')));
  v_delivery := lower(trim(coalesce(p_data ->> 'delivery_method', '')));
  if length(v_phone) < 9 or length(v_phone) > 15 then
    raise exception 'Ingresa un teléfono válido' using errcode = '22023';
  end if;
  if v_doc_type not in ('', 'dni', 'ce', 'pasaporte') or v_delivery not in ('', 'indriver', 'pickup', 'shalom') then
    raise exception 'Datos no válidos' using errcode = '22023';
  end if;

  v_name  := left(trim(coalesce(p_data ->> 'full_name', '')), 160);
  v_doc   := left(case when v_doc_type = 'dni'
                       then regexp_replace(coalesce(p_data ->> 'document_number', ''), '[^0-9]', '', 'g')
                       else upper(regexp_replace(coalesce(p_data ->> 'document_number', ''), '[^A-Za-z0-9]', '', 'g')) end, 30);
  v_email := left(lower(trim(coalesce(p_data ->> 'email', ''))), 180);
  v_laddr := left(trim(coalesce(p_data ->> 'local_address', '')), 300);
  v_ldist := left(trim(coalesce(p_data ->> 'local_district', '')), 100);
  v_lref  := left(trim(coalesce(p_data ->> 'local_reference', '')), 200);
  v_sname := left(trim(coalesce(p_data ->> 'shalom_name', '')), 180);
  v_saddr := left(trim(coalesce(p_data ->> 'shalom_address', '')), 300);
  v_sdep  := left(trim(coalesce(p_data ->> 'shalom_department', '')), 100);
  v_sprov := left(trim(coalesce(p_data ->> 'shalom_province', '')), 100);
  v_sdist := left(trim(coalesce(p_data ->> 'shalom_district', '')), 100);

  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');
  select * into v from public.customer_profile_submissions where edit_token_hash = v_hash for update;
  if not found then
    if (select count(*) from public.customer_profile_submissions where created_at > now() - interval '1 hour') >= 300 then
      raise exception 'Hay muchas solicitudes en este momento. Intenta de nuevo en unos minutos.' using errcode = '22023';
    end if;
    loop
      begin
        insert into public.customer_profile_submissions(draft_ref, edit_token_hash, consent_at)
        values (public._customer_random_code('BOR-', 6), v_hash, now()) returning * into v;
        exit;
      exception when unique_violation then null;
      end;
    end loop;
    insert into public.customer_profile_events(submission_id, event_type, actor) values (v.id, 'started', 'customer');
  elsif v.status in ('imported', 'expired', 'revoked') then
    raise exception 'Este registro ya no se puede modificar' using errcode = '22023';
  elsif v.version >= 400 then
    raise exception 'Este registro recibió demasiados cambios. Recarga la página e intenta de nuevo.' using errcode = '22023';
  end if;

  v_err := public._registro_cliente_error(v_name, v_phone, v_doc_type, v_doc, v_email, v_delivery,
                                          v_laddr, v_ldist, v_sname, v_saddr, v_sdep, v_sprov);
  if p_complete and v_err is not null then
    raise exception '%', v_err using errcode = '22023';
  end if;
  -- Un registro ya completo solo se reemplaza por datos que también sean completos y válidos.
  if v.status in ('complete', 'whatsapp_opened') and v_err is not null then
    v_keep := true;
  end if;

  if not v_keep then
    update public.customer_profile_submissions set
      full_name = v_name, phone = v_phone, document_type = v_doc_type, document_number = v_doc,
      email = v_email, delivery_method = v_delivery,
      local_address = v_laddr, local_district = v_ldist, local_reference = v_lref,
      shalom_name = v_sname, shalom_address = v_saddr, shalom_department = v_sdep,
      shalom_province = v_sprov, shalom_district = v_sdist,
      updated_at = now(), version = version + 1
    where id = v.id returning * into v;
  end if;

  if p_complete then
    if v.import_code is null then
      loop
        begin
          v_code := public._customer_random_code('BA-', 4) || '-' || public._customer_random_code('', 4);
          update public.customer_profile_submissions
             set import_code = v_code, status = 'complete', completed_at = now(), updated_at = now()
           where id = v.id returning * into v;
          exit;
        exception when unique_violation then null;
        end;
      end loop;
      insert into public.customer_profile_events(submission_id, event_type, actor) values (v.id, 'completed', 'customer');
    end if;
  elsif not v_keep then
    if not exists (select 1 from public.customer_profile_events
                    where submission_id = v.id and event_type = 'draft_saved' and created_at > now() - interval '5 minutes') then
      insert into public.customer_profile_events(submission_id, event_type, actor) values (v.id, 'draft_saved', 'customer');
    end if;
  end if;

  return jsonb_build_object('draft_ref', v.draft_ref, 'import_code', v.import_code, 'status', v.status,
                            'updated_at', v.updated_at, 'kept', v_keep);
end;
$$;
revoke all on function public.registro_cliente_guardar(text, jsonb, boolean) from public;
grant execute on function public.registro_cliente_guardar(text, jsonb, boolean) to anon, authenticated;

-- Portal: revocar un registro (anula el código). Solo la cuenta administradora.
create or replace function public.registro_cliente_revocar(p_id uuid, p_motivo text default '')
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.panel_es_admin() then raise exception 'No autorizado' using errcode = '42501'; end if;
  update public.customer_profile_submissions
     set status = 'revoked', revoked_at = now(), updated_at = now()
   where id = p_id and status in ('draft', 'complete', 'whatsapp_opened')
   returning id into v_id;
  if v_id is null then return false; end if;
  insert into public.customer_profile_events(submission_id, event_type, actor, detail)
  values (v_id, 'revoked', 'admin', jsonb_build_object('motivo', left(coalesce(p_motivo, ''), 200)));
  return true;
end;
$$;
revoke all on function public.registro_cliente_revocar(uuid, text) from public, anon;
grant execute on function public.registro_cliente_revocar(uuid, text) to authenticated;

-- Studio (clave de servicio): marcar el registro como importado, una sola vez y con historial.
create or replace function public.registro_cliente_marcar_importado(p_id uuid, p_by text default 'BoomArt Studio')
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  update public.customer_profile_submissions
     set status = 'imported', imported_at = now(), updated_at = now(),
         imported_by = left(coalesce(nullif(trim(p_by), ''), 'BoomArt Studio'), 60)
   where id = p_id and status in ('complete', 'whatsapp_opened')
   returning id into v_id;
  if v_id is null then return false; end if;
  insert into public.customer_profile_events(submission_id, event_type, actor)
  values (v_id, 'imported', 'studio');
  return true;
end;
$$;
revoke all on function public.registro_cliente_marcar_importado(uuid, text) from public, anon, authenticated;
grant execute on function public.registro_cliente_marcar_importado(uuid, text) to service_role;

-- Limpieza por plazos de conservación (la corre pg_cron cada día).
create or replace function public.registro_clientes_depurar()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare n_borradores int; n_vencidos int; n_importados int; n_antiguos int;
begin
  delete from public.customer_profile_submissions
   where status = 'draft' and updated_at < now() - interval '7 days';
  get diagnostics n_borradores = row_count;

  update public.customer_profile_submissions
     set status = 'expired', updated_at = now(),
         full_name = '', phone = '', document_type = '', document_number = '', email = '', delivery_method = '',
         local_address = '', local_district = '', local_reference = '',
         shalom_name = '', shalom_address = '', shalom_department = '', shalom_province = '', shalom_district = ''
   where status in ('complete', 'whatsapp_opened') and coalesce(completed_at, updated_at) < now() - interval '30 days';
  get diagnostics n_vencidos = row_count;

  delete from public.customer_profile_submissions
   where status = 'imported' and coalesce(imported_at, updated_at) < now() - interval '90 days';
  get diagnostics n_importados = row_count;

  delete from public.customer_profile_submissions
   where status in ('expired', 'revoked') and updated_at < now() - interval '90 days';
  get diagnostics n_antiguos = row_count;

  return jsonb_build_object('borradores_borrados', n_borradores, 'vencidos', n_vencidos,
                            'importados_borrados', n_importados, 'antiguos_borrados', n_antiguos);
end;
$$;
revoke all on function public.registro_clientes_depurar() from public, anon, authenticated;
grant execute on function public.registro_clientes_depurar() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'registro-clientes-depurar';
    perform cron.schedule('registro-clientes-depurar', '17 8 * * *', 'select public.registro_clientes_depurar();');
  end if;
end $$;
