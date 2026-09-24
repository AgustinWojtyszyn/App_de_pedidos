import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const currentDir = dirname(fileURLToPath(import.meta.url))
const modalSource = readFileSync(join(currentDir, 'AdminExtraOrderModal.jsx'), 'utf8')
const historySource = readFileSync(join(currentDir, 'LateAdminExtraHistoryPanel.jsx'), 'utf8')
const dailyOrdersSource = readFileSync(join(currentDir, '../DailyOrders.jsx'), 'utf8')
const dailyDataSource = readFileSync(join(currentDir, '../../hooks/useDailyOrdersData.js'), 'utf8')
const calculationSource = readFileSync(join(currentDir, '../../utils/daily/dailyOrderCalculations.js'), 'utf8')

describe('late admin extra realtime flow', () => {
  it('uses the exact 22:01 to 18:00 business window in the modal', () => {
    expect(modalSource).toContain('const LATE_ADMIN_WINDOW_START_SECONDS = 22 * 3600 + 60')
    expect(modalSource).toContain('const LATE_ADMIN_WINDOW_END_SECONDS = 18 * 3600')
    expect(modalSource).toContain('seconds >= LATE_ADMIN_WINDOW_START_SECONDS')
    expect(modalSource).toContain('seconds < LATE_ADMIN_WINDOW_END_SECONDS')
  })

  it('refreshes Histórico de extras immediately when an extra is created', () => {
    expect(dailyOrdersSource).toContain('const [extraHistoryRefreshKey, setExtraHistoryRefreshKey] = useState(0)')
    expect(dailyOrdersSource).toContain('setExtraHistoryRefreshKey((value) => value + 1)')
    expect(dailyOrdersSource).toContain('refreshKey={extraHistoryRefreshKey}')
    expect(historySource).toContain("refreshKey = 0")
    expect(historySource).toContain('loadDays(operationalDate)')
    expect(historySource).toContain('[operationalDate, refreshKey]')
  })

  it('keeps post-report extras inside the daily dataset and operational total', () => {
    expect(dailyDataSource).toContain("statuses: ['pending', 'archived', 'post_report_extra']")
    expect(dailyDataSource).toContain('setStats(calculateStats(todayOrders))')
    expect(calculationSource).toContain('totalItems += units')
    expect(calculationSource).toContain("order.status === 'post_report_extra'")
    expect(calculationSource).toContain('postReportExtra += units')
  })
})
