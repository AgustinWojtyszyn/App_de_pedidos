import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  new URL('./20260917103000_harden_shared_people_and_order_views.sql', import.meta.url),
  'utf8'
)

describe('shared helper view hardening', () => {
  it('revokes direct authenticated access to cross-user helper views', () => {
    expect(migration).toContain('revoke all on table public.admin_people_unified from authenticated;')
    expect(migration).toContain('revoke all on table public.orders_with_person_key from authenticated;')
    expect(migration).toContain('revoke all on table public.orders_count_by_person from authenticated;')
  })

  it('keeps the authorized admin people RPC available to authenticated callers', () => {
    expect(migration).toContain('grant execute on function public.get_admin_people_page(text, text, text, integer, integer) to authenticated;')
    expect(migration).toContain('revoke all on function public.get_admin_people_page(text, text, text, integer, integer) from anon;')
  })
})
