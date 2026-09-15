export const LABEL_PRINT_BATCH_SIZE_OPTIONS = Object.freeze([25, 50, 100])
export const DEFAULT_LABEL_PRINT_BATCH_SIZE = 50

const normalizeOrderId = (order = {}) => String(order?.id || '').trim()

export const getUniquePrintableOrders = (orders = []) => {
  const seenIds = new Set()
  const printableOrders = []

  ;(Array.isArray(orders) ? orders : []).forEach((order) => {
    const orderId = normalizeOrderId(order)
    if (!orderId || seenIds.has(orderId)) return

    seenIds.add(orderId)
    printableOrders.push(order)
  })

  return printableOrders
}

export const normalizeLabelPrintBatchSize = (
  value,
  fallback = DEFAULT_LABEL_PRINT_BATCH_SIZE
) => {
  const parsed = Number(value)
  const safeFallback = LABEL_PRINT_BATCH_SIZE_OPTIONS.includes(Number(fallback))
    ? Number(fallback)
    : DEFAULT_LABEL_PRINT_BATCH_SIZE

  return LABEL_PRINT_BATCH_SIZE_OPTIONS.includes(parsed)
    ? parsed
    : safeFallback
}

export const createLabelPrintBatches = (
  orders = [],
  batchSize = DEFAULT_LABEL_PRINT_BATCH_SIZE
) => {
  const printableOrders = getUniquePrintableOrders(orders)
  const safeBatchSize = normalizeLabelPrintBatchSize(batchSize)
  const batches = []

  for (let index = 0; index < printableOrders.length; index += safeBatchSize) {
    batches.push(printableOrders.slice(index, index + safeBatchSize))
  }

  return batches
}
