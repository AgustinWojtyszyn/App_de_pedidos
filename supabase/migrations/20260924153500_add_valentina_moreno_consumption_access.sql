begin;

-- Refuerzo para vmoreno@imasa.com.ar: acceso de solo lectura al reporte de consumo de Igarreta e ISEMAR.
-- La autorización por email autenticado evita que el acceso desaparezca si public.users
-- todavía no está sincronizado con el UUID de Auth. Si el perfil existe, también dejamos
-- persistidos los permisos granulares.
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
      select 1
      from public.company_admins ca
      join public.companies c on c.id = ca.company_id
      cross join requested r
      where ca.user_id = auth.uid()
        and lower(c.slug) = r.slug
    )
    or exists (
      select 1
      from public.user_permissions up
      cross join requested r
      where up.user_id = auth.uid()
        and up.permission = 'consumption_report_viewer'
        and lower(trim(up.company_slug)) = r.slug
    )
    or exists (
      select 1
      from identity i
      cross join requested r
      where i.email in (
        'lcorrea@imasa.com.ar',
        'ggalvarini@imasa.com.ar',
        'vcastilla@imasa.com.ar',
        'mborras@imasa.com.ar',
        'marianelaborras@gmail.com',
        'vmoreno@imasa.com.ar'
      )
        and r.slug in ('igarreta', 'isemar')
    );
$$;

insert into public.user_permissions (user_id, permission, company_slug)
select u.id, 'consumption_report_viewer', c.slug
from public.users u
cross join public.companies c
where lower(trim(u.email)) = 'vmoreno@imasa.com.ar'
  and lower(c.slug) in ('igarreta', 'isemar')
on conflict (user_id, permission, company_slug) do nothing;

revoke all on function public.has_consumption_report_access(text) from public;
revoke all on function public.has_consumption_report_access(text) from anon;
grant execute on function public.has_consumption_report_access(text) to authenticated;

commit;
