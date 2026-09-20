import { describe, expect, it } from 'vitest'
import {
  hasDinnerOverrideInResponses,
  isDinnerOverrideValue
} from './orderBusinessRules'
import { canChooseCustomSide, isHyperproteicOption, isMainMenuOption, isSaladOption } from './orderCustomSideRules'

describe('dinner business rules', () => {
  it('detects dinner override values from response text', () => {
    expect(isDinnerOverrideValue('Opción cena veggie')).toBe(true)
    expect(isDinnerOverrideValue(['Agua', 'MP cena'])).toBe(true)
    expect(isDinnerOverrideValue('Bebida')).toBe(false)
  })

  it('detects dinner override responses by title or response', () => {
    expect(hasDinnerOverrideInResponses([
      { title: 'Opción de cena', response: 'Veggie' }
    ])).toBe(true)
    expect(hasDinnerOverrideInResponses([
      { title: 'Bebida', response: 'Agua' }
    ])).toBe(false)
  })
})

describe('custom side rules', () => {
  it('blocks main menu, Hiperproteica, Ensalada and Celíaco from custom side selection', () => {
    expect(isMainMenuOption({ slotIndex: 0 })).toBe(true)
    expect(isSaladOption({ name: 'Ensalada completa' })).toBe(true)
    expect(canChooseCustomSide({ slotIndex: 0, name: 'Milanesa' })).toBe(false)
    expect(canChooseCustomSide({ slotIndex: 6, name: 'Opción 6', description: 'Ensalada completa' })).toBe(false)
    expect(canChooseCustomSide({ slotIndex: 7, name: 'Opción 7', description: 'Celíaco' })).toBe(false)
    expect(isHyperproteicOption({ slotIndex: 4, name: 'Opción 4 - Hiperproteica' })).toBe(true)
    expect(canChooseCustomSide({ slotIndex: 4, name: 'Opción 4 - Hiperproteica', description: '46 g de proteína' })).toBe(false)
  })

  it('allows custom side for Bife in option 5 and other non-closed dishes', () => {
    expect(canChooseCustomSide({ slotIndex: 5, name: 'Opción 5', description: 'Bife de pollo' })).toBe(true)
    expect(canChooseCustomSide({ slotIndex: 2, name: 'Pollo al horno' })).toBe(true)
  })
})
