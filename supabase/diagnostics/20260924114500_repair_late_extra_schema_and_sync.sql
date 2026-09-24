-- SERVIFOOD · REPARACIÓN CONSOLIDADA DE EXTRAS / HISTÓRICO
-- Fecha: 2026-09-24
--
-- Ejecutar este archivo COMPLETO en Supabase SQL Editor.
-- Es intencionalmente autocontenido para bases donde faltan migraciones
-- históricas de late_admin_extra_order_history / closures.
--
-- Resultado final:
--   * habilita la infraestructura faltante del histórico de extras;
--   * conserva permisos/allowlists existentes;
--   * reconstruye/backfillea historial cuando corresponde;
--   * unifica histórico por delivery_date;
--   * aplica ventana exacta 22:01 -> 18:00;
--   * evita cierres prematuros que congelen extras;
--   * mantiene los extras en el total operativo diario.
--
-- Los bloques previos son idempotentes (CREATE IF NOT EXISTS,
-- CREATE OR REPLACE, INSERT ... ON CONFLICT) y pueden coexistir con
-- instalaciones que ya tengan parte de esta infraestructura.



-- ============================================================
-- BLOQUE 1: supabase/migrations/20260821120000_late_admin_extra_extended_window.sql
-- ============================================================

-- Allow selected administrative accounts to create late/admin extra orders
-- in the extended 22:00-18:00 window. The RPC still enforces
-- company/location/date scope through create_admin_extra_order and keeps
-- post_report_extra classification.

begin;

create table if not exists public.admin_late_extra_order_authorized_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  email text,
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_late_extra_authorized_identity_check check (
    user_id is not null or nullif(trim(coalesce(email, '')), '') is not null
  )
);

create unique index if not exists admin_late_extra_authorized_user_id_uidx
  on public.admin_late_extra_order_authorized_accounts (user_id)
  where user_id is not null;

create unique index if not exists admin_late_extra_authorized_email_uidx
  on public.admin_late_extra_order_authorized_accounts (lower(trim(email)))
  where email is not null;

update public.admin_late_extra_order_authorized_accounts
set active = false,
    updated_at = now()
where lower(trim(coalesce(email, ''))) not in (
  'servifoodrecepcion@gmail.com',
  'sarmientoclaudia985@gmail.com',
  'agustinwojtyszyn99@gmail.com'
);

insert into public.admin_late_extra_order_authorized_accounts (email, note)
values
  ('servifoodrecepcion@gmail.com', 'Cuenta autorizada para carga administrativa fuera de termino hasta las 18:00'),
  ('sarmientoclaudia985@gmail.com', 'Cuenta autorizada para carga administrativa fuera de termino hasta las 18:00'),
  ('agustinwojtyszyn99@gmail.com', 'Cuenta autorizada para carga administrativa fuera de termino hasta las 18:00')
on conflict ((lower(trim(email)))) where email is not null do update
set active = true,
    note = excluded.note,
    updated_at = now();

create or replace function public.is_late_admin_extra_order_authorized(
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with actor as (
    select u.id, lower(trim(coalesce(u.email, ''))) as email
    from public.users u
    where u.id = p_user_id
  )
  select exists (
    select 1
    from public.admin_late_extra_order_authorized_accounts cfg
    join actor a on (
      cfg.user_id = a.id
      or lower(trim(coalesce(cfg.email, ''))) = a.email
    )
    where cfg.active = true
  );
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
begin
  if v_admin_id is null then
    raise exception 'not_authenticated';
  end if;

  select *
  into v_admin
  from public.users
  where id = v_admin_id;

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

  if v_local_time >= time '22:00:00' then
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
      'extended_window', '22:00-18:00',
      'status', v_order.status
    ),
    v_request_id,
    now()
  )
  on conflict (request_id, action) where request_id is not null do nothing;

  return jsonb_build_object(
    'delivery_date', v_operational_date,
    'order', to_jsonb(v_order)
  );
end;
$$;

create or replace function public.get_admin_access_context()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_is_global boolean := false;
  v_companies jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  v_is_global := public.is_admin();

  if not v_is_global then
    select coalesce(jsonb_agg(jsonb_build_object(
      'slug', c.slug,
      'name', c.name
    ) order by c.name), '[]'::jsonb)
    into v_companies
    from public.company_admins ca
    join public.companies c on c.id = ca.company_id
    where ca.user_id = auth.uid()
      and c.slug <> 'global';
  end if;

  return jsonb_build_object(
    'is_global_admin', v_is_global,
    'is_company_admin', jsonb_array_length(v_companies) > 0,
    'can_create_late_admin_extra_order', public.is_late_admin_extra_order_authorized(auth.uid()),
    'companies', v_companies
  );
end;
$$;

create or replace function public.delete_admin_extra_order(
  p_order_id uuid,
  p_reason text,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_id uuid := auth.uid();
  v_admin public.users;
  v_order public.orders;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_request_id text := nullif(trim(coalesce(p_request_id, '')), '');
  v_allowed boolean := false;
  v_is_late_extra boolean := false;
begin
  if v_admin_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_order_id is null then
    raise exception 'order_required';
  end if;

  if v_reason is null then
    raise exception 'reason_required';
  end if;

  select *
  into v_admin
  from public.users
  where id = v_admin_id;

  if not public.has_company_admin_access() then
    raise exception 'not_authorized';
  end if;

  if v_request_id is not null and exists (
    select 1
    from public.audit_logs a
    where a.request_id = v_request_id
      and a.action = 'admin_extra_order_deleted'
  ) then
    return jsonb_build_object(
      'deleted', false,
      'idempotent', true,
      'order_id', p_order_id
    );
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'order_not_found';
  end if;

  if lower(coalesce(v_order.order_origin, 'user')) <> 'admin_extra' then
    raise exception 'not_admin_extra_order';
  end if;

  select exists (
    select 1
    from public.audit_logs a
    where a.action = 'late_admin_extra_order_created'
      and (
        a.target_id = v_order.user_id
        or a.metadata->>'order_id' = v_order.id::text
      )
      and a.metadata->>'order_id' = v_order.id::text
  )
  into v_is_late_extra;

  if v_is_late_extra and not public.is_late_admin_extra_order_authorized(v_admin_id) then
    raise exception 'late_admin_extra_not_authorized';
  end if;

  if public.is_admin() then
    v_allowed := true;
  else
    select exists (
      select 1
      from public.company_admins ca
      join public.companies c on c.id = ca.company_id
      where ca.user_id = v_admin_id
        and (
          c.slug = v_order.company_slug
          or public.admin_extra_company_location_allowed(c.slug, coalesce(v_order.location, v_order.delivery_location, ''))
        )
    )
    into v_allowed;
  end if;

  if not coalesce(v_allowed, false) then
    raise exception 'not_authorized';
  end if;

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
    'admin_extra_order_deleted',
    'Pedido extra eliminado por administrador',
    v_admin_id,
    v_admin.email,
    coalesce(nullif(trim(v_admin.full_name), ''), v_admin.email),
    v_order.user_id,
    v_order.customer_email,
    v_order.customer_name,
    jsonb_build_object(
      'reason', v_reason,
      'order_id', v_order.id,
      'company_slug', v_order.company_slug,
      'company_name', v_order.company_name,
      'location', v_order.location,
      'delivery_location', v_order.delivery_location,
      'delivery_date', v_order.delivery_date,
      'service', v_order.service,
      'origin', v_order.order_origin,
      'late_admin_extra', v_is_late_extra,
      'snapshot', to_jsonb(v_order)
    ),
    v_request_id,
    now()
  )
  on conflict (request_id, action) where request_id is not null do nothing;

  delete from public.orders
  where id = v_order.id
    and lower(coalesce(order_origin, 'user')) = 'admin_extra';

  return jsonb_build_object(
    'deleted', true,
    'idempotent', false,
    'order_id', v_order.id,
    'late_admin_extra', v_is_late_extra
  );
end;
$$;

revoke all on function public.is_late_admin_extra_order_authorized(uuid) from public;
revoke all on function public.is_late_admin_extra_order_authorized(uuid) from anon;
grant execute on function public.is_late_admin_extra_order_authorized(uuid) to authenticated;

revoke all on function public.create_late_admin_extra_order(jsonb) from public;
revoke all on function public.create_late_admin_extra_order(jsonb) from anon;
grant execute on function public.create_late_admin_extra_order(jsonb) to authenticated;

revoke all on function public.delete_admin_extra_order(uuid, text, text) from public;
revoke all on function public.delete_admin_extra_order(uuid, text, text) from anon;
grant execute on function public.delete_admin_extra_order(uuid, text, text) to authenticated;

revoke all on function public.get_admin_access_context() from public;
revoke all on function public.get_admin_access_context() from anon;
grant execute on function public.get_admin_access_context() to authenticated;

notify pgrst, 'reload schema';

commit;



-- ============================================================
-- BLOQUE 2: supabase/migrations/20260821174500_late_extra_history_wider_db_backfill.sql
-- ============================================================

-- Consolidated DB-backed fix for late admin extra history.
-- Applying this single SQL updates the allowlist, retroactive backfill, and
-- the read/close RPCs used by the UI.

begin;

create table if not exists public.late_admin_extra_history_authorized_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  email text,
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint late_extra_history_authorized_identity_check check (
    user_id is not null or nullif(trim(coalesce(email, '')), '') is not null
  )
);

create unique index if not exists late_extra_history_authorized_user_id_uidx
  on public.late_admin_extra_history_authorized_accounts (user_id)
  where user_id is not null;

create unique index if not exists late_extra_history_authorized_email_uidx
  on public.late_admin_extra_history_authorized_accounts (lower(trim(email)))
  where email is not null;

insert into public.late_admin_extra_history_authorized_accounts (email, note)
values
  ('servifoodrecepcion@gmail.com', 'Autorizado para historico de pedidos extra fuera de termino'),
  ('sarmientoclaudia985@gmail.com', 'Autorizada para historico de pedidos extra fuera de termino'),
  ('agustinwojtyszyn99@gmail.com', 'Autorizado para historico de pedidos extra fuera de termino')
on conflict ((lower(trim(email)))) where email is not null do update
set active = true,
    note = excluded.note,
    updated_at = now();

create table if not exists public.late_admin_extra_order_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid,
  operational_date date not null,
  delivery_date date,
  window_started_at timestamptz not null,
  window_closed_at timestamptz not null,
  created_at timestamptz not null,
  created_by uuid references auth.users(id) on delete set null,
  created_by_email text,
  created_by_name text,
  company_slug text,
  company_name text,
  location text,
  delivery_location text,
  location_key text,
  service text,
  total_items integer,
  detail jsonb not null default '{}'::jsonb,
  order_snapshot jsonb not null default '{}'::jsonb,
  historical_status text not null default 'created',
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  deleted_by_email text,
  deleted_by_name text,
  deleted_reason text,
  create_request_id text,
  delete_request_id text,
  create_audit_log_id uuid,
  delete_audit_log_id uuid,
  source text not null default 'create_late_admin_extra_order',
  created_record_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists late_admin_extra_order_history_order_id_uidx
  on public.late_admin_extra_order_history (order_id)
  where order_id is not null;

create index if not exists late_admin_extra_order_history_operational_date_idx
  on public.late_admin_extra_order_history (operational_date desc, created_at);

create table if not exists public.late_admin_extra_order_closures (
  id uuid primary key default gen_random_uuid(),
  operational_date date not null unique,
  window_started_at timestamptz not null,
  window_closed_at timestamptz not null,
  closed_at timestamptz not null default now(),
  closed_by uuid references auth.users(id) on delete set null,
  closed_by_email text,
  total_orders integer not null default 0,
  total_units integer not null default 0,
  snapshot jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.late_admin_extra_history_authorized_accounts enable row level security;
alter table public.late_admin_extra_order_history enable row level security;
alter table public.late_admin_extra_order_closures enable row level security;

create or replace function public.can_manage_late_extra_history(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with actor as (
    select u.id, lower(trim(coalesce(u.email, ''))) as email
    from public.users u
    where u.id = p_user_id
  )
  select exists (
    select 1
    from public.late_admin_extra_history_authorized_accounts cfg
    join actor a on (
      cfg.user_id = a.id
      or lower(trim(coalesce(cfg.email, ''))) = a.email
    )
    where cfg.active = true
  );
$$;

drop policy if exists late_extra_history_authorized_read on public.late_admin_extra_history_authorized_accounts;
create policy late_extra_history_authorized_read
on public.late_admin_extra_history_authorized_accounts
for select
to authenticated
using (public.can_manage_late_extra_history(auth.uid()));

drop policy if exists late_extra_history_read on public.late_admin_extra_order_history;
create policy late_extra_history_read
on public.late_admin_extra_order_history
for select
to authenticated
using (public.can_manage_late_extra_history(auth.uid()));

drop policy if exists late_extra_closures_read on public.late_admin_extra_order_closures;
create policy late_extra_closures_read
on public.late_admin_extra_order_closures
for select
to authenticated
using (public.can_manage_late_extra_history(auth.uid()));

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
      22, 0, 0, 'America/Argentina/Buenos_Aires'
    ),
    make_timestamptz(
      extract(year from p_operational_date)::integer,
      extract(month from p_operational_date)::integer,
      extract(day from p_operational_date)::integer,
      18, 0, 0, 'America/Argentina/Buenos_Aires'
    );
$$;

create or replace function public.resolve_late_admin_extra_operational_date(p_created_at timestamptz)
returns date
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when (p_created_at at time zone 'America/Argentina/Buenos_Aires')::time >= time '22:00:00'
      then (p_created_at at time zone 'America/Argentina/Buenos_Aires')::date + 1
    else (p_created_at at time zone 'America/Argentina/Buenos_Aires')::date
  end;
$$;

create or replace function public.late_admin_extra_order_snapshot_detail(p_order jsonb)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'items', coalesce(p_order->'items', '[]'::jsonb),
    'custom_responses', coalesce(p_order->'custom_responses', '[]'::jsonb),
    'comments', p_order->>'comments',
    'customer_name', p_order->>'customer_name',
    'customer_email', p_order->>'customer_email'
  );
$$;

create or replace function public.late_admin_extra_order_units(p_order jsonb)
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
  select greatest(coalesce(
    case when trim(coalesce(p_order->>'total_items', '')) ~ '^[0-9]+$' then trim(p_order->>'total_items')::integer end,
    (
      select coalesce(sum(greatest(coalesce(
        case when trim(coalesce(item->>'quantity', '')) ~ '^[0-9]+$' then trim(item->>'quantity')::integer end,
        1
      ), 1)), 0)::integer
      from jsonb_array_elements(coalesce(p_order->'items', '[]'::jsonb)) as t(item)
      where jsonb_typeof(item) = 'object'
    ),
    0
  ), 0);
$$;

create or replace function public.backfill_late_admin_extra_history_for_date(p_operational_date date)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_bounds record;
  v_affected integer := 0;
begin
  if p_operational_date is null then
    raise exception 'operational_date_required';
  end if;

  select * into v_bounds
  from public.late_admin_extra_operational_bounds(p_operational_date);

  with allowed_accounts as (
    select lower(trim(email)) as email
    from (values
      ('servifoodrecepcion@gmail.com'),
      ('sarmientoclaudia985@gmail.com'),
      ('agustinwojtyszyn99@gmail.com')
    ) as fixed(email)
    union
    select lower(trim(coalesce(u.email, cfg.email, ''))) as email
    from public.late_admin_extra_history_authorized_accounts cfg
    left join public.users u on u.id = cfg.user_id
    where cfg.active = true
      and lower(trim(coalesce(u.email, cfg.email, ''))) <> ''
  ),
  audit_created as (
    select
      case
        when coalesce(a.metadata->>'order_id', a.target_id::text) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then coalesce(a.metadata->>'order_id', a.target_id::text)::uuid
      end as order_id,
      a.created_at,
      a.actor_id,
      a.actor_email,
      a.actor_name,
      a.request_id,
      a.id as audit_log_id,
      a.metadata,
      case
        when a.action = 'late_admin_extra_order_created' then 'audit_late_admin_extra_order_created'
        else 'audit_admin_extra_order_created_allowed_window'
      end as source
    from public.audit_logs a
    left join allowed_accounts aa on aa.email = lower(trim(coalesce(a.actor_email, '')))
    where a.action in ('late_admin_extra_order_created', 'admin_extra_order_created')
      and a.created_at >= v_bounds.window_started_at
      and a.created_at < v_bounds.window_closed_at
      and (
        a.action = 'late_admin_extra_order_created'
        or aa.email is not null
        or coalesce(a.metadata->>'late_admin_extra', '') = 'true'
      )
      and (
        coalesce(a.metadata->>'delivery_date', '') = ''
        or coalesce(a.metadata->>'delivery_date', '') = p_operational_date::text
      )
      and (
        coalesce(a.metadata->>'origin', '') = ''
        or coalesce(a.metadata->>'origin', '') = 'admin_extra'
      )
  ),
  audit_deleted_only as (
    select
      case
        when coalesce(a.metadata->>'order_id', a.target_id::text) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then coalesce(a.metadata->>'order_id', a.target_id::text)::uuid
      end as order_id,
      coalesce(nullif(a.metadata->'snapshot'->>'created_at', '')::timestamptz, a.created_at) as created_at,
      a.actor_id,
      a.actor_email,
      a.actor_name,
      nullif(trim(coalesce(a.request_id, '')), '') as request_id,
      a.id as audit_log_id,
      a.metadata,
      'audit_admin_extra_order_deleted_snapshot'::text as source
    from public.audit_logs a
    left join allowed_accounts aa on aa.email = lower(trim(coalesce(a.actor_email, '')))
    where a.action = 'admin_extra_order_deleted'
      and coalesce(a.metadata->>'delivery_date', a.metadata->'snapshot'->>'delivery_date', '') = p_operational_date::text
      and coalesce(a.metadata->>'origin', a.metadata->'snapshot'->>'order_origin', '') = 'admin_extra'
      and (
        aa.email is not null
        or exists (
          select 1
          from allowed_accounts creator
          where creator.email = lower(trim(coalesce(a.metadata->'snapshot'->>'created_by_admin_email', '')))
        )
      )
  ),
  current_orders_allowed as (
    select
      o.id as order_id,
      o.created_at,
      o.created_by_admin_id as actor_id,
      o.created_by_admin_email as actor_email,
      o.created_by_admin_name as actor_name,
      null::text as request_id,
      null::uuid as audit_log_id,
      jsonb_build_object(
        'order_id', o.id,
        'delivery_date', o.delivery_date,
        'origin', o.order_origin,
        'snapshot', to_jsonb(o)
      ) as metadata,
      'orders_admin_extra_allowed_window'::text as source
    from public.orders o
    left join allowed_accounts aa on aa.email = lower(trim(coalesce(o.created_by_admin_email, '')))
    where lower(coalesce(o.order_origin, '')) = 'admin_extra'
      and o.created_at >= v_bounds.window_started_at
      and o.created_at < v_bounds.window_closed_at
      and o.delivery_date = p_operational_date
      and (
        aa.email is not null
        or coalesce(o.created_by_admin_email, '') = ''
      )
  ),
  sources as (
    select * from audit_created
    union all
    select * from audit_deleted_only
    union all
    select * from current_orders_allowed
  ),
  distinct_sources as (
    select distinct on (s.order_id)
      s.*
    from sources s
    where s.order_id is not null
    order by s.order_id,
      case
        when s.source = 'audit_late_admin_extra_order_created' then 1
        when s.source = 'orders_admin_extra_allowed_window' then 2
        when s.source = 'audit_admin_extra_order_created_allowed_window' then 3
        else 4
      end,
      s.created_at asc
  )
  insert into public.late_admin_extra_order_history (
    order_id,
    operational_date,
    delivery_date,
    window_started_at,
    window_closed_at,
    created_at,
    created_by,
    created_by_email,
    created_by_name,
    company_slug,
    company_name,
    location,
    delivery_location,
    location_key,
    service,
    total_items,
    detail,
    order_snapshot,
    historical_status,
    create_request_id,
    create_audit_log_id,
    source
  )
  select
    s.order_id,
    p_operational_date,
    coalesce(o.delivery_date, nullif(s.metadata->>'delivery_date', '')::date, nullif(s.metadata->'snapshot'->>'delivery_date', '')::date, p_operational_date),
    v_bounds.window_started_at,
    v_bounds.window_closed_at,
    coalesce(o.created_at, nullif(s.metadata->'snapshot'->>'created_at', '')::timestamptz, s.created_at),
    coalesce(o.created_by_admin_id, s.actor_id),
    coalesce(o.created_by_admin_email, s.metadata->'snapshot'->>'created_by_admin_email', s.actor_email),
    coalesce(o.created_by_admin_name, s.metadata->'snapshot'->>'created_by_admin_name', s.actor_name),
    coalesce(o.company_slug, s.metadata->'snapshot'->>'company_slug', s.metadata->>'company_slug'),
    coalesce(o.company_name, s.metadata->'snapshot'->>'company_name', s.metadata->>'company_name'),
    coalesce(o.location, s.metadata->'snapshot'->>'location', s.metadata->>'location'),
    coalesce(o.delivery_location, s.metadata->'snapshot'->>'delivery_location', s.metadata->>'delivery_location'),
    coalesce(o.requesting_location_code, s.metadata->'snapshot'->>'requesting_location_code', s.metadata->>'location_key', ''),
    coalesce(o.service, s.metadata->'snapshot'->>'service', s.metadata->>'service'),
    coalesce(
      public.late_admin_extra_order_units(coalesce(to_jsonb(o), s.metadata->'snapshot', '{}'::jsonb)),
      case when trim(coalesce(s.metadata->>'quantity', '')) ~ '^[0-9]+$' then trim(s.metadata->>'quantity')::integer end,
      0
    ),
    public.late_admin_extra_order_snapshot_detail(coalesce(to_jsonb(o), s.metadata->'snapshot', s.metadata)),
    coalesce(to_jsonb(o), s.metadata->'snapshot', jsonb_build_object('audit_metadata', s.metadata)),
    case when d.id is null then 'created' else 'deleted' end,
    s.request_id,
    s.audit_log_id,
    s.source
  from distinct_sources s
  left join public.orders o on o.id = s.order_id
  left join public.audit_logs d on d.action = 'admin_extra_order_deleted'
    and d.metadata->>'order_id' = s.order_id::text
  on conflict (order_id) where order_id is not null do update
  set delivery_date = excluded.delivery_date,
      window_started_at = excluded.window_started_at,
      window_closed_at = excluded.window_closed_at,
      created_at = excluded.created_at,
      created_by = coalesce(late_admin_extra_order_history.created_by, excluded.created_by),
      created_by_email = coalesce(late_admin_extra_order_history.created_by_email, excluded.created_by_email),
      created_by_name = coalesce(late_admin_extra_order_history.created_by_name, excluded.created_by_name),
      company_slug = coalesce(excluded.company_slug, late_admin_extra_order_history.company_slug),
      company_name = coalesce(excluded.company_name, late_admin_extra_order_history.company_name),
      location = coalesce(excluded.location, late_admin_extra_order_history.location),
      delivery_location = coalesce(excluded.delivery_location, late_admin_extra_order_history.delivery_location),
      location_key = coalesce(excluded.location_key, late_admin_extra_order_history.location_key),
      service = coalesce(excluded.service, late_admin_extra_order_history.service),
      total_items = coalesce(excluded.total_items, late_admin_extra_order_history.total_items),
      detail = case when excluded.detail <> '{}'::jsonb then excluded.detail else late_admin_extra_order_history.detail end,
      order_snapshot = case when excluded.order_snapshot <> '{}'::jsonb then excluded.order_snapshot else late_admin_extra_order_history.order_snapshot end,
      historical_status = excluded.historical_status,
      create_request_id = coalesce(late_admin_extra_order_history.create_request_id, excluded.create_request_id),
      create_audit_log_id = coalesce(late_admin_extra_order_history.create_audit_log_id, excluded.create_audit_log_id),
      source = case
        when late_admin_extra_order_history.source = 'create_late_admin_extra_order' then late_admin_extra_order_history.source
        else excluded.source
      end,
      updated_at = now();

  get diagnostics v_affected = row_count;

  update public.late_admin_extra_order_history h
  set historical_status = 'deleted',
      deleted_at = d.created_at,
      deleted_by = d.actor_id,
      deleted_by_email = d.actor_email,
      deleted_by_name = d.actor_name,
      deleted_reason = d.metadata->>'reason',
      delete_request_id = d.request_id,
      delete_audit_log_id = d.id,
      updated_at = now()
  from public.audit_logs d
  where h.operational_date = p_operational_date
    and d.action = 'admin_extra_order_deleted'
    and d.metadata->>'order_id' = h.order_id::text
    and h.deleted_at is null;

  return v_affected;
end;
$$;

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
declare
  v_day date;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.can_manage_late_extra_history(auth.uid()) then raise exception 'not_authorized'; end if;

  if p_from_date is not null and p_to_date is not null and p_from_date = p_to_date then
    perform public.backfill_late_admin_extra_history_for_date(p_from_date);
  else
    for v_day in
      with evidence_days as (
        select public.resolve_late_admin_extra_operational_date(a.created_at) as operational_date
        from public.audit_logs a
        where a.action in ('late_admin_extra_order_created', 'admin_extra_order_created')
          and (p_from_date is null or public.resolve_late_admin_extra_operational_date(a.created_at) >= p_from_date)
          and (p_to_date is null or public.resolve_late_admin_extra_operational_date(a.created_at) <= p_to_date)
        union
        select o.delivery_date as operational_date
        from public.orders o
        where lower(coalesce(o.order_origin, '')) = 'admin_extra'
          and (p_from_date is null or o.delivery_date >= p_from_date)
          and (p_to_date is null or o.delivery_date <= p_to_date)
        union
        select nullif(coalesce(a.metadata->>'delivery_date', a.metadata->'snapshot'->>'delivery_date', ''), '')::date as operational_date
        from public.audit_logs a
        where a.action = 'admin_extra_order_deleted'
          and nullif(coalesce(a.metadata->>'delivery_date', a.metadata->'snapshot'->>'delivery_date', ''), '') is not null
          and (p_from_date is null or nullif(coalesce(a.metadata->>'delivery_date', a.metadata->'snapshot'->>'delivery_date', ''), '')::date >= p_from_date)
          and (p_to_date is null or nullif(coalesce(a.metadata->>'delivery_date', a.metadata->'snapshot'->>'delivery_date', ''), '')::date <= p_to_date)
      )
      select distinct operational_date
      from evidence_days
      where operational_date is not null
    loop
      perform public.backfill_late_admin_extra_history_for_date(v_day);
    end loop;
  end if;

  return query
  with days as (
    select h.operational_date
    from public.late_admin_extra_order_history h
    where (p_from_date is null or h.operational_date >= p_from_date)
      and (p_to_date is null or h.operational_date <= p_to_date)
    union
    select c.operational_date
    from public.late_admin_extra_order_closures c
    where (p_from_date is null or c.operational_date >= p_from_date)
      and (p_to_date is null or c.operational_date <= p_to_date)
  )
  select
    d.operational_date,
    b.window_started_at,
    b.window_closed_at,
    count(h.id)::integer,
    coalesce(sum(h.total_items), 0)::integer,
    count(h.id) filter (where h.deleted_at is not null)::integer,
    case
      when c.id is not null then 'closed'
      when now() >= b.window_closed_at then 'ready_to_close'
      else 'open'
    end,
    c.id,
    c.version,
    c.closed_at
  from days d
  cross join lateral public.late_admin_extra_operational_bounds(d.operational_date) b
  left join public.late_admin_extra_order_history h on h.operational_date = d.operational_date
  left join public.late_admin_extra_order_closures c on c.operational_date = d.operational_date
  group by d.operational_date, b.window_started_at, b.window_closed_at, c.id, c.version, c.closed_at
  having count(h.id) > 0 or c.id is not null
  order by d.operational_date desc;
end;
$$;

drop function if exists public.get_late_admin_extra_history_for_day(date);

create or replace function public.get_late_admin_extra_history_for_day(p_operational_date date)
returns setof public.late_admin_extra_order_history
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.can_manage_late_extra_history(auth.uid()) then raise exception 'not_authorized'; end if;
  if p_operational_date is null then raise exception 'operational_date_required'; end if;

  perform public.backfill_late_admin_extra_history_for_date(p_operational_date);

  return query
  select *
  from public.late_admin_extra_order_history
  where operational_date = p_operational_date
  order by created_at asc, id asc;
end;
$$;

create or replace function public.close_late_admin_extra_operational_day(p_operational_date date)
returns public.late_admin_extra_order_closures
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_bounds record;
  v_existing public.late_admin_extra_order_closures%rowtype;
  v_result public.late_admin_extra_order_closures%rowtype;
  v_actor public.users;
  v_snapshot jsonb;
  v_total_orders integer := 0;
  v_total_units integer := 0;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.can_manage_late_extra_history(auth.uid()) then raise exception 'not_authorized'; end if;
  if p_operational_date is null then raise exception 'operational_date_required'; end if;

  select * into v_bounds from public.late_admin_extra_operational_bounds(p_operational_date);
  if now() < v_bounds.window_closed_at then
    raise exception 'late_extra_operational_day_open';
  end if;

  perform public.backfill_late_admin_extra_history_for_date(p_operational_date);

  select * into v_existing
  from public.late_admin_extra_order_closures
  where operational_date = p_operational_date
  for update;
  if found then return v_existing; end if;

  select * into v_actor from public.users where id = auth.uid();

  select count(*)::integer, coalesce(sum(total_items), 0)::integer
  into v_total_orders, v_total_units
  from public.late_admin_extra_order_history h
  where h.operational_date = p_operational_date
    and h.created_at >= v_bounds.window_started_at
    and h.created_at < v_bounds.window_closed_at;

  select jsonb_build_object(
    'version', 1,
    'operationalDate', p_operational_date,
    'windowStartedAt', v_bounds.window_started_at,
    'windowClosedAt', v_bounds.window_closed_at,
    'totalOrders', v_total_orders,
    'totalUnits', v_total_units,
    'rows', coalesce(jsonb_agg(to_jsonb(h) order by h.created_at, h.id) filter (where h.id is not null), '[]'::jsonb)
  )
  into v_snapshot
  from public.late_admin_extra_order_history h
  where h.operational_date = p_operational_date
    and h.created_at >= v_bounds.window_started_at
    and h.created_at < v_bounds.window_closed_at;

  insert into public.late_admin_extra_order_closures (
    operational_date,
    window_started_at,
    window_closed_at,
    closed_by,
    closed_by_email,
    total_orders,
    total_units,
    snapshot
  )
  values (
    p_operational_date,
    v_bounds.window_started_at,
    v_bounds.window_closed_at,
    auth.uid(),
    v_actor.email,
    v_total_orders,
    v_total_units,
    coalesce(v_snapshot, '{}'::jsonb)
  )
  returning * into v_result;

  insert into public.audit_logs (
    action, details, actor_id, actor_email, actor_name, target_id, target_name, metadata, request_id, created_at
  )
  values (
    'late_admin_extra_operational_day_closed',
    'Cierre operativo de pedidos extra fuera de termino',
    auth.uid(),
    v_actor.email,
    coalesce(nullif(trim(v_actor.full_name), ''), v_actor.email),
    v_result.id,
    p_operational_date::text,
    jsonb_build_object('operational_date', p_operational_date, 'total_orders', v_total_orders, 'total_units', v_total_units),
    concat('late-extra-closure:', p_operational_date::text, ':', v_result.version::text),
    now()
  )
  on conflict (request_id, action) where request_id is not null do nothing;

  return v_result;
end;
$$;

create or replace function public.get_late_admin_extra_closure(p_operational_date date)
returns setof public.late_admin_extra_order_closures
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.can_manage_late_extra_history(auth.uid()) then raise exception 'not_authorized'; end if;
  if p_operational_date is null then raise exception 'operational_date_required'; end if;

  return query
  select *
  from public.late_admin_extra_order_closures
  where operational_date = p_operational_date;
end;
$$;

revoke all on table public.late_admin_extra_history_authorized_accounts from public, anon;
revoke all on table public.late_admin_extra_order_history from public, anon;
revoke all on table public.late_admin_extra_order_closures from public, anon;

revoke all on function public.can_manage_late_extra_history(uuid) from public, anon;
grant execute on function public.can_manage_late_extra_history(uuid) to authenticated;

revoke all on function public.backfill_late_admin_extra_history_for_date(date) from public, anon;
grant execute on function public.backfill_late_admin_extra_history_for_date(date) to authenticated;

revoke all on function public.get_late_admin_extra_history_days(date, date) from public, anon;
grant execute on function public.get_late_admin_extra_history_days(date, date) to authenticated;

revoke all on function public.get_late_admin_extra_history_for_day(date) from public, anon;
grant execute on function public.get_late_admin_extra_history_for_day(date) to authenticated;

revoke all on function public.close_late_admin_extra_operational_day(date) from public, anon;
grant execute on function public.close_late_admin_extra_operational_day(date) to authenticated;

revoke all on function public.get_late_admin_extra_closure(date) from public, anon;
grant execute on function public.get_late_admin_extra_closure(date) to authenticated;

notify pgrst, 'reload schema';

commit;



-- ============================================================
-- BLOQUE 3: supabase/migrations/20260825103000_admin_extra_history_by_delivery_date.sql
-- ============================================================

-- Make the "Historico de extras" panel retroactive by delivery date.
-- It now reads every admin-created extra order for the selected date, not only
-- late-window records persisted in late_admin_extra_order_history.

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
              or public.admin_extra_company_location_allowed(c.slug, coalesce(o.location, o.delivery_location, ''))
            )
        )
      )
  ),
  deleted_orders as (
    select
      a.id::text as source_id,
      nullif(coalesce(a.metadata->>'delivery_date', a.metadata->'snapshot'->>'delivery_date', ''), '')::date as delivery_date,
      public.late_admin_extra_order_units(coalesce(a.metadata->'snapshot', '{}'::jsonb)) as total_items,
      true as deleted
    from public.audit_logs a
    where a.action = 'admin_extra_order_deleted'
      and coalesce(a.metadata->>'origin', a.metadata->'snapshot'->>'order_origin', '') = 'admin_extra'
      and nullif(coalesce(a.metadata->>'delivery_date', a.metadata->'snapshot'->>'delivery_date', ''), '') is not null
      and (p_from_date is null or nullif(coalesce(a.metadata->>'delivery_date', a.metadata->'snapshot'->>'delivery_date', ''), '')::date >= p_from_date)
      and (p_to_date is null or nullif(coalesce(a.metadata->>'delivery_date', a.metadata->'snapshot'->>'delivery_date', ''), '')::date <= p_to_date)
      and (
        public.is_admin()
        or exists (
          select 1
          from public.company_admins ca
          join public.companies c on c.id = ca.company_id
          where ca.user_id = auth.uid()
            and (
              c.slug = coalesce(a.metadata->>'company_slug', a.metadata->'snapshot'->>'company_slug')
              or public.admin_extra_company_location_allowed(c.slug, coalesce(a.metadata->>'location', a.metadata->'snapshot'->>'location', a.metadata->>'delivery_location', a.metadata->'snapshot'->>'delivery_location', ''))
            )
        )
      )
      and not exists (
        select 1
        from public.orders o
        where o.id::text = coalesce(a.metadata->>'order_id', a.metadata->'snapshot'->>'id', '')
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
    make_timestamptz(
      extract(year from (g.delivery_date - 1))::integer,
      extract(month from (g.delivery_date - 1))::integer,
      extract(day from (g.delivery_date - 1))::integer,
      22, 0, 0, 'America/Argentina/Buenos_Aires'
    ) as window_started_at,
    make_timestamptz(
      extract(year from g.delivery_date)::integer,
      extract(month from g.delivery_date)::integer,
      extract(day from g.delivery_date)::integer,
      18, 0, 0, 'America/Argentina/Buenos_Aires'
    ) as window_closed_at,
    g.total_orders,
    g.total_units,
    g.deleted_orders,
    case when c.id is not null then 'closed' else 'open' end as status,
    c.id as closure_id,
    c.version as closure_version,
    c.closed_at
  from grouped g
  left join public.late_admin_extra_order_closures c on c.operational_date = g.delivery_date
  order by g.delivery_date desc;
end;
$$;

drop function if exists public.get_late_admin_extra_history_for_day(date);

create or replace function public.get_late_admin_extra_history_for_day(p_operational_date date)
returns table (
  id uuid,
  order_id uuid,
  operational_date date,
  delivery_date date,
  window_started_at timestamptz,
  window_closed_at timestamptz,
  created_at timestamptz,
  created_by uuid,
  created_by_email text,
  created_by_name text,
  company_slug text,
  company_name text,
  location text,
  delivery_location text,
  location_key text,
  service text,
  total_items integer,
  detail jsonb,
  order_snapshot jsonb,
  historical_status text,
  deleted_at timestamptz,
  deleted_by uuid,
  deleted_by_email text,
  deleted_by_name text,
  deleted_reason text,
  create_request_id text,
  delete_request_id text,
  create_audit_log_id uuid,
  delete_audit_log_id uuid,
  source text,
  created_record_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.has_company_admin_access() then raise exception 'not_authorized'; end if;
  if p_operational_date is null then raise exception 'operational_date_required'; end if;

  return query
  with existing_closure as (
    select c.*
    from public.late_admin_extra_order_closures c
    where c.operational_date = p_operational_date
    limit 1
  ),
  closed_rows as (
    select
      (row_data->>'id')::uuid as id,
      nullif(row_data->>'order_id', '')::uuid as order_id,
      (row_data->>'operational_date')::date as operational_date,
      (row_data->>'delivery_date')::date as delivery_date,
      (row_data->>'window_started_at')::timestamptz as window_started_at,
      (row_data->>'window_closed_at')::timestamptz as window_closed_at,
      (row_data->>'created_at')::timestamptz as created_at,
      nullif(row_data->>'created_by', '')::uuid as created_by,
      row_data->>'created_by_email' as created_by_email,
      row_data->>'created_by_name' as created_by_name,
      row_data->>'company_slug' as company_slug,
      row_data->>'company_name' as company_name,
      row_data->>'location' as location,
      row_data->>'delivery_location' as delivery_location,
      row_data->>'location_key' as location_key,
      row_data->>'service' as service,
      coalesce((row_data->>'total_items')::integer, 0) as total_items,
      coalesce(row_data->'detail', '{}'::jsonb) as detail,
      coalesce(row_data->'order_snapshot', '{}'::jsonb) as order_snapshot,
      'closed'::text as historical_status,
      nullif(row_data->>'deleted_at', '')::timestamptz as deleted_at,
      nullif(row_data->>'deleted_by', '')::uuid as deleted_by,
      row_data->>'deleted_by_email' as deleted_by_email,
      row_data->>'deleted_by_name' as deleted_by_name,
      row_data->>'deleted_reason' as deleted_reason,
      row_data->>'create_request_id' as create_request_id,
      row_data->>'delete_request_id' as delete_request_id,
      nullif(row_data->>'create_audit_log_id', '')::uuid as create_audit_log_id,
      nullif(row_data->>'delete_audit_log_id', '')::uuid as delete_audit_log_id,
      coalesce(row_data->>'source', 'closed_snapshot') as source,
      coalesce(nullif(row_data->>'created_record_at', '')::timestamptz, (row_data->>'created_at')::timestamptz) as created_record_at,
      coalesce(nullif(row_data->>'updated_at', '')::timestamptz, (select closed_at from existing_closure)) as updated_at
    from existing_closure c
    cross join lateral jsonb_array_elements(coalesce(c.snapshot->'rows', '[]'::jsonb)) as rows(row_data)
  ),
  bounds as (
    select
      make_timestamptz(
        extract(year from (p_operational_date - 1))::integer,
        extract(month from (p_operational_date - 1))::integer,
        extract(day from (p_operational_date - 1))::integer,
        22, 0, 0, 'America/Argentina/Buenos_Aires'
      ) as started_at,
      make_timestamptz(
        extract(year from p_operational_date)::integer,
        extract(month from p_operational_date)::integer,
        extract(day from p_operational_date)::integer,
        18, 0, 0, 'America/Argentina/Buenos_Aires'
      ) as closed_at
  ),
  active_orders as (
    select
      o.id,
      o.id as order_id,
      o.delivery_date as operational_date,
      o.delivery_date,
      b.started_at as window_started_at,
      b.closed_at as window_closed_at,
      o.created_at,
      o.created_by_admin_id as created_by,
      o.created_by_admin_email,
      o.created_by_admin_name,
      o.company_slug,
      o.company_name,
      o.location,
      o.delivery_location,
      coalesce(o.requesting_location_code, '') as location_key,
      o.service,
      coalesce(o.total_items, public.late_admin_extra_order_units(to_jsonb(o)), 0)::integer as total_items,
      public.late_admin_extra_order_snapshot_detail(to_jsonb(o)) as detail,
      to_jsonb(o) as order_snapshot,
      'registered'::text as historical_status,
      null::timestamptz as deleted_at,
      null::uuid as deleted_by,
      null::text as deleted_by_email,
      null::text as deleted_by_name,
      null::text as deleted_reason,
      null::text as create_request_id,
      null::text as delete_request_id,
      null::uuid as create_audit_log_id,
      null::uuid as delete_audit_log_id,
      'orders_admin_extra_by_delivery_date'::text as source,
      o.created_at as created_record_at,
      o.updated_at
    from public.orders o
    cross join bounds b
    where lower(coalesce(o.order_origin, '')) = 'admin_extra'
      and o.delivery_date = p_operational_date
      and (
        public.is_admin()
        or exists (
          select 1
          from public.company_admins ca
          join public.companies c on c.id = ca.company_id
          where ca.user_id = auth.uid()
            and (
              c.slug = o.company_slug
              or public.admin_extra_company_location_allowed(c.slug, coalesce(o.location, o.delivery_location, ''))
            )
        )
      )
  ),
  deleted_orders as (
    select
      a.id,
      case
        when coalesce(a.metadata->>'order_id', a.metadata->'snapshot'->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then coalesce(a.metadata->>'order_id', a.metadata->'snapshot'->>'id')::uuid
      end as order_id,
      p_operational_date as operational_date,
      p_operational_date as delivery_date,
      b.started_at as window_started_at,
      b.closed_at as window_closed_at,
      coalesce(nullif(a.metadata->'snapshot'->>'created_at', '')::timestamptz, a.created_at) as created_at,
      case
        when coalesce(a.metadata->'snapshot'->>'created_by_admin_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then (a.metadata->'snapshot'->>'created_by_admin_id')::uuid
      end as created_by,
      coalesce(a.metadata->'snapshot'->>'created_by_admin_email', a.actor_email) as created_by_admin_email,
      coalesce(a.metadata->'snapshot'->>'created_by_admin_name', a.actor_name) as created_by_admin_name,
      coalesce(a.metadata->>'company_slug', a.metadata->'snapshot'->>'company_slug') as company_slug,
      coalesce(a.metadata->>'company_name', a.metadata->'snapshot'->>'company_name') as company_name,
      coalesce(a.metadata->>'location', a.metadata->'snapshot'->>'location') as location,
      coalesce(a.metadata->>'delivery_location', a.metadata->'snapshot'->>'delivery_location') as delivery_location,
      coalesce(a.metadata->'snapshot'->>'requesting_location_code', '') as location_key,
      coalesce(a.metadata->'snapshot'->>'service', a.metadata->>'service') as service,
      public.late_admin_extra_order_units(coalesce(a.metadata->'snapshot', '{}'::jsonb)) as total_items,
      public.late_admin_extra_order_snapshot_detail(coalesce(a.metadata->'snapshot', '{}'::jsonb)) as detail,
      coalesce(a.metadata->'snapshot', jsonb_build_object('audit_metadata', a.metadata)) as order_snapshot,
      'deleted'::text as historical_status,
      a.created_at as deleted_at,
      a.actor_id as deleted_by,
      a.actor_email as deleted_by_email,
      a.actor_name as deleted_by_name,
      a.metadata->>'reason' as deleted_reason,
      null::text as create_request_id,
      a.request_id as delete_request_id,
      null::uuid as create_audit_log_id,
      a.id as delete_audit_log_id,
      'audit_admin_extra_order_deleted_snapshot'::text as source,
      a.created_at as created_record_at,
      a.created_at as updated_at
    from public.audit_logs a
    cross join bounds b
    where a.action = 'admin_extra_order_deleted'
      and coalesce(a.metadata->>'origin', a.metadata->'snapshot'->>'order_origin', '') = 'admin_extra'
      and nullif(coalesce(a.metadata->>'delivery_date', a.metadata->'snapshot'->>'delivery_date', ''), '')::date = p_operational_date
      and (
        public.is_admin()
        or exists (
          select 1
          from public.company_admins ca
          join public.companies c on c.id = ca.company_id
          where ca.user_id = auth.uid()
            and (
              c.slug = coalesce(a.metadata->>'company_slug', a.metadata->'snapshot'->>'company_slug')
              or public.admin_extra_company_location_allowed(c.slug, coalesce(a.metadata->>'location', a.metadata->'snapshot'->>'location', a.metadata->>'delivery_location', a.metadata->'snapshot'->>'delivery_location', ''))
            )
        )
      )
      and not exists (
        select 1
        from public.orders o
        where o.id::text = coalesce(a.metadata->>'order_id', a.metadata->'snapshot'->>'id', '')
      )
  )
  select * from closed_rows
  union all
  select * from active_orders
  where not exists (select 1 from existing_closure)
  union all
  select * from deleted_orders
  where not exists (select 1 from existing_closure)
  order by created_at asc, id asc;
end;
$$;

drop function if exists public.close_late_admin_extra_operational_day(date);

create or replace function public.close_late_admin_extra_operational_day(p_operational_date date)
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

  select *
  into v_existing
  from public.late_admin_extra_order_closures
  where operational_date = p_operational_date
  for update;

  if found then
    return v_existing;
  end if;

  v_window_started_at := make_timestamptz(
    extract(year from (p_operational_date - 1))::integer,
    extract(month from (p_operational_date - 1))::integer,
    extract(day from (p_operational_date - 1))::integer,
    22, 0, 0, 'America/Argentina/Buenos_Aires'
  );
  v_window_closed_at := make_timestamptz(
    extract(year from p_operational_date)::integer,
    extract(month from p_operational_date)::integer,
    extract(day from p_operational_date)::integer,
    18, 0, 0, 'America/Argentina/Buenos_Aires'
  );

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
      'rows', coalesce(jsonb_agg(to_jsonb(rows) order by rows.created_at, rows.id), '[]'::jsonb)
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

revoke all on function public.get_late_admin_extra_history_days(date, date) from public, anon;
grant execute on function public.get_late_admin_extra_history_days(date, date) to authenticated;

revoke all on function public.get_late_admin_extra_history_for_day(date) from public, anon;
grant execute on function public.get_late_admin_extra_history_for_day(date) to authenticated;

revoke all on function public.close_late_admin_extra_operational_day(date) from public, anon;
grant execute on function public.close_late_admin_extra_operational_day(date) to authenticated;



-- ============================================================
-- BLOQUE 4: supabase/migrations/20260924103000_fix_late_extra_realtime_history_and_totals.sql
-- ============================================================

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
