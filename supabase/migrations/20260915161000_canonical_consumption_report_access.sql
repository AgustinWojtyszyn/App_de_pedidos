begin;

-- Canonical access check. Permissions are normally tied to auth.uid(), but the
-- known Igarreta/ISEMAR viewers also receive an identity fallback by normalized
-- authenticated email. This avoids access loss when public.users was recreated
-- or linked to a different auth UUID.
create or replace function public.has_consumption_report_access(p_company_slug text default null)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with requested as (
    select nullif(lower(trim(coalesce(p_company_slug, ''))), '') as slug
  ), identity as (
    select auth.uid() as user_id,
           lower(trim(coalesce(auth.jwt() ->> 'email', ''))) as email
  )
  select coalesce(public.is_admin(), false)
    or exists (
      select 1 from public.company_admins ca
      join public.companies c on c.id = ca.company_id
      cross join requested r
      where ca.user_id = auth.uid() and lower(c.slug) = r.slug
    )
    or exists (
      select 1 from public.user_permissions up
      cross join requested r
      where up.user_id = auth.uid()
        and up.permission = 'consumption_report_viewer'
        and lower(trim(up.company_slug)) = r.slug
    )
    or exists (
      select 1 from identity i cross join requested r
      where i.email in (
        'lcorrea@imasa.com.ar',
        'ggalvarini@imasa.com.ar',
        'vcastilla@imasa.com.ar',
        'mborras@imasa.com.ar',
        'marianelaborras@gmail.com'
      ) and r.slug in ('igarreta', 'isemar')
    );
$$;

-- Keep persisted rows repaired when a matching public.users identity exists.
insert into public.user_permissions (user_id, permission, company_slug)
select u.id, 'consumption_report_viewer', c.slug
from public.users u cross join public.companies c
where lower(trim(u.email)) in (
  'lcorrea@imasa.com.ar','ggalvarini@imasa.com.ar','vcastilla@imasa.com.ar',
  'mborras@imasa.com.ar','marianelaborras@gmail.com'
) and lower(c.slug) in ('igarreta','isemar')
on conflict (user_id, permission, company_slug) do nothing;

revoke all on function public.has_consumption_report_access(text) from public;
revoke all on function public.has_consumption_report_access(text) from anon;
grant execute on function public.has_consumption_report_access(text) to authenticated;

commit;
