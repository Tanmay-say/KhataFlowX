create extension if not exists pgtap with schema extensions;
select extensions.plan(12);
select public.rpc_record_sale('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
 '[{"name":"atta","qty":2,"unit":"kg","pricePaise":5000}]'::jsonb,10000,0,'m1-test-sale','web',
 '00000000-0000-4000-8000-000000000001');
select public.rpc_record_sale('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
 '[{"name":"atta","qty":2,"unit":"kg","pricePaise":5000}]'::jsonb,10000,0,'m1-test-sale','web',
 '00000000-0000-4000-8000-000000000001');
select extensions.is((select result->>'balancePaise' from public.idempotency_requests where business_id='10000000-0000-4000-8000-000000000001' and idempotency_key='m1-test-sale'),'60000','sale updates balance and replay returns the stored result');
select extensions.is((select count(*)::integer from public.ledger_entries where idempotency_key='m1-test-sale:sale'),1,'sale replay inserts only one ledger entry');
select extensions.is((select balance_paise::text from public.clients where id='20000000-0000-4000-8000-000000000001'),'60000','client balance remains consistent');
select extensions.is((select quantity::text from public.inventory where business_id='10000000-0000-4000-8000-000000000001' and item_name='atta'),'98.000','sale decrements stock atomically');
select extensions.is((select status from public.invoices where id=(select (result->>'invoiceId')::uuid from public.idempotency_requests where idempotency_key='m1-test-sale' and business_id='10000000-0000-4000-8000-000000000001')),'ISSUED','sale creates an open invoice');
select extensions.throws_ok(
 $$select public.rpc_adjust_stock('10000000-0000-4000-8000-000000000001','atta',-999,'kg','m1-negative-stock','00000000-0000-4000-8000-000000000001')$$,
 'P0001','Stock cannot be negative','stock adjustment cannot go below zero');
select public.rpc_record_payment('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',40000,'CASH','m1-test-payment',null,'00000000-0000-4000-8000-000000000001',false);
select public.rpc_record_payment('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',40000,'CASH','m1-test-payment',null,'00000000-0000-4000-8000-000000000001',false);
select extensions.is((select result->>'balancePaise' from public.idempotency_requests where business_id='10000000-0000-4000-8000-000000000001' and idempotency_key='m1-test-payment'),'10000','payment replay returns the stored result');
select extensions.is((select paid_paise::text from public.invoices where id='30000000-0000-4000-8000-000000000002'),'70000','payment allocates to the oldest open invoice');
select extensions.is((select balance_paise::text from public.clients where id='20000000-0000-4000-8000-000000000002'),'10000','payment updates the client balance atomically');
select extensions.is((select count(*)::integer from public.receipts r join public.payments p on p.id=r.payment_id where p.idempotency_key='m1-test-payment'),1,'successful payment issues one receipt');
select extensions.is((select count(*)::integer from public.ledger_entries where idempotency_key='m1-test-payment:payment'),1,'payment replay inserts only one ledger entry');
select extensions.ok(not exists(
 select 1 from public.clients c where c.business_id='10000000-0000-4000-8000-000000000001'
 and c.balance_paise<>coalesce((select sum(case when e.type='PAYMENT' then -e.amount_paise else e.amount_paise end)
  from public.ledger_entries e where e.business_id=c.business_id and e.client_id=c.id),0)
),'client balances match their append-only ledger');
reset role;
select * from extensions.finish();
