import { describe, expect, it } from 'vitest'
import { isEmptySlotOverride, mergeCompanyMenuItems } from './companyMenuMerge'

describe('company menu merge', () => {
  it('keeps the global dish when a company override only contains an empty numbered slot', () => {
    const globalItems = [
      { id: 'global-5', name: 'Opción 5', description: 'Bife de pollo', slotIndex: 5 }
    ]
    const companyItems = [
      { id: 'epse-empty-5', name: 'Opción 5', description: '', slotIndex: 5 }
    ]

    expect(isEmptySlotOverride(companyItems[0])).toBe(true)
    expect(mergeCompanyMenuItems(globalItems, companyItems)).toEqual(globalItems)
  })

  it('still applies a company override when it has actual content', () => {
    const globalItems = [
      { id: 'global-5', name: 'Opción 5', description: 'Bife de pollo', slotIndex: 5 }
    ]
    const companyItems = [
      { id: 'company-5', name: 'Opción 5', description: 'Plato especial EPSE', slotIndex: 5 }
    ]

    expect(mergeCompanyMenuItems(globalItems, companyItems)).toEqual(companyItems)
  })
})
