-- CHECK SOLO LECTURA
-- Detecta extras del día que todavía no estén incluidos en un remito emitido.

WITH extras AS (
  SELECT
    o.id AS pedido_extra,
    o.delivery_date,
    o.company_name,
    o.total_items,
    public.normalize_company_remito_slug(
      COALESCE(o.company_slug, o.company_name, o.organization)
    ) AS empresa_slug,
    CASE
      WHEN public.normalize_company_remito_slug(
        COALESCE(o.company_slug, o.company_name, o.organization)
      ) IN ('epse', 'isemar')
      THEN COALESCE(
        NULLIF(loc.slug, ''),
        NULLIF(dloc.slug, ''),
        public.normalize_order_schedule_location_key(
          COALESCE(
            o.requesting_location_code,
            o.location,
            o.delivery_location,
            ''
          )
        )
      )
      ELSE ''
    END AS location_key
  FROM public.orders o
  LEFT JOIN public.order_locations loc
    ON loc.id = o.order_location_id
  LEFT JOIN public.order_locations dloc
    ON dloc.id = o.delivery_order_location_id
  WHERE o.delivery_date =
    (NOW() AT TIME ZONE 'America/Argentina/San_Juan')::date
    AND LOWER(COALESCE(o.order_origin, '')) = 'admin_extra'
    AND o.status IN (
      'pending',
      'archived',
      'post_report_extra'
    )
),
resultado AS (
  SELECT
    e.*,
    cr.id AS remito_id,
    cr.remito_number,
    cr.location_key AS remito_location_key
  FROM extras e
  JOIN public.companies c
    ON c.slug = e.empresa_slug
  LEFT JOIN public.company_remitos cr
    ON cr.company_id = c.id
    AND cr.delivery_date = e.delivery_date
    AND cr.status = 'issued'
    AND (
      e.empresa_slug NOT IN ('epse', 'isemar')
      OR COALESCE(cr.location_key, '') = COALESCE(e.location_key, '')
    )
    AND e.pedido_extra = ANY(
      COALESCE(cr.order_ids, ARRAY[]::uuid[])
    )
)
SELECT
  pedido_extra,
  empresa_slug,
  company_name AS empresa,
  total_items AS viandas,
  location_key,
  remito_number,
  CASE
    WHEN remito_id IS NULL THEN 'FALTA EN REMITO'
    ELSE 'OK'
  END AS resultado
FROM resultado
WHERE remito_id IS NULL
ORDER BY empresa_slug, location_key;
