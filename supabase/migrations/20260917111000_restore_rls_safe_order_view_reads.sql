-- Restore authenticated reads required by order labels without reopening
-- cross-user access. The previous hardening migration revoked SELECT from
-- orders_with_person_key before every frontend reader had been migrated.
--
-- SECURITY INVOKER makes the view use the caller's permissions and RLS.
-- public.orders already scopes SELECT to global admins, the order owner, or
-- company admins assigned to the order company/location.

alter view public.orders_with_person_key set (security_invoker = true);

revoke all on table public.orders_with_person_key from public;
revoke all on table public.orders_with_person_key from anon;
revoke all on table public.orders_with_person_key from authenticated;
grant select on table public.orders_with_person_key to authenticated;

comment on view public.orders_with_person_key is
  'Order helper view exposed to authenticated callers with SECURITY INVOKER so public.orders RLS remains authoritative.';
