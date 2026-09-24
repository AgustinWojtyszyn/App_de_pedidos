begin;

create or replace function public.get_admin_access_context()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_is_global boolean := false;
  v_companies jsonb := '[]'::jsonb;
  v_consumption_report_companies jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  v_is_global := public.is_admin();

  if v_is_global then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'slug', c.slug,
      'name', c.name
    ) order by c.name), '[]'::jsonb)
    into v_companies
    from public.companies c
    where c.slug <> 'global';
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'slug', c.slug,
      'name', c.name
    ) order by c.name), '[]'::jsonb)
    into v_companies
    from public.company_admins ca
    join public.companies c on c.id = ca.company_id
    where ca.user_id = auth.uid()
      and c.slug <> 'global';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'slug', c.slug,
    'name', c.name
  ) order by c.name), '[]'::jsonb)
  into v_consumption_report_companies
  from public.companies c
  where c.slug <> 'global'
    and public.has_consumption_report_access(c.slug);

  return jsonb_build_object(
    'is_global_admin', v_is_global,
    'is_company_admin', jsonb_array_length(v_companies) > 0,
    'companies', v_companies,
    'can_view_consumption_report', jsonb_array_length(v_consumption_report_companies) > 0,
    'consumption_report_companies', v_consumption_report_companies,
    'can_manage_late_extra_history', public.can_manage_late_extra_history(auth.uid()),
    'can_create_late_admin_extra_order', public.is_late_admin_extra_order_authorized(auth.uid()),
    'can_manage_order_discounts', public.can_manage_order_discounts(auth.uid())
  );
end;
$$;

revoke all on function public.get_admin_access_context() from public;
revoke all on function public.get_admin_access_context() from anon;
grant execute on function public.get_admin_access_context() to authenticated;

notify pgrst, 'reload schema';

commit;
