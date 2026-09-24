-- CHECK SOLO LECTURA
-- Verifica específicamente las dos incidencias detectadas el 24/09/2026.
-- Los pedidos archivados en cero con descuentos registrados son históricos válidos.

with padre_bueno_missing as (
  select count(*)::integer as missing_count
  from public.orders o
  join public.companies c
    on lower(c.slug) = 'padrebueno'
  join public.company_remitos cr
    on cr.company_id = c.id
   and cr.delivery_date = o.delivery_date
   and cr.status = 'issued'
  where lower(coalesce(o.company_slug, '')) = 'padrebueno'
    and lower(coalesce(o.order_origin, '')) = 'admin_extra'
    and o.delivery_date >= current_date - 7
    and not (o.id = any(coalesce(cr.order_ids, array[]::uuid[])))
),
invalid_zero_orders as (
  select count(*)::integer as invalid_count
  from public.orders o
  where o.delivery_date >= current_date - 30
    and coalesce(o.total_items, 0) <= 0
    and not (
      o.status = 'archived'
      and exists (
        select 1
        from public.order_item_discounts d
        where d.order_id = o.id
      )
    )
),
historical_zero_orders as (
  select count(*)::integer as historical_count
  from public.orders o
  where o.delivery_date >= current_date - 30
    and coalesce(o.total_items, 0) <= 0
    and o.status = 'archived'
    and exists (
      select 1
      from public.order_item_discounts d
      where d.order_id = o.id
    )
),
scope_guard as (
  select
    to_regprocedure(
      'public.get_expected_company_remito_order_ids(uuid,date,text,boolean)'
    ) is not null
    and exists (
      select 1
      from pg_trigger
      where tgrelid = 'public.company_remitos'::regclass
        and tgname = 'trg_validate_company_remito_order_scope'
        and not tgisinternal
    ) as ok
)
select
  '09 · Padre Bueno remitos' as check_name,
  case when p.missing_count = 0 then 'PASS' else 'FAIL' end as resultado,
  'Extras faltantes en remitos emitidos últimos 7 días: ' || p.missing_count as detalle
from padre_bueno_missing p

union all

select
  '10 · Integridad pedidos recientes',
  case when z.invalid_count = 0 then 'PASS' else 'FAIL' end,
  'Pedidos cero inválidos: ' || z.invalid_count ||
  ' · históricos archivados con descuento preservados: ' || h.historical_count
from invalid_zero_orders z
cross join historical_zero_orders h

union all

select
  '11 · Guardia DB de remitos',
  case when s.ok then 'PASS' else 'FAIL' end,
  'Valida order_ids y snapshot contra los pedidos vigentes antes de emitir/actualizar'
from scope_guard s

order by 1;
