import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LABEL_PRINT_BATCH_SIZE,
  LABEL_PRINT_BATCH_SIZE_OPTIONS,
  createLabelPrintBatches,
  getUniquePrintableOrders,
  normalizeLabelPrintBatchSize
} from './labelPrintBatchUtils'

const buildOrders = (count) => Array.from(
  { length: count },
  (_, index) => ({ id: `order-${index + 1}` })
)

describe('label print batch planning', () => {
  it('uses only the supported batch sizes', () => {
    expect(LABEL_PRINT_BATCH_SIZE_OPTIONS).toEqual([25, 50, 100])
    expect(DEFAULT_LABEL_PRINT_BATCH_SIZE).toBe(50)
    expect(normalizeLabelPrintBatchSize('25')).toBe(25)
    expect(normalizeLabelPrintBatchSize(100)).toBe(100)
    expect(normalizeLabelPrintBatchSize(0)).toBe(50)
    expect(normalizeLabelPrintBatchSize(200)).toBe(50)
  })

  it('removes invalid and duplicate orders before batching', () => {
    const first = { id: 'order-1' }
    const second = { id: 'order-2' }

    expect(getUniquePrintableOrders([
      first,
      null,
      { id: '' },
      first,
      { id: 'order-1' },
      second
    ])).toEqual([first, second])
  })

  it('creates exact 25-label batches without losing or duplicating orders', () => {
    const orders = buildOrders(51)
    const batches = createLabelPrintBatches(orders, 25)

    expect(batches.map(batch => batch.length)).toEqual([25, 25, 1])
    expect(batches.flat().map(order => order.id)).toEqual(
      orders.map(order => order.id)
    )
  })

  it('creates exact 50-label batches and preserves the final remainder', () => {
    const orders = buildOrders(123)
    const batches = createLabelPrintBatches(orders, 50)

    expect(batches.map(batch => batch.length)).toEqual([50, 50, 23])
    expect(new Set(batches.flat().map(order => order.id)).size).toBe(123)
  })

  it('handles empty and exact-size selections deterministically', () => {
    expect(createLabelPrintBatches([], 50)).toEqual([])
    expect(createLabelPrintBatches(buildOrders(50), 50).map(batch => batch.length)).toEqual([50])
    expect(createLabelPrintBatches(buildOrders(100), 100).map(batch => batch.length)).toEqual([100])
  })
})
