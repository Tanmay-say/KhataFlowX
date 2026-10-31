create table public.telegram_link_tokens (
 id uuid primary key default gen_random_uuid(),
 token_hash text not null unique,
 bot text not null check (bot in ('admin','client')),
 business_id uuid not null references public.businesses(id) on delete cascade,
 client_id uuid,
 created_by uuid not null references auth.users(id) on delete cascade,
 expires_at timestamptz not null,
 used_at timestamptz,
 created_at timestamptz not null default now(),
 check ((bot='admin' and client_id is null) or (bot='client' and client_id is not null)),
 foreign key (business_id,client_id) references public.clients(business_id,id) on delete cascade
);
alter table public.telegram_link_tokens enable row level security;

create function public.rpc_consume_telegram_link(p_token_hash text,p_bot text,p_chat_id text,p_username text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_link public.telegram_link_tokens%rowtype;
begin
 if p_bot not in ('admin','client') or p_chat_id is null or length(p_chat_id)>64 then raise exception 'Invalid Telegram link'; end if;
 select * into v_link from public.telegram_link_tokens where token_hash=p_token_hash and bot=p_bot for update;
 if not found or v_link.used_at is not null or v_link.expires_at<=now() then raise exception 'Telegram link is invalid or expired'; end if;
 update public.telegram_link_tokens set used_at=now() where id=v_link.id;
 insert into public.telegram_sessions(bot,chat_id,business_id,client_id,state)
 values(v_link.bot,p_chat_id,v_link.business_id,v_link.client_id,jsonb_build_object('username',left(coalesce(p_username,''),64),'linkedBy',v_link.created_by))
 on conflict(bot,chat_id) do update set business_id=excluded.business_id,client_id=excluded.client_id,state=excluded.state,updated_at=now();
 return jsonb_build_object('businessId',v_link.business_id,'clientId',v_link.client_id,'bot',v_link.bot,'linkedBy',v_link.created_by);
end;
$$;
revoke all on function public.rpc_consume_telegram_link(text,text,text,text) from public,anon,authenticated;
grant execute on function public.rpc_consume_telegram_link(text,text,text,text) to service_role;
