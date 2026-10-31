create extension if not exists pgtap with schema extensions;
select extensions.plan(10);
select public.rpc_create_invoice(
 '10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
 '[{"name":"sabun","qty":2,"unit":"piece","pricePaise":2000}]'::jsonb,null,'m1-create-invoice',
 '00000000-0000-4000-8000-000000000001');
select public.rpc_create_invoice(
 '10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
 '[{"name":"sabun","qty":2,"unit":"piece","pricePaise":2000}]'::jsonb,null,'m1-create-invoice',
 '00000000-0000-4000-8000-000000000001');
select extensions.is((select result->>'totalPaise' from public.idempotency_requests where idempotency_key='m1-create-invoice'),'4000','invoice total uses paise and quantity');
select extensions.is((select count(*)::integer from public.invoices where number=(select result->>'number' from public.idempotency_requests where idempotency_key='m1-create-invoice')),1,'invoice create replay inserts one invoice');
select extensions.is((select status from public.invoices where number=(select result->>'number' from public.idempotency_requests where idempotency_key='m1-create-invoice')),'DRAFT','manual invoice begins as draft');
select extensions.is((select balance_paise::text from public.clients where id='20000000-0000-4000-8000-000000000001'),'50000','draft invoice does not post a sale');

select public.rpc_adjust_stock('10000000-0000-4000-8000-000000000001','m1 test item',5,'piece','m1-stock-add','00000000-0000-4000-8000-000000000001');
select public.rpc_adjust_stock('10000000-0000-4000-8000-000000000001','m1 test item',5,'piece','m1-stock-add','00000000-0000-4000-8000-000000000001');
select extensions.is((select quantity::text from public.inventory where business_id='10000000-0000-4000-8000-000000000001' and item_name='m1 test item'),'5.000','stock adjustment replay does not double-add');

select public.rpc_record_sale('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
 '[{"name":"atta","qty":2,"unit":"kg","pricePaise":5000}]'::jsonb,10000,0,'m1-void-sale','web',
 '00000000-0000-4000-8000-000000000001');
select public.rpc_void_invoice('10000000-0000-4000-8000-000000000001',
 (select (result->>'invoiceId')::uuid from public.idempotency_requests where idempotency_key='m1-void-sale'),
 'm1-void-invoice','00000000-0000-4000-8000-000000000001');
select extensions.is((select status from public.invoices where id=(select (result->>'invoiceId')::uuid from public.idempotency_requests where idempotency_key='m1-void-sale')),'VOID','void keeps invoice and marks it void');
select extensions.is((select balance_paise::text from public.clients where id='20000000-0000-4000-8000-000000000001'),'50000','void reverses the sale balance');
select extensions.is((select quantity::text from public.inventory where business_id='10000000-0000-4000-8000-000000000001' and item_name='atta'),'100.000','void restores stock deducted by the sale');

insert into public.payment_confirmations(business_id,client_id,amount_paise,note)
values('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',10000,'cash claim');
select public.rpc_confirm_payment_claim(
 (select id from public.payment_confirmations where note='cash claim'),true,'00000000-0000-4000-8000-000000000001');
select extensions.is((select status from public.payment_confirmations where note='cash claim'),'APPROVED','only approval records the claim as approved');
select extensions.is((select balance_paise::text from public.clients where id='20000000-0000-4000-8000-000000000001'),'40000','approved claim records a payment');
select * from extensions.finish();
