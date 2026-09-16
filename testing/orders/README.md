# Atomic multi-service order creation

## Design and audit

The old `submitOrders` loop validated and persisted one service at a time. Each
`create_order_idempotent` request committed independently. A dinner validation,
permission, duplicate, schedule, or network failure could therefore leave lunch
committed even though the combined submission reported failure.

The new frontend builds and validates all payloads first. One service keeps the
individual RPC. Lunch + dinner uses exactly one `create_orders_atomic` RPC, with
no sequential fallback and no compensating DELETE. The compatibility facade in
`src/services/orders.js` forwards to the canonical orders service.

The new migration is
`supabase/migrations/20260916120000_atomic_multi_service_order_creation.sql`.
It extracts the current creation implementation into a non-publicly-executable
`prepare_or_create_order` helper. Both public RPCs share that helper. Batch
preflight calls it in validation mode, then persistence calls it normally; no
order is inserted until every member has passed preflight. User provisioning and
permission synchronization can happen during preflight and share the same
transaction. The September company visibility checks are also performed in
preflight using `assert_company_order_allowed`; existing triggers remain active.
Any uncaught exception, including a trigger or constraint on the second insert,
rolls back the entire PostgreSQL statement. Returning rows with `RETURN NEXT`
does not commit individual rows.

Relevant RPC history reviewed: base schema; May 13 concurrency; May 20 company
profiles; June 8 owner security; June 12 active-order uniqueness; June 19 guards;
July 1 normalization; July 2 companies; July 30 locations/authorization;
August 12 EPSE; August 13 new accounts; August 18 company snapshots; August 28
schedule flows. September 2 adds company visibility and company/location schedule
resolution via existing helpers/triggers. September 16 owner editing is unchanged.
The active unique index remains `(user_id, delivery_date, normalized service)`
for `status = 'pending'`.

Notable historical detail: July 30 replaced the SQL item normalization introduced
on July 1. The current individual RPC preserves its existing behavior; the
frontend still normalizes meals to one item of quantity one. The new batch RPC
validates one object with a nonempty item name per service and enforces quantity
and total one itself. Custom responses and all contact/snapshot fields continue
through the existing insertion path. Legacy company locations are retained;
unknown locations are rejected for new batches. Active catalog locations retain
existing EPSE/contact-authorization semantics.

## Idempotency and concurrency

Each service retains its own key. Batch storage identity includes the complete
ordered payload pair, so a changed dinner also changes lunch's batch identity.
It is separate from individual submissions. `sessionStorage` preserves keys
across reloads; an in-memory map supports same-page retries if storage is blocked.
Keys are not cleared on timeout or success. The old frontend pending-order query
was removed from `submitOrders`: it prevented recovering IDs after a lost reply.
PostgreSQL remains authoritative for active duplicates.

Both public RPCs take the same transaction-level advisory lock per target user
before reading keys. Concurrent identical requests recover the same rows;
different keys still meet the active unique index. Batch retries validate key
ownership, service and date. An operation with only one recoverable member is
rejected without inserting the missing member. Completed retries return existing
rows even after schedules/features change. No claim is made that a caller can
reuse arbitrary keys with changed content to update an existing order.

If browser storage is cleared, identities cannot be recovered from that storage;
the active unique index still prevents new active duplicates. If one member was
later deleted through a separate authorized operation, replay fails rather than
reconstructing a partial batch. Existing clients running the previous frontend
must reload to acquire batch semantics; two independent individual RPC requests
cannot retrospectively become a transaction.

## Database tests

Use an **isolated disposable Supabase PostgreSQL database** with the current
`main` schema and the new migration installed. Do not run fixture scripts in
production. SQL tests wrap fixtures and fault-injection triggers in a transaction
and end with ROLLBACK. The concurrency script uses multiple connections and leaves
its unique fixtures in the disposable database (it also opens test schedules).

```sh
docker exec -i supabase_db_food-order-app psql -U postgres -d atomic_orders_verify -v ON_ERROR_STOP=1 < testing/orders/atomic-order-creation.sql
python3 testing/orders/atomic-order-concurrency.py supabase_db_food-order-app atomic_orders_verify
```

`atomic-order-creation.sql` tests actual functions, constraints and triggers:

- Exactly two rows and IDs, normalized quantities, responses and snapshots.
- Invalid second items/service/date/location/user/responses and malformed batch.
- Dinner disabled, denied location, private/inactive company, closed dinner location.
- Known-invalid batches perform zero order INSERT attempts, measured with a
  nontransactional sequence in a test trigger.
- An injected second-insert exception observes the inserted lunch inside the
  transaction, then raises; the assertion after catching it confirms zero new rows.
- Existing active dinner prevents a new lunch; single lunch/dinner and retries work.
- Same IDs on retry, including after feature/window changes; incomplete replay fails.
- Different delivery dates per service, unauthenticated denial, and private helper ACLs.

`atomic-order-concurrency.py` uses actual concurrent PostgreSQL connections for
identical batches, competing keys, and a single-order versus batch race. It
asserts returned IDs and persisted row counts.

Verification in this task used an isolated copy of the local database. Because
that local schema lagged behind main, the applicable current snapshot, delivery,
schedule and September company-module definitions were installed in that copy
before testing. No production database was accessed. The new migration was also
applied repeatedly successfully. This is behavioral PostgreSQL coverage, not a
claim to have run a full migration reset from an empty production-equivalent DB.

## Frontend tests and rollout

The two new Vitest files cover one atomic RPC, validation before persistence,
normalization, service-specific dates, all IDs, backend failures without fallback
or DELETE, stable retry/reload identities, changed batch identities, and individual
creation. Existing creation and owner-edit tests are also exercised.

Apply the new SQL migration manually before deploying the new frontend. It uses
`CREATE OR REPLACE FUNCTION`, explicit ACLs, a transaction and schema-cache reload;
repeating it does not insert/update/delete business data or change RLS. Historical
migrations, including `20260916103000_secure_owner_edit_location_scope.sql`, are
unchanged. Missing batch RPC fails closed; it never falls back to partial writes.

Full Vitest run exposed one pre-existing failure:
`src/components/EditOrderForm.regression.test.js` expects
`originalCompany?.slug === ADMIN_SERVIFOOD_SLUG`, removed by current main. Both
that test and `EditOrderForm.jsx` were verified byte-identical to `origin/main`.
They are left untouched because this task must not change owner editing.
