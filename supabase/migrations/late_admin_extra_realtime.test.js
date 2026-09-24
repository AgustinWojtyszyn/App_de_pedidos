import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const currentDir = dirname(fileURLToPath(import.meta.url))
const migration = readFileSync(
  join(currentDir, '20260924103000_fix_late_extra_realtime_history_and_totals.sql'),
  'utf8'
)

describe('late extra realtime history and totals migration', () => {
  it('enforces the exact 22:01 to 18:00 window server-side', () => {
    expect(migration).toContain("time '22:01:00'")
    expect(migration).toContain("'extended_window', '22:01-18:00'")
    expect(migration).toContain("'America/Argentina/San_Juan'")
  })

  it('keeps every admin extra in historical totals by delivery date', () => {
    expect(migration).toContain("lower(coalesce(o.order_origin, '')) = 'admin_extra'")
    expect(migration).toContain('coalesce(o.total_items, public.late_admin_extra_order_units(to_jsonb(o)), 0)')
    expect(migration).toContain('group by r.delivery_date')
  })

  it('prevents premature closures from freezing an incomplete history', () => {
    expect(migration).toContain("raise exception 'late_extra_operational_day_open'")
    expect(migration).toContain('c.closed_at >= b.window_closed_at')
    expect(migration).toContain('delete from public.late_admin_extra_order_closures c')
    expect(migration).toContain('v_existing.closed_at >= v_window_closed_at')
  })
})
