create function public.rpc_ledger_summary(p_business uuid)
returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object(
  'totalReceivablePaise',coalesce(sum(balance_paise),0)::text,
  'clientsWithBalance',count(*) filter(where balance_paise>0)
 )
 from public.clients where business_id=p_business and archived_at is null;
$$;
revoke all on function public.rpc_ledger_summary(uuid) from public,anon,authenticated;
grant execute on function public.rpc_ledger_summary(uuid) to service_role;
