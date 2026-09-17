import { describe, expect, it, vi } from 'vitest'
import { createUsersService } from './usersService'

const createSupabaseMock = (rpcResult = { data: [{ id: 'user-1', role: 'admin' }], error: null }) => {
  const calls = []
  return {
    calls,
    supabase: {
      rpc(name, args) {
        calls.push(['rpc', name, args])
        return Promise.resolve(rpcResult)
      },
      from(table) {
        calls.push(['from', table])
        return {
          update(payload) {
            calls.push(['update', payload])
            return this
          }
        }
      }
    }
  }
}

describe('usersService role updates', () => {
  it('obtiene sedes activas de empresa por RPC', async () => {
    const calls = []
    const service = createUsersService({
      supabase: {
        rpc(name, args) {
          calls.push(['rpc', name, args])
          return Promise.resolve({
            data: [{ code: 'EPSE_PLANTA', name: 'EPSE - Planta', delivery_name: 'EPSE - Planta' }],
            error: null
          })
        }
      }
    })

    const result = await service.getCompanyOrderLocations({ companySlug: ' EPSE ' })

    expect(result).toEqual({
      data: [{ code: 'EPSE_PLANTA', name: 'EPSE - Planta', delivery_name: 'EPSE - Planta' }],
      error: null
    })
    expect(calls).toEqual([
      ['rpc', 'get_company_order_locations', { p_company_slug: 'epse' }]
    ])
  })

  it('usa fallback directo y conserva la sede efectiva de entrega', async () => {
    const calls = []
    const locationRows = [
      {
        id: 'loc-estacion',
        code: 'EPSE_ESTACION',
        slug: 'epse_estacion',
        display_name: 'EPSE - Estacion',
        default_delivery_location_id: 'loc-planta'
      },
      {
        id: 'loc-planta',
        code: 'EPSE_PLANTA',
        slug: 'epse_planta',
        display_name: 'EPSE - Planta',
        default_delivery_location_id: 'loc-planta'
      }
    ]
    const deliveryRows = [
      {
        id: 'loc-planta',
        code: 'EPSE_PLANTA',
        slug: 'epse_planta',
        display_name: 'EPSE - Planta'
      }
    ]
    const query = {
      select(columns) {
        calls.push(['select', columns])
        return this
      },
      eq(column, value) {
        calls.push(['eq', column, value])
        return this
      },
      order(column, options) {
        calls.push(['order', column, options])
        return Promise.resolve({ data: locationRows, error: null })
      },
      in(column, values) {
        calls.push(['in', column, values])
        return Promise.resolve({ data: deliveryRows, error: null })
      }
    }
    const service = createUsersService({
      supabase: {
        rpc(name, args) {
          calls.push(['rpc', name, args])
          return Promise.resolve({
            data: null,
            error: { code: 'PGRST202', message: 'missing function' }
          })
        },
        from(table) {
          calls.push(['from', table])
          return query
        }
      }
    })

    const result = await service.getCompanyOrderLocations({ companySlug: 'epse' })

    expect(result.error).toBeNull()
    expect(result.data).toEqual([
      expect.objectContaining({
        name: 'EPSE - Estacion',
        delivery_name: 'EPSE - Planta'
      }),
      expect.objectContaining({
        name: 'EPSE - Planta',
        delivery_name: 'EPSE - Planta'
      })
    ])
    expect(calls).toContainEqual(['eq', 'organization.code', 'EPSE'])
    expect(calls).toContainEqual(['in', 'id', ['loc-planta']])
  })

  it('usa la RPC administrativa y no actualiza public.users directamente', async () => {
    const { supabase, calls } = createSupabaseMock()
    const invalidateCache = vi.fn()
    const logAudit = vi.fn()
    const service = createUsersService({ supabase, invalidateCache, logAudit })

    const result = await service.updateUserRole('user-1', 'admin')

    expect(result).toEqual({ data: { id: 'user-1', role: 'admin' }, error: null })
    expect(calls).toEqual([
      ['rpc', 'admin_update_user_role', { p_user_id: 'user-1', p_role: 'admin' }]
    ])
    expect(calls.some(([method]) => method === 'from' || method === 'update')).toBe(false)
    expect(invalidateCache).toHaveBeenCalledTimes(1)
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'role_changed',
      target_id: 'user-1',
      metadata: { role: 'admin' }
    }))
  })

  it('envia un payload minimo con solo ID y rol', async () => {
    const { supabase, calls } = createSupabaseMock()
    const service = createUsersService({ supabase })

    await service.updateUserRole('user-2', 'user')

    expect(calls[0][2]).toEqual({ p_user_id: 'user-2', p_role: 'user' })
    expect(Object.keys(calls[0][2])).toEqual(['p_user_id', 'p_role'])
  })

  it('normaliza el rol antes de enviarlo a la RPC', async () => {
    const { supabase, calls } = createSupabaseMock()
    const logAudit = vi.fn()
    const service = createUsersService({ supabase, logAudit })

    const result = await service.updateUserRole('user-3', ' ADMIN ')

    expect(result).toEqual({ data: { id: 'user-1', role: 'admin' }, error: null })
    expect(calls).toEqual([
      ['rpc', 'admin_update_user_role', { p_user_id: 'user-3', p_role: 'admin' }]
    ])
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
      details: 'Rol actualizado a "admin"',
      metadata: { role: 'admin' }
    }))
  })

  it('rechaza roles invalidos antes de llamar a Supabase', async () => {
    const { supabase, calls } = createSupabaseMock()
    const service = createUsersService({ supabase })

    const result = await service.updateUserRole('user-1', 'owner')

    expect(result.data).toBeNull()
    expect(result.error?.message).toBe('invalid_role')
    expect(calls).toEqual([])
  })

  it('pagina personas administrativas solo mediante la RPC segura', async () => {
    const calls = []
    const supabase = {
      rpc(name, args) {
        calls.push(['rpc', name, args])
        if (args.p_page === 1) {
          return Promise.resolve({
            data: {
              items: [{ person_id: 'user-1', display_name: 'Ana' }],
              total_count: 2,
              total_pages: 2,
              page: 1,
              page_size: 200
            },
            error: null
          })
        }
        return Promise.resolve({
          data: {
            items: [{ person_id: 'user-2', display_name: 'Bruno' }],
            total_count: 2,
            total_pages: 2,
            page: 2,
            page_size: 200
          },
          error: null
        })
      },
      from: vi.fn()
    }
    const service = createUsersService({ supabase })

    const result = await service.getAdminPeopleUnified()

    expect(result).toEqual({
      data: [
        { person_id: 'user-1', display_name: 'Ana' },
        { person_id: 'user-2', display_name: 'Bruno' }
      ],
      error: null
    })
    expect(calls).toHaveLength(2)
    expect(calls[0]).toEqual(['rpc', 'get_admin_people_page', expect.objectContaining({ p_page: 1, p_page_size: 200 })])
    expect(calls[1]).toEqual(['rpc', 'get_admin_people_page', expect.objectContaining({ p_page: 2, p_page_size: 200 })])
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('falla cerrado si no existe la RPC de personas administrativas', async () => {
    const from = vi.fn()
    const service = createUsersService({
      supabase: {
        rpc() {
          return Promise.resolve({
            data: null,
            error: { code: 'PGRST202', message: 'Could not find get_admin_people_page' }
          })
        },
        from
      }
    })

    const result = await service.getAdminPeoplePage({ search: 'ana' })

    expect(result.data).toBeNull()
    expect(result.error?.code).toBe('PGRST202')
    expect(from).not.toHaveBeenCalled()
  })
})
