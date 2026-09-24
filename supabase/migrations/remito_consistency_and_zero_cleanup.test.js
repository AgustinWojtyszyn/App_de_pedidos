import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  new URL('./20260924194500_remito_consistency_and_zero_cleanup.sql', import.meta.url),
  'utf8'
)

describe('remito consistency and zero-unit cleanup migration', () => {
  it('repairs the known Padre Bueno remito omission without consuming a new number', () => {
    expect(migration).toContain("'6da04d4b-2e01-449e-899a-d115e9e5e65f'::uuid")
    expect(migration).toContain('cr.remito_number = 70034')
    expect(migration).toContain("'needsRefresh', true")
    expect(migration).not.toContain('next_remito_number =')
  })

  it('removes only the guarded Greif legacy zero-unit post-report extra', () => {
    expect(migration).toContain("'670f6d2a-6c23-48cb-923c-2c111f981f62'::uuid")
    expect(migration).toContain("o.status = 'post_report_extra'")
    expect(migration).toContain('coalesce(o.total_items, 0) = 0')
    expect(migration).toContain(') = 9')
    expect(migration).toContain('delete from public.orders')
  })

  it('enforces DB-backed remito order scope while preserving the explicit extras exclusion mode', () => {
    expect(migration).toContain('create or replace function public.get_expected_company_remito_order_ids')
    expect(migration).toContain("o.status = 'post_report_extra'")
    expect(migration).toContain('p_exclude_post_report_extras')
    expect(migration).toContain('create trigger trg_validate_company_remito_order_scope')
    expect(migration).toContain("raise exception 'remito_orders_mismatch'")
    expect(migration).toContain("new.snapshot->>'excludePostReportExtras'")
  })
})
