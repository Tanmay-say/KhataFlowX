create extension if not exists pgtap with schema extensions;
select extensions.plan(3);
select extensions.ok(public.rpc_claim_voice_call('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','stt','saaras:v3') is not null,'member can claim a transcription usage slot');
select extensions.is((select kind from public.ai_usage where business_id='10000000-0000-4000-8000-000000000001' order by created_at desc limit 1),'stt','transcription is logged as STT usage');
select public.rpc_finish_ai_call((select id from public.ai_usage where business_id='10000000-0000-4000-8000-000000000001' order by created_at desc limit 1),100,0,50,true);
select extensions.ok((select ok and latency_ms=50 from public.ai_usage where business_id='10000000-0000-4000-8000-000000000001' order by created_at desc limit 1),'voice request outcome and duration are recorded');
select * from extensions.finish();
