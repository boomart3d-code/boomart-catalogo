begin;

create table if not exists public.radar_moderators (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table if not exists public.radar_entries (
  id uuid primary key default gen_random_uuid(),
  post_slug text not null check (post_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(post_slug) <= 100),
  author_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  parent_id uuid references public.radar_entries(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 30),
  message text not null check (char_length(message) between 5 and 1200),
  photo_key text unique check (photo_key ~ '^[a-f0-9-]{36}\.jpg$'),
  state text not null default 'pending' check (state in ('pending', 'approved', 'hidden')),
  created_at timestamptz not null default now(),
  unique (author_id, request_id)
);

create index if not exists radar_entries_thread_idx on public.radar_entries (post_slug, state, created_at);
create index if not exists radar_entries_author_idx on public.radar_entries (author_id, created_at);
create index if not exists radar_entries_parent_idx on public.radar_entries (parent_id);

create table if not exists public.radar_ratings (
  post_slug text not null check (post_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(post_slug) <= 100),
  author_id uuid not null references auth.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  primary key (post_slug, author_id)
);

create table if not exists public.radar_reports (
  entry_id uuid not null references public.radar_entries(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('respeto', 'privacidad', 'derechos', 'spam', 'otro')),
  resolved_at timestamptz,
  primary key (entry_id, reporter_id)
);

create table if not exists public.radar_photo_tickets (
  photo_key text primary key,
  author_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists radar_photo_tickets_author_idx on public.radar_photo_tickets (author_id, created_at);
alter table public.radar_photo_tickets enable row level security;
revoke all on public.radar_photo_tickets from public, anon, authenticated;

alter table public.radar_moderators enable row level security;
alter table public.radar_entries enable row level security;
alter table public.radar_ratings enable row level security;
alter table public.radar_reports enable row level security;

revoke all on public.radar_moderators, public.radar_entries, public.radar_ratings, public.radar_reports
  from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('radar-fotos', 'radar-fotos', false, 2500000, array['image/jpeg'])
on conflict (id) do nothing;

create or replace function public.radar_is_moderator()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.radar_moderators where user_id = auth.uid());
$$;

create or replace function public.radar_may_read_photo(p_key text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.radar_is_moderator() or exists (
    select 1 from public.radar_entries e
    left join public.radar_entries p on p.id = e.parent_id
    where e.photo_key = p_key and e.state = 'approved'
      and (e.parent_id is null or p.state = 'approved')
  );
$$;

create or replace function public.radar_reserve_photo(p_request uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  key text := p_request::text || '.jpg';
begin
  if caller is null or p_request is null then raise exception 'radar_auth_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(caller::text, 6527));
  if exists (select 1 from public.radar_photo_tickets where photo_key = key and author_id = caller) then return; end if;
  if (select count(*) from public.radar_photo_tickets where author_id = caller and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'radar_slow_down';
  end if;
  insert into public.radar_photo_tickets (photo_key, author_id) values (key, caller);
end;
$$;

create or replace function public.radar_may_upload_photo(p_key text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.radar_photo_tickets
    where photo_key = p_key and author_id = auth.uid() and created_at > now() - interval '1 hour');
$$;

revoke all on function public.radar_reserve_photo(uuid), public.radar_may_upload_photo(text) from public, anon, authenticated;
grant execute on function public.radar_reserve_photo(uuid), public.radar_may_upload_photo(text) to authenticated;

drop policy if exists radar_upload_insert on storage.objects;
create policy radar_upload_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'radar-fotos' and owner_id = (select auth.uid())::text
    and public.radar_may_upload_photo(name));

drop policy if exists radar_upload_read on storage.objects;
create policy radar_upload_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'radar-fotos' and (
    owner_id = (select auth.uid())::text or public.radar_may_read_photo(name)
  ));

create or replace function public.radar_discussion(p_slug text)
returns jsonb language sql stable security definer set search_path = ''
as $$
  with visible as (
    select e.id, e.parent_id, e.display_name, e.message, e.photo_key, e.created_at
    from public.radar_entries e
    left join public.radar_entries p on p.id = e.parent_id
    where e.post_slug = p_slug and e.state = 'approved'
      and (e.parent_id is null or p.state = 'approved')
    order by e.created_at desc, e.id desc
    limit 150
  )
  select jsonb_build_object(
    'entries', coalesce((select jsonb_agg(to_jsonb(v) order by v.created_at, v.id) from visible v), '[]'::jsonb),
    'votes', (select count(*) from public.radar_ratings where post_slug = p_slug),
    'average', (select round(avg(rating), 1) from public.radar_ratings where post_slug = p_slug),
    'my_rating', (select rating from public.radar_ratings where post_slug = p_slug and author_id = auth.uid())
  );
$$;

create or replace function public.radar_submit_entry(
  p_slug text, p_alias text, p_message text, p_request uuid, p_parent uuid default null, p_photo text default null
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  entry uuid;
begin
  if caller is null or p_request is null then raise exception 'radar_auth_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(caller::text, 6527));
  select id into entry from public.radar_entries where author_id = caller and request_id = p_request;
  if found then return entry; end if;
  if (select count(*) from public.radar_entries where author_id = caller and created_at > now() - interval '10 minutes') >= 8 then
    raise exception 'radar_slow_down';
  end if;
  if p_parent is not null and not exists (
    select 1 from public.radar_entries
    where id = p_parent and post_slug = p_slug and state = 'approved' and parent_id is null
  ) then raise exception 'radar_invalid_parent'; end if;
  if p_photo is not null and (p_photo <> (p_request::text || '.jpg') or not exists (
    select 1 from storage.objects where bucket_id = 'radar-fotos' and name = p_photo and owner_id = caller::text
  )) then raise exception 'radar_invalid_photo'; end if;
  insert into public.radar_entries (post_slug, author_id, request_id, parent_id, display_name, message, photo_key)
  values (p_slug, caller, p_request, p_parent, btrim(p_alias), btrim(p_message), p_photo)
  returning id into entry;
  return entry;
end;
$$;

create or replace function public.radar_rate(p_slug text, p_rating smallint)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'radar_auth_required'; end if;
  insert into public.radar_ratings (post_slug, author_id, rating)
  values (p_slug, auth.uid(), p_rating)
  on conflict (post_slug, author_id) do update set rating = excluded.rating;
end;
$$;

create or replace function public.radar_report(p_entry uuid, p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'radar_auth_required'; end if;
  if not exists (
    select 1 from public.radar_entries e
    left join public.radar_entries p on p.id = e.parent_id
    where e.id = p_entry and e.state = 'approved' and (e.parent_id is null or p.state = 'approved')
  ) then raise exception 'radar_entry_unavailable'; end if;
  insert into public.radar_reports (entry_id, reporter_id, reason)
  values (p_entry, auth.uid(), p_reason)
  on conflict (entry_id, reporter_id) do nothing;
end;
$$;

create or replace function public.radar_moderation_queue()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.radar_is_moderator() then raise exception 'radar_forbidden'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(queue) order by queue.created_at, queue.id)
    from (
      select e.id, e.post_slug, e.display_name, e.message, e.photo_key, e.created_at, e.state,
        array(select r.reason from public.radar_reports r where r.entry_id = e.id and r.resolved_at is null) as reports
      from public.radar_entries e
      where e.state = 'pending' or (e.state = 'approved' and exists (
        select 1 from public.radar_reports r where r.entry_id = e.id and r.resolved_at is null
      ))
      order by e.created_at, e.id
      limit 100
    ) queue
  ), '[]'::jsonb);
end;
$$;

create or replace function public.radar_moderate(p_entry uuid, p_state text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.radar_is_moderator() then raise exception 'radar_forbidden'; end if;
  if p_state is null or p_state not in ('approved', 'hidden') then raise exception 'radar_invalid_state'; end if;
  update public.radar_entries set state = p_state
    where id = p_entry and state in ('pending', 'approved');
  if not found then raise exception 'radar_entry_unavailable'; end if;
  update public.radar_reports set resolved_at = now() where entry_id = p_entry and resolved_at is null;
end;
$$;

revoke all on function public.radar_is_moderator(), public.radar_may_read_photo(text),
  public.radar_discussion(text), public.radar_submit_entry(text, text, text, uuid, uuid, text),
  public.radar_rate(text, smallint), public.radar_report(uuid, text),
  public.radar_moderation_queue(), public.radar_moderate(uuid, text) from public, anon, authenticated;

grant execute on function public.radar_discussion(text), public.radar_may_read_photo(text) to anon, authenticated;
grant execute on function public.radar_is_moderator(), public.radar_submit_entry(text, text, text, uuid, uuid, text),
  public.radar_rate(text, smallint), public.radar_report(uuid, text),
  public.radar_moderation_queue(), public.radar_moderate(uuid, text) to authenticated;

commit;
