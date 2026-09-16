"""Real concurrent PostgreSQL sessions, against a DISPOSABLE migrated database.
Usage: python3 testing/orders/atomic-order-concurrency.py CONTAINER atomic_orders_DB
Fixtures remain in the disposable DB; this never targets the working postgres DB.
"""
import concurrent.futures
import json
import subprocess
import sys
import uuid

container, database = sys.argv[1:]
if not database.startswith('atomic_orders_'):
    raise SystemExit('Use a disposable database named atomic_orders_...')

user_id = str(uuid.uuid4())
organization_id = str(uuid.uuid4())
location_id = str(uuid.uuid4())
location = 'Atomic concurrency ' + user_id


def sql(statement):
    return subprocess.run(
        ['docker', 'exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', database,
         '-v', 'ON_ERROR_STOP=1', '-Atq'], input=statement, text=True, capture_output=True,
        check=True).stdout.strip()


sql(f"""
insert into auth.users(id,email) values ('{user_id}','{user_id}@example.invalid');
insert into public.user_features(user_id,feature,enabled) values ('{user_id}','dinner',true);
insert into public.order_organizations(id,code,name) values ('{organization_id}','{organization_id}','{location}');
insert into public.order_locations(id,organization_id,code,slug,display_name)
values ('{location_id}','{organization_id}','{location_id}','{location_id}','{location}');
update public.order_schedule_flows set opens_at='00:00', closes_at='23:59:59.999999';
""")


def call(case, days, single=False):
    payload = {
        'user_id': user_id, 'location': location,
        'items': [{'id': 'meal', 'name': 'Comida', 'quantity': 1}],
        'customer_email': f'{user_id}@example.invalid'
    }
    rows = [dict(payload, service=service, idempotency_key=f'{user_id}-{case}-{service}')
            for service in ('lunch', 'dinner')]
    encoded = json.dumps(rows)
    # A future service-specific date avoids fixtures from other tests.
    query = f"""with payload as (
      select jsonb_agg(value || jsonb_build_object('delivery_date', current_date + {days})) as orders
      from jsonb_array_elements('{encoded}'::jsonb)
    ) select jsonb_agg(o.id order by o.service) from payload,
    lateral public.create_orders_atomic('{user_id}', payload.orders) o;"""
    if single:
        query = f"""select to_jsonb((public.create_order_idempotent('{user_id}',
        '{user_id}-{case}-dinner', '{json.dumps(rows[1])}'::jsonb ||
        jsonb_build_object('delivery_date', current_date + {days}))).id);"""
    return f"""begin;
    set local role authenticated;
    set local request.jwt.claims = '{{"sub":"{user_id}","email":"{user_id}@example.invalid","role":"authenticated"}}';
    {query}
    select pg_sleep(0.4);
    commit;
    """


with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    futures = [pool.submit(sql, call('same', 10)) for _ in range(2)]
    ids = [json.loads(f.result()) for f in futures]
    assert ids[0] == ids[1] and len(ids[0]) == 2, ids
    assert sql(f"select count(*) from public.orders where user_id='{user_id}'") == '2'
    print('Concurrent identical batches: same two IDs, exactly two rows.')

    futures = [pool.submit(sql, call(case, 11)) for case in ('different-a', 'different-b')]
    successes, failures = [], []
    for f in futures:
        try:
            successes.append(json.loads(f.result()))
        except subprocess.CalledProcessError as error:
            assert 'duplicate_active_order' in error.stderr, error.stderr
            failures.append(error)
    assert len(successes) == len(failures) == 1
    assert sql(f"select count(*) from public.orders where user_id='{user_id}' and delivery_date=current_date+11") == '2'
    print('Concurrent different keys: one whole batch wins, other inserts nothing.')

    # The individual RPC and atomic RPC share the same lock. Either one dinner
    # wins and the batch adds nothing, or the complete batch wins.
    futures = [pool.submit(sql, call('single-race', 12, True)), pool.submit(sql, call('batch-race', 12))]
    results = []
    for f in futures:
        try:
            results.append(json.loads(f.result()))
        except subprocess.CalledProcessError as error:
            assert 'duplicate_active_order' in error.stderr, error.stderr
    assert len(results) == 1
    expected = 2 if isinstance(results[0], list) else 1
    assert sql(f"select count(*) from public.orders where user_id='{user_id}' and delivery_date=current_date+12") == str(expected)
    print('Single vs batch race: losing transaction adds no partial order.')
