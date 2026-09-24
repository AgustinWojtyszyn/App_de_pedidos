begin;

-- Los usuarios deben recibir también los productos deshabilitados de cada empresa.
-- Si se filtran en SQL, el frontend no puede distinguir "sin configuración" de "deshabilitado".
create or replace function public.get_public_company_catalog()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'slug', c.slug,
    'name', c.name,
    'description', c.description,
    'subtitle', c.subtitle,
    'active', c.active,
    'visibility', c.visibility,
    'optionsSourceSlug', c.options_source_slug,
    'settings', c.settings,
    'labelSettings', c.label_settings,
    'integrationSettings', c.integration_settings,
    'services', coalesce(s.services, '[]'::jsonb),
    'schedule', coalesce(to_jsonb(cs), '{}'::jsonb) - 'company_id' - 'created_at' - 'updated_at',
    'locations', coalesce(l.locations, '[]'::jsonb),
    'rules', coalesce(rs.rules, '{}'::jsonb),
    'menuItems', coalesce(mi.menu_items, '[]'::jsonb)
  ) order by c.name), '[]'::jsonb)
  from public.companies c
  left join public.company_schedule_settings cs on cs.company_id = c.id
  left join lateral (
    select jsonb_agg(jsonb_build_object('service', service, 'enabled', enabled) order by service) services
    from public.company_services svc
    where svc.company_id = c.id and svc.enabled = true
  ) s on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'id', loc.id,
      'name', loc.display_name,
      'code', loc.code,
      'slug', loc.slug,
      'active', loc.active,
      'deliveryName', coalesce(loc.delivery_name, loc.display_name),
      'scheduleMode', loc.schedule_mode,
      'scheduleFlow', loc.schedule_flow
    ) order by loc.display_name) locations
    from public.order_locations loc
    where loc.company_id = c.id and loc.active = true
  ) l on true
  left join lateral (
    select jsonb_object_agg(rule_key, jsonb_build_object('enabled', enabled, 'value', value)) rules
    from public.company_rule_settings crs
    where crs.company_id = c.id
  ) rs on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'key', menu_item_key,
      'enabled', enabled,
      'displayLabel', display_label,
      'sortOrder', sort_order
    ) order by sort_order, menu_item_key) menu_items
    from public.company_menu_item_settings cmis
    where cmis.company_id = c.id
  ) mi on true
  where c.active = true and c.visibility = 'public';
$$;

-- EPSE debe quedar explícitamente sin ninguno de los tres tipos de bife.
insert into public.company_menu_item_settings (
  company_id,
  menu_item_key,
  enabled,
  display_label,
  sort_order
)
select
  c.id,
  b.menu_item_key,
  false,
  b.display_label,
  b.sort_order
from public.companies c
cross join (
  values
    ('bife_dia'::text, 'Bife del día'::text, 70),
    ('bife_lomo'::text, 'Bife de lomo'::text, 71),
    ('bife_pollo'::text, 'Bife de pollo'::text, 72)
) as b(menu_item_key, display_label, sort_order)
where lower(c.slug) = 'epse'
on conflict (company_id, menu_item_key) do update
set enabled = excluded.enabled,
    display_label = excluded.display_label,
    sort_order = excluded.sort_order,
    updated_at = now();

revoke all on function public.get_public_company_catalog() from public;
revoke all on function public.get_public_company_catalog() from anon;
grant execute on function public.get_public_company_catalog() to authenticated;

notify pgrst, 'reload schema';

commit;
