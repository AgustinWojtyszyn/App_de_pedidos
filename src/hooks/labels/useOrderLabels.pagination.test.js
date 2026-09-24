import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const hookSource = readFileSync(
  new URL('./useOrderLabels.js', import.meta.url),
  'utf8'
)

const pageSource = readFileSync(
  new URL('../../components/OrderLabelsPage.jsx', import.meta.url),
  'utf8'
)

const resultsSource = readFileSync(
  new URL('../../components/labels/OrderLabelsResults.jsx', import.meta.url),
  'utf8'
)

describe('order labels pagination regression', () => {
  it('keeps the selected service date stable across label printing and page remounts', () => {
    expect(hookSource).toContain("const LABEL_DELIVERY_DATE_STORAGE_KEY = 'sf-order-labels-delivery-date'")
    expect(hookSource).toContain('deliveryDate: getPersistedDeliveryDate()')
    expect(hookSource).toContain("if (name === 'deliveryDate') persistDeliveryDate(value)")
    expect(hookSource).toContain('window.localStorage.setItem(')
  })

  it('loads the complete server result before applying client filters and UI pagination', () => {
    expect(hookSource).toContain('const SERVER_PAGE_SIZE = 100')
    expect(hookSource).toContain('while (hasMore)')
    expect(hookSource).toContain('offset: serverOffset')
    expect(hookSource).not.toContain('offset: page * PAGE_SIZE')
    expect(hookSource).toContain('const matchingOrders = useMemo')
    expect(hookSource).toContain('return matchingOrders.slice(start, start + PAGE_SIZE)')
  })

  it('derives counts and page count from the filtered print-state result instead of raw Supabase count', () => {
    expect(hookSource).toContain('const totalCount = matchingOrders.length')
    expect(hookSource).toContain('Math.ceil(totalCount / PAGE_SIZE)')
    expect(hookSource).toContain('pending,')
    expect(hookSource).toContain('printed,')
    expect(hookSource).toContain('all: filteredOrders.length')
  })

  it('selects every matching label even when 51 or more results span multiple UI pages', () => {
    expect(hookSource).toContain('const selectAllMatching = useCallback')
    expect(hookSource).toContain('matchingOrders.forEach(order => next.add(order.id))')
    expect(pageSource).toContain('labels.selectAllMatching')
    expect(pageSource).toContain('labels.unselectAllMatching')
    expect(pageSource).toContain('Seleccionar todos (${labels.totalCount})')
    expect(resultsSource).toContain('onSelectAll')
    expect(resultsSource).toContain('Seleccionar todos (${totalCount})')
  })
})
