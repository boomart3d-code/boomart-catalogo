-- Registro público de clientes y bandeja privada BoomArt.
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.customer_profile_submissions (
  id uuid primary key default gen_random_uuid(),
  draft_ref text not null unique,
  import_code text unique,
  edit_token_hash text not null unique,
  status text not null default 'draft' check (status in ('draft','complete','whatsapp_opened','imported','expired','revoked')),
  full_name text not null default '',
  phone text not null default '',
  document_type text not null default '' check (document_type in ('','dni','ce','pasaporte')),
  document_number text not null default '',
  email text not null default '',
  delivery_method text not null default '' check (delivery_method in ('','indriver','pickup','shalom')),
  local_address text not null default '',
  local_district text not null default '',
  local_reference text not null default '',
  shalom_name text not null default '',
  shalom_address text not null default '',
  shalom_department text not null default '',
  shalom_province text not null default '',
  shalom_district text not null default '',
  consent_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  whatsapp_opened_at timestamptz,
  imported_at timestamptz,
  revoked_at timestamptz,
  imported_by text not null default '',
  version integer not null default 1 check (version > 0)
);
create index if not exists customer_profile_status_updated_idx on public.customer_profile_submissions(status, updated_at desc);
create index if not exists customer_profile_phone_idx on public.customer_profile_submissions(phone);

create table if not exists public.customer_profile_events (
  id bigint generated always as identity primary key,
  submission_id uuid not null references public.customer_profile_submissions(id) on delete cascade,
  event_type text not null,
  actor text not null check (actor in ('customer','studio','admin','system')),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists customer_profile_events_submission_idx on public.customer_profile_events(submission_id, id);

alter table public.customer_profile_submissions enable row level security;
alter table public.customer_profile_submissions force row level security;
alter table public.customer_profile_events enable row level security;
alter table public.customer_profile_events force row level security;
revoke all on public.customer_profile_submissions, public.customer_profile_events from public, anon, authenticated;
grant select, insert, update, delete on public.customer_profile_submissions, public.customer_profile_events to service_role;
grant usage, select on sequence public.customer_profile_events_id_seq to service_role;

create or replace function public._customer_random_code(p_prefix text, p_chars integer)
returns text language sql volatile set search_path = '' as $$
  select p_prefix || upper(substr(translate(encode(extensions.gen_random_bytes(12), 'hex'), '01', 'XY'), 1, p_chars));
$$;
revoke all on function public._customer_random_code(text, integer) from public, anon, authenticated;

create or replace function public.registro_cliente_guardar(p_token text, p_data jsonb, p_complete boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v public.customer_profile_submissions%rowtype;
  v_hash text;
  v_phone text := regexp_replace(coalesce(p_data->>'phone',''), '[^0-9]+', '', 'g');
  v_doc_type text := lower(trim(coalesce(p_data->>'document_type','')));
  v_delivery text := lower(trim(coalesce(p_data->>'delivery_method','')));
  v_code text;
begin
  if p_token is null or length(p_token) < 32 or jsonb_typeof(p_data) <> 'object' then
    raise exception 'Registro no válido' using errcode = '22023';
  end if;
  if coalesce((p_data->>'consent')::boolean, false) is not true then
    raise exception 'Debes aceptar el uso de tus datos para registrar el pedido' using errcode = '22023';
  end if;
  if length(v_phone) < 9 or length(v_phone) > 15 then
    raise exception 'Ingresa un teléfono válido' using errcode = '22023';
  end if;
  if v_doc_type not in ('','dni','ce','pasaporte') or v_delivery not in ('','indriver','pickup','shalom') then
    raise exception 'Datos no válidos' using errcode = '22023';
  end if;
  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');
  select * into v from public.customer_profile_submissions where edit_token_hash = v_hash for update;
  if not found then
    loop
      begin
        insert into public.customer_profile_submissions(draft_ref, edit_token_hash, consent_at)
        values (public._customer_random_code('BOR-', 6), v_hash, now()) returning * into v;
        exit;
      exception when unique_violation then null;
      end;
    end loop;
    insert into public.customer_profile_events(submission_id,event_type,actor) values(v.id,'started','customer');
  elsif v.status in ('imported','expired','revoked') then
    raise exception 'Este registro ya no se puede modificar' using errcode = '22023';
  end if;

  update public.customer_profile_submissions set
    full_name=left(trim(coalesce(p_data->>'full_name','')),160), phone=v_phone,
    document_type=v_doc_type, document_number=left(trim(coalesce(p_data->>'document_number','')),30),
    email=left(lower(trim(coalesce(p_data->>'email',''))),180), delivery_method=v_delivery,
    local_address=left(trim(coalesce(p_data->>'local_address','')),300),
    local_district=left(trim(coalesce(p_data->>'local_district','')),100),
    local_reference=left(trim(coalesce(p_data->>'local_reference','')),200),
    shalom_name=left(trim(coalesce(p_data->>'shalom_name','')),180),
    shalom_address=left(trim(coalesce(p_data->>'shalom_address','')),300),
    shalom_department=left(trim(coalesce(p_data->>'shalom_department','')),100),
    shalom_province=left(trim(coalesce(p_data->>'shalom_province','')),100),
    shalom_district=left(trim(coalesce(p_data->>'shalom_district','')),100),
    updated_at=now(), version=version+1
  where id=v.id returning * into v;

  if p_complete then
    if length(v.full_name) < 3 or v.email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
       or v.document_type = '' or length(v.document_number) < 5 or v.delivery_method = ''
       or (v.delivery_method='indriver' and (v.local_address='' or v.local_district=''))
       or (v.delivery_method='shalom' and (v.shalom_name='' or v.shalom_address='')) then
      raise exception 'Completa todos los campos obligatorios' using errcode = '22023';
    end if;
    if v.document_type='dni' and v.document_number !~ '^[0-9]{8}$' then
      raise exception 'El DNI debe tener 8 dígitos' using errcode = '22023';
    end if;
    if v.import_code is null then
      loop
        begin
          v_code := public._customer_random_code('BA-',4) || '-' || public._customer_random_code('',4);
          update public.customer_profile_submissions set import_code=v_code,status='complete',completed_at=now(),updated_at=now()
          where id=v.id returning * into v;
          exit;
        exception when unique_violation then null;
        end;
      end loop;
      insert into public.customer_profile_events(submission_id,event_type,actor) values(v.id,'completed','customer');
    end if;
  else
    insert into public.customer_profile_events(submission_id,event_type,actor) values(v.id,'draft_saved','customer');
  end if;
  return jsonb_build_object('draft_ref',v.draft_ref,'import_code',v.import_code,'status',v.status,'updated_at',v.updated_at);
end;
$$;
revoke all on function public.registro_cliente_guardar(text,jsonb,boolean) from public;
grant execute on function public.registro_cliente_guardar(text,jsonb,boolean) to anon, authenticated;

create or replace function public.registro_cliente_whatsapp(p_token text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  update public.customer_profile_submissions set status='whatsapp_opened',whatsapp_opened_at=coalesce(whatsapp_opened_at,now()),updated_at=now()
  where edit_token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and status in ('complete','whatsapp_opened') returning id into v_id;
  if v_id is null then return false; end if;
  insert into public.customer_profile_events(submission_id,event_type,actor) values(v_id,'whatsapp_opened','customer');
  return true;
end;
$$;
revoke all on function public.registro_cliente_whatsapp(text) from public;
grant execute on function public.registro_cliente_whatsapp(text) to anon, authenticated;

create or replace function public.registro_clientes_admin(p_status text default '', p_query text default '', p_limit integer default 100)
returns table(id uuid,draft_ref text,import_code text,status text,full_name text,phone text,document_type text,document_number text,email text,
 delivery_method text,local_address text,local_district text,local_reference text,shalom_name text,shalom_address text,
 shalom_department text,shalom_province text,shalom_district text,created_at timestamptz,updated_at timestamptz,completed_at timestamptz,
 whatsapp_opened_at timestamptz,imported_at timestamptz,imported_by text)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.panel_es_admin() then raise exception 'No autorizado' using errcode='42501'; end if;
  return query select s.id,s.draft_ref,s.import_code,s.status,s.full_name,s.phone,s.document_type,s.document_number,s.email,
    s.delivery_method,s.local_address,s.local_district,s.local_reference,s.shalom_name,s.shalom_address,s.shalom_department,
    s.shalom_province,s.shalom_district,s.created_at,s.updated_at,s.completed_at,s.whatsapp_opened_at,s.imported_at,s.imported_by
  from public.customer_profile_submissions s
  where (coalesce(p_status,'')='' or s.status=p_status)
    and (coalesce(trim(p_query),'')='' or concat_ws(' ',s.full_name,s.phone,s.document_number,s.email,s.import_code,s.draft_ref) ilike '%'||trim(p_query)||'%')
  order by s.updated_at desc limit least(greatest(coalesce(p_limit,100),1),250);
end;
$$;
revoke all on function public.registro_clientes_admin(text,text,integer) from public,anon;
grant execute on function public.registro_clientes_admin(text,text,integer) to authenticated;

comment on table public.customer_profile_submissions is 'Formularios genéricos de registro para importar en BoomArt Studio; acceso público solo mediante RPC validada.';
