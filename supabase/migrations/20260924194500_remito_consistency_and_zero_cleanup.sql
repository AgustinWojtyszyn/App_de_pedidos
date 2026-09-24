begin;

-- ---------------------------------------------------------------------------
-- Historical repairs found by the 2026-09-24 production integrity check.
-- 1) Padre Bueno remito 70034 omitted an already-existing 2-unit admin extra.
-- 2) One legacy Greif post_report_extra remained persisted with zero units after
--    discounts. Current discount logic deletes this state, so clean only that
--    exact historical row.
-- ---------------------------------------------------------------------------

do $$
declare
  v_order_id uuid := '6da04d4b-2e01-449e-899a-d115e9e5e65f'::uuid;
  v_remito_id uuid;
begin
  select cr.id
  into v_remito_id
  from public.company_remitos cr
  join public.companies c on c.id = cr.company_id
  where lower(c.slug) = 'padrebueno'
    and cr.delivery_date = date '2026-09-23'
    and cr.remito_number = 70034
    and cr.status = 'issued'
    and exists (
      select 1
      from public.orders o
      where o.id = v_order_id
        and o.delivery_date = cr.delivery_date
        and lower(coalesce(o.company_slug, '')) = 'padrebueno'
        and lower(coalesce(o.order_origin, '')) = 'admin_extra'
        and o.status = 'post_report_extra'
        and coalesce(o.total_items, 0) = 2
    )
  limit 1;

  if v_remito_id is not null
    and not exists (
      select 1
      from public.company_remitos cr
      where cr.id = v_remito_id
        and v_order_id = any(coalesce(cr.order_ids, array[]::uuid[]))
    )
  then
    perform set_config('app.allow_issued_remito_snapshot_refresh', 'on', true);

    update public.company_remitos cr
    set order_ids = (
          select coalesce(array_agg(distinct order_id order by order_id), array[]::uuid[])
          from unnest(coalesce(cr.order_ids, array[]::uuid[]) || array[v_order_id]) as x(order_id)
        ),
        snapshot = coalesce(cr.snapshot, '{}'::jsonb) || jsonb_build_object(
          'needsRefresh', true,
          'repairReason', 'missing_existing_order',
          'repairAt', now()
        ),
        updated_at = now(),
        snapshot_version = coalesce(cr.snapshot_version, 1) + 1
    where cr.id = v_remito_id;
  end if;
end
$$;

do $$
declare
  v_order_id uuid := '670f6d2a-6c23-48cb-923c-2c111f981f62'::uuid;
  v_is_legacy_zero boolean := false;
begin
  select exists (
    select 1
    from public.orders o
    where o.id = v_order_id
      and o.delivery_date = date '2026-09-08'
      and lower(coalesce(o.company_slug, '')) = 'greif'
      and lower(coalesce(o.order_origin, '')) = 'admin_extra'
      and o.status = 'post_report_extra'
      and coalesce(o.total_items, 0) = 0
      and jsonb_typeof(coalesce(o.items, '[]'::jsonb)) = 'array'
      and jsonb_array_length(coalesce(o.items, '[]'::jsonb)) = 0
      and (
        select coalesce(sum(d.quantity), 0)
        from public.order_item_discounts d
        where d.order_id = o.id
      ) = 9
  )
  into v_is_legacy_zero;

  if v_is_legacy_zero then
    perform set_config('app.allow_issued_remito_snapshot_refresh', 'on', true);

    update public.company_remitos cr
    set order_ids = array_remove(coalesce(cr.order_ids, array[]::uuid[]), v_order_id),
        snapshot = coalesce(cr.snapshot, '{}'::jsonb) || jsonb_build_object(
          'needsRefresh', true,
          'repairReason', 'removed_zero_unit_legacy_order',
          'repairAt', now()
        ),
        updated_at = now(),
        snapshot_version = coalesce(cr.snapshot_version, 1) + 1
    where v_order_id = any(coalesce(cr.order_ids, array[]::uuid[]));

    delete from public.orders
    where id = v_order_id;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Canonical expected order scope for remitos.
-- Keeps issuance and refreshes aligned with the orders that actually exist in DB.
-- The explicit "Remitar sin extras del día" mode is preserved through
-- snapshot.excludePostReportExtras.
-- ---------------------------------------------------------------------------

create or replace function public.get_expected_company_remito_order_ids(
  p_company_id uuid,
  p_delivery_date date,
  p_location_key text default '',
  p_exclude_post_report_extras boolean default false
)
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with target_company as (
    select c.id, c.slug
    from public.companies c
    where c.id = p_company_id
  ),
  eligible as (
    select distinct o.id
    from public.orders o
    cross join target_company c
    left join public.order_locations loc
      on loc.id = o.order_location_id
    left join public.order_locations dloc
      on dloc.id = o.delivery_order_location_id
    where o.delivery_date = p_delivery_date
      and (
        o.status in ('pending', 'archived')
        or (
          not coalesce(p_exclude_post_report_extras, false)
          and o.status = 'post_report_extra'
        )
      )
      and (
        public.normalize_company_remito_slug(coalesce(nullif(o.company_slug, ''), '')) = c.slug
        or public.normalize_company_remito_slug(coalesce(nullif(o.company_name, ''), '')) = c.slug
        or public.normalize_company_remito_slug(coalesce(nullif(o.organization, ''), '')) = c.slug
        or public.admin_extra_company_location_allowed(
          c.slug,
          coalesce(nullif(o.location, ''), nullif(o.delivery_location, ''), '')
        )
      )
      and (
        c.slug not in ('epse', 'isemar')
        or coalesce(
          nullif(loc.slug, ''),
          nullif(dloc.slug, ''),
          public.normalize_order_schedule_location_key(
            coalesce(
              nullif(o.requesting_location_code, ''),
              nullif(o.location, ''),
              nullif(o.delivery_location, ''),
              ''
            )
          ),
          ''
        ) = coalesce(p_location_key, '')
      )
  )
  select coalesce(array_agg(id order by id), array[]::uuid[])
  from eligible;
$$;

revoke all on function public.get_expected_company_remito_order_ids(uuid, date, text, boolean) from public;
revoke all on function public.get_expected_company_remito_order_ids(uuid, date, text, boolean) from anon;
grant execute on function public.get_expected_company_remito_order_ids(uuid, date, text, boolean) to authenticated;
grant execute on function public.get_expected_company_remito_order_ids(uuid, date, text, boolean) to service_role;

create or replace function public.validate_company_remito_order_scope()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_exclude_post_report_extras boolean := false;
  v_expected uuid[] := array[]::uuid[];
  v_requested uuid[] := array[]::uuid[];
  v_snapshot_order_ids uuid[] := array[]::uuid[];
  v_snapshot_source_ids uuid[] := array[]::uuid[];
begin
  if new.status <> 'issued' then
    return new;
  end if;

  if new.snapshot is not null
    and jsonb_typeof(new.snapshot) = 'object'
    and lower(coalesce(new.snapshot->>'excludePostReportExtras', 'false')) in ('true', 'false')
  then
    v_exclude_post_report_extras :=
      lower(coalesce(new.snapshot->>'excludePostReportExtras', 'false')) = 'true';
  end if;

  v_expected := public.get_expected_company_remito_order_ids(
    new.company_id,
    new.delivery_date,
    coalesce(new.location_key, ''),
    v_exclude_post_report_extras
  );

  select coalesce(array_agg(distinct order_id order by order_id), array[]::uuid[])
  into v_requested
  from unnest(coalesce(new.order_ids, array[]::uuid[])) as t(order_id);

  if v_requested is distinct from v_expected then
    raise exception 'remito_orders_mismatch'
      using detail = format(
        'expected=%s requested=%s exclude_post_report_extras=%s',
        v_expected::text,
        v_requested::text,
        v_exclude_post_report_extras::text
      );
  end if;

  if new.snapshot is not null
    and jsonb_typeof(new.snapshot) = 'object'
    and new.snapshot ? 'orderIds'
  then
    select coalesce(array_agg(distinct value::uuid order by value::uuid), array[]::uuid[])
    into v_snapshot_order_ids
    from jsonb_array_elements_text(coalesce(new.snapshot->'orderIds', '[]'::jsonb)) as t(value);

    if v_snapshot_order_ids is distinct from v_expected then
      raise exception 'remito_snapshot_orders_mismatch';
    end if;
  end if;

  if new.snapshot is not null
    and jsonb_typeof(new.snapshot) = 'object'
    and new.snapshot ? 'sourceOrders'
  then
    select coalesce(array_agg(distinct (source_order->>'id')::uuid order by (source_order->>'id')::uuid), array[]::uuid[])
    into v_snapshot_source_ids
    from jsonb_array_elements(coalesce(new.snapshot->'sourceOrders', '[]'::jsonb)) as t(source_order)
    where nullif(source_order->>'id', '') is not null;

    if v_snapshot_source_ids is distinct from v_expected then
      raise exception 'remito_snapshot_source_orders_mismatch';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_company_remito_order_scope on public.company_remitos;
create trigger trg_validate_company_remito_order_scope
before insert or update of company_id, delivery_date, location_key, order_ids, snapshot, status
on public.company_remitos
for each row
execute function public.validate_company_remito_order_scope();

notify pgrst, 'reload schema';

commit;
