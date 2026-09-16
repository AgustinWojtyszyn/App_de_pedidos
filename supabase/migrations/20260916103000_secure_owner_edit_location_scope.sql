-- Keep owner edits inside the original order company.
-- Frontend validation already limits the selector, but this migration makes the
-- database authoritative and keeps location/delivery snapshots consistent.

begin;

create or replace function public.update_own_pending_order(
  p_order_id uuid,
  p_updates jsonb
)
returns public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
  v_updates jsonb := coalesce(p_updates, '{}'::jsonb);
  v_allowed_keys constant text[] := array[
    'location',
    'customer_name',
    'customer_email',
    'customer_phone',
    'items',
    'comments',
    'custom_responses'
  ];
  v_unknown_key text;
  v_new_total integer;
  v_requested_location text;
  v_location public.order_locations%rowtype;
  v_delivery public.order_locations%rowtype;
  v_organization public.order_organizations%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_order_id is null then
    raise exception 'order_id_required';
  end if;

  if jsonb_typeof(v_updates) <> 'object' then
    raise exception 'updates_must_be_object';
  end if;

  select key_name
  into v_unknown_key
  from jsonb_object_keys(v_updates) as update_keys(key_name)
  where not (key_name = any(v_allowed_keys))
  limit 1;

  if v_unknown_key is not null then
    raise exception 'order_update_field_not_allowed:%', v_unknown_key;
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'order_not_found';
  end if;

  if v_order.user_id <> v_uid then
    raise exception 'order_not_owner';
  end if;

  if v_order.status <> 'pending' then
    raise exception 'order_not_pending';
  end if;

  if v_order.created_at < now() - interval '15 minutes' then
    raise exception 'order_update_window_expired';
  end if;

  if v_updates ? 'location' then
    v_requested_location := nullif(trim(v_updates->>'location'), '');
    if v_requested_location is null then
      raise exception 'order_location_required';
    end if;

    if lower(trim(v_requested_location)) <> lower(trim(coalesce(v_order.location, ''))) then
      if nullif(trim(coalesce(v_order.company_slug, '')), '') is null then
        raise exception 'order_location_company_unresolved';
      end if;

      select loc.*
      into v_location
      from public.order_locations loc
      join public.order_organizations org
        on org.id = loc.organization_id
       and org.active = true
      where loc.active = true
        and lower(trim(org.code)) = lower(trim(v_order.company_slug))
        and (
          lower(trim(loc.display_name)) = lower(trim(v_requested_location))
          or lower(trim(coalesce(loc.slug, ''))) = lower(trim(v_requested_location))
          or lower(trim(coalesce(loc.code, ''))) = lower(trim(v_requested_location))
        )
      limit 1;

      if not found then
        raise exception 'order_location_not_allowed';
      end if;

      select *
      into v_organization
      from public.order_organizations
      where id = v_location.organization_id
        and active = true;

      select *
      into v_delivery
      from public.order_locations
      where id = coalesce(v_location.default_delivery_location_id, v_location.id)
        and active = true;

      if v_organization.id is null or v_delivery.id is null then
        raise exception 'order_location_snapshot_unresolved';
      end if;
    end if;
  end if;

  if v_updates ? 'items' then
    if jsonb_typeof(v_updates->'items') <> 'array' then
      raise exception 'order_items_must_be_array';
    end if;

    select coalesce(sum(
      case
        when jsonb_typeof(item_value) = 'object'
          and nullif(item_value->>'quantity', '') ~ '^[0-9]+$'
          then greatest((item_value->>'quantity')::integer, 0)
        when jsonb_typeof(item_value) = 'object' then 1
        else 0
      end
    ), 0)::integer
    into v_new_total
    from jsonb_array_elements(v_updates->'items') as edit_items(item_value);

    if v_new_total <> coalesce(v_order.total_items, 0) then
      raise exception 'order_update_quantity_not_allowed';
    end if;
  end if;

  if v_updates ? 'custom_responses'
     and jsonb_typeof(v_updates->'custom_responses') <> 'array' then
    raise exception 'order_custom_responses_must_be_array';
  end if;

  update public.orders
  set
    location = case when v_updates ? 'location' then v_requested_location else location end,
    organization = case when v_location.id is not null then v_organization.name else organization end,
    requesting_location_code = case when v_location.id is not null then v_location.code else requesting_location_code end,
    order_location_id = case when v_location.id is not null then v_location.id else order_location_id end,
    delivery_location = case when v_location.id is not null then v_delivery.display_name else delivery_location end,
    delivery_location_code = case when v_location.id is not null then v_delivery.code else delivery_location_code end,
    customer_name = case when v_updates ? 'customer_name' then v_updates->>'customer_name' else customer_name end,
    customer_email = case when v_updates ? 'customer_email' then v_updates->>'customer_email' else customer_email end,
    customer_phone = case when v_updates ? 'customer_phone' then v_updates->>'customer_phone' else customer_phone end,
    items = case when v_updates ? 'items' then v_updates->'items' else items end,
    comments = case when v_updates ? 'comments' then v_updates->>'comments' else comments end,
    custom_responses = case when v_updates ? 'custom_responses' then v_updates->'custom_responses' else custom_responses end,
    updated_at = now()
  where id = p_order_id
  returning * into v_order;

  return v_order;
end;
$$;

revoke all on function public.update_own_pending_order(uuid, jsonb) from public;
revoke all on function public.update_own_pending_order(uuid, jsonb) from anon;
grant execute on function public.update_own_pending_order(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';

commit;
