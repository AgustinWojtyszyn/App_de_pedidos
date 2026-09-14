begin;

create or replace function public.create_personalized_admin_extra_order(
  p_payload jsonb,
  p_late_window boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client_user_id uuid;
  v_client public.users;
  v_order public.orders;
  v_late_result jsonb;
  v_order_id uuid;
  v_request_id text := nullif(trim(coalesce(p_payload->>'idempotency_key', '')), '');
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  -- Linking an arbitrary user to an administrative order is intentionally
  -- limited to global admins. Company-admin extras keep the existing flow.
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  begin
    v_client_user_id := nullif(trim(coalesce(p_payload->>'client_user_id', '')), '')::uuid;
  exception when invalid_text_representation then
    raise exception 'client_invalid';
  end;

  if v_client_user_id is null then
    raise exception 'client_required';
  end if;

  select *
  into v_client
  from public.users
  where id = v_client_user_id;

  if v_client.id is null then
    raise exception 'client_not_found';
  end if;

  if coalesce(p_late_window, false) then
    v_late_result := public.create_late_admin_extra_order(p_payload);
    begin
      v_order_id := nullif(v_late_result->'order'->>'id', '')::uuid;
    exception when invalid_text_representation then
      v_order_id := null;
    end;
  else
    select *
    into v_order
    from public.create_admin_extra_order(p_payload);
    v_order_id := v_order.id;
  end if;

  if v_order_id is null then
    raise exception 'personalized_admin_extra_order_not_created';
  end if;

  update public.orders
  set user_id = v_client.id,
      customer_name = coalesce(nullif(trim(v_client.full_name), ''), v_client.email),
      customer_email = v_client.email,
      updated_at = now()
  where id = v_order_id
  returning * into v_order;

  update public.audit_logs
  set target_id = v_client.id,
      target_email = v_client.email,
      target_name = coalesce(nullif(trim(v_client.full_name), ''), v_client.email),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'client_user_id', v_client.id,
        'client_email', v_client.email,
        'client_name', coalesce(nullif(trim(v_client.full_name), ''), v_client.email),
        'snapshot', to_jsonb(v_order)
      )
  where action in ('admin_extra_order_created', 'late_admin_extra_order_created')
    and metadata->>'order_id' = v_order_id::text;

  if coalesce(p_late_window, false) then
    update public.late_admin_extra_order_history
    set order_snapshot = to_jsonb(v_order),
        detail = public.late_admin_extra_order_snapshot_detail(to_jsonb(v_order)),
        updated_at = now()
    where order_id = v_order_id;

    return jsonb_build_object(
      'delivery_date', v_late_result->'delivery_date',
      'order', to_jsonb(v_order)
    );
  end if;

  return to_jsonb(v_order);
end;
$$;

revoke all on function public.create_personalized_admin_extra_order(jsonb, boolean) from public;
revoke all on function public.create_personalized_admin_extra_order(jsonb, boolean) from anon;
grant execute on function public.create_personalized_admin_extra_order(jsonb, boolean) to authenticated;

commit;
