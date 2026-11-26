-- Pruebas de la migración 202611260001_amigo_secreto.sql (Amigo Secreto por correo).
-- Se ejecutan con run-amigo-secreto.sh en una base DESCARTABLE; nunca en producción.
-- Datos inventados (dominio ejemplo.test).
do $$
declare
  s uuid; n int; ok boolean;
begin
  -- 1) Un sorteo con sus participantes se guarda.
  insert into public.amigo_secreto_sorteos (evento, tipo, fecha, presupuesto, modo, organizador_nombre, organizador_email,
    confirmar_hash, confirmar_vence, borrar_en)
  values ('Navidad prueba', 'oficina', '2026-12-23', 50, 'secreto', 'Organiza Prueba', 'organiza@ejemplo.test',
    repeat('a', 64), now() + interval '2 days', now() + interval '30 days')
  returning id into s;
  insert into public.amigo_secreto_participantes (sorteo_id, orden, nombre, email, regala_a, ofertas_hash) values
    (s, 0, 'Ana Prueba', 'ana@ejemplo.test', 1, 'h0'), (s, 1, 'Luis Prueba', 'luis@ejemplo.test', 2, 'h1'),
    (s, 2, 'Carmen Prueba', 'carmen@ejemplo.test', 0, 'h2');
  select count(*) into n from public.amigo_secreto_participantes where sorteo_id = s;
  assert n = 3, 'guarda 3 participantes';

  -- 2) Reglas: nadie se regala a sí mismo; modo y tipo válidos; correo con formato.
  begin
    insert into public.amigo_secreto_participantes (sorteo_id, orden, nombre, email, regala_a, ofertas_hash)
    values (s, 3, 'Jorge Prueba', 'jorge@ejemplo.test', 3, 'h3');
    raise exception 'debió rechazar regalarse a sí mismo';
  exception when check_violation then null; end;
  begin
    insert into public.amigo_secreto_sorteos (evento, modo, organizador_nombre, organizador_email, confirmar_hash, confirmar_vence, borrar_en)
    values ('x', 'publico', 'x', 'x@ejemplo.test', repeat('b', 64), now(), now());
    raise exception 'debió rechazar un modo inválido';
  exception when check_violation then null; end;
  begin
    insert into public.amigo_secreto_sorteos (evento, modo, organizador_nombre, organizador_email, confirmar_hash, confirmar_vence, borrar_en)
    values ('x', 'secreto', 'x', 'sin-arroba', repeat('c', 64), now(), now());
    raise exception 'debió rechazar un correo inválido';
  exception when check_violation then null; end;

  -- 3) Borrar el sorteo borra a sus participantes.
  delete from public.amigo_secreto_sorteos where id = s;
  select count(*) into n from public.amigo_secreto_participantes where sorteo_id = s;
  assert n = 0, 'borra participantes en cascada';

  -- 4) Contactos de marketing: un correo una sola vez.
  insert into public.contactos_marketing (email, nombre, fuente, consentimiento_texto, baja_hash)
  values ('ana@ejemplo.test', 'Ana Prueba', 'amigo_secreto', 'texto aceptado', repeat('d', 64));
  begin
    insert into public.contactos_marketing (email, nombre, fuente, consentimiento_texto, baja_hash)
    values ('ana@ejemplo.test', 'Ana', 'amigo_secreto', 'texto', repeat('e', 64));
    raise exception 'debió rechazar un correo repetido';
  exception when unique_violation then null; end;

  -- 5) Nadie de afuera puede leer ni escribir (anon / authenticated).
  select has_table_privilege('anon', 'public.amigo_secreto_participantes', 'select') into ok;
  assert not ok, 'anon no puede leer participantes';
  select has_table_privilege('anon', 'public.contactos_marketing', 'insert') into ok;
  assert not ok, 'anon no puede escribir contactos';
  select has_table_privilege('authenticated', 'public.amigo_secreto_sorteos', 'select') into ok;
  assert not ok, 'authenticated no puede leer sorteos';
  select relrowsecurity into ok from pg_class where oid = 'public.contactos_marketing'::regclass;
  assert ok, 'RLS activo en contactos_marketing';

  raise notice 'amigo_secreto.test.sql: todas las pruebas pasaron';
end;
$$;
