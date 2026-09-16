import { ordersService } from '../../services/orders'
import { buildIdempotencyStorageKey, generateIdempotencyKey } from './orderIdempotency'
import { buildOrderPayload } from './orderPayload'
import { hasDinnerOverrideInResponses } from './orderBusinessRules'
import { normalizeOrderItemsForService } from './orderItemNormalization'
import { hasHiddenOrderMenuSelection, hasSyntheticFallbackMenuSelection } from './menuDisplay'

const DUPLICATE_ORDER_MESSAGE = 'Ya tenés un pedido registrado para esta fecha y servicio.'
const INVALID_MENU_MESSAGE = 'El menú quedó desactualizado o no está disponible. Recargá la página e intentá nuevamente.'

// Keep retries stable even when browser storage is unavailable.
const memoryKeys = new Map()

const submitOrders = async ({
  turnosSeleccionados,
  selectedItemsList,
  selectedItemsListDinner,
  customResponsesArray,
  customResponsesDinnerArray,
  dinnerOverrideChoice,
  user,
  formData,
  deliveryDate,
  deliveryDates,
  companySlug = ''
}) => {
  const prepared = []
  if (!Array.isArray(turnosSeleccionados) || turnosSeleccionados.length === 0 ||
      turnosSeleccionados.some(service => !['lunch', 'dinner'].includes(service)) ||
      new Set(turnosSeleccionados).size !== turnosSeleccionados.length) {
    return { ok: false, errorMessage: 'Seleccioná un servicio válido.', forceLunchOnly: false }
  }

  for (const service of turnosSeleccionados) {
    const isDinner = service === 'dinner'
    const serviceDeliveryDate = deliveryDates?.[service] || deliveryDate

    const overrideChoice = isDinner ? dinnerOverrideChoice : null
    const rawItemsForService = isDinner ? selectedItemsListDinner : selectedItemsList
    const itemsForService = normalizeOrderItemsForService(service, rawItemsForService)
    const responsesForService = isDinner ? customResponsesDinnerArray : customResponsesArray

    if (hasSyntheticFallbackMenuSelection(rawItemsForService)) {
      return {
        ok: false,
        errorMessage: INVALID_MENU_MESSAGE,
        forceLunchOnly: false
      }
    }

    if (hasHiddenOrderMenuSelection(itemsForService, companySlug)) {
      return {
        ok: false,
        errorMessage: 'Esa opción de menú no está disponible para pedidos.',
        forceLunchOnly: false
      }
    }

    if ((rawItemsForService || []).length > 1) {
      return {
        ok: false,
        errorMessage: 'Solo podés seleccionar 1 comida principal por persona para almuerzo o cena.',
        forceLunchOnly: false
      }
    }

    if (isDinner) {
      const hasOverride = hasDinnerOverrideInResponses(responsesForService)
      if (itemsForService.length > 0 && hasOverride) {
        return {
          ok: false,
          errorMessage: 'Para cena elegí menú o la opción de cena, no ambas.',
          forceLunchOnly: false
        }
      }
    }

    const totalItems = itemsForService.length
    const { orderData, idempotencySignature } = buildOrderPayload({
      service,
      user,
      formData,
      deliveryDate: serviceDeliveryDate,
      itemsForService,
      responsesForService,
      dinnerOverrideChoice: overrideChoice,
      totalItems,
      idempotencyKey: null,
      companySlug
    })

    if (orderData.items.length === 0) {
      return { ok: false, errorMessage: 'Seleccioná una comida para cada servicio.', forceLunchOnly: false }
    }

    const idempotencyStorageKey = buildIdempotencyStorageKey(
      itemsForService,
      formData.location,
      idempotencySignature,
      service,
      user?.id || 'anon'
    )

    prepared.push({ orderData, idempotencyStorageKey })
  }

  // Include the entire batch identity so a changed companion order cannot reuse
  // a key from an earlier batch or from the individual creation flow.
  const batchIdentity = prepared.length > 1
    ? JSON.stringify(prepared.map(({ orderData }) => orderData).sort((a, b) => a.service.localeCompare(b.service)))
    : null
  const payloads = prepared.map(({ orderData, idempotencyStorageKey }) => {
    const storageKey = batchIdentity ? `${idempotencyStorageKey}:batch:${batchIdentity}` : idempotencyStorageKey
    let key = memoryKeys.get(storageKey)
    try {
      key = sessionStorage.getItem(storageKey) || key
    } catch { /* Storage may be disabled. Keep the in-memory retry identity. */ }
    key ||= generateIdempotencyKey()
    memoryKeys.set(storageKey, key)
    try {
      sessionStorage.setItem(storageKey, key)
    } catch { /* The same page can still retry safely. */ }
    return { ...orderData, idempotency_key: key }
  })

  // PostgreSQL is authoritative for duplicates and idempotent recovery. A
  // frontend pending-order check would reject a retry after a lost response.
  const { data, error } = payloads.length > 1
    ? await ordersService.createOrdersAtomic(payloads)
    : await ordersService.createOrder(payloads[0])

  if (error) {
    const msg = typeof error === 'string' ? error : (error.message || JSON.stringify(error))
    if (msg.includes('duplicate_active_order') || msg.includes('orders_active_user_delivery_service_uniq')) {
      return {
        ok: false,
        errorMessage: DUPLICATE_ORDER_MESSAGE,
        forceLunchOnly: false
      }
    }
    if (msg.includes('location_not_allowed') || msg.includes('location_required')) {
      return {
        ok: false,
        errorMessage: 'No tenés autorización para pedir en esa locación.',
        forceLunchOnly: false
      }
    }
    if (msg.toLowerCase().includes('order_window_closed')) {
      return {
        ok: false,
        errorMessage: 'Pedidos cerrados para tu sede. Revisá el horario indicado e intentá dentro de la ventana habilitada.',
        forceLunchOnly: false
      }
    }
    if (msg.includes('dinner') || msg.toLowerCase().includes('service') || msg.includes('feature')) {
      return {
        ok: false,
        errorMessage: 'No tenés habilitada la cena. Deja solo almuerzo o pedí alta a un admin.',
        forceLunchOnly: true
      }
    }
    if (msg.includes('violates row-level security policy') || msg.includes('new row violates row-level security')) {
      return {
        ok: false,
        errorMessage: 'Ya tienes un pedido pendiente. Espera hasta que se archive para crear uno nuevo.',
        forceLunchOnly: false
      }
    }
    return {
      ok: false,
      errorMessage: 'No pudimos crear el pedido. Intentá nuevamente.',
      forceLunchOnly: false
    }
  }

  const rows = Array.isArray(data) ? data : [data]
  const createdOrderIds = rows.map(row => row?.id || row?.order_id || row?.order?.id).filter(Boolean)
  if (createdOrderIds.length !== payloads.length) {
    return { ok: false, errorMessage: 'No pudimos confirmar el pedido. Intentá nuevamente.', forceLunchOnly: false }
  }
  return { ok: true, createdOrderIds }
}

export { submitOrders }
