import { describe, expect, it } from 'vitest'
import { validateEditOrderForm } from './validateEditOrderForm'

const user = { id: 'user-1' }
const baseItem = { id: 'menu-1', name: 'Menú principal', quantity: 1 }

const validate = (overrides = {}) => validateEditOrderForm({
  user,
  formData: { location: 'Greif' },
  selectedItemsList: [baseItem],
  service: 'lunch',
  customOptions: [],
  customResponses: {},
  originalOrder: {
    company_slug: 'greif',
    location: 'Greif',
    items: [baseItem]
  },
  ...overrides
})

describe('validateEditOrderForm', () => {
  it('blocks changing an order to a location from another company', () => {
    const result = validate({
      formData: { location: 'Molinos' }
    })

    expect(result.ok).toBe(false)
    expect(result.error).toContain('empresa original')
  })

  it('allows changing between locations of the same company', () => {
    const result = validate({
      formData: { location: 'ISEMAR – PREDIO 2' },
      originalOrder: {
        company_slug: 'isemar',
        location: 'ISEMAR – PREDIO 1',
        items: [baseItem]
      }
    })

    expect(result).toEqual({ ok: true, error: null })
  })

  it('does not accept an empty required checkbox response', () => {
    const result = validate({
      customOptions: [
        { id: 'required-check', title: 'Opción obligatoria', type: 'checkbox', required: true, active: true }
      ],
      customResponses: {
        'required-check': []
      }
    })

    expect(result.ok).toBe(false)
    expect(result.error).toContain('Opción obligatoria')
  })

  it('keeps beverage and dessert requirements when using a dinner override', () => {
    const result = validate({
      formData: { location: 'Genneia' },
      selectedItemsList: [],
      service: 'dinner',
      originalOrder: {
        company_slug: 'genneia',
        location: 'Genneia',
        items: []
      },
      customOptions: [
        { id: 'dinner-special', title: 'Opción de cena', active: true },
        { id: 'drink', title: 'Bebida', required: true, active: true },
        { id: 'side', title: 'Guarnición', required: true, active: true }
      ],
      customResponses: {
        'dinner-special': 'Menú principal cena',
        drink: '',
        side: ''
      }
    })

    expect(result.ok).toBe(false)
    expect(result.error).toContain('Bebida')
    expect(result.error).not.toContain('Guarnición')
  })

  it('allows a dinner override when required beverage is completed', () => {
    const result = validate({
      formData: { location: 'Genneia' },
      selectedItemsList: [],
      service: 'dinner',
      originalOrder: {
        company_slug: 'genneia',
        location: 'Genneia',
        items: []
      },
      customOptions: [
        { id: 'dinner-special', title: 'Opción de cena', active: true },
        { id: 'drink', title: 'Bebida', required: true, active: true },
        { id: 'side', title: 'Guarnición', required: true, active: true }
      ],
      customResponses: {
        'dinner-special': 'Menú principal cena',
        drink: 'Agua',
        side: ''
      }
    })

    expect(result).toEqual({ ok: true, error: null })
  })
})
