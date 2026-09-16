import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ordersService } from '../../services/orders'
import { submitOrders } from './orderSubmit'

vi.mock('../../services/orders', () => ({ ordersService: {
  createOrder: vi.fn(), createOrdersAtomic: vi.fn(), getOrders: vi.fn(), deleteOrder: vi.fn()
} }))
const input = () => ({
  turnosSeleccionados: ['lunch', 'dinner'],
  selectedItemsList: [{ id: 'l', name: 'Pollo', quantity: 4 }],
  selectedItemsListDinner: [{ id: 'd', name: 'Pasta', quantity: 2 }],
  customResponsesArray: [{ id: 'dessert', response: 'Fruta' }],
  customResponsesDinnerArray: [], user: { id: 'atomic-user' },
  formData: { location: 'Greif', comments: 'Sin sal' },
  deliveryDates: { lunch: '2026-09-17', dinner: '2026-09-18' }
})

describe('atomic order submission', () => {
  afterEach(() => vi.unstubAllGlobals())
  beforeEach(() => {
    vi.clearAllMocks()
    ordersService.createOrdersAtomic.mockResolvedValue({ data: [{ id: 'lunch-id' }, { id: 'dinner-id' }], error: null })
    ordersService.createOrder.mockResolvedValue({ data: { id: 'single-id' }, error: null })
  })

  it('builds both normalized payloads and submits once, returning every ID', async () => {
    expect(await submitOrders(input())).toEqual({ ok: true, createdOrderIds: ['lunch-id', 'dinner-id'] })
    expect(ordersService.createOrdersAtomic).toHaveBeenCalledTimes(1)
    const [lunch, dinner] = ordersService.createOrdersAtomic.mock.calls[0][0]
    expect(lunch).toMatchObject({ service: 'lunch', delivery_date: '2026-09-17', total_items: 1, custom_responses: [{ id: 'dessert', response: 'Fruta' }] })
    expect(dinner).toMatchObject({ service: 'dinner', delivery_date: '2026-09-18', total_items: 1 })
    expect(lunch.items[0].quantity).toBe(1)
    expect(dinner.items[0].quantity).toBe(1)
    expect(lunch.idempotency_key).not.toBe(dinner.idempotency_key)
    expect(ordersService.createOrder).not.toHaveBeenCalled()
  })

  it('validates the second payload before any creation', async () => {
    const args = input()
    args.selectedItemsListDinner.push({ id: 'other', name: 'Otro' })
    expect((await submitOrders(args)).ok).toBe(false)
    expect(ordersService.createOrdersAtomic).not.toHaveBeenCalled()
    expect(ordersService.createOrder).not.toHaveBeenCalled()
  })

  it('rejects an empty second service before contacting the backend', async () => {
    expect((await submitOrders({ ...input(), selectedItemsListDinner: [] })).ok).toBe(false)
    expect(ordersService.createOrdersAtomic).not.toHaveBeenCalled()
    expect(ordersService.createOrder).not.toHaveBeenCalled()
  })

  it('recovers persisted keys after reloading the submission module', async () => {
    const saved = new Map()
    vi.stubGlobal('sessionStorage', {
      getItem: key => saved.get(key) || null,
      setItem: (key, value) => saved.set(key, value)
    })
    await submitOrders(input())
    vi.resetModules()
    const { submitOrders: reloadedSubmit } = await import('./orderSubmit')
    await reloadedSubmit(input())
    expect(ordersService.createOrdersAtomic.mock.calls[1][0]).toEqual(ordersService.createOrdersAtomic.mock.calls[0][0])
  })

  it('does not report success without every returned ID', async () => {
    ordersService.createOrdersAtomic.mockResolvedValue({ data: [{ id: 'only-one' }], error: null })
    expect((await submitOrders(input())).ok).toBe(false)
  })

  it.each(['dinner_not_enabled', 'duplicate_active_order', 'ORDER_WINDOW_CLOSED', 'location_not_allowed', 'unexpected_failure', 'PGRST202'])('fails closed on %s without individual inserts or compensation', async message => {
    ordersService.createOrdersAtomic.mockResolvedValue({ data: null, error: { message } })
    expect((await submitOrders(input())).ok).toBe(false)
    expect(ordersService.createOrder).not.toHaveBeenCalled()
    expect(ordersService.deleteOrder).not.toHaveBeenCalled()
  })

  it('reuses identities after a lost response and after success, even with reversed service order', async () => {
    ordersService.createOrdersAtomic.mockResolvedValueOnce({ data: null, error: { message: 'timeout' } })
    await submitOrders(input())
    expect((await submitOrders(input())).ok).toBe(true)
    await submitOrders({ ...input(), turnosSeleccionados: ['dinner', 'lunch'] })
    const calls = ordersService.createOrdersAtomic.mock.calls.map(([rows]) => Object.fromEntries(rows.map(row => [row.service, row.idempotency_key])))
    expect(calls[1]).toEqual(calls[0])
    expect(calls[2]).toEqual(calls[0])
    expect(ordersService.getOrders).not.toHaveBeenCalled()
  })

  it('changes both identities if one member changes', async () => {
    await submitOrders(input())
    const changed = input()
    changed.selectedItemsListDinner = [{ id: 'x', name: 'Tarta' }]
    await submitOrders(changed)
    const [first, second] = ordersService.createOrdersAtomic.mock.calls.map(([rows]) => rows)
    expect(second[0].idempotency_key).not.toBe(first[0].idempotency_key)
    expect(second[1].idempotency_key).not.toBe(first[1].idempotency_key)
  })

  it.each(['lunch', 'dinner'])('preserves individual %s and its retry identity', async service => {
    const args = { ...input(), turnosSeleccionados: [service] }
    expect(await submitOrders(args)).toEqual({ ok: true, createdOrderIds: ['single-id'] })
    await submitOrders(args)
    expect(ordersService.createOrdersAtomic).not.toHaveBeenCalled()
    expect(ordersService.createOrder.mock.calls[1][0]).toEqual(ordersService.createOrder.mock.calls[0][0])
  })
})
