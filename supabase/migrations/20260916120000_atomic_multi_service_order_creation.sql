-- Atomic multi-service order creation.
-- Keep the proven single-order RPC authoritative for all business rules and
-- call it twice inside one PostgreSQL statement/transaction. If either member
-- fails, PostgreSQL rolls back the entire batch automatically.

begin;

-- Private wrapper kept intentionally small. It lets the batch RPC reuse the
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

  -- Serialize batch retries for the same user before inspecting idempotency
  -- keys. The existing active-order unique index remains the final concurrency
  -- guard against competing requests.
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
    where batch.payload->>'service' not in ('lunch', 'dinner')
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

  -- A completed retry must resolve to the same user/service/date. One recovered
  -- member and one missing member is rejected rather than reconstructing a
  -- partially deleted historical batch.
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

  -- Cheap business preflight that can be checked without inserting. The
  -- existing single-order RPC remains authoritative and rechecks these rules.
  if exists (
    select 1
    from jsonb_array_elements(p_orders) as batch(payload)
    cross join lateral public.get_order_schedule_context(
      batch.payload->>'location',
      now()
    ) as schedule
    where not coalesce(schedule.is_open, false)
  ) then
    raise exception 'ORDER_WINDOW_CLOSED';
  end if;

  if not public.is_admin()
     and exists (
       select 1
       from jsonb_array_elements(p_orders) as batch(payload)
       where batch.payload->>'service' = 'dinner'
     )
     and not exists (
       select 1
       from public.user_features uf
       where uf.user_id = p_user_id
         and uf.feature = 'dinner'
         and uf.enabled = true
     ) then
    raise exception 'dinner_not_enabled';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_orders) as batch(payload)
    where not exists (
      select 1
      from public.orders existing_key
      where existing_key.idempotency_key = batch.payload->>'idempotency_key'
    )
      and exists (
        select 1
        from public.orders active_order
        where active_order.user_id = p_user_id
          and active_order.delivery_date = (batch.payload->>'delivery_date')::date
          and coalesce(nullif(lower(active_order.service), ''), 'lunch') = batch.payload->>'service'
          and active_order.status = 'pending'
      )
  ) then
    raise exception 'duplicate_active_order';
  end if;

  -- Both calls execute inside this single RPC statement. RETURN QUERY does not
  -- commit member rows individually: any exception from either call, trigger or
  -- constraint aborts and rolls back the full transaction.
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
