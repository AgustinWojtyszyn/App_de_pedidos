-- Atomic multi-service order creation.
-- Reuse the proven single-order RPC inside one PostgreSQL statement/transaction.
-- If either member fails, PostgreSQL rolls back the entire batch automatically.

begin;

-- Private wrapper kept intentionally small so the batch RPC can reuse the
-- existing create_order_idempotent implementation without duplicating its
-- schedule, location, company, feature, snapshot, trigger or constraint logic.
create or replace function public.prepare_or_create_order(
  p_user_id uuid,
  p_idempotency_key text,
  p_payload jsonb,
  p_validate_only boolean
)
returns public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $prepare_order$
begin
  if p_validate_only then
    return null;
  end if;

  return public.create_order_idempotent(
    p_user_id,
    p_idempotency_key,
    p_payload
  );
end;
$prepare_order$;

revoke all on function public.prepare_or_create_order(uuid, text, jsonb, boolean)
  from public, anon, authenticated;

create or replace function public.create_orders_atomic(
  p_user_id uuid,
  p_orders jsonb
)
returns setof public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $atomic_orders$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if p_user_id is null then
    raise exception 'user_id_required';
  end if;

  if p_user_id <> auth.uid() and not public.is_admin() then
    raise exception 'user_id_not_allowed';
  end if;

  if jsonb_typeof(p_orders) is distinct from 'array'
     or jsonb_array_length(p_orders) <> 2 then
    raise exception 'invalid_order_batch';
  end if;

  -- Serialize retries for the same user before inspecting idempotency keys.
  perform pg_advisory_xact_lock(
    hashtextextended('order-create:' || p_user_id::text, 0)
  );

  -- Validate the complete envelope before the first order insert.
  if exists (
    select 1
    from jsonb_array_elements(p_orders) as batch(payload)
    where jsonb_typeof(batch.payload) is distinct from 'object'
  ) then
    raise exception 'invalid_order_payload';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_orders) as batch(payload)
    where nullif(batch.payload->>'user_id', '') is null
       or (batch.payload->>'user_id')::uuid is distinct from p_user_id
  ) then
    raise exception 'user_id_not_allowed';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_orders) as batch(payload)
    where batch.payload->>'service' is null
       or batch.payload->>'service' not in ('lunch', 'dinner')
  ) then
    raise exception 'invalid_service';
  end if;

  if (
    select count(distinct batch.payload->>'service')
    from jsonb_array_elements(p_orders) as batch(payload)
  ) <> 2 then
    raise exception 'duplicate_batch_service';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_orders) as batch(payload)
    where nullif(btrim(batch.payload->>'idempotency_key'), '') is null
  ) then
    raise exception 'idempotency_key_required';
  end if;

  if (
    select count(distinct batch.payload->>'idempotency_key')
    from jsonb_array_elements(p_orders) as batch(payload)
  ) <> 2 then
    raise exception 'idempotency_key_conflict';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_orders) as batch(payload)
    where jsonb_typeof(batch.payload->'items') is distinct from 'array'
       or jsonb_array_length(batch.payload->'items') <> 1
       or jsonb_typeof(batch.payload->'items'->0) is distinct from 'object'
       or nullif(btrim(batch.payload->'items'->0->>'name'), '') is null
  ) then
    raise exception 'invalid_items';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_orders) as batch(payload)
    where jsonb_typeof(coalesce(batch.payload->'custom_responses', '[]'::jsonb)) <> 'array'
  ) then
    raise exception 'invalid_custom_responses';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_orders) as batch(payload)
    where nullif(batch.payload->>'delivery_date', '') is null
  ) then
    raise exception 'invalid_delivery_date';
  end if;

  -- Completed retries must resolve to the same user/service/date. One recovered
  -- member and one missing member is rejected instead of reconstructing a
  -- partially deleted batch.
  if exists (
    select 1
    from jsonb_array_elements(p_orders) as batch(payload)
    join public.orders existing
      on existing.idempotency_key = batch.payload->>'idempotency_key'
    where existing.user_id is distinct from p_user_id
       or coalesce(nullif(lower(existing.service), ''), 'lunch')
            is distinct from batch.payload->>'service'
       or existing.delivery_date
            is distinct from (batch.payload->>'delivery_date')::date
  ) then
    raise exception 'idempotency_key_conflict';
  end if;

  if (
    select count(*)
    from jsonb_array_elements(p_orders) as batch(payload)
    join public.orders existing
      on existing.idempotency_key = batch.payload->>'idempotency_key'
  ) not in (0, 2) then
    raise exception 'incomplete_order_batch';
  end if;

  -- Business rules remain authoritative in create_order_idempotent. Both calls
  -- execute inside this single RPC statement, so any failure from either call,
  -- trigger or constraint rolls back the full batch. A completed retry is
  -- recovered before schedule/feature checks by the existing RPC, preserving
  -- current idempotency semantics.
  return query
  select created.*
  from jsonb_array_elements(p_orders) with ordinality as batch(payload, ordinal)
  cross join lateral public.prepare_or_create_order(
    p_user_id,
    batch.payload->>'idempotency_key',
    jsonb_set(
      jsonb_set(batch.payload, '{items,0,quantity}', '1'::jsonb),
      '{total_items}',
      '1'::jsonb
    ),
    false
  ) as created
  order by batch.ordinal;
end;
$atomic_orders$;

revoke all on function public.create_orders_atomic(uuid, jsonb) from public, anon;
grant execute on function public.create_orders_atomic(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';

commit;
