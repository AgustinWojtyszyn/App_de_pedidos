import { describe, expect, it } from 'vitest'
import { DEFAULT_EXCLUDE_POST_REPORT_EXTRAS, buildDailyRemitoRows, buildFreshGroupForRemito, filterOrdersForRemitos } from './DailyRemitosPanel.jsx'

const epseGroup = {
  slug: 'epse',
  name: 'EPSE',
  displayName: 'EPSE – Los Caracoles',
  locationKey: 'epse_los_caracoles',
  locationLabel: 'EPSE – Los Caracoles',
  orders: [{ id: '10000000-0000-4000-8000-000000000001' }]
}

describe('DailyRemitosPanel remito row matching', () => {
  it('incluye post_report_extra por defecto para que los remitos contemplen extras del día', () => {
    expect(DEFAULT_EXCLUDE_POST_REPORT_EXTRAS).toBe(false)

    const result = filterOrdersForRemitos({
      orders: [
        { id: 'normal', status: 'archived', location: 'Genneia' },
        { id: 'extra-dia', status: 'post_report_extra', order_origin: 'admin_extra', location: 'Genneia' }
      ],
      companySlug: 'all',
      location: 'all',
      excludePostReportExtras: DEFAULT_EXCLUDE_POST_REPORT_EXTRAS
    })

    expect(result.map((order) => order.id)).toEqual(['normal', 'extra-dia'])
  })

  it('permite remitar sin extras del día y conserva admin_extra que ya pertenecían al cierre', () => {
    const result = filterOrdersForRemitos({
      orders: [
        { id: 'normal', status: 'archived', location: 'Genneia' },
        { id: 'admin-cierre', status: 'archived', order_origin: 'admin_extra', location: 'Genneia' },
        { id: 'extra-dia', status: 'post_report_extra', order_origin: 'admin_extra', location: 'Genneia' }
      ],
      companySlug: 'all',
      location: 'all',
      excludePostReportExtras: true
    })

    expect(result.map((order) => order.id)).toEqual(['normal', 'admin-cierre'])
  })

  it('rebuilds the company group from fresh orders before issuing so an existing extra cannot be omitted', () => {
    const baseOrder = {
      id: '50000000-0000-4000-8000-000000000001',
      status: 'archived',
      delivery_date: '2026-09-23',
      company_slug: 'padrebueno',
      company_name: 'Padre Bueno',
      location: 'Padre Bueno',
      total_items: 1,
      items: [{ id: 'main', name: 'Menú principal', quantity: 1 }]
    }
    const extraOrder = {
      id: '50000000-0000-4000-8000-000000000002',
      status: 'post_report_extra',
      order_origin: 'admin_extra',
      delivery_date: '2026-09-23',
      company_slug: 'padrebueno',
      company_name: 'Padre Bueno',
      location: 'Padre Bueno',
      total_items: 2,
      items: [{ id: 'main', name: 'Menú principal', quantity: 2 }]
    }
    const fallbackGroup = {
      slug: 'padrebueno',
      name: 'Padre Bueno',
      displayName: 'Padre Bueno',
      locationKey: '',
      orders: [baseOrder]
    }

    const fresh = buildFreshGroupForRemito({
      orders: [baseOrder, extraOrder],
      existing: {
        company_slug: 'padrebueno',
        company_name: 'Padre Bueno',
        delivery_date: '2026-09-23',
        location_key: ''
      },
      fallbackGroup,
      deliveryDate: '2026-09-23',
      excludePostReportExtras: false
    })

    expect(fresh.orders.map((order) => order.id).sort()).toEqual([
      baseOrder.id,
      extraOrder.id
    ].sort())
  })

  it('preserves the explicit option to remitar without post-report extras when rebuilding fresh orders', () => {
    const baseOrder = {
      id: '50000000-0000-4000-8000-000000000003',
      status: 'archived',
      delivery_date: '2026-09-23',
      company_slug: 'padrebueno',
      company_name: 'Padre Bueno',
      location: 'Padre Bueno',
      total_items: 1,
      items: [{ id: 'main', name: 'Menú principal', quantity: 1 }]
    }
    const extraOrder = {
      id: '50000000-0000-4000-8000-000000000004',
      status: 'post_report_extra',
      order_origin: 'admin_extra',
      delivery_date: '2026-09-23',
      company_slug: 'padrebueno',
      company_name: 'Padre Bueno',
      location: 'Padre Bueno',
      total_items: 2,
      items: [{ id: 'main', name: 'Menú principal', quantity: 2 }]
    }

    const fresh = buildFreshGroupForRemito({
      orders: [baseOrder, extraOrder],
      existing: {
        company_slug: 'padrebueno',
        company_name: 'Padre Bueno',
        delivery_date: '2026-09-23',
        location_key: ''
      },
      fallbackGroup: {
        slug: 'padrebueno',
        name: 'Padre Bueno',
        displayName: 'Padre Bueno',
        locationKey: '',
        orders: [baseOrder]
      },
      deliveryDate: '2026-09-23',
      excludePostReportExtras: true
    })

    expect(fresh.orders.map((order) => order.id)).toEqual([baseOrder.id])
  })

  it('does not show or associate an empty EPSE remito with blank location_key', () => {
    const rows = buildDailyRemitoRows({
      deliveryDate: '2026-08-21',
      locationKey: '',
      groups: [epseGroup],
      remitos: [{
        remito_id: '9baaa0ea-9cc7-4aa5-93fa-4640fec58f41',
        company_slug: 'epse',
        company_name: 'EPSE',
        delivery_date: '2026-08-21',
        remito_number: 30006,
        status: 'issued',
        order_ids: [],
        total_items: 0,
        location_key: '',
        snapshot: {
          orderIds: [],
          ordersCount: 0,
          totalItems: 0,
          totalMenus: 0,
          locationKey: '',
          locationLabel: ''
        }
      }]
    })

    expect(rows).toHaveLength(1)
    expect(rows[0].group.locationKey).toBe('epse_los_caracoles')
    expect(rows[0].existing).toBeNull()
    expect(rows.some((row) => row.existing?.remito_number === 30006)).toBe(false)
  })

  it('keeps blank location_key matching for companies without requesting locations', () => {
    const group = {
      slug: 'genneia',
      name: 'Genneia',
      displayName: 'Genneia',
      locationKey: '',
      orders: [{ id: '10000000-0000-4000-8000-000000000002' }]
    }

    const rows = buildDailyRemitoRows({
      deliveryDate: '2026-08-21',
      locationKey: '',
      groups: [group],
      remitos: [{
        remito_id: '20000000-0000-4000-8000-000000000001',
        company_slug: 'genneia',
        company_name: 'Genneia',
        delivery_date: '2026-08-21',
        remito_number: 40001,
        status: 'issued',
        order_ids: ['10000000-0000-4000-8000-000000000002'],
        location_key: '',
        snapshot: {
          orderIds: ['10000000-0000-4000-8000-000000000002'],
          ordersCount: 1,
          totalItems: 1,
          totalMenus: 1
        }
      }]
    })

    expect(rows).toHaveLength(1)
    expect(rows[0].existing?.remito_number).toBe(40001)
  })

  it('does not match or render cancelled remitos as operative rows', () => {
    const rows = buildDailyRemitoRows({
      deliveryDate: '2026-08-20',
      locationKey: '',
      groups: [epseGroup],
      remitos: [{
        remito_id: '30000000-0000-4000-8000-000000000005',
        company_slug: 'epse',
        company_name: 'EPSE',
        delivery_date: '2026-08-20',
        remito_number: 30005,
        status: 'cancelled',
        order_ids: ['10000000-0000-4000-8000-000000000001'],
        location_key: 'epse_los_caracoles',
        snapshot: {
          orderIds: ['10000000-0000-4000-8000-000000000001'],
          ordersCount: 1,
          totalItems: 1,
          totalMenus: 1,
          locationKey: 'epse_los_caracoles'
        }
      }]
    })

    expect(rows).toHaveLength(1)
    expect(rows[0].group.locationKey).toBe('epse_los_caracoles')
    expect(rows[0].existing).toBeNull()
    expect(rows.some((row) => row.existing?.remito_number === 30005)).toBe(false)
  })

  it('matches EPSE Obra Linea de Alta Tension with its issued remito by location_key', () => {
    const altaTensionGroup = {
      slug: 'epse',
      name: 'EPSE',
      displayName: 'EPSE - Obra Linea de Alta Tension',
      locationKey: 'epse_obra_linea_alta_tension',
      locationLabel: 'EPSE - Obra Linea de Alta Tension',
      orders: [{ id: '10000000-0000-4000-8000-000000000003' }]
    }

    const rows = buildDailyRemitoRows({
      deliveryDate: '2026-08-21',
      locationKey: '',
      groups: [altaTensionGroup],
      remitos: [{
        remito_id: '40000000-0000-4000-8000-000000000001',
        company_slug: 'epse',
        company_name: 'EPSE',
        delivery_date: '2026-08-21',
        remito_number: 30007,
        status: 'issued',
        order_ids: ['10000000-0000-4000-8000-000000000003'],
        location_key: 'epse_obra_linea_alta_tension',
        snapshot: {
          orderIds: ['10000000-0000-4000-8000-000000000003'],
          ordersCount: 1,
          totalItems: 1,
          totalMenus: 1,
          locationKey: 'epse_obra_linea_alta_tension'
        }
      }]
    })

    expect(rows).toHaveLength(1)
    expect(rows[0].group.locationKey).toBe('epse_obra_linea_alta_tension')
    expect(rows[0].existing?.remito_id).toBe('40000000-0000-4000-8000-000000000001')
    expect(rows[0].existing?.remito_number).toBe(30007)
  })
})
