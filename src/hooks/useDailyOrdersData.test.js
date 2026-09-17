import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const currentDir = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(currentDir, 'useDailyOrdersData.js'), 'utf8')
const dailyOrdersSource = readFileSync(join(currentDir, '../components/DailyOrders.jsx'), 'utf8')
const dailyHeaderSource = readFileSync(join(currentDir, '../components/daily/DailyHeader.jsx'), 'utf8')
const dailyExportActionsSource = readFileSync(join(currentDir, '../components/daily/DailyExportActions.jsx'), 'utf8')

describe('useDailyOrdersData daily orders loading', () => {
  it('starts with the current operational delivery date', () => {
    expect(source).toContain('useState(() => getTomorrowISOInTimeZone())')
  })

  it('loads daily orders with server-side delivery_date and operational statuses', () => {
    expect(source).toContain('db.getDailyOrdersForAdmin')
    expect(source).toContain('deliveryDate: nextOperationalDate')
    expect(source).toContain("statuses: ['pending', 'archived', 'post_report_extra']")
    expect(source).toContain('resolveAdminExtraCreator(order')
    expect(source).not.toContain('db.getOrdersWithPersonKey(')
    expect(source).not.toContain('Solicitado por admin')
  })

  it('excludes zero-quantity items from the dish selector', () => {
    expect(source).toContain('getItemOperationalQuantity(item) > 0')
    expect(source).toContain('dishesSet.add(item.name)')
  })

  it('changes the selected delivery date through the unfiltered historical view', () => {
    expect(source).toContain('handleDeliveryDateChange')
    expect(source).toContain('setOperationalDate(nextDate)')
    expect(source).toContain('deliveryDate = operationalDate')
    expect(dailyOrdersSource).toContain('const handleOperationalDateChange = (nextDate) => {')
    expect(dailyOrdersSource).toContain("setSelectedLocation('all')")
    expect(dailyOrdersSource).toContain("setSelectedStatus('all')")
    expect(dailyOrdersSource).toContain("setSelectedDish('all')")
    expect(dailyOrdersSource).toContain("setSelectedSide('all')")
    expect(dailyOrdersSource).toContain('handleDeliveryDateChange(nextDate)')
    expect(dailyOrdersSource).toContain('onDeliveryDateChange={handleOperationalDateChange}')
    expect(dailyHeaderSource).toContain('onDeliveryDateChange(event.target.value)')
  })

  it('refreshes using the selected delivery date', () => {
    expect(source).toContain('await fetchDailyOrders(false, operationalDate)')
  })

  it('keeps the newest date request authoritative when loads overlap', () => {
    expect(source).toContain('const requestSequenceRef = useRef(0)')
    expect(source).toContain('const requestId = ++requestSequenceRef.current')
    expect(source).toContain('const isLatestRequest = () => requestId === requestSequenceRef.current')
    expect(source.match(/if \(!isLatestRequest\(\)\) return \[\]/g)?.length).toBeGreaterThanOrEqual(3)
    expect(source).toContain('fetchDailyReportRunStatus(nextOperationalDate, requestId)')
    expect(source).toContain('requestId === null || requestId === requestSequenceRef.current')
    expect(source).toContain('loadingRequestRef.current === requestId')
    expect(source).not.toContain('isFetchingRef')
  })

  it('polls only the live operational date and pauses while the tab is hidden', () => {
    const historicalGuard = source.indexOf('if (operationalDate !== liveOperationalDate) return')
    const intervalSetup = source.indexOf('const interval = setInterval(refreshIfVisible, 30000)')

    expect(source).toContain('const liveOperationalDate = getTomorrowISOInTimeZone()')
    expect(historicalGuard).toBeGreaterThan(-1)
    expect(intervalSetup).toBeGreaterThan(historicalGuard)
    expect(source).toContain("document.visibilityState !== 'visible'")
    expect(source).toContain("document.addEventListener('visibilitychange', handleVisibilityChange)")
    expect(source).toContain("document.removeEventListener('visibilitychange', handleVisibilityChange)")
    expect(source).toContain("if (document.visibilityState === 'visible')")
    expect(source).toContain('fetchDailyOrders(true, operationalDate)')
  })

  it('counts pending order rows separately from pending units before bulk archive', () => {
    expect(source).toContain('const pendingOrders = (Array.isArray(orders) ? orders : []).filter')
    expect(source).toContain('const pendingCount = pendingOrders.length')
    expect(source).toContain('const pendingUnits = pendingOrders.reduce((sum, order) => sum + getOperationalOrderUnits(order), 0)')
    expect(source).toContain('${pendingUnits} vianda${pendingUnits === 1 ? \'\' : \'s\'}')
  })

  it('routes the refresh button through the filtered daily orders loader', () => {
    expect(dailyOrdersSource).toContain('onRefresh={handleRefresh}')
    expect(dailyHeaderSource).toContain('onClick={onRefresh}')
    expect(dailyOrdersSource).not.toContain('getOrdersWithPersonKey(')
    expect(dailyHeaderSource).not.toContain('getOrdersWithPersonKey(')
    expect(dailyExportActionsSource).not.toContain('getOrdersWithPersonKey(')
  })

  it('keeps exports, summaries and close status based on the loaded daily dataset', () => {
    expect(dailyOrdersSource).toContain('filterOrdersByCompany(sortedOrders, exportCompany)')
    expect(dailyOrdersSource).toContain('const deliveryDateLabel = formatDeliveryDateLabel(operationalDate)')
    expect(dailyOrdersSource).toContain('tomorrowLabel={deliveryDateLabel}')
    expect(dailyOrdersSource).toContain('getDailyOperationalStatus({')
    expect(dailyOrdersSource).toContain('orders: allOrders')
    expect(dailyOrdersSource).toContain('deliveryDate: operationalDate')
    expect(dailyOrdersSource).toContain('buildPrintStats(allOrders)')
  })

  it('cancels admin extra orders through their isolated flow scoped to the selected delivery date', () => {
    expect(source).toContain('handleCancelExtraOrders')
    expect(source).toContain('isAdminExtraOrder(order)')
    expect(source).toContain("String(order.delivery_date || '') === String(operationalDate || '')")
    expect(source).toContain('db.deleteAdminExtraOrder')
    expect(source).not.toContain('cancelOwnPendingOrder')
    expect(dailyOrdersSource).toContain('AdminExtraCancelPanel')
    expect(dailyOrdersSource).toContain('onCancelExtras={handleCancelExtraOrders}')
  })

  it('registers order discounts through an authorized modal and refreshes loaded totals', () => {
    expect(source).toContain('canManageOrderDiscounts')
    expect(source).toContain('handleCreateOrderDiscount')
    expect(source).toContain('db.createOrderDiscount')
    expect(source).toContain('delivery_date: operationalDate')
    expect(source).toContain('setDiscountingOrders(true)')
    expect(source).toContain('await handleRefresh()')
    expect(dailyOrdersSource).toContain('OrderDiscountModal')
    expect(dailyOrdersSource).toContain('onDiscountOrders={canManageOrderDiscounts ? () => setDiscountModalOpen(true) : null}')
    expect(dailyExportActionsSource).toContain('Descontar pedidos')
  })
})
