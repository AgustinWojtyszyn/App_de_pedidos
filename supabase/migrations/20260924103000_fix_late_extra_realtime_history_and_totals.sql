-- Fix late/admin extra consistency across Daily Orders and Histórico de extras.
-- Business window: 22:01 of the previous day through 18:00 of delivery day.
-- Prevents premature history closures from freezing the snapshot while extras can still be created.

begin;

create or replace function public.late_admin_extra_operational_bounds(p_operational_date date)
returns table (
  operational_date date,
  window_started_at timestamptz,
  window_closed_at timestamptz
)
language sql
stable
set search_path = public, pg_temp
as $$
  select
    p_operational_date,
    make_timestamptz(
      extract(year from (p_operational_date - 1))::integer,
      extract(month from (p_operational_date - 1))::integer,
      extract(day from (p_operational_date - 1))::integer,
      22, 1, 0, 'America/Argentina/San_Juan'
    ),
    make_timestamptz(
      extract(year from p_operational_date)::integer,
      extract(month from p_operational_date)::integer,
      extract(day from p_operational_date)::integer,
      18, 0, 0, 'America/Argentina/San_Juan'
    );
$$;

create or replace function public.resolve_late_admin_extra_operational_date(p_created_at timestamptz)
returns date
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when (p_created_at at time zone 'America/Argentina/San_Juan')::time >= time '22:01:00'
      then (p_created_at at time zone 'America/Argentina/San_Juan')::date + 1
    else (p_created_at at time zone 'America/Argentina/San_Juan')::date
  end;
$$;

create or replace function public.create_late_admin_extra_order(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_id uuid := auth.uid();
  v_admin public.users;
  v_local_now timestamp := current_timestamp at time zone 'America/Argentina/San_Juan';
  v_local_time time := (current_timestamp at time zone 'America/Argentina/San_Juan')::time;
  v_local_date date := (current_timestamp at time zone 'America/Argentina/San_Juan')::date;
  v_operational_date date;
  v_requested_date_text text := nullif(trim(coalesce(p_payload->>'delivery_date', '')), '');
  v_payload jsonb;
  v_order public.orders;
  v_request_id text := nullif(trim(coalesce(p_payload->>'idempotency_key', '')), '');
  v_has_authorized_config boolean := false;
  v_is_authorized boolean := false;
  v_audit_id uuid;
begin
  if v_admin_id is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_admin from public.users where id = v_admin_id;
  if v_admin.id is null then
    raise exception 'not_authenticated';
  end if;

  select exists (
    select 1
    from public.admin_late_extra_order_authorized_accounts cfg
    where cfg.active = true
  )
  into v_has_authorized_config;

  if not coalesce(v_has_authorized_config, false) then
    raise exception 'late_admin_extra_authorized_account_not_configured';
  end if;

  v_is_authorized := public.is_late_admin_extra_order_authorized(v_admin_id);
  if not coalesce(v_is_authorized, false) then
    raise exception 'late_admin_extra_not_authorized';
  end if;

  if v_local_time >= time '22:01:00' then
    v_operational_date := v_local_now::date + 1;
  elsif v_local_time < time '18:00:00' then
    v_operational_date := v_local_now::date;
  else
    raise exception 'late_admin_extra_window_closed';
  end if;

  if v_requested_date_text is not null then
    if v_requested_date_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'invalid_delivery_date';
    end if;
    if v_requested_date_text::date <> v_operational_date then
      raise exception 'invalid_delivery_date';
    end if;
  end if;

  if v_operational_date < v_local_date then
    raise exception 'invalid_delivery_date';
  end if;

  v_payload := coalesce(p_payload, '{}'::jsonb)
    || jsonb_build_object(
      'delivery_date', v_operational_date::text,
      'late_admin_extra', true
    );

  select *
  into v_order
  from public.create_admin_extra_order(v_payload);

  insert into public.audit_logs (
    action,
    details,
    actor_id,
    actor_email,
    actor_name,
    target_id,
    target_email,
    target_name,
    metadata,
    request_id,
    created_at
  )
  values (
    'late_admin_extra_order_created',
    'Pedido fuera de termino cargado por cuenta autorizada',
    v_admin_id,
    v_admin.email,
    coalesce(nullif(trim(v_admin.full_name), ''), v_admin.email),
    v_order.user_id,
    v_order.customer_email,
    v_order.customer_name,
    jsonb_build_object(
      'order_id', v_order.id,
      'delivery_date', v_operational_date,
      'local_timestamp', v_local_now,
      'timezone', 'America/Argentina/San_Juan',
      'origin', 'admin_extra',
      'extended_window', '22:01-18:00',
      'status', v_order.status,
      'snapshot', to_jsonb(v_order)
    ),
    v_request_id,
    now()
  )
  on conflict (request_id, action) where request_id is not null do nothing
  returning id into v_audit_id;

  perform public.insert_late_admin_extra_order_history(
    v_order,
    v_operational_date,
    v_admin_id,
    v_admin.email,
    coalesce(nullif(trim(v_admin.full_name), ''), v_admin.email),
    v_request_id,
    v_audit_id,
    'create_late_admin_extra_order'
  );

  return jsonb_build_object(
    'delivery_date', v_operational_date,
    'order', to_jsonb(v_order)
  );
end;
$$;

-- Any closure created before the real end of the operational window is invalid:
-- it can freeze an incomplete snapshot. Current history is reconstructible from
-- orders + audited deleted extras, so removing only those invalid closures is safe.
delete from public.late_admin_extra_order_closures c
where c.closed_at < (
  select b.window_closed_at
  from public.late_admin_extra_operational_bounds(c.operational_date) b
);

create or replace function public.get_late_admin_extra_history_days(
  p_from_date date default null,
  p_to_date date default null
)
returns table (
  operational_date date,
  window_started_at timestamptz,
  window_closed_at timestamptz,
  total_orders integer,
  total_units integer,
  deleted_orders integer,
  status text,
  closure_id uuid,
  closure_version integer,
  closed_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.has_company_admin_access() then raise exception 'not_authorized'; end if;

  return query
  with active_orders as (
    select
      o.id::text as source_id,
      o.delivery_date,
      coalesce(o.total_items, public.late_admin_extra_order_units(to_jsonb(o)), 0) as total_items,
      false as deleted
    from public.orders o
    where lower(coalesce(o.order_origin, '')) = 'admin_extra'
      and (p_from_date is null or o.delivery_date >= p_from_date)
      and (p_to_date is null or o.delivery_date <= p_to_date)
      and (
        public.is_admin()
        or exists (
          select 1
          from public.company_admins ca
          join public.companies c on c.id = ca.company_id
          where ca.user_id = auth.uid()
            and (
              c.slug = o.company_slug
              or public.admin_extra_company_location_allowed(
                c.slug,
                coalesce(o.location, o.delivery_location, '')
              )
            )
        )
      )
  ),
  deleted_orders as (
    select
      a.id::text as source_id,
      nullif(
        coalesce(
          a.metadata->>'delivery_date',
          a.metadata->'snapshot'->>'delivery_date',
          ''
        ),
        ''
      )::date as delivery_date,
      public.late_admin_extra_order_units(
        coalesce(a.metadata->'snapshot', '{}'::jsonb)
      ) as total_items,
      true as deleted
    from public.audit_logs a
    where a.action = 'admin_extra_order_deleted'
      and coalesce(
        a.metadata->>'origin',
        a.metadata->'snapshot'->>'order_origin',
        ''
      ) = 'admin_extra'
      and nullif(
        coalesce(
          a.metadata->>'delivery_date',
          a.metadata->'snapshot'->>'delivery_date',
          ''
        ),
        ''
      ) is not null
      and (
        p_from_date is null
        or nullif(
          coalesce(
            a.metadata->>'delivery_date',
            a.metadata->'snapshot'->>'delivery_date',
            ''
          ),
          ''
        )::date >= p_from_date
      )
      and (
        p_to_date is null
        or nullif(
          coalesce(
            a.metadata->>'delivery_date',
            a.metadata->'snapshot'->>'delivery_date',
            ''
          ),
          ''
        )::date <= p_to_date
      )
      and (
        public.is_admin()
        or exists (
          select 1
          from public.company_admins ca
          join public.companies c on c.id = ca.company_id
          where ca.user_id = auth.uid()
            and (
              c.slug = coalesce(
                a.metadata->>'company_slug',
                a.metadata->'snapshot'->>'company_slug'
              )
              or public.admin_extra_company_location_allowed(
                c.slug,
                coalesce(
                  a.metadata->>'location',
                  a.metadata->'snapshot'->>'location',
                  a.metadata->>'delivery_location',
                  a.metadata->'snapshot'->>'delivery_location',
                  ''
                )
              )
            )
        )
      )
      and not exists (
        select 1
        from public.orders o
        where o.id::text = coalesce(
          a.metadata->>'order_id',
          a.metadata->'snapshot'->>'id',
          ''
        )
      )
  ),
  rows as (
    select * from active_orders
    union all
    select * from deleted_orders
  ),
  grouped as (
    select
      r.delivery_date,
      count(*)::integer as total_orders,
      coalesce(sum(r.total_items), 0)::integer as total_units,
      count(*) filter (where r.deleted)::integer as deleted_orders
    from rows r
    where r.delivery_date is not null
    group by r.delivery_date
  )
  select
    g.delivery_date as operational_date,
    b.window_started_at,
    b.window_closed_at,
    g.total_orders,
    g.total_units,
    g.deleted_orders,
    case
      when c.id is not null then 'closed'
      when now() >= b.window_closed_at then 'ready_to_close'
      else 'open'
    end as status,
    c.id as closure_id,
    c.version as closure_version,
    c.closed_at
  from grouped g
  cross join lateral public.late_admin_extra_operational_bounds(g.delivery_date) b
  left join public.late_admin_extra_order_closures c
    on c.operational_date = g.delivery_date
   and c.closed_at >= b.window_closed_at
  order by g.delivery_date desc;
end;
$$;

create or replace function public.close_late_admin_extra_operational_day(
  p_operational_date date
)
returns public.late_admin_extra_order_closures
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.late_admin_extra_order_closures%rowtype;
  v_result public.late_admin_extra_order_closures%rowtype;
  v_actor public.users;
  v_window_started_at timestamptz;
  v_window_closed_at timestamptz;
  v_snapshot jsonb;
  v_total_orders integer := 0;
  v_total_units integer := 0;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.can_manage_late_extra_history(auth.uid()) then raise exception 'not_authorized'; end if;
  if p_operational_date is null then raise exception 'operational_date_required'; end if;

  select b.window_started_at, b.window_closed_at
  into v_window_started_at, v_window_closed_at
  from public.late_admin_extra_operational_bounds(p_operational_date) b;

  if now() < v_window_closed_at then
    raise exception 'late_extra_operational_day_open';
  end if;

  select *
  into v_existing
  from public.late_admin_extra_order_closures
  where operational_date = p_operational_date
  for update;

  if found and v_existing.closed_at >= v_window_closed_at then
    return v_existing;
  end if;

  -- Defensive self-heal for a legacy/premature closure that could freeze
  -- the history before the business window actually ended.
  if found then
    delete from public.late_admin_extra_order_closures
    where id = v_existing.id;
  end if;

  select * into v_actor from public.users where id = auth.uid();

  with rows as (
    select *
    from public.get_late_admin_extra_history_for_day(p_operational_date)
  )
  select
    count(*)::integer,
    coalesce(sum(total_items), 0)::integer,
    jsonb_build_object(
      'delivery_date', p_operational_date,
      'window_started_at', v_window_started_at,
      'window_closed_at', v_window_closed_at,
      'closed_at', now(),
      'closed_by', auth.uid(),
      'closed_by_email', v_actor.email,
      'rows', coalesce(
        jsonb_agg(to_jsonb(rows) order by rows.created_at, rows.id),
        '[]'::jsonb
      )
    )
  into v_total_orders, v_total_units, v_snapshot
  from rows;

  insert into public.late_admin_extra_order_closures (
    operational_date,
    window_started_at,
    window_closed_at,
    closed_by,
    closed_by_email,
    total_orders,
    total_units,
    snapshot,
    version
  )
  values (
    p_operational_date,
    v_window_started_at,
    v_window_closed_at,
    auth.uid(),
    v_actor.email,
    v_total_orders,
    v_total_units,
    coalesce(v_snapshot, jsonb_build_object('rows', '[]'::jsonb)),
    1
  )
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.create_late_admin_extra_order(jsonb) from public, anon;
grant execute on function public.create_late_admin_extra_order(jsonb) to authenticated;

revoke all on function public.get_late_admin_extra_history_days(date, date) from public, anon;
grant execute on function public.get_late_admin_extra_history_days(date, date) to authenticated;

revoke all on function public.close_late_admin_extra_operational_day(date) from public, anon;
grant execute on function public.close_late_admin_extra_operational_day(date) to authenticated;

notify pgrst, 'reload schema';

commit;
