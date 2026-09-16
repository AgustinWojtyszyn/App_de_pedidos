import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  new URL('./20260916103000_secure_owner_edit_location_scope.sql', import.meta.url),
  'utf8'
)

describe('owner order edit location scope migration', () => {
  it('keeps owner edits inside the original company', () => {
    expect(source).toContain('create or replace function public.update_own_pending_order')
    expect(source).toContain("lower(trim(org.code)) = lower(trim(v_order.company_slug))")
    expect(source).toContain("raise exception 'order_location_not_allowed'")
  })

  it('keeps requesting and delivery snapshots aligned when location changes', () => {
    expect(source).toContain('requesting_location_code = case when v_location.id is not null then v_location.code')
    expect(source).toContain('order_location_id = case when v_location.id is not null then v_location.id')
    expect(source).toContain('delivery_location = case when v_location.id is not null then v_delivery.display_name')
    expect(source).toContain('delivery_location_code = case when v_location.id is not null then v_delivery.code')
  })

  it('preserves the existing owner edit protections', () => {
    expect(source).toContain("v_order.status <> 'pending'")
    expect(source).toContain("v_order.created_at < now() - interval '15 minutes'")
    expect(source).toContain('order_update_quantity_not_allowed')
    expect(source).toContain('security definer')
  })
})
