alter table public.pending_actions add column result jsonb;

create function public.rpc_claim_ai_call(p_business uuid,p_actor uuid,p_model text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_count integer; v_id uuid; v_day timestamptz;
begin
 if not exists(select 1 from public.business_members where business_id=p_business and user_id=p_actor) then raise exception 'Business access denied'; end if;
 v_day:=date_trunc('day',now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
 perform pg_advisory_xact_lock(hashtextextended(p_business::text||':llm:'||v_day::date::text,0));
 select count(*) into v_count from public.ai_usage where business_id=p_business and kind='llm' and created_at>=v_day;
 if v_count>=300 then return null; end if;
 insert into public.ai_usage(business_id,kind,model,latency_ms,ok)
 values(p_business,'llm',p_model,0,false) returning id into v_id;
 return v_id;
end;
$$;

create function public.rpc_finish_ai_call(p_id uuid,p_input_units integer,p_output_units integer,p_latency_ms integer,p_ok boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
 update public.ai_usage set input_units=greatest(p_input_units,0),output_units=greatest(p_output_units,0),latency_ms=greatest(p_latency_ms,0),ok=p_ok
 where id=p_id and created_at>now()-interval '1 day';
 if not found then raise exception 'AI usage record not found'; end if;
end;
$$;

create function public.rpc_confirm_pending_action(p_business uuid,p_action uuid,p_actor uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_pending public.pending_actions%rowtype; v_role text; v_action jsonb; v_results jsonb:='[]'::jsonb; v_result jsonb; v_index integer:=0; v_client uuid;
begin
 select * into v_pending from public.pending_actions where id=p_action and business_id=p_business for update;
 if not found then raise exception 'Pending action not found'; end if;
 if v_pending.status='CONFIRMED' then return coalesce(v_pending.result,'{}'::jsonb); end if;
 if v_pending.status<>'PENDING' then raise exception 'Pending action is no longer available'; end if;
 if v_pending.expires_at<=now() then update public.pending_actions set status='EXPIRED',updated_at=now() where id=p_action; return jsonb_build_object('status','EXPIRED'); end if;
 select role into v_role from public.business_members where business_id=p_business and user_id=p_actor;
 if v_role is null then raise exception 'Business access denied'; end if;
 for v_action in select value from jsonb_array_elements(v_pending.actions) loop
  v_index:=v_index+1;
  case v_action->>'intent'
   when 'ADD_SALE' then
    v_result:=public.rpc_record_sale(p_business,(v_action->>'clientId')::uuid,v_action->'items',(v_action->>'totalPaise')::bigint,coalesce((v_action->>'paidNowPaise')::bigint,0),p_action::text||':'||v_index,'web',p_actor);
   when 'UPDATE_STOCK' then
    v_result:=public.rpc_adjust_stock(p_business,v_action->>'itemName',(v_action->>'delta')::numeric,v_action->>'unit',p_action::text||':'||v_index,p_actor);
   when 'MARK_PAID' then
    v_result:=public.rpc_record_payment(p_business,(v_action->>'clientId')::uuid,(v_action->>'amountPaise')::bigint,'CASH',p_action::text||':'||v_index,null,p_actor,false);
   when 'GENERATE_INVOICE' then
    v_result:=public.rpc_create_invoice(p_business,(v_action->>'clientId')::uuid,v_action->'items',nullif(v_action->>'dueDate','')::date,p_action::text||':'||v_index,p_actor);
   when 'ADD_CLIENT' then
    insert into public.clients(business_id,name,phone) values(p_business,trim(v_action->>'name'),nullif(trim(v_action->>'phone'),'')) returning id into v_client;
    v_result:=jsonb_build_object('clientId',v_client,'name',trim(v_action->>'name'));
   else raise exception 'Unsupported confirmed action';
  end case;
  v_results:=v_results||jsonb_build_array(v_result);
 end loop;
 update public.pending_actions set status='CONFIRMED',result=v_results,updated_at=now() where id=p_action;
 return v_results;
end;
$$;

revoke all on function public.rpc_claim_ai_call(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.rpc_finish_ai_call(uuid,integer,integer,integer,boolean) from public,anon,authenticated;
revoke all on function public.rpc_confirm_pending_action(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.rpc_claim_ai_call(uuid,uuid,text) to service_role;
grant execute on function public.rpc_finish_ai_call(uuid,integer,integer,integer,boolean) to service_role;
grant execute on function public.rpc_confirm_pending_action(uuid,uuid,uuid) to service_role;
