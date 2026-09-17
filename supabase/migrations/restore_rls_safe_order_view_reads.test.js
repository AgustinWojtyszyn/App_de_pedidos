import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  new URL('./20260917111000_restore_rls_safe_order_view_reads.sql', import.meta.url),
  'utf8'
)

describe('RLS-safe order helper view reads', () => {
  it('restores authenticated order-view reads through SECURITY INVOKER', () => {
    expect(migration).toContain('alter view public.orders_with_person_key set (security_invoker = true);')
    expect(migration).toContain('grant select on table public.orders_with_person_key to authenticated;')
  })

  it('keeps anonymous access revoked and does not reopen the people helper view', () => {
    expect(migration).toContain('revoke all on table public.orders_with_person_key from anon;')
    expect(migration).not.toContain('admin_people_unified')
    expect(migration).not.toContain('orders_count_by_person')
  })
})
