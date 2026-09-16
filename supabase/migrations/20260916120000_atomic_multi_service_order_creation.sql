-- One PostgreSQL statement/transaction for a multi-service submission.
-- Extracted from 20260828130000: preserve current creation rules and triggers.
-- Validation may provision the user/sync permissions, but never inserts orders.
-- All such side effects also roll back if any member fails.
begin;

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
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
  v_items jsonb;
  v_delivery_date date;
  v_service text;
  v_constraint text;
  v_local_now timestamp := now() at time zone 'America/Argentina/San_Juan';
  v_requested_location text;
  v_schedule record;
  v_location public.order_locations;
  v_delivery_location public.order_locations;
  v_organization public.order_organizations;
  v_company_snapshot record;
  v_company_slug text;
  v_company_name text;
  v_payload_company_slug text;
  v_location_company_slug text;
  v_requires_contact_authorization boolean := false;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_user_id is null then
    raise exception 'user_id_required';
  end if;

  if p_user_id <> v_uid and not public.is_admin() then
    raise exception 'user_id_not_allowed';
  end if;

  -- Shared by single and batch creation; serialize retries before reading keys.
  perform pg_advisory_xact_lock(hashtextextended('order-create:' || p_user_id::text, 0));

  insert into public.users (id, email, full_name, role, created_at, updated_at)
  values (
    p_user_id,
    coalesce(
      nullif(public.normalize_contact_email(auth.jwt()->>'email'), ''),
      nullif(public.normalize_contact_email(p_payload->>'customer_email'), ''),
      p_user_id::text
    ),
    coalesce(
      nullif(trim(coalesce(p_payload->>'customer_name', '')), ''),
      nullif(trim(coalesce(auth.jwt()->>'email', '')), ''),
      nullif(trim(coalesce(p_payload->>'customer_email', '')), ''),
      p_user_id::text
    ),
    'user',
    now(),
    now()
  )
  on conflict (id) do update
  set email = coalesce(nullif(public.users.email, ''), excluded.email),
      full_name = coalesce(nullif(public.users.full_name, ''), excluded.full_name),
      updated_at = now();

  if p_idempotency_key is null or length(trim(p_idempotency_key)) = 0 then
    raise exception 'idempotency_key_required';
  end if;

  select *
  into v_order
  from public.orders
  where idempotency_key = p_idempotency_key;

  if v_order.id is not null then
    if v_order.user_id <> p_user_id then
      raise exception 'idempotency_key_conflict';
    end if;

    return v_order;
  end if;

  v_items := coalesce(p_payload->'items', '[]'::jsonb);
  v_delivery_date := coalesce((p_payload->>'delivery_date')::date, v_local_now::date);
  v_service := coalesce(nullif(lower(p_payload->>'service'), ''), 'lunch');
  v_requested_location := nullif(trim(coalesce(p_payload->>'location', '')), '');

  if v_requested_location is null then
    raise exception 'location_required';
  end if;

  if v_service not in ('lunch', 'dinner') then
    raise exception 'invalid_service';
  end if;

  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'items_required';
  end if;

  if v_delivery_date < v_local_now::date then
    raise exception 'invalid_delivery_date';
  end if;

  select *
  into v_schedule
  from public.get_order_schedule_context(v_requested_location, now())
  limit 1;

  if not coalesce(v_schedule.is_open, false) then
    raise exception 'ORDER_WINDOW_CLOSED';
  end if;

  if v_service = 'dinner' and not public.is_admin() and not exists (
    select 1
    from public.user_features uf
    where uf.user_id = p_user_id
      and uf.feature = 'dinner'
      and uf.enabled = true
  ) then
    raise exception 'dinner_not_enabled';
  end if;

  select loc.*
  into v_location
  from public.order_locations loc
  where loc.active = true
    and (
      lower(loc.display_name) = lower(v_requested_location)
      or lower(loc.code) = lower(v_requested_location)
      or lower(loc.slug) = lower(v_requested_location)
    )
  limit 1;

  if v_location.id is not null then
    select *
    into v_organization
    from public.order_organizations
    where id = v_location.organization_id;

    v_requires_contact_authorization := upper(coalesce(v_organization.code, '')) <> 'EPSE'
      and exists (
        select 1
        from public.authorized_order_contacts c
        where c.organization_id = v_location.organization_id
          and c.status <> 'disabled'
      );

    if not public.is_admin() and v_requires_contact_authorization and not exists (
      select 1
      from public.user_order_locations uol
      where uol.user_id = p_user_id
        and uol.location_id = v_location.id
        and uol.active = true
    ) then
      perform public.sync_authorized_order_locations_for_user(p_user_id);
      if not exists (
        select 1
        from public.user_order_locations uol
        where uol.user_id = p_user_id
          and uol.location_id = v_location.id
          and uol.active = true
      ) then
        raise exception 'location_not_allowed';
      end if;
    end if;

    select *
    into v_delivery_location
    from public.order_locations
    where id = coalesce(v_location.default_delivery_location_id, v_location.id);
  end if;

  select *
  into v_company_snapshot
  from public.resolve_order_company_snapshot(
    p_user_id,
    coalesce(v_location.display_name, v_requested_location),
    v_organization.name,
    p_payload->>'customer_email',
    v_delivery_date
  );

  v_company_slug := coalesce(
    v_company_snapshot.company_slug,
    public.normalize_company_snapshot_key(coalesce(v_organization.name, v_location.display_name, v_requested_location))
  );
  v_company_name := coalesce(
    v_company_snapshot.company_name,
    v_organization.name,
    v_location.display_name,
    v_requested_location
  );

  -- Preflight the September company-visibility trigger too. The trigger remains
  -- authoritative at INSERT; use its existing authorization helper unchanged.
  v_payload_company_slug := public.normalize_company_admin_slug(v_company_slug);
  select c.slug into v_location_company_slug
  from public.order_locations loc
  join public.companies c on c.id = loc.company_id
  where (v_location.id is not null and loc.id = v_location.id)
     or public.normalize_order_schedule_location_key(v_requested_location) in (
       public.normalize_order_schedule_location_key(loc.display_name),
       public.normalize_order_schedule_location_key(loc.code),
       public.normalize_order_schedule_location_key(loc.slug)
     )
  order by case when loc.id = v_location.id then 0 else 1 end
  limit 1;

  if v_payload_company_slug is not null
     and exists (select 1 from public.companies where slug = v_payload_company_slug)
     and v_location_company_slug is not null
     and v_payload_company_slug <> v_location_company_slug then
    raise exception 'order_company_location_mismatch';
  end if;
  if not exists (select 1 from public.companies where slug = v_payload_company_slug) then
    v_payload_company_slug := null;
  end if;
  perform public.assert_company_order_allowed(coalesce(v_location_company_slug, v_payload_company_slug));

  if exists (
    select 1
    from public.orders
    where user_id = p_user_id
      and delivery_date = v_delivery_date
      and coalesce(nullif(lower(service), ''), 'lunch') = v_service
      and status = 'pending'
  ) then
    raise exception 'duplicate_active_order';
  end if;

  if p_validate_only then
    return null;
  end if;

  insert into public.orders (
    user_id,
    idempotency_key,
    location,
    company_slug,
    company_name,
    organization,
    requesting_location_code,
    order_location_id,
    delivery_location,
    delivery_location_code,
    delivery_order_location_id,
    service,
    items,
    status,
    total_items,
    custom_responses,
    customer_name,
    customer_email,
    customer_phone,
    comments,
    delivery_date
  )
  values (
    p_user_id,
    p_idempotency_key,
    coalesce(v_location.display_name, v_requested_location),
    v_company_slug,
    v_company_name,
    v_organization.name,
    v_location.code,
    v_location.id,
    coalesce(v_delivery_location.display_name, v_requested_location),
    v_delivery_location.code,
    v_delivery_location.id,
    v_service,
    v_items,
    'pending',
    coalesce((p_payload->>'total_items')::integer, jsonb_array_length(v_items), 0),
    coalesce(p_payload->'custom_responses', '[]'::jsonb),
    coalesce(p_payload->>'customer_name', null),
    coalesce(p_payload->>'customer_email', null),
    coalesce(p_payload->>'customer_phone', null),
    coalesce(p_payload->>'comments', null),
    v_delivery_date
  )
  returning *
  into v_order;

  return v_order;
exception
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'orders_active_user_delivery_service_uniq' then
      raise exception 'duplicate_active_order';
    end if;
    raise;
end;
$$;

revoke all on function public.prepare_or_create_order(uuid, text, jsonb, boolean) from public, anon, authenticated;

create or replace function public.create_order_idempotent(
  p_user_id uuid, p_idempotency_key text, p_payload jsonb
)
returns public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return public.prepare_or_create_order(p_user_id, p_idempotency_key, p_payload, false);
end;
$$;

create or replace function public.create_orders_atomic(p_user_id uuid, p_orders jsonb)
returns setof public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payload jsonb;
  v_order public.orders;
  v_seen_services text[] := '{}';
  v_seen_keys text[] := '{}';
  v_existing integer := 0;
  v_service text;
  v_key text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_user_id is null then raise exception 'user_id_required'; end if;
  if p_user_id <> auth.uid() and not public.is_admin() then
    raise exception 'user_id_not_allowed';
  end if;
  if jsonb_typeof(p_orders) is distinct from 'array' then
    raise exception 'invalid_order_batch';
  end if;
  if jsonb_array_length(p_orders) <> 2 then raise exception 'invalid_order_batch'; end if;

  perform pg_advisory_xact_lock(hashtextextended('order-create:' || p_user_id::text, 0));

  -- Validate every member before the first orders INSERT. Replays are resolved
  -- before time/feature/active-order checks, just like the individual RPC.
  for v_payload in select value from jsonb_array_elements(p_orders) loop
    if jsonb_typeof(v_payload) is distinct from 'object' then
      raise exception 'invalid_order_payload';
    end if;
    if (v_payload->>'user_id')::uuid is distinct from p_user_id then
      raise exception 'user_id_not_allowed';
    end if;
    v_service := v_payload->>'service';
    v_key := v_payload->>'idempotency_key';
    if v_service is null or v_service not in ('lunch', 'dinner') then
      raise exception 'invalid_service';
    end if;
    if v_service = any(v_seen_services) then raise exception 'duplicate_batch_service'; end if;
    if v_key is null or btrim(v_key) = '' then raise exception 'idempotency_key_required'; end if;
    if v_key = any(v_seen_keys) then raise exception 'idempotency_key_conflict'; end if;
    v_seen_services := array_append(v_seen_services, v_service);
    v_seen_keys := array_append(v_seen_keys, v_key);
    if jsonb_typeof(v_payload->'items') is distinct from 'array' then
      raise exception 'items_required';
    end if;
    if jsonb_array_length(v_payload->'items') <> 1
       or jsonb_typeof(v_payload->'items'->0) is distinct from 'object'
       or nullif(btrim(v_payload->'items'->0->>'name'), '') is null then
      raise exception 'invalid_items';
    end if;
    if jsonb_typeof(coalesce(v_payload->'custom_responses', '[]'::jsonb)) <> 'array' then
      raise exception 'invalid_custom_responses';
    end if;
    if nullif(v_payload->>'delivery_date', '') is null then
      raise exception 'invalid_delivery_date';
    end if;

    v_order := public.prepare_or_create_order(p_user_id, v_key, v_payload, true);
    if v_order.id is not null then
      if v_order.service is distinct from v_service
         or v_order.delivery_date is distinct from (v_payload->>'delivery_date')::date then
        raise exception 'idempotency_key_conflict';
      end if;
      v_existing := v_existing + 1;
    elsif not exists (
      select 1 from public.order_locations loc
      where loc.active and lower(btrim(v_payload->>'location')) in
        (lower(loc.display_name), lower(loc.code), lower(loc.slug))
    ) and not exists (
      -- Preserve legacy company locations that predate the location catalog.
      select 1 from public.companies c
      where lower(btrim(v_payload->>'location')) = lower(public.resolve_company_location(c.slug))
         or (c.slug = 'genneia' and lower(btrim(v_payload->>'location')) = 'genneia o&m')
    ) then
      raise exception 'location_not_allowed';
    end if;
  end loop;

  -- Never extend a partially recovered operation (e.g. one member was deleted).
  if v_existing not in (0, 2) then raise exception 'incomplete_order_batch'; end if;

  for v_payload in select value from jsonb_array_elements(p_orders) loop
    -- Same meal normalization as buildOrderPayload; never trust client totals.
    v_payload := jsonb_set(v_payload, '{items,0,quantity}', '1'::jsonb);
    v_payload := jsonb_set(v_payload, '{total_items}', '1'::jsonb);
    v_order := public.prepare_or_create_order(
      p_user_id, v_payload->>'idempotency_key', v_payload, false
    );
    return next v_order;
  end loop;
  -- No exception handler here: every failure aborts the entire RPC statement.
end;
$$;

revoke all on function public.create_order_idempotent(uuid, text, jsonb) from public, anon;
grant execute on function public.create_order_idempotent(uuid, text, jsonb) to authenticated;
revoke all on function public.create_orders_atomic(uuid, jsonb) from public, anon;
grant execute on function public.create_orders_atomic(uuid, jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
