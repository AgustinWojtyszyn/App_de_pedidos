import { describe, expect, it } from 'vitest'
import { filterOrderableMenuItems, getMenuDisplay } from './menuDisplay'

const fullMenu = [
  { id: 'main', name: 'Menú principal', description: 'Milanesa con puré', slotIndex: 0 },
  { id: 'option-1', name: 'Opción 1', description: 'Pollo al horno', slotIndex: 1 },
  { id: 'option-2', name: 'Opción 2', description: 'Tarta de verdura', slotIndex: 2 },
  { id: 'option-3', name: 'Opción 3', description: 'Omelette', slotIndex: 3 },
  { id: 'hyper', name: 'Hiperproteica', description: 'Pechuga grillada con guarnición proteica' },
  { id: 'option-4', name: 'Opción 4', description: 'Bife del día', slotIndex: 4 },
  { id: 'option-5', name: 'Opción 5', description: 'Ensalada mix de hojas', slotIndex: 5 },
  { id: 'option-6', name: 'Opción 6', description: 'Celíaco', slotIndex: 6 }
]

const labelsFor = (items, company) =>
  items.map((item, index) => getMenuDisplay(item, index, company).label)

const dishesFor = (items, company) =>
  items.map((item, index) => getMenuDisplay(item, index, company).dish)

describe('menu contract with fixed hyperproteic option 4', () => {
  it('keeps the hyperproteic option at 4 and shifts legacy options through 7 for regular companies', () => {
    const companySlugs = [
      'administracion_servifood',
      'ccp',
      'genneia',
      'greif',
      'laja',
      'losberros',
      'molinos',
      'padrebueno',
      'placo'
    ]

    for (const companySlug of companySlugs) {
      const result = filterOrderableMenuItems(fullMenu, companySlug)
      expect(result).toHaveLength(8)
      expect(labelsFor(result, companySlug)).toEqual([
        'Menú principal',
        'Opción 1',
        'Opción 2',
        'Opción 3',
        'Opción 4',
        'Opción 5',
        'Opción 6',
        'Opción 7'
      ])
      expect(result[4]).toMatchObject({
        id: 'hyper',
        slotIndex: 4
      })
      expect(dishesFor(result, companySlug)[4]).toContain('Hiperproteica')
    }
  })

  it('injects a visible hyperproteic option when the date has not been saved with one yet', () => {
    const legacyMenu = fullMenu.filter((item) => item.id !== 'hyper')
    const result = filterOrderableMenuItems(legacyMenu, 'genneia')

    expect(labelsFor(result, 'genneia')).toEqual([
      'Menú principal',
      'Opción 1',
      'Opción 2',
      'Opción 3',
      'Opción 4',
      'Opción 5',
      'Opción 6',
      'Opción 7'
    ])
    expect(result[4]).toMatchObject({
      id: 'hyperproteic-option-4',
      slotIndex: 4,
      isSyntheticHyperproteicOption: true
    })
    expect(getMenuDisplay(result[4], 4, 'genneia').dish).toBe('Hiperproteica')
  })

  it('does not let legacy semantic settings hide numbered slots 4 to 7', () => {
    const companyConfig = {
      slug: 'laja',
      menuItems: [
        { key: 'menu_principal', enabled: true },
        { key: 'opcion_1', enabled: true },
        { key: 'opcion_2', enabled: true },
        { key: 'opcion_3', enabled: true },
        { key: 'otros_menus', enabled: false },
        { key: 'dieta', enabled: false },
        { key: 'celiacos', enabled: false },
        { key: 'bife_lomo', enabled: false },
        { key: 'bife_pollo', enabled: false }
      ]
    }

    const result = filterOrderableMenuItems(fullMenu, companyConfig)

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
  })

  it('keeps EPSE at seven numbered options with Celíaco as option 7', () => {
    const result = filterOrderableMenuItems(fullMenu, 'epse')

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
    expect(labelsFor(result, 'epse')).toEqual([
      'Menú principal',
      'Opción 1',
      'Opción 2',
      'Opción 3',
      'Opción 4',
      'Opción 5',
      'Opción 6',
      'Opción 7'
    ])
    expect(dishesFor(result, 'epse')[7]).toBe('Celíaco')
  })

  it.each(['igarreta', 'isemar'])(
    'keeps %s continuous with Hiperproteica 4, salad 5 and Celíaco 6',
    (companySlug) => {
      const result = filterOrderableMenuItems(fullMenu, companySlug)
      const display = result.map((item, index) => getMenuDisplay(item, index, companySlug))

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
      expect(display[4].dish).toContain('Hiperproteica')
      expect(display[5].dish).toBe('Ensalada mix de hojas')
      expect(display[6].dish).toBe('Celíaco')
    }
  )
})
