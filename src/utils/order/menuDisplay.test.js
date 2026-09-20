import { describe, expect, it } from 'vitest'
import { filterOrderableMenuItems, getMenuDisplay } from './menuDisplay'

const baseMenu = [
  { id: 'main', name: 'Menú principal', description: 'Milanesa', slotIndex: 0 },
  { id: 'option-1', name: 'Opción 1', description: 'BIFE DE CARNE CON PURE', slotIndex: 1 },
  { id: 'option-2', name: 'Opción 2', description: 'Pollo', slotIndex: 2 },
  { id: 'option-3', name: 'Opción 3', description: 'Tarta', slotIndex: 3 },
  { id: 'hyper', name: 'Hiperproteica', description: 'Pechuga grillada' },
  { id: 'option-4', name: 'Opción 4', description: 'BIFE DEL DÍA CARNE', slotIndex: 4 },
  { id: 'option-5', name: 'Opción 5', description: 'Mix de hojas verdes', slotIndex: 5 },
  { id: 'option-6', name: 'Opción 6', description: 'Celiaco', slotIndex: 6 }
]

const displayFor = (items, companySlug) =>
  items.map((item, index) => getMenuDisplay(item, index, companySlug))

describe('company-specific menu display with hyperproteic option 4', () => {
  it('inserts Hiperproteica at option 4 and shifts the previous option 4 to 5', () => {
    const result = filterOrderableMenuItems(baseMenu, 'genneia')
    const display = displayFor(result, 'genneia')

    expect(display.map((item) => item.label)).toEqual([
      'Menú principal',
      'Opción 1',
      'Opción 2',
      'Opción 3',
      'Opción 4',
      'Opción 5',
      'Opción 6',
      'Opción 7'
    ])
    expect(display[4]).toMatchObject({
      label: 'Opción 4',
      dish: 'Hiperproteica · Pechuga grillada',
      slotIndex: 4
    })
    expect(display[5]).toMatchObject({
      label: 'Opción 5',
      dish: 'Bife de pollo',
      slotIndex: 5
    })
  })

  it('shows Dieta at the shifted option 5 for Molinos and Placo', () => {
    for (const companySlug of ['molinos', 'placo']) {
      const result = filterOrderableMenuItems(baseMenu, companySlug)
      const display = displayFor(result, companySlug)
      expect(display[4]).toMatchObject({ label: 'Opción 4', dish: 'Hiperproteica · Pechuga grillada' })
      expect(display[5]).toMatchObject({ label: 'Opción 5', dish: 'Dieta' })
    }
  })

  it('keeps Bife de pollo at the shifted option 5 for the four Calidra sites', () => {
    for (const companySlug of ['ccp', 'laja', 'padrebueno', 'losberros']) {
      const result = filterOrderableMenuItems(baseMenu, companySlug)
      const bife = result.find((item) => item.slotIndex === 5)
      expect(bife).toMatchObject({
        name: 'Opción 5',
        displayName: 'Opción 5',
        description: 'Bife de pollo',
        slotIndex: 5
      })
    }
  })

  it('keeps Bife de pollo fixed at option 5 for Genneia, Greif and Administración', () => {
    for (const companySlug of ['genneia', 'greif', 'administracion_servifood']) {
      const result = filterOrderableMenuItems(baseMenu, companySlug)
      expect(result.find((item) => item.slotIndex === 5)).toMatchObject({
        name: 'Opción 5',
        displayName: 'Opción 5',
        description: 'Bife de pollo',
        slotIndex: 5
      })
      expect(result.find((item) => item.slotIndex === 6)?.description).toMatch(/hojas/i)
      expect(result.find((item) => item.slotIndex === 7)?.description).toMatch(/celiaco/i)
    }
  })

  it('removes duplicated Bife de pollo outside fixed option 5 for Calidra sites', () => {
    const menuWithDuplicateBife = [
      ...baseMenu,
      { id: 'duplicate-bife', name: 'Bife de pollo', description: 'Bife de pollo', slotIndex: 7 }
    ]
    const result = filterOrderableMenuItems(menuWithDuplicateBife, 'laja')
    const bifeItems = result.filter((item) => /bife\s+de\s+pollo/i.test(`${item.name || ''} ${item.description || ''}`))

    expect(bifeItems).toHaveLength(1)
    expect(bifeItems[0].slotIndex).toBe(5)
  })

  it('keeps EPSE capped at option 7 with Celíaco in option 7', () => {
    const result = filterOrderableMenuItems(baseMenu, 'epse')
    const display = displayFor(result, 'epse')

    expect(result.map((item) => item.id)).toEqual([
      'main',
      'option-1',
      'option-2',
      'option-3',
      'hyper',
      'option-4',
      'option-5',
      'option-6'
    ])
    expect(display.map((item) => item.label)).toEqual([
      'Menú principal',
      'Opción 1',
      'Opción 2',
      'Opción 3',
      'Opción 4',
      'Opción 5',
      'Opción 6',
      'Opción 7'
    ])
    expect(display[4].dish).toContain('Hiperproteica')
    expect(display[7].dish).toMatch(/celiaco/i)
  })

  it('does not create option 8 when EPSE already has Celíaco persisted as option 7', () => {
    const alreadyShifted = baseMenu.map((item) =>
      item.id === 'option-6'
        ? { ...item, name: 'Opción 7', slotIndex: 7 }
        : item
    )
    const result = filterOrderableMenuItems(alreadyShifted, 'epse')

    expect(Math.max(...result.map((item) => item.slotIndex))).toBe(7)
    expect(result.find((item) => item.slotIndex === 7)?.description).toMatch(/celiaco/i)
  })


  it('does not shift an already-renumbered menu a second time', () => {
    const alreadyShifted = [
      { id: 'main', name: 'Menú principal', description: 'Milanesa', slotIndex: 0 },
      { id: 'option-1', name: 'Opción 1', description: 'Uno', slotIndex: 1 },
      { id: 'option-2', name: 'Opción 2', description: 'Dos', slotIndex: 2 },
      { id: 'option-3', name: 'Opción 3', description: 'Tres', slotIndex: 3 },
      { id: 'hyper', name: 'Opción 4 - Hiperproteica', description: 'Hamburguesa proteica', slotIndex: 4 },
      { id: 'bife', name: 'Opción 5', description: 'Bife de pollo', slotIndex: 5 },
      { id: 'salad', name: 'Opción 6', description: 'Ensalada mix de hojas', slotIndex: 6 },
      { id: 'celiac', name: 'Opción 7', description: 'Celíaco', slotIndex: 7 }
    ]

    const result = filterOrderableMenuItems(alreadyShifted, 'global')
    const labels = displayFor(result, 'global').map((item) => item.label)

    expect(labels).toEqual([
      'Menú principal',
      'Opción 1',
      'Opción 2',
      'Opción 3',
      'Opción 4',
      'Opción 5',
      'Opción 6',
      'Opción 7'
    ])
    expect(labels.filter((label) => label === 'Opción 7')).toHaveLength(1)
    expect(result.find((item) => item.slotIndex === 6)?.description).toMatch(/ensalada/i)
    expect(result.find((item) => item.slotIndex === 7)?.description).toMatch(/cel[ií]aco/i)
  })

  it('compacts EPSE when option 5 is empty instead of leaving a visible gap', () => {
    const epseWithEmptyLegacyBife = baseMenu.map((item) =>
      item.id === 'option-4'
        ? { ...item, description: '' }
        : item
    )

    const result = filterOrderableMenuItems(epseWithEmptyLegacyBife, 'epse')
    const display = displayFor(result, 'epse')

    expect(display.map((item) => item.label)).toEqual([
      'Menú principal',
      'Opción 1',
      'Opción 2',
      'Opción 3',
      'Opción 4',
      'Opción 5',
      'Opción 6'
    ])
    expect(display[5].dish).toMatch(/hojas/i)
    expect(display[6].dish).toMatch(/celiaco/i)
    expect(result.some((item) => item.slotIndex === 5 && !String(item.description || '').trim())).toBe(false)
  })

  it.each(['igarreta', 'isemar'])(
    'maps %s to options 1-3, Hiperproteica 4, salad 5 and Celíaco 6',
    (companySlug) => {
      const result = filterOrderableMenuItems(baseMenu, companySlug)
      const display = displayFor(result, companySlug)

      expect(result.map((item) => item.id)).toEqual([
        'main',
        'option-1',
        'option-2',
        'option-3',
        'hyper',
        'option-5',
        'option-6'
      ])
      expect(display.map((item) => item.label)).toEqual([
        'Menú principal',
        'Opción 1',
        'Opción 2',
        'Opción 3',
        'Opción 4',
        'Opción 5',
        'Opción 6'
      ])
      expect(display[1].dish).toBe('BIFE DE CARNE CON PURE')
      expect(display[4].dish).toBe('Hiperproteica · Pechuga grillada')
      expect(result[4].isHyperproteicOption).toBe(true)
      expect(display[5].dish).toBe('Mix de hojas verdes')
      expect(display[6].dish).toBe('Celíaco')
      expect(result.some((item) => item.id === 'option-4')).toBe(false)
    }
  )

  it('injects Hiperproteica for legacy menus that do not have it persisted yet', () => {
    const legacyMenu = baseMenu.filter((item) => item.id !== 'hyper')
    const result = filterOrderableMenuItems(legacyMenu, 'greif')
    const display = displayFor(result, 'greif')

    expect(result[4]).toMatchObject({
      id: 'hyperproteic-option-4',
      slotIndex: 4,
      isSyntheticHyperproteicOption: true
    })
    expect(display[4]).toMatchObject({
      label: 'Opción 4',
      dish: 'Hiperproteica'
    })
    expect(display[5]).toMatchObject({
      label: 'Opción 5',
      dish: 'Bife de pollo'
    })
  })

  it('does not remove a normal Bife dish from another slot for Igarreta or ISEMAR', () => {
    for (const companySlug of ['igarreta', 'isemar']) {
      const result = filterOrderableMenuItems(baseMenu, companySlug)
      expect(result.find((item) => item.id === 'option-1')).toMatchObject({
        name: 'Opción 1',
        slotIndex: 1
      })
      expect(result.some((item) => item.id === 'option-4')).toBe(false)
    }
  })
})
