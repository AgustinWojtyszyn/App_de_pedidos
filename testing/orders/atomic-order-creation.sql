-- Run with psql -v ON_ERROR_STOP=1 against an isolated, migrated Supabase DB.
-- Fixtures, schedule overrides and fault-injection triggers are rolled back.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email) values
  ('a7010000-0000-0000-0000-000000000001', 'atomic-test@example.invalid');
insert into public.user_features(user_id, feature, enabled)
values ('a7010000-0000-0000-0000-000000000001', 'dinner', true);
insert into public.order_organizations(id, code, name) values
  ('a7010000-0000-0000-0000-000000000010', 'ATOMIC_TEST', 'Atomic test'),
  ('a7010000-0000-0000-0000-000000000011', 'ATOMIC_RESTRICTED', 'Restricted test');
insert into public.order_locations(id, organization_id, code, slug, display_name) values
  ('a7010000-0000-0000-0000-000000000020', 'a7010000-0000-0000-0000-000000000010', 'ATOMIC_TEST', 'atomic-test', 'Atomic test'),
  ('a7010000-0000-0000-0000-000000000021', 'a7010000-0000-0000-0000-000000000011', 'ATOMIC_RESTRICTED', 'atomic-restricted', 'Restricted test');
insert into public.companies(id, slug, name, visibility, active) values
  ('a7010000-0000-0000-0000-000000000030', 'atomic_private', 'Atomic private', 'admins', true),
  ('a7010000-0000-0000-0000-000000000031', 'atomic_inactive', 'Atomic inactive', 'public', false);
insert into public.order_locations(organization_id, company_id, code, slug, display_name) values
  ('a7010000-0000-0000-0000-000000000010', 'a7010000-0000-0000-0000-000000000030', 'ATOMIC_PRIVATE', 'atomic-private', 'Atomic private'),
  ('a7010000-0000-0000-0000-000000000010', 'a7010000-0000-0000-0000-000000000031', 'ATOMIC_INACTIVE', 'atomic-inactive', 'Atomic inactive');
insert into public.authorized_order_contacts(email, full_name, organization_id)
values ('someone-else@example.invalid', 'Another user', 'a7010000-0000-0000-0000-000000000011');
update public.order_schedule_flows set opens_at = '00:00', closes_at = '23:59:59.999999';
select set_config('request.jwt.claims', '{"sub":"a7010000-0000-0000-0000-000000000001","email":"atomic-test@example.invalid","role":"authenticated"}', true);

create function pg_temp.payload(p_service text, p_case text, p_days integer default 1)
returns jsonb language sql as $$
  select jsonb_build_object(
    'user_id', 'a7010000-0000-0000-0000-000000000001',
    'idempotency_key', 'atomic-test-' || p_case || '-' || p_service,
    'service', p_service, 'location', 'Atomic test',
    'delivery_date', (now() at time zone 'America/Argentina/San_Juan')::date + p_days,
    'items', '[{"id":"meal","name":"Comida","quantity":7}]'::jsonb,
    'custom_responses', '[{"id":"dessert","response":"Fruta"}]'::jsonb,
    'customer_name', 'Atomic test', 'customer_email', 'atomic-test@example.invalid',
    'comments', 'Sin sal', 'total_items', 7
  );
$$;
create function pg_temp.batch(p_case text, p_days integer default 1)
returns jsonb language sql as $$
  select jsonb_build_array(pg_temp.payload('lunch', p_case, p_days), pg_temp.payload('dinner', p_case, p_days));
$$;
create function pg_temp.expect_failure(p_orders jsonb, p_message text)
returns void language plpgsql as $$
declare v_before integer; v_failed boolean := false;
begin
  select count(*) into v_before from public.orders where user_id = auth.uid();
  begin
    perform public.create_orders_atomic(auth.uid(), p_orders);
  exception when others then
    if sqlerrm not like '%' || p_message || '%' then raise; end if;
    v_failed := true;
  end;
  assert v_failed, 'Expected RPC failure: ' || p_message;
  assert (select count(*) from public.orders where user_id = auth.uid()) = v_before,
    'Failed RPC left a partial order';
end;
$$;

-- An order-insert probe uses a sequence because nextval is not rolled back.
-- This proves known-invalid batches are rejected BEFORE their first INSERT.
create sequence pg_temp.insert_attempts;
create function pg_temp.probe_order_insert() returns trigger language plpgsql as $$
begin
  if new.user_id = 'a7010000-0000-0000-0000-000000000001' then
    perform nextval('pg_temp.insert_attempts');
    if new.service = 'dinner' and new.comments = 'inject-second-failure' then
      assert exists (select 1 from public.orders where user_id = new.user_id
        and service = 'lunch' and delivery_date = new.delivery_date), 'First INSERT did not run';
      raise exception 'injected_second_insert_failure';
    end if;
  end if;
  return new;
end;
$$;
create trigger atomic_test_insert_probe before insert on public.orders
for each row execute function pg_temp.probe_order_insert();
grant usage, select on sequence pg_temp.insert_attempts to authenticated;

set local role authenticated;
do $$
begin
  assert not public.is_admin(), 'Tests must exercise non-admin authorization';
  assert not has_function_privilege('anon', 'public.create_orders_atomic(uuid,jsonb)', 'execute');
  assert not has_function_privilege('authenticated', 'public.prepare_or_create_order(uuid,text,jsonb,boolean)', 'execute');
  perform pg_temp.expect_failure(jsonb_set(pg_temp.batch('bad-items'), '{1,items}', '[]'), 'invalid_items');
  perform pg_temp.expect_failure(jsonb_set(pg_temp.batch('bad-service'), '{1,service}', '"breakfast"'), 'invalid_service');
  perform pg_temp.expect_failure(jsonb_set(pg_temp.batch('bad-date'), '{1,delivery_date}', to_jsonb((current_date - 5)::text)), 'invalid_delivery_date');
  perform pg_temp.expect_failure(jsonb_set(pg_temp.batch('bad-location'), '{1,location}', '"Unknown nonexistent location"'), 'location_not_allowed');
  perform pg_temp.expect_failure(jsonb_set(pg_temp.batch('restricted'), '{1,location}', '"Restricted test"'), 'location_not_allowed');
  perform pg_temp.expect_failure(jsonb_set(pg_temp.batch('private'), '{1,location}', '"Atomic private"'), 'company_admins_only');
  perform pg_temp.expect_failure(jsonb_set(pg_temp.batch('inactive'), '{1,location}', '"Atomic inactive"'), 'company_inactive');
  perform pg_temp.expect_failure(jsonb_set(pg_temp.batch('wrong-user'), '{1,user_id}', '"a7010000-0000-0000-0000-000000000099"'), 'user_id_not_allowed');
  perform pg_temp.expect_failure(jsonb_set(pg_temp.batch('bad-responses'), '{1,custom_responses}', '{}'), 'invalid_custom_responses');
  perform pg_temp.expect_failure('null', 'invalid_order_batch');
  assert not (select is_called from pg_temp.insert_attempts), 'Invalid batch attempted INSERT';
end;
$$;
reset role;
update public.user_features set enabled = false where user_id = 'a7010000-0000-0000-0000-000000000001';
set local role authenticated;
select pg_temp.expect_failure(pg_temp.batch('disabled-dinner'), 'dinner_not_enabled');
reset role;
update public.user_features set enabled = true where user_id = 'a7010000-0000-0000-0000-000000000001';
-- Close only dinner's location, leaving lunch valid.
update public.order_schedule_flows set opens_at = '00:00', closes_at = '00:00:00.000001' where flow = 'extended';
insert into public.order_schedule_location_overrides(location_key, flow, label)
values ('restricted_test', 'extended', 'Restricted test') on conflict(location_key) do update set flow = excluded.flow;
set local role authenticated;
select pg_temp.expect_failure(jsonb_set(pg_temp.batch('closed'), '{1,location}', '"Restricted test"'), 'ORDER_WINDOW_CLOSED');
do $$ begin
  assert not (select is_called from pg_temp.insert_attempts), 'Preflight attempted INSERT';
end $$;

-- Successful pair, correct snapshots/normalization, and retry with identical IDs.
do $$
declare v_ids uuid[]; v_retry uuid[]; v_rows public.orders[];
begin
  select array_agg(o.id order by o.service), array_agg(o) into v_ids, v_rows
    from public.create_orders_atomic(auth.uid(), pg_temp.batch('success', 2)) o;
  assert cardinality(v_ids) = 2 and v_ids[1] <> v_ids[2], 'Expected exactly two IDs';
  assert (select count(*) from public.orders where id = any(v_ids)
    and status = 'pending' and total_items = 1 and items->0->>'quantity' = '1'
    and company_name = 'Atomic test' and organization = 'Atomic test'
    and requesting_location_code = 'ATOMIC_TEST' and delivery_location_code = 'ATOMIC_TEST'
    and custom_responses = '[{"id":"dessert","response":"Fruta"}]'::jsonb) = 2, 'Lost snapshots or payload fields';
  select array_agg(o.id order by o.service) into v_retry
    from public.create_orders_atomic(auth.uid(), pg_temp.batch('success', 2)) o;
  assert v_ids = v_retry, 'Retry changed IDs';
  assert (select count(*) from public.orders where user_id = auth.uid()) = 2, 'Retry duplicated orders';
  -- Real unexpected exception after the first order was inserted.
  perform pg_temp.expect_failure(jsonb_set(pg_temp.batch('trigger-failure', 3), '{1,comments}', '"inject-second-failure"'), 'injected_second_insert_failure');
  assert (select count(*) from public.orders where user_id = auth.uid()) = 2, 'Second failure leaked lunch';
end;
$$;

-- A pre-existing dinner must not allow a new lunch to persist. Single RPC still works.
do $$
declare v_dinner public.orders; v_lunch public.orders; v_retry public.orders; v_attempts bigint;
begin
  v_dinner := public.create_order_idempotent(auth.uid(), 'atomic-single-dinner', pg_temp.payload('dinner', 'single', 4));
  select last_value into v_attempts from pg_temp.insert_attempts;
  perform pg_temp.expect_failure(pg_temp.batch('duplicate', 4), 'duplicate_active_order');
  assert (select last_value from pg_temp.insert_attempts) = v_attempts, 'Duplicate not caught in preflight';
  v_lunch := public.create_order_idempotent(auth.uid(), 'atomic-single-lunch', pg_temp.payload('lunch', 'single', 5));
  v_retry := public.create_order_idempotent(auth.uid(), 'atomic-single-lunch', pg_temp.payload('lunch', 'single', 5));
  assert v_lunch.id = v_retry.id and v_dinner.id is not null, 'Individual creation/retry regressed';
end;
$$;
-- A partially recovered identity must not create the missing member.
do $$
declare v_before bigint;
begin
  perform public.create_order_idempotent(auth.uid(), 'atomic-test-partial-lunch', pg_temp.payload('lunch', 'partial', 6));
  select last_value into v_before from pg_temp.insert_attempts;
  perform pg_temp.expect_failure(pg_temp.batch('partial', 6), 'incomplete_order_batch');
  assert (select last_value from pg_temp.insert_attempts) = v_before;
  assert (select count(*) from public.create_orders_atomic(auth.uid(),
    jsonb_set(pg_temp.batch('different-dates', 7), '{1,delivery_date}',
      to_jsonb(((now() at time zone 'America/Argentina/San_Juan')::date + 8)::text)))) = 2;
end;
$$;
reset role;
-- Completed retries must work after hours/features change, without new inserts.
update public.user_features set enabled = false where user_id = 'a7010000-0000-0000-0000-000000000001';
update public.order_schedule_flows set opens_at = '00:00', closes_at = '00:00:00.000001';
set local role authenticated;
do $$ begin
  assert (select count(*) from public.create_orders_atomic(auth.uid(), pg_temp.batch('success', 2))) = 2;
end $$;
reset role;
select set_config('request.jwt.claims', '{}', true);
set local role authenticated;
select pg_temp.expect_failure(pg_temp.batch('unauthenticated'), 'not_authenticated');
reset role;
rollback;
\echo Atomic PostgreSQL tests passed (all fixtures rolled back).
