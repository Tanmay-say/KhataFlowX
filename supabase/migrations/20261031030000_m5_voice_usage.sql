create function public.rpc_claim_voice_call(p_business uuid,p_actor uuid,p_kind text,p_model text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_count integer; v_id uuid; v_day timestamptz;
begin
 if p_kind not in ('stt','tts') then raise exception 'Invalid voice usage kind'; end if;
 if not exists(select 1 from public.business_members where business_id=p_business and user_id=p_actor) then raise exception 'Business access denied'; end if;
 v_day:=date_trunc('day',now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
 perform pg_advisory_xact_lock(hashtextextended(p_business::text||':'||p_kind||':'||v_day::date::text,0));
 select count(*) into v_count from public.ai_usage where business_id=p_business and kind=p_kind and created_at>=v_day;
 if v_count>=100 then return null; end if;
 insert into public.ai_usage(business_id,kind,model,latency_ms,ok)
 values(p_business,p_kind,p_model,0,false) returning id into v_id;
 return v_id;
end;
$$;
revoke all on function public.rpc_claim_voice_call(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.rpc_claim_voice_call(uuid,uuid,text,text) to service_role;
