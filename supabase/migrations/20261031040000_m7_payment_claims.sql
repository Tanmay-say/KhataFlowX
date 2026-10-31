create function public.rpc_submit_payment_claim(p_business uuid,p_client uuid,p_amount_paise bigint,p_note text,p_idem text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_result jsonb; v_balance bigint; v_id uuid;
begin
 if p_amount_paise is null or p_amount_paise<=0 or p_idem is null or length(trim(p_idem)) not between 8 and 128 then raise exception 'Invalid payment claim'; end if;
 v_result:=public.begin_idempotency(p_business,p_idem,'submit_payment_claim');
 if v_result is not null then
  if v_result->>'amountPaise'<>p_amount_paise::text then raise exception 'Idempotency key conflict'; end if;
  return v_result;
 end if;
 select balance_paise into v_balance from public.clients where business_id=p_business and id=p_client for update;
 if not found then raise exception 'Client does not belong to business'; end if;
 if p_amount_paise>v_balance then raise exception 'Payment claim exceeds balance'; end if;
 insert into public.payment_confirmations(business_id,client_id,amount_paise,note)
 values(p_business,p_client,p_amount_paise,nullif(trim(p_note),'')) returning id into v_id;
 v_result:=jsonb_build_object('confirmationId',v_id,'status','PENDING','amountPaise',p_amount_paise::text);
 perform public.finish_idempotency(p_business,p_idem,v_result);
 return v_result;
end;
$$;
revoke all on function public.rpc_submit_payment_claim(uuid,uuid,bigint,text,text) from public,anon,authenticated;
grant execute on function public.rpc_submit_payment_claim(uuid,uuid,bigint,text,text) to service_role;
