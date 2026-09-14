import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const migration = readFileSync(new URL('./20260914124500_personalized_admin_extra_orders.sql', import.meta.url), 'utf8')

describe('personalized admin extra orders migration', () => {
  it('keeps linked-person creation restricted to global admins', () => {
    expect(migration).toContain('if not public.is_admin() then')
    expect(migration).toContain("raise exception 'not_authorized'")
  })

  it('derives customer identity from public.users instead of trusting client text', () => {
    expect(migration).toContain('from public.users')
    expect(migration).toContain('user_id = v_client.id')
    expect(migration).toContain("customer_email = v_client.email")
  })

  it('preserves both normal and late admin-extra flows', () => {
    expect(migration).toContain('public.create_admin_extra_order(p_payload)')
    expect(migration).toContain('public.create_late_admin_extra_order(p_payload)')
    expect(migration).toContain('public.late_admin_extra_order_history')
  })
})
