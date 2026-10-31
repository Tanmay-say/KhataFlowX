create extension if not exists pgtap with schema extensions;
select extensions.plan(5);
select extensions.is(public.rpc_submit_payment_claim('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',1000,'cash paid','m7-cash-claim')->>'status','PENDING','cash claim is submitted for shopkeeper approval');
select extensions.is(public.rpc_submit_payment_claim('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',1000,'cash paid','m7-cash-claim')->>'confirmationId',(select result->>'confirmationId' from public.idempotency_requests where business_id='10000000-0000-4000-8000-000000000001' and idempotency_key='m7-cash-claim'),'cash claim replay returns the same confirmation');
select extensions.is((select count(*)::integer from public.payment_confirmations where business_id='10000000-0000-4000-8000-000000000001' and client_id='20000000-0000-4000-8000-000000000001'),1,'replayed cash claim inserts only one confirmation');
select extensions.throws_ok($$select public.rpc_submit_payment_claim('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',2000,'changed amount','m7-cash-claim')$$,'P0001','Idempotency key conflict','cash claim key cannot be reused for a different amount');
select extensions.throws_ok($$select public.rpc_submit_payment_claim('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',50001,'over balance','m7-over-balance')$$,'P0001','Payment claim exceeds balance','cash claim cannot exceed the outstanding balance');
select * from extensions.finish();
