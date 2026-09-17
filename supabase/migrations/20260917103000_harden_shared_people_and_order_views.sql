-- Harden helper views that expose cross-user data.
-- Apply this migration only after deploying the frontend changes that no longer
-- depend on direct authenticated SELECT access to these views.
--
-- Admin/person listing is served by public.get_admin_people_page(), which
-- performs its own authorization checks. Daily-order admin reads use dedicated
-- RPCs. Service-role Edge Functions are not affected by revoking anon/authenticated.

revoke all on table public.admin_people_unified from public;
revoke all on table public.admin_people_unified from anon;
revoke all on table public.admin_people_unified from authenticated;

revoke all on table public.orders_with_person_key from public;
revoke all on table public.orders_with_person_key from anon;
revoke all on table public.orders_with_person_key from authenticated;

revoke all on table public.orders_count_by_person from public;
revoke all on table public.orders_count_by_person from anon;
revoke all on table public.orders_count_by_person from authenticated;

-- Keep the secured RPC available to logged-in users; the function itself
-- decides whether the caller is a global admin, company admin, or only self.
revoke all on function public.get_admin_people_page(text, text, text, integer, integer) from public;
revoke all on function public.get_admin_people_page(text, text, text, integer, integer) from anon;
grant execute on function public.get_admin_people_page(text, text, text, integer, integer) to authenticated;
