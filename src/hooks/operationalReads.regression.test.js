import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const dashboardSource = readFileSync(
  new URL('./dashboard/useDashboardOrders.js', import.meta.url),
  'utf8'
)
const orderBootstrapSource = readFileSync(
  new URL('./useOrderBootstrap.js', import.meta.url),
  'utf8'
)

describe('bounded operational reads', () => {
  it('keeps the personal dashboard away from administrative people views', () => {
    expect(dashboardSource).toContain('db.getOrders(user.id, { limit: DASHBOARD_ORDER_LIMIT })')
    expect(dashboardSource).not.toContain('getAdminPeopleUnified')
    expect(dashboardSource).not.toContain('getOrdersWithPersonKey')
  })

  it('separates active-order checks from bounded suggestion history', () => {
    expect(orderBootstrapSource).toContain('const ORDER_SUGGESTION_HISTORY_LIMIT = 40')
    expect(orderBootstrapSource).toContain('const ACTIVE_ORDER_DATE_LIMIT = 20')
    expect(orderBootstrapSource).toContain("status: 'pending'")
    expect(orderBootstrapSource).toContain('deliveryDate,')
    expect(orderBootstrapSource).toContain('db.getOrders(user.id, { limit: ORDER_SUGGESTION_HISTORY_LIMIT })')
    expect(orderBootstrapSource).not.toContain('const { data, error } = await db.getOrders(user.id)')
  })
})
