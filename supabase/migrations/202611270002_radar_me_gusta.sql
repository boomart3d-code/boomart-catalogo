begin;

create table if not exists public.radar_likes (
  post_slug text not null check (post_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(post_slug) <= 100),
  author_id uuid not null references auth.users(id) on delete cascade,
  primary key (post_slug, author_id)
);

alter table public.radar_likes enable row level security;
revoke all on public.radar_likes from public, anon, authenticated;

create or replace function public.radar_set_like(p_slug text, p_liked boolean)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then raise exception 'radar_auth_required'; end if;
  if p_slug is null or p_liked is null then raise exception 'radar_invalid_entry'; end if;
  if p_liked then
    insert into public.radar_likes (post_slug, author_id)
    values (p_slug, caller)
    on conflict (post_slug, author_id) do nothing;
  else
    delete from public.radar_likes where post_slug = p_slug and author_id = caller;
  end if;
end;
$$;

revoke all on function public.radar_set_like(text, boolean) from public, anon, authenticated;
grant execute on function public.radar_set_like(text, boolean) to authenticated;

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
    'my_rating', (select rating from public.radar_ratings where post_slug = p_slug and author_id = auth.uid()),
    'likes', (select count(*) from public.radar_likes where post_slug = p_slug),
    'my_like', exists (select 1 from public.radar_likes where post_slug = p_slug and author_id = auth.uid())
  );
$$;

commit;
