-- Ejecutar solo en una base descartable con Auth y Storage de Supabase.
begin;

insert into auth.users (id, email)
values ('00000000-0000-4000-8000-000000000011', 'lector@radar.test'),
       ('00000000-0000-4000-8000-000000000022', 'moderacion@radar.test'),
       ('00000000-0000-4000-8000-000000000033', 'otro@radar.test');

insert into public.radar_moderators (user_id)
values ('00000000-0000-4000-8000-000000000022');

create function pg_temp.check_radar(result boolean, expectation text)
returns void language plpgsql as $$
begin
  if result is distinct from true then raise exception 'Falla: %', expectation; end if;
end;
$$;

set local role anon;
select pg_temp.check_radar(jsonb_array_length(public.radar_discussion('nota-prueba')->'entries') = 0, 'lectura anónima');
select pg_temp.check_radar(not has_table_privilege(current_user, 'public.radar_entries', 'select'), 'sin acceso a autores');
select pg_temp.check_radar(not has_table_privilege(current_user, 'public.radar_likes', 'select'), 'sin acceso a quienes reaccionan');
select pg_temp.check_radar(not has_function_privilege(current_user, 'public.radar_set_like(text,boolean)', 'execute'), 'Me gusta requiere sesión');
select pg_temp.check_radar(not has_function_privilege(current_user, 'public.radar_submit_entry(text,text,text,uuid,uuid,text)', 'execute'), 'no hay escritura anónima');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000011';

do $$
begin
  perform public.radar_moderation_queue();
  raise exception 'se permitió abrir la bandeja';
exception when raise_exception then
  if sqlerrm <> 'radar_forbidden' then raise; end if;
end;
$$;

select public.radar_reserve_photo('00000000-0000-4000-8000-000000000044');
select pg_temp.check_radar(public.radar_may_upload_photo('00000000-0000-4000-8000-000000000044.jpg'), 'reserva de foto propia');
select pg_temp.check_radar(not public.radar_may_upload_photo('00000000-0000-4000-8000-000000000045.jpg'), 'bloqueo de foto libre');

-- La API de Storage registra el owner_id a partir de su JWT verificado.
reset role;
insert into storage.objects (bucket_id, name, owner_id)
values ('radar-fotos', '00000000-0000-4000-8000-000000000044.jpg', '00000000-0000-4000-8000-000000000011');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000033';
select pg_temp.check_radar(not public.radar_may_upload_photo('00000000-0000-4000-8000-000000000044.jpg'), 'bloqueo de reserva ajena');
do $$
begin
  perform public.radar_submit_entry('nota-prueba', 'Falsa', 'Esta foto no es mía',
    '00000000-0000-4000-8000-000000000044', null, '00000000-0000-4000-8000-000000000044.jpg');
  raise exception 'se vinculó una foto ajena';
exception when raise_exception then
  if sqlerrm <> 'radar_invalid_photo' then raise; end if;
end;
$$;

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000011';
select set_config('radar.test.entry', public.radar_submit_entry('nota-prueba', 'Fénix', 'Así armé mi diorama.',
  '00000000-0000-4000-8000-000000000044', null, '00000000-0000-4000-8000-000000000044.jpg')::text, true);
select pg_temp.check_radar(
  public.radar_submit_entry('nota-prueba', 'Fénix', 'Así armé mi diorama.',
    '00000000-0000-4000-8000-000000000044', null, '00000000-0000-4000-8000-000000000044.jpg')
  = current_setting('radar.test.entry')::uuid, 'reintentar devuelve el mismo aporte');
select public.radar_set_like('nota-prueba', true);
select public.radar_set_like('nota-prueba', true);
select pg_temp.check_radar(
  public.radar_discussion('nota-prueba')->>'likes' = '1' and
  public.radar_discussion('nota-prueba')->>'my_like' = 'true', 'Me gusta idempotente por lector y nota');
select public.radar_set_like('nota-prueba', false);
select public.radar_set_like('nota-prueba', false);
select pg_temp.check_radar(
  public.radar_discussion('nota-prueba')->>'likes' = '0' and
  public.radar_discussion('nota-prueba')->>'my_like' = 'false', 'Me gusta se puede retirar');
select public.radar_set_like('nota-prueba', true);
select public.radar_rate('nota-prueba', 5::smallint);
select public.radar_rate('nota-prueba', 4::smallint);
select pg_temp.check_radar(public.radar_discussion('nota-prueba')->>'votes' = '1' and
  public.radar_discussion('nota-prueba')->>'my_rating' = '4', 'se conserva un voto editable por persona');

reset role;
set local role anon;
set local request.jwt.claim.sub = '';
select pg_temp.check_radar(jsonb_array_length(public.radar_discussion('nota-prueba')->'entries') = 0, 'pendiente no público');
select pg_temp.check_radar(
  public.radar_discussion('nota-prueba')->>'likes' = '1' and
  public.radar_discussion('nota-prueba')->>'my_like' = 'false', 'agregado público sin revelar el autor');
select pg_temp.check_radar(public.radar_discussion('otra-nota')->>'likes' = '0', 'cada nota tiene su propio contador');
select pg_temp.check_radar(not public.radar_may_read_photo('00000000-0000-4000-8000-000000000044.jpg'), 'foto pendiente no pública');
select pg_temp.check_radar(not exists(select 1 from storage.objects where bucket_id = 'radar-fotos'), 'Storage aplica la política de lectura');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000022';
select pg_temp.check_radar(jsonb_array_length(public.radar_moderation_queue()) = 1, 'bandeja del moderador');
select public.radar_moderate(current_setting('radar.test.entry')::uuid, 'approved');

reset role;
set local role anon;
set local request.jwt.claim.sub = '';
select pg_temp.check_radar(public.radar_discussion('nota-prueba')->'entries'->0->>'display_name' = 'Fénix', 'aprobado visible por alias');
select pg_temp.check_radar(not ((public.radar_discussion('nota-prueba')->'entries'->0) ? 'author_id'), 'la API no revela UID');
select pg_temp.check_radar(public.radar_may_read_photo('00000000-0000-4000-8000-000000000044.jpg'), 'foto aprobada visible');
select pg_temp.check_radar(exists(select 1 from storage.objects where bucket_id = 'radar-fotos'), 'Storage concede lectura del archivo aprobado');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000033';
do $$
begin
  perform public.radar_submit_entry('otra-nota', 'Dragón', 'Respuesta cruzada',
    '00000000-0000-4000-8000-000000000056', current_setting('radar.test.entry')::uuid, null);
  raise exception 'se permitió una respuesta cruzada';
exception when raise_exception then
  if sqlerrm <> 'radar_invalid_parent' then raise; end if;
end;
$$;
select set_config('radar.test.reply', public.radar_submit_entry('nota-prueba', 'Dragón', 'Buen detalle.',
  '00000000-0000-4000-8000-000000000057', current_setting('radar.test.entry')::uuid, null)::text, true);
select public.radar_report(current_setting('radar.test.entry')::uuid, 'privacidad');

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000022';
select pg_temp.check_radar(jsonb_array_length(public.radar_moderation_queue()) = 2, 'reporte y respuesta en cola');
select public.radar_moderate(current_setting('radar.test.reply')::uuid, 'approved');
select pg_temp.check_radar(jsonb_array_length(public.radar_discussion('nota-prueba')->'entries') = 2, 'respuesta visible');
select public.radar_moderate(current_setting('radar.test.entry')::uuid, 'hidden');

reset role;
set local role anon;
set local request.jwt.claim.sub = '';
select pg_temp.check_radar(jsonb_array_length(public.radar_discussion('nota-prueba')->'entries') = 0, 'ocultar padre retira conversación');
select pg_temp.check_radar(not public.radar_may_read_photo('00000000-0000-4000-8000-000000000044.jpg'), 'ocultar retira acceso a foto');
select 'Radar: pruebas de permisos, moderación, fotos, reportes, respuestas, votos y Me gusta completadas.';

rollback;
