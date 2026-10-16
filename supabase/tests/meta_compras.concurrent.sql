-- Ejecutar dos procesos a la vez en la base descartable, tras meta_compras.test.sql.
\set ON_ERROR_STOP on
do $$ begin if current_database() <> 'meta_purchase_test' then raise exception 'Solo base descartable'; end if; end $$;
insert into public.customer_profile_submissions values
  ('11111111-1111-4111-8111-111111111111','complete','demo@example.com','987654321') on conflict do nothing;
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"email":"boomart.3d@gmail.com","sub":"33333333-3333-4333-8333-333333333333"}',true);
select public.meta_compra_confirmar('11111111-1111-4111-8111-111111111111','NV-RACE-001',
  '[{"id":"templo-aries","quantity":1,"item_price":100}]',50,'yape','OP-RACE');
select pg_sleep(2);
commit;
