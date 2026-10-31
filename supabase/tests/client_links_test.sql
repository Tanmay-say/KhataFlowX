create extension if not exists pgtap with schema extensions;
select extensions.plan(8);
insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
values('00000000-0000-4000-8000-000000000002','authenticated','authenticated','client.test@khataflow.test','',now(),now(),now(),'{}'::jsonb,'{}'::jsonb)
on conflict(id) do nothing;
insert into public.client_profiles(user_id,name,phone)
values('00000000-0000-4000-8000-000000000002','Test Client','9000000000');
insert into public.client_invitations(id,business_id,client_id,token_hash,invited_by,expires_at)
values('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
 '20000000-0000-4000-8000-000000000001','m1-client-invite-one','00000000-0000-4000-8000-000000000001',now()+interval '1 day');
select extensions.is(
 (public.rpc_accept_client_invitation('m1-client-invite-one','00000000-0000-4000-8000-000000000002')->>'clientId'),
 '20000000-0000-4000-8000-000000000001','client accepts the shopkeeper invitation for the intended ledger');
select extensions.is(
 (public.rpc_accept_client_invitation('m1-client-invite-one','00000000-0000-4000-8000-000000000002')->>'linkId'),
 (select id::text from public.client_business_links where invitation_id='50000000-0000-4000-8000-000000000001'),
 'acceptance replay returns the same link');
insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
values('00000000-0000-4000-8000-000000000003','authenticated','authenticated','owner.two@khataflow.test','',now(),now(),now(),'{}'::jsonb,'{}'::jsonb)
on conflict(id) do nothing;
insert into public.businesses(id,name,owner_user_id)
values('10000000-0000-4000-8000-000000000003','Second Demo Shop','00000000-0000-4000-8000-000000000003');
insert into public.clients(id,business_id,name)
values('20000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000003','Test Client');
insert into public.client_invitations(id,business_id,client_id,token_hash,invited_by,expires_at)
values('50000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003',
 '20000000-0000-4000-8000-000000000009','m1-client-invite-two','00000000-0000-4000-8000-000000000003',now()+interval '1 day');
select extensions.is(
 (public.rpc_accept_client_invitation('m1-client-invite-two','00000000-0000-4000-8000-000000000002')->>'businessId'),
 '10000000-0000-4000-8000-000000000003','client account can link to a second shop');
insert into public.client_invitations(id,business_id,client_id,token_hash,invited_by,expires_at)
values('50000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001',
 '20000000-0000-4000-8000-000000000002','m1-client-invite-expired','00000000-0000-4000-8000-000000000001',now()-interval '1 second');
select extensions.throws_ok(
 $$select public.rpc_accept_client_invitation('m1-client-invite-expired','00000000-0000-4000-8000-000000000002')$$,
 'P0001','Invitation is no longer valid','expired invitations cannot connect a client');
select extensions.is((select count(*)::integer from public.client_business_links where user_id='00000000-0000-4000-8000-000000000002'),2,'one client account can connect to multiple shops');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select extensions.is((select count(*)::integer from public.ledger_entries),0,'client accounts cannot query shop ledgers directly');
select extensions.is((select count(*)::integer from public.client_business_links),2,'client can read their own shop connections');
select extensions.is((select count(*)::integer from public.client_profiles),1,'client can read their own profile');
reset role;
select * from extensions.finish();

