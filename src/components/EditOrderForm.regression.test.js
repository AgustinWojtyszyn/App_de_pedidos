import { describe, expect, it } from 'vitest'
import {
  appendOriginalLocation,
  resolveEditOrderCompany,
  resolveEditOrderLocation
} from '../utils/orderEdit/editOrderCompany'

describe('EditOrderForm regression guards', () => {
  it('preserva Administración ServiFood cuando es la empresa original del pedido', () => {
    const order = {
      company_slug: 'administracion_servifood',
      company_name: 'Administración ServiFood',
      location: 'Administración ServiFood'
    }

    const company = resolveEditOrderCompany(order)
    const location = resolveEditOrderLocation(order)
    const locations = appendOriginalLocation([], location)

    expect(company?.slug).toBe('administracion_servifood')
    expect(location).toBe('Administración ServiFood')
    expect(locations).toContain('Administración ServiFood')
  })
})
