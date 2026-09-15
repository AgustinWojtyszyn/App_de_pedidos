begin;

-- Final idempotent guard for the explicitly authorized Igarreta/ISEMAR
-- consumption-report viewers. Replaying/deploying this migration can only add
-- the narrow report permission; it never grants company-admin privileges.
insert into public.user_permissions (user_id, permission, company_slug)
select u.id, 'consumption_report_viewer', c.slug
from public.users u
cross join public.companies c
where lower(trim(u.email)) in (
  'lcorrea@imasa.com.ar',
  'ggalvarini@imasa.com.ar',
  'vcastilla@imasa.com.ar',
  'mborras@imasa.com.ar',
  'marianelaborras@gmail.com'
)
  and c.slug in ('igarreta', 'isemar')
on conflict (user_id, permission, company_slug) do nothing;

-- Fail the deployment instead of silently leaving a known viewer half-enabled.
do $$
declare
  v_missing integer;
begin
  select count(*)
  into v_missing
  from public.users u
  cross join public.companies c
  where lower(trim(u.email)) in (
    'lcorrea@imasa.com.ar',
    'ggalvarini@imasa.com.ar',
    'vcastilla@imasa.com.ar',
    'mborras@imasa.com.ar',
    'marianelaborras@gmail.com'
  )
    and c.slug in ('igarreta', 'isemar')
    and not exists (
      select 1
      from public.user_permissions up
      where up.user_id = u.id
        and up.permission = 'consumption_report_viewer'
        and up.company_slug = c.slug
    );

  if v_missing > 0 then
    raise exception 'consumption_report_viewer_guard_failed: % permission rows missing', v_missing;
  end if;
end;
$$;

commit;
