create extension if not exists pgtap with schema extensions;
select extensions.plan(7);
select extensions.has_table('public','businesses','business workspace table exists');
select extensions.has_table('public','clients','shopkeeper client records exist');
select extensions.has_table('public','client_profiles','client login profile table exists');
select extensions.has_table('public','client_business_links','client shop links exist');
select extensions.ok(has_function_privilege('service_role','public.rpc_record_sale(uuid,uuid,jsonb,bigint,bigint,text,text,uuid)','EXECUTE'),'service role can call the sale RPC');
select extensions.ok(not has_function_privilege('authenticated','public.rpc_record_sale(uuid,uuid,jsonb,bigint,bigint,text,text,uuid)','EXECUTE'),'authenticated clients cannot write through the sale RPC');
select extensions.ok(
 (select count(*)=21 and bool_and(relrowsecurity) from pg_class where relnamespace='public'::regnamespace and relkind='r'
  and relname in ('businesses','business_members','client_profiles','clients','client_invitations','client_business_links',
   'inventory','invoices','payments','receipts','ledger_entries','payment_confirmations','orders','chat_messages',
   'pending_actions','notifications','telegram_sessions','ai_usage','audit_log','document_counters','idempotency_requests')),
 'RLS is enabled on every app table');
select * from extensions.finish();
