create extension if not exists pgtap with schema extensions;
select extensions.plan(8);
insert into public.chat_messages(id,business_id,user_id,channel,role,content)
values('60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','web','user','add client');
insert into public.pending_actions(id,business_id,chat_message_id,actions,expires_at)
values('70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',
 '[{"intent":"ADD_CLIENT","name":"Confirmed Client","phone":null}]'::jsonb,now()+interval '1 day');
select extensions.is((select count(*)::integer from public.clients where business_id='10000000-0000-4000-8000-000000000001' and name='Confirmed Client'),0,'unconfirmed action has no effect');
select extensions.is(public.rpc_confirm_pending_action('10000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001')->0->>'name','Confirmed Client','confirmation performs the server-stored action');
select extensions.is((select status from public.pending_actions where id='70000000-0000-4000-8000-000000000001'),'CONFIRMED','confirmation marks action complete');
select extensions.is((select count(*)::integer from public.clients where business_id='10000000-0000-4000-8000-000000000001' and name='Confirmed Client'),1,'confirmed action writes exactly once');
select extensions.is(public.rpc_confirm_pending_action('10000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001')->0->>'name','Confirmed Client','replaying confirmation returns original result');
select extensions.ok(has_function_privilege('service_role','public.rpc_confirm_pending_action(uuid,uuid,uuid)','EXECUTE') and not has_function_privilege('authenticated','public.rpc_confirm_pending_action(uuid,uuid,uuid)','EXECUTE'),'confirmation RPC is service-role only');
select extensions.ok(public.rpc_claim_ai_call('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','muse-spark-1.3') is not null,'business member can claim an AI usage slot');
select public.rpc_finish_ai_call((select id from public.ai_usage where business_id='10000000-0000-4000-8000-000000000001' order by created_at desc limit 1),19,7,10,true);
select extensions.is((select input_units+output_units from public.ai_usage where business_id='10000000-0000-4000-8000-000000000001' order by created_at desc limit 1),26,'AI usage is recorded after the request');
select * from extensions.finish();
