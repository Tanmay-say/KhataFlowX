create extension if not exists pgtap with schema extensions;
select extensions.plan(2);
select extensions.is(
 public.rpc_ledger_summary('10000000-0000-4000-8000-000000000001')->>'totalReceivablePaise',
 (select coalesce(sum(balance_paise),0)::text from public.clients where business_id='10000000-0000-4000-8000-000000000001' and archived_at is null),
 'summary returns exact paise total as text');
select extensions.ok(
 has_function_privilege('service_role','public.rpc_ledger_summary(uuid)','EXECUTE')
 and not has_function_privilege('authenticated','public.rpc_ledger_summary(uuid)','EXECUTE'),
 'summary RPC is service-role only');
select * from extensions.finish();
