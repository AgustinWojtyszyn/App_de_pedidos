import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const currentDir = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(currentDir, 'AdminExtraOrderModal.jsx'), 'utf8')
const personAutocompleteSource = readFileSync(join(currentDir, 'AdminExtraPersonAutocomplete.jsx'), 'utf8')

describe('AdminExtraOrderModal admin extra beverage options', () => {
  it('adds Agua saborizada inside the admin extra flow without depending on a company-specific DB update', () => {
    expect(source).toContain("const ADMIN_EXTRA_BEVERAGE_LABEL = 'Agua saborizada'")
    expect(source).toContain('withAdminExtraBeverageOption(nextCustomOptions)')
    expect(source).toContain('return [ADMIN_EXTRA_BEVERAGE_OPTION, ...normalizedOptions]')
    expect(source).toContain("options: ['Agua', 'Soda', ADMIN_EXTRA_BEVERAGE_LABEL, 'Coca cola', 'Coca Zero']")
  })
})

describe('AdminExtraOrderModal person autocomplete', () => {
  it('keeps the person optional and only enables smart lookup for global admins', () => {
    expect(source).toContain('<AdminExtraPersonAutocomplete')
    expect(source).toContain('enabled={Boolean(isGlobalAdmin)}')
    expect(personAutocompleteSource).toContain('Persona del pedido')
    expect(personAutocompleteSource).toContain('El menú no se copia')
  })

  it('uses bounded historical orders to suggest context without copying menu choices', () => {
    expect(personAutocompleteSource).toContain('const ADMIN_EXTRA_HISTORY_LIMIT = 24')
    expect(personAutocompleteSource).toContain('db.getOrders(userId, { limit: ADMIN_EXTRA_HISTORY_LIMIT })')
    expect(personAutocompleteSource).toContain('buildAdminExtraHabitProfile')
    expect(source).toContain('setCompanySlug(profile.companySlug)')
    expect(source).toContain('setService(profile.service)')
    expect(source).toContain('findHabitLocationOption(preferredHabitLocation, locations)')
  })

  it('persists the selected person through the dedicated secure RPC', () => {
    expect(source).toContain('client_user_id: selectedPerson?.id || null')
    expect(source).toContain("supabase.rpc('create_personalized_admin_extra_order'")
    expect(source).toContain('p_late_window: lateWindowMode')
  })
})

describe('AdminExtraOrderModal order schedule warning', () => {
  it('uses the selected location schedule instead of fixed global opening hours', () => {
    expect(source).toContain('db.getOrderScheduleContext({ location })')
    expect(source).toContain('orderScheduleContext?.is_open === false')
    expect(source).toContain("orderScheduleContext?.opens_at || '--:--'")
    expect(source).toContain("orderScheduleContext?.closes_at || '--:--'")
    expect(source).not.toContain('ORDER_START_HOUR')
    expect(source).not.toContain('ORDER_CUTOFF_HOUR')
    expect(source).not.toContain('isOutsideOrderWindow')
  })
})
