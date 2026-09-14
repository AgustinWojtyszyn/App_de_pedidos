import { describe, expect, it } from 'vitest'
import { buildAdminExtraHabitProfile, findHabitLocationOption } from './adminExtraHabitProfile'

const companies = [
  { slug: 'igarreta', name: 'Igarreta' },
  { slug: 'isemar', name: 'ISEMAR' }
]

describe('admin extra habitual profile', () => {
  it('prefers the most repeated company, location and service combination', () => {
    const profile = buildAdminExtraHabitProfile([
      { company_slug: 'igarreta', location: 'Maipú', service: 'lunch', status: 'archived', delivery_date: '2026-09-10' },
      { company_slug: 'igarreta', location: 'Maipú', service: 'lunch', status: 'archived', delivery_date: '2026-09-11' },
      { company_slug: 'isemar', location: 'Planta', service: 'lunch', status: 'archived', delivery_date: '2026-09-12' },
      { company_slug: 'igarreta', location: 'Maipú', service: 'lunch', status: 'archived', delivery_date: '2026-09-13' }
    ], companies)

    expect(profile).toMatchObject({
      companySlug: 'igarreta',
      companyName: 'Igarreta',
      location: 'Maipú',
      service: 'lunch',
      matches: 3,
      ordersConsidered: 4
    })
  })

  it('ignores cancelled and admin-extra rows so exceptions do not become the habit', () => {
    const profile = buildAdminExtraHabitProfile([
      { company_slug: 'isemar', location: 'Excepción', service: 'dinner', status: 'cancelled' },
      { company_slug: 'isemar', location: 'Excepción', service: 'dinner', status: 'archived', order_origin: 'admin_extra' },
      { company_slug: 'igarreta', location: 'Maipú', service: 'lunch', status: 'archived' }
    ], companies)

    expect(profile?.companySlug).toBe('igarreta')
    expect(profile?.location).toBe('Maipú')
  })

  it('matches habitual locations ignoring accents and casing', () => {
    expect(findHabitLocationOption('Administracion Servifood', ['Administración Servifood', 'Otra'])).toBe('Administración Servifood')
  })
})
