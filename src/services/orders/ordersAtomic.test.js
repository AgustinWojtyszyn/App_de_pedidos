import { describe, it, expect, vi } from 'vitest'
import { createOrdersService } from './ordersService'

describe('createOrdersAtomic', () => {
  it.each([null, { code: 'PGRST202' }, { message: 'unexpected database failure' }])('uses exactly one RPC and propagates its result: %j', async error => {
    const data = error ? null : [{ id: 'l' }, { id: 'd' }]
    const rpc = vi.fn().mockResolvedValue({ data, error })
    const from = vi.fn()
    const invalidateCache = vi.fn()
    const service = createOrdersService({ supabase: { rpc, from }, invalidateCache })
    const payloads = [{ user_id: 'u', service: 'lunch', idempotency_key: 'l' }, { user_id: 'u', service: 'dinner', idempotency_key: 'd' }]
    expect(await service.createOrdersAtomic(payloads)).toEqual({ data, error })
    expect(rpc).toHaveBeenCalledExactlyOnceWith('create_orders_atomic', { p_user_id: 'u', p_orders: payloads })
    expect(from).not.toHaveBeenCalled()
    expect(invalidateCache).toHaveBeenCalledOnce()
  })
})
