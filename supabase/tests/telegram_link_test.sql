create extension if not exists pgtap with schema extensions;
select extensions.plan(4);
insert into public.telegram_link_tokens(token_hash,bot,business_id,client_id,created_by,expires_at)
values('m8-admin-test-hash','admin','10000000-0000-4000-8000-000000000001',null,'00000000-0000-4000-8000-000000000001',now()+interval '15 minutes');
select extensions.is(public.rpc_consume_telegram_link('m8-admin-test-hash','admin','900000001','testowner')->>'businessId','10000000-0000-4000-8000-000000000001','valid Telegram start token links the chat to its shop');
select extensions.is((select business_id::text from public.telegram_sessions where bot='admin' and chat_id='900000001'),'10000000-0000-4000-8000-000000000001','Telegram session stores its business mapping');
select extensions.throws_ok($$select public.rpc_consume_telegram_link('m8-admin-test-hash','admin','900000001','testowner')$$,'P0001','Telegram link is invalid or expired','link token is single use');
select extensions.ok((select used_at is not null from public.telegram_link_tokens where token_hash='m8-admin-test-hash'),'consumed token cannot be reused');
select * from extensions.finish();
