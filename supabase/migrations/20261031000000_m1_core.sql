create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

create table public.businesses (
 id uuid primary key default gen_random_uuid(),
 name text not null check (length(trim(name)) > 0),
 owner_user_id uuid not null references auth.users(id) on delete restrict,
 plan text not null default 'free' check (plan in ('free','pro')),
 settings jsonb not null default '{"language":"en","tts_enabled":true,"reminder_days":[1,7]}'::jsonb,
 telegram_admin_chat_id text, telegram_admin_username text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.business_members (
 business_id uuid not null references public.businesses(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check (role in ('owner','admin','staff')),
 created_at timestamptz not null default now(), primary key (business_id,user_id)
);
create index business_members_user_business_idx on public.business_members(user_id,business_id);
create function public.add_business_owner_membership()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.business_members(business_id,user_id,role) values(new.id,new.owner_user_id,'owner');
 return new;
end;
$$;
create trigger businesses_owner_membership after insert on public.businesses
for each row execute function public.add_business_owner_membership();
create table public.client_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 name text not null check (length(trim(name)) > 0), phone text, address text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.clients (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 name text not null check (length(trim(name)) > 0), phone text, address text,
 balance_paise bigint not null default 0, preferred_language text not null default 'en',
 telegram_chat_id text, telegram_username text, telegram_linked_at timestamptz,
 notification_prefs jsonb not null default '{}'::jsonb, archived_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique (business_id,id)
);
create unique index clients_business_name_lower_idx on public.clients(business_id,lower(name));
create index clients_name_trgm_idx on public.clients using gin(name extensions.gin_trgm_ops);
create index clients_business_activity_idx on public.clients(business_id,created_at desc);

create table public.client_invitations (
 id uuid primary key default gen_random_uuid(), business_id uuid not null, client_id uuid not null,
 token_hash text not null unique, invited_by uuid not null references auth.users(id),
 expires_at timestamptz not null, accepted_at timestamptz, revoked_at timestamptz,
 created_at timestamptz not null default now(),
 foreign key (business_id,client_id) references public.clients(business_id,id) on delete cascade
);
create index client_invitations_business_idx on public.client_invitations(business_id,created_at desc);
create table public.client_business_links (
 id uuid primary key default gen_random_uuid(), business_id uuid not null, client_id uuid not null,
 user_id uuid not null references public.client_profiles(user_id) on delete cascade,
 invitation_id uuid not null unique references public.client_invitations(id),
 created_at timestamptz not null default now(), unique (business_id,user_id),
 foreign key (business_id,client_id) references public.clients(business_id,id) on delete cascade
);
create index client_business_links_user_idx on public.client_business_links(user_id,business_id);

create table public.inventory (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 item_name text not null check (length(trim(item_name)) > 0),
 quantity numeric(12,3) not null default 0 check (quantity >= 0), unit text not null,
 low_stock_threshold numeric(12,3) not null default 0 check (low_stock_threshold >= 0),
 price_per_unit_paise bigint not null default 0 check (price_per_unit_paise >= 0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index inventory_business_item_lower_idx on public.inventory(business_id,lower(item_name));

create table public.invoices (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 client_id uuid not null, number text not null,
 items jsonb not null default '[]'::jsonb check (jsonb_typeof(items)='array'),
 total_paise bigint not null check (total_paise >= 0),
 paid_paise bigint not null default 0 check (paid_paise >= 0 and paid_paise <= total_paise),
 status text not null check (status in ('DRAFT','ISSUED','PARTIAL','PAID','VOID')),
 due_date date, pdf_path text, issued_at timestamptz, voided_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique (business_id,number), unique (business_id,id),
 foreign key (business_id,client_id) references public.clients(business_id,id) on delete restrict
);
create index invoices_business_client_date_idx on public.invoices(business_id,client_id,issued_at,created_at);

create table public.payments (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 client_id uuid not null, invoice_id uuid, amount_paise bigint not null check (amount_paise > 0),
 method text not null check (method in ('CASH','UPI_MOCK','UPI','OTHER')),
 provider text not null check (provider in ('mock','paytm','manual')),
 provider_ref text, status text not null check (status in ('CREATED','PENDING','SUCCEEDED','FAILED','EXPIRED','CANCELLED')),
 idempotency_key text not null, paid_at timestamptz, raw jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique (business_id,idempotency_key),
 unique (business_id,id),
 foreign key (business_id,client_id) references public.clients(business_id,id) on delete restrict,
 foreign key (business_id,invoice_id) references public.invoices(business_id,id) on delete restrict
);
create index payments_business_client_date_idx on public.payments(business_id,client_id,created_at desc);
create table public.receipts (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 payment_id uuid not null unique, number text not null, pdf_path text,
 issued_at timestamptz not null default now(), created_at timestamptz not null default now(), unique (business_id,number),
 foreign key (business_id,payment_id) references public.payments(business_id,id) on delete restrict
);
create table public.ledger_entries (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 client_id uuid not null, type text not null check (type in ('SALE','PAYMENT','ADJUSTMENT')),
 amount_paise bigint not null, items jsonb not null default '[]'::jsonb check (jsonb_typeof(items)='array'),
 invoice_id uuid, payment_id uuid, source text not null check (source in ('web','chat','voice','telegram','portal','system')),
 note text, idempotency_key text not null, created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(), check (type='ADJUSTMENT' or amount_paise > 0),
 unique (business_id,idempotency_key),
 foreign key (business_id,client_id) references public.clients(business_id,id) on delete restrict,
 foreign key (business_id,invoice_id) references public.invoices(business_id,id) on delete restrict,
 foreign key (business_id,payment_id) references public.payments(business_id,id) on delete restrict
);
create index ledger_entries_business_client_date_idx on public.ledger_entries(business_id,client_id,created_at desc);
create unique index ledger_entries_payment_once_idx on public.ledger_entries(payment_id) where type='PAYMENT' and payment_id is not null;

create table public.payment_confirmations (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 client_id uuid not null, amount_paise bigint not null check (amount_paise > 0), note text,
 status text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key (business_id,client_id) references public.clients(business_id,id) on delete restrict
);
create index payment_confirmations_business_status_idx on public.payment_confirmations(business_id,status,created_at desc);
create table public.orders (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 client_id uuid not null, items jsonb not null check (jsonb_typeof(items)='array'),
 status text not null default 'PLACED' check (status in ('PLACED','ACCEPTED','FULFILLED','CANCELLED')),
 source text not null check (source in ('web','chat','voice','telegram','portal','system')),
 idempotency_key text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key (business_id,client_id) references public.clients(business_id,id) on delete restrict
);
create unique index orders_business_idem_idx on public.orders(business_id,idempotency_key) where idempotency_key is not null;

create table public.chat_messages (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 user_id uuid references auth.users(id) on delete set null, channel text not null check (channel in ('web','telegram')),
 role text not null check (role in ('user','assistant','system')), content text not null, parsed jsonb,
 audio_path text, status text not null default 'COMPLETED', created_at timestamptz not null default now(),
 unique (business_id,id)
);
create index chat_messages_business_history_idx on public.chat_messages(business_id,created_at desc);
create table public.pending_actions (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 chat_message_id uuid not null,
 actions jsonb not null check (jsonb_typeof(actions)='array'), expires_at timestamptz not null,
 status text not null default 'PENDING' check (status in ('PENDING','CONFIRMED','CANCELLED','EXPIRED')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key (business_id,chat_message_id) references public.chat_messages(business_id,id) on delete cascade
);
create index pending_actions_business_status_idx on public.pending_actions(business_id,status,expires_at);
create table public.notifications (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 client_id uuid, type text not null, title text not null, body text not null, read_at timestamptz,
 channel text not null check (channel in ('web','telegram','email')), delivered_at timestamptz,
 created_at timestamptz not null default now(),
 foreign key (business_id,client_id) references public.clients(business_id,id) on delete cascade
);
create index notifications_business_unread_idx on public.notifications(business_id,read_at,created_at desc);

create table public.telegram_sessions (
 id uuid primary key default gen_random_uuid(), bot text not null check (bot in ('admin','client')),
 chat_id text not null, business_id uuid references public.businesses(id) on delete cascade,
 client_id uuid, state jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default now(), unique (bot,chat_id),
 check (client_id is null or business_id is not null),
 foreign key (business_id,client_id) references public.clients(business_id,id) on delete cascade
);
create index telegram_sessions_business_idx on public.telegram_sessions(business_id,updated_at desc);
create table public.ai_usage (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 kind text not null check (kind in ('llm','stt','tts')), model text not null,
 input_units integer not null default 0 check (input_units >= 0), output_units integer not null default 0 check (output_units >= 0),
 latency_ms integer not null check (latency_ms >= 0), ok boolean not null, created_at timestamptz not null default now()
);
create index ai_usage_business_date_idx on public.ai_usage(business_id,created_at desc);
create table public.audit_log (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 actor uuid references auth.users(id) on delete set null, action text not null, entity text not null, entity_id uuid,
 diff jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index audit_log_business_date_idx on public.audit_log(business_id,created_at desc);

create table public.document_counters (
 business_id uuid not null references public.businesses(id) on delete cascade,
 document_type text not null check (document_type in ('invoice','receipt')),
 document_year integer not null, next_value bigint not null check (next_value > 0),
 primary key (business_id,document_type,document_year)
);
create table public.idempotency_requests (
 business_id uuid not null references public.businesses(id) on delete cascade, idempotency_key text not null,
 operation text not null, result jsonb, created_at timestamptz not null default now(),
 primary key (business_id,idempotency_key)
);

create function public.touch_updated_at()
returns trigger language plpgsql set search_path=public as $$
begin
 new.updated_at := now();
 return new;
end;
$$;
do $$
declare t text;
begin
 foreach t in array array['businesses','client_profiles','clients','inventory','invoices','payments','payment_confirmations','orders','pending_actions'] loop
  execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()',t||'_touch_updated_at',t);
 end loop;
end;
$$;
create trigger telegram_sessions_touch_updated_at before update on public.telegram_sessions for each row execute function public.touch_updated_at();

create function public.is_member(p_business_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.business_members where business_id=p_business_id and user_id=auth.uid());
$$;

create function public.next_document_number(p_business_id uuid,p_type text)
returns text language plpgsql security definer set search_path=public as $$
declare
 v_year integer := extract(year from (now() at time zone 'Asia/Kolkata'))::integer;
 v_number bigint;
begin
 if p_type not in ('invoice','receipt') then raise exception 'Invalid document type'; end if;
 insert into public.document_counters(business_id,document_type,document_year,next_value)
 values(p_business_id,p_type,v_year,2)
 on conflict(business_id,document_type,document_year)
 do update set next_value=public.document_counters.next_value+1
 returning next_value-1 into v_number;
 return (case when p_type='invoice' then 'KF-' else 'KF-R-' end)||v_year::text||'-'||lpad(v_number::text,4,'0');
end;
$$;

create function public.begin_idempotency(p_business_id uuid,p_key text,p_operation text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_operation text; v_result jsonb;
begin
 if p_key is null or length(trim(p_key))=0 then raise exception 'Idempotency key is required'; end if;
 insert into public.idempotency_requests(business_id,idempotency_key,operation)
 values(p_business_id,p_key,p_operation) on conflict do nothing;
 select operation,result into v_operation,v_result from public.idempotency_requests
 where business_id=p_business_id and idempotency_key=p_key for update;
 if v_operation<>p_operation then raise exception 'Idempotency key already used for another operation'; end if;
 return v_result;
end;
$$;
create function public.finish_idempotency(p_business_id uuid,p_key text,p_result jsonb)
returns void language sql security definer set search_path=public as $$
 update public.idempotency_requests set result=p_result
 where business_id=p_business_id and idempotency_key=p_key;
$$;

create function public.rpc_accept_client_invitation(p_token_hash text,p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_invitation public.client_invitations%rowtype; v_link_id uuid;
begin
 if not exists(select 1 from public.client_profiles where user_id=p_user_id) then raise exception 'Client profile does not exist'; end if;
 select * into v_invitation from public.client_invitations where token_hash=p_token_hash for update;
 if not found then raise exception 'Invitation not found'; end if;
 if v_invitation.accepted_at is not null then
  select id into v_link_id from public.client_business_links where invitation_id=v_invitation.id;
  if v_link_id is not null then
   if (select user_id from public.client_business_links where id=v_link_id)<>p_user_id then raise exception 'Invitation already accepted'; end if;
   return jsonb_build_object('linkId',v_link_id);
  end if;
  raise exception 'Invitation has already been used';
 end if;
 if v_invitation.revoked_at is not null or v_invitation.expires_at<=now() then raise exception 'Invitation is no longer valid'; end if;
 insert into public.client_business_links(business_id,client_id,user_id,invitation_id)
 values(v_invitation.business_id,v_invitation.client_id,p_user_id,v_invitation.id) returning id into v_link_id;
 update public.client_invitations set accepted_at=now() where id=v_invitation.id;
 return jsonb_build_object('linkId',v_link_id,'businessId',v_invitation.business_id,'clientId',v_invitation.client_id);
end;
$$;

create function public.rpc_record_sale(
 p_business uuid,p_client uuid,p_items jsonb,p_total_paise bigint,
 p_paid_now_paise bigint,p_idem text,p_source text,p_actor uuid
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 v_result jsonb; v_line jsonb;
 v_name text; v_unit text; v_qty numeric; v_stock public.inventory%rowtype;
 v_invoice uuid; v_payment uuid; v_number text; v_receipt text; v_entry uuid;
 v_balance bigint; v_status text;
begin
 v_result:=public.begin_idempotency(p_business,p_idem,'record_sale');
 if v_result is not null then return v_result; end if;
 if p_total_paise is null or p_paid_now_paise is null or p_total_paise<=0 or p_paid_now_paise<0 or p_paid_now_paise>p_total_paise then raise exception 'Invalid sale amount'; end if;
 if p_source is null or p_source not in ('web','chat','voice','telegram','portal','system') then raise exception 'Invalid source'; end if;
 if jsonb_typeof(coalesce(p_items,'[]'::jsonb))<>'array' then raise exception 'Sale items must be an array'; end if;
 perform 1 from public.clients where id=p_client and business_id=p_business for update;
 if not found then raise exception 'Client does not belong to business'; end if;
 for v_line in select value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
  v_name:=trim(v_line->>'name'); v_unit:=coalesce(trim(v_line->>'unit'),''); v_qty:=(v_line->>'qty')::numeric;
  if v_name is null or v_name='' or v_qty is null or v_qty<=0 then raise exception 'Invalid sale item'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_business::text||':'||lower(v_name),0));
  select * into v_stock from public.inventory
   where business_id=p_business and lower(item_name)=lower(v_name) and lower(unit)=lower(v_unit) for update;
  if found then
   if v_stock.quantity<v_qty then raise exception 'Insufficient stock for %',v_name; end if;
   update public.inventory set quantity=quantity-v_qty where id=v_stock.id;
  elsif exists(select 1 from public.inventory where business_id=p_business and lower(item_name)=lower(v_name)) then
   raise exception 'Stock unit does not match for %',v_name;
  -- shortcut: unlisted items do not change stock, require catalog-only sales if every item must be tracked.
  end if;
 end loop;
 v_number:=public.next_document_number(p_business,'invoice');
 v_status:=case when p_paid_now_paise=0 then 'ISSUED' when p_paid_now_paise=p_total_paise then 'PAID' else 'PARTIAL' end;
 insert into public.invoices(business_id,client_id,number,items,total_paise,paid_paise,status,issued_at)
 values(p_business,p_client,v_number,coalesce(p_items,'[]'::jsonb),p_total_paise,p_paid_now_paise,v_status,now())
 returning id into v_invoice;
 insert into public.ledger_entries(business_id,client_id,type,amount_paise,items,invoice_id,source,idempotency_key,created_by)
 values(p_business,p_client,'SALE',p_total_paise,coalesce(p_items,'[]'::jsonb),v_invoice,p_source,p_idem||':sale',p_actor)
 returning id into v_entry;
 if p_paid_now_paise>0 then
  insert into public.payments(business_id,client_id,invoice_id,amount_paise,method,provider,status,idempotency_key,paid_at)
  values(p_business,p_client,v_invoice,p_paid_now_paise,'CASH','manual','SUCCEEDED',p_idem||':paid-now',now())
  returning id into v_payment;
  insert into public.ledger_entries(business_id,client_id,type,amount_paise,invoice_id,payment_id,source,idempotency_key,created_by)
  values(p_business,p_client,'PAYMENT',p_paid_now_paise,v_invoice,v_payment,p_source,p_idem||':payment',p_actor);
  v_receipt:=public.next_document_number(p_business,'receipt');
  insert into public.receipts(business_id,payment_id,number) values(p_business,v_payment,v_receipt);
 end if;
 update public.clients set balance_paise=balance_paise+p_total_paise-p_paid_now_paise
  where id=p_client returning balance_paise into v_balance;
 insert into public.audit_log(business_id,actor,action,entity,entity_id,diff)
 values(p_business,p_actor,'record_sale','invoice',v_invoice,jsonb_build_object('totalPaise',p_total_paise::text,'paidNowPaise',p_paid_now_paise::text));
 v_result:=jsonb_build_object('invoiceId',v_invoice,'saleEntryId',v_entry,'paymentId',v_payment,'balancePaise',v_balance::text);
 perform public.finish_idempotency(p_business,p_idem,v_result);
 return v_result;
end;
$$;

create function public.rpc_record_payment(
 p_business uuid,p_client uuid,p_amount_paise bigint,p_method text,
 p_idem text,p_payment_id uuid,p_actor uuid,p_allow_advance boolean default false
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 v_result jsonb; v_client public.clients%rowtype; v_payment public.payments%rowtype;
 v_invoice public.invoices%rowtype; v_remaining bigint; v_allocation bigint;
 v_balance bigint; v_entry uuid; v_receipt text;
begin
 v_result:=public.begin_idempotency(p_business,p_idem,'record_payment');
 if v_result is not null then return v_result; end if;
 if p_amount_paise is null or p_method is null or p_amount_paise<=0 or p_method not in ('CASH','UPI_MOCK','UPI','OTHER') then raise exception 'Invalid payment'; end if;
 select * into v_client from public.clients where id=p_client and business_id=p_business for update;
 if not found then raise exception 'Client does not belong to business'; end if;
 if p_amount_paise>greatest(v_client.balance_paise,0) and not p_allow_advance then raise exception 'Payment exceeds outstanding balance'; end if;
 if p_payment_id is null then
  insert into public.payments(business_id,client_id,amount_paise,method,provider,status,idempotency_key,paid_at)
  values(p_business,p_client,p_amount_paise,p_method,'manual','SUCCEEDED',p_idem,now()) returning * into v_payment;
 else
  select * into v_payment from public.payments where id=p_payment_id and business_id=p_business and client_id=p_client for update;
  if not found or v_payment.amount_paise<>p_amount_paise then raise exception 'Payment attempt does not match'; end if;
  if v_payment.method<>p_method then raise exception 'Payment method does not match attempt'; end if;
  if v_payment.status not in ('CREATED','PENDING','SUCCEEDED') then raise exception 'Payment attempt cannot be settled'; end if;
  if v_payment.status='SUCCEEDED' then
   select id into v_entry from public.ledger_entries where payment_id=p_payment_id and type='PAYMENT';
   if v_entry is not null then
    v_result:=jsonb_build_object('paymentId',p_payment_id,'ledgerEntryId',v_entry,'balancePaise',v_client.balance_paise::text);
    perform public.finish_idempotency(p_business,p_idem,v_result); return v_result;
   end if;
  end if;
  update public.payments set status='SUCCEEDED',paid_at=coalesce(paid_at,now()) where id=p_payment_id;
 end if;
 v_remaining:=p_amount_paise;
 for v_invoice in
  select * from public.invoices
  where business_id=p_business and client_id=p_client and status in ('ISSUED','PARTIAL') and paid_paise<total_paise
  order by issued_at asc nulls first,created_at asc for update
 loop
  exit when v_remaining=0;
  v_allocation:=least(v_remaining,v_invoice.total_paise-v_invoice.paid_paise);
  update public.invoices set paid_paise=paid_paise+v_allocation,
   status=case when paid_paise+v_allocation=total_paise then 'PAID' else 'PARTIAL' end
   where id=v_invoice.id;
  v_remaining:=v_remaining-v_allocation;
 end loop;
 insert into public.ledger_entries(business_id,client_id,type,amount_paise,invoice_id,payment_id,source,idempotency_key,created_by)
 values(p_business,p_client,'PAYMENT',p_amount_paise,v_payment.invoice_id,v_payment.id,'web',p_idem||':payment',p_actor)
 returning id into v_entry;
 update public.clients set balance_paise=balance_paise-p_amount_paise where id=p_client returning balance_paise into v_balance;
 v_receipt:=public.next_document_number(p_business,'receipt');
 insert into public.receipts(business_id,payment_id,number) values(p_business,v_payment.id,v_receipt)
 on conflict(payment_id) do nothing;
 insert into public.audit_log(business_id,actor,action,entity,entity_id,diff)
 values(p_business,p_actor,'record_payment','payment',v_payment.id,jsonb_build_object('amountPaise',p_amount_paise::text));
 v_result:=jsonb_build_object('paymentId',v_payment.id,'ledgerEntryId',v_entry,'balancePaise',v_balance::text);
 perform public.finish_idempotency(p_business,p_idem,v_result);
 return v_result;
end;
$$;

create function public.rpc_adjust_stock(
 p_business uuid,p_item text,p_delta numeric,p_unit text,p_idem text,p_actor uuid
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 v_result jsonb; v_stock public.inventory%rowtype; v_quantity numeric; v_item_id uuid;
begin
 v_result:=public.begin_idempotency(p_business,p_idem,'adjust_stock');
 if v_result is not null then return v_result; end if;
 if p_item is null or p_unit is null or p_delta is null or trim(p_item)='' or trim(p_unit)='' or p_delta=0 then raise exception 'Invalid stock adjustment'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_business::text||':'||lower(trim(p_item)),0));
 select * into v_stock from public.inventory where business_id=p_business and lower(item_name)=lower(trim(p_item)) for update;
 if found then
  if lower(v_stock.unit)<>lower(trim(p_unit)) then raise exception 'Stock unit does not match'; end if;
  if v_stock.quantity+p_delta<0 then raise exception 'Stock cannot be negative'; end if;
  update public.inventory set quantity=quantity+p_delta where id=v_stock.id returning id,quantity into v_item_id,v_quantity;
 else
  if p_delta<0 then raise exception 'Cannot subtract stock from unknown item'; end if;
  insert into public.inventory(business_id,item_name,unit,quantity) values(p_business,trim(p_item),trim(p_unit),p_delta)
  returning id,quantity into v_item_id,v_quantity;
 end if;
 insert into public.audit_log(business_id,actor,action,entity,entity_id,diff)
 values(p_business,p_actor,'adjust_stock','inventory',v_item_id,jsonb_build_object('delta',p_delta,'quantity',v_quantity));
 v_result:=jsonb_build_object('itemId',v_item_id,'item',trim(p_item),'quantity',v_quantity,'unit',trim(p_unit));
 perform public.finish_idempotency(p_business,p_idem,v_result);
 return v_result;
end;
$$;

create function public.rpc_create_invoice(
 p_business uuid,p_client uuid,p_items jsonb,p_due_date date,p_idem text,p_actor uuid
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 v_result jsonb; v_line jsonb; v_total bigint:=0; v_qty numeric; v_price bigint; v_number text; v_invoice uuid;
begin
 v_result:=public.begin_idempotency(p_business,p_idem,'create_invoice');
 if v_result is not null then return v_result; end if;
 if jsonb_typeof(coalesce(p_items,'[]'::jsonb))<>'array' then raise exception 'Invoice items must be an array'; end if;
 if not exists(select 1 from public.clients where id=p_client and business_id=p_business) then raise exception 'Client does not belong to business'; end if;
 for v_line in select value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
  v_qty:=(v_line->>'qty')::numeric; v_price:=(v_line->>'pricePaise')::bigint;
  if trim(v_line->>'name') is null or trim(v_line->>'name')='' or v_qty is null or v_qty<=0 or v_price is null or v_price<0 then raise exception 'Invalid invoice item'; end if;
  v_total:=v_total+round(v_qty*v_price)::bigint;
 end loop;
 if v_total<=0 then raise exception 'Invoice total must be positive'; end if;
 v_number:=public.next_document_number(p_business,'invoice');
 insert into public.invoices(business_id,client_id,number,items,total_paise,status,due_date)
 values(p_business,p_client,v_number,p_items,v_total,'DRAFT',p_due_date) returning id into v_invoice;
 insert into public.audit_log(business_id,actor,action,entity,entity_id,diff)
 values(p_business,p_actor,'create_invoice','invoice',v_invoice,jsonb_build_object('totalPaise',v_total::text));
 v_result:=jsonb_build_object('invoiceId',v_invoice,'number',v_number,'totalPaise',v_total::text);
 perform public.finish_idempotency(p_business,p_idem,v_result);
 return v_result;
end;
$$;

create function public.rpc_void_invoice(p_business uuid,p_invoice uuid,p_idem text,p_actor uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 v_result jsonb; v_invoice public.invoices%rowtype; v_role text; v_line jsonb; v_qty numeric; v_name text; v_unit text;
begin
 v_result:=public.begin_idempotency(p_business,p_idem,'void_invoice');
 if v_result is not null then return v_result; end if;
 select role into v_role from public.business_members where business_id=p_business and user_id=p_actor;
 if v_role is null or v_role not in ('owner','admin') then raise exception 'Insufficient role to void invoice'; end if;
 select * into v_invoice from public.invoices where id=p_invoice and business_id=p_business for update;
 if not found then raise exception 'Invoice not found'; end if;
 if v_invoice.status='VOID' then
  v_result:=jsonb_build_object('invoiceId',p_invoice,'status','VOID');
  perform public.finish_idempotency(p_business,p_idem,v_result); return v_result;
 end if;
 if v_invoice.status='DRAFT' then
  update public.invoices set status='VOID',voided_at=now() where id=p_invoice;
  v_result:=jsonb_build_object('invoiceId',p_invoice,'status','VOID');
  perform public.finish_idempotency(p_business,p_idem,v_result); return v_result;
 end if;
 update public.clients set balance_paise=balance_paise-v_invoice.total_paise where id=v_invoice.client_id;
 insert into public.ledger_entries(business_id,client_id,type,amount_paise,items,invoice_id,source,note,idempotency_key,created_by)
 values(p_business,v_invoice.client_id,'ADJUSTMENT',-v_invoice.total_paise,v_invoice.items,p_invoice,'system','Invoice void reversal',p_idem||':reversal',p_actor);
 for v_line in select value from jsonb_array_elements(v_invoice.items) loop
  v_name:=v_line->>'name'; v_unit:=coalesce(v_line->>'unit',''); v_qty:=(v_line->>'qty')::numeric;
  perform pg_advisory_xact_lock(hashtextextended(p_business::text||':'||lower(v_name),0));
  update public.inventory set quantity=quantity+v_qty
   where business_id=p_business and lower(item_name)=lower(v_name) and lower(unit)=lower(v_unit);
 end loop;
 update public.invoices set status='VOID',voided_at=now() where id=p_invoice;
 insert into public.audit_log(business_id,actor,action,entity,entity_id,diff)
 values(p_business,p_actor,'void_invoice','invoice',p_invoice,jsonb_build_object('totalPaise',v_invoice.total_paise::text));
 v_result:=jsonb_build_object('invoiceId',p_invoice,'status','VOID');
 perform public.finish_idempotency(p_business,p_idem,v_result);
 return v_result;
end;
$$;

create function public.rpc_confirm_payment_claim(p_confirmation uuid,p_approve boolean,p_actor uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_claim public.payment_confirmations%rowtype; v_role text; v_result jsonb;
begin
 select * into v_claim from public.payment_confirmations where id=p_confirmation for update;
 if not found then raise exception 'Payment claim not found'; end if;
 v_result:=public.begin_idempotency(v_claim.business_id,'claim:'||p_confirmation::text,'confirm_payment_claim');
 if v_result is not null then return v_result; end if;
 if v_claim.status<>'PENDING' then raise exception 'Payment claim is no longer pending'; end if;
 select role into v_role from public.business_members where business_id=v_claim.business_id and user_id=p_actor;
 if v_role is null or (p_approve and v_role not in ('owner','admin')) then raise exception 'Insufficient role to handle payment claims'; end if;
 if p_approve then
  v_result:=public.rpc_record_payment(v_claim.business_id,v_claim.client_id,v_claim.amount_paise,'CASH',
    'claim-payment:'||p_confirmation::text,null,p_actor,false);
  update public.payment_confirmations set status='APPROVED' where id=p_confirmation;
 else
  update public.payment_confirmations set status='REJECTED' where id=p_confirmation;
  v_result:=jsonb_build_object('confirmationId',p_confirmation,'status','REJECTED');
 end if;
 perform public.finish_idempotency(v_claim.business_id,'claim:'||p_confirmation::text,v_result);
 return v_result;
end;
$$;

create policy businesses_member_read on public.businesses for select to authenticated using(public.is_member(id));
create policy business_members_read on public.business_members for select to authenticated using(user_id=auth.uid() or public.is_member(business_id));
create policy clients_member_read on public.clients for select to authenticated using(public.is_member(business_id));
create policy client_profiles_self_read on public.client_profiles for select to authenticated using(user_id=auth.uid());
create policy client_profiles_self_update on public.client_profiles for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy client_business_links_member_or_self_read on public.client_business_links for select to authenticated using(user_id=auth.uid() or public.is_member(business_id));
create policy inventory_member_read on public.inventory for select to authenticated using(public.is_member(business_id));
create policy invoices_member_read on public.invoices for select to authenticated using(public.is_member(business_id));
create policy payments_succeeded_member_read on public.payments for select to authenticated using(status='SUCCEEDED' and public.is_member(business_id));
create policy receipts_member_read on public.receipts for select to authenticated using(public.is_member(business_id));
create policy ledger_member_read on public.ledger_entries for select to authenticated using(public.is_member(business_id));
create policy payment_confirmations_member_read on public.payment_confirmations for select to authenticated using(public.is_member(business_id));
create policy orders_member_read on public.orders for select to authenticated using(public.is_member(business_id));
create policy chat_messages_member_read on public.chat_messages for select to authenticated using(public.is_member(business_id));
create policy pending_actions_member_read on public.pending_actions for select to authenticated using(public.is_member(business_id));
create policy notifications_member_read on public.notifications for select to authenticated using(public.is_member(business_id));
create policy telegram_sessions_member_read on public.telegram_sessions for select to authenticated using(business_id is not null and public.is_member(business_id));
create policy ai_usage_member_read on public.ai_usage for select to authenticated using(public.is_member(business_id));
create policy audit_log_member_read on public.audit_log for select to authenticated using(public.is_member(business_id));

do $$
declare t text;
begin
 foreach t in array array[
  'businesses','business_members','client_profiles','clients','client_invitations','client_business_links',
  'inventory','invoices','payments','receipts','ledger_entries','payment_confirmations','orders',
  'chat_messages','pending_actions','notifications','telegram_sessions','ai_usage','audit_log',
  'document_counters','idempotency_requests'
 ] loop
  execute format('alter table public.%I enable row level security',t);
 end loop;
end;
$$;

insert into storage.buckets(id,name,public)
values('invoices','invoices',false),('receipts','receipts',false),('voice-tmp','voice-tmp',false)
on conflict(id) do update set public=false;

revoke all on function public.touch_updated_at() from public,anon,authenticated;
revoke all on function public.add_business_owner_membership() from public,anon,authenticated;
revoke all on function public.is_member(uuid) from public,anon;
revoke all on function public.next_document_number(uuid,text) from public,anon,authenticated;
revoke all on function public.begin_idempotency(uuid,text,text) from public,anon,authenticated;
revoke all on function public.finish_idempotency(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.rpc_accept_client_invitation(text,uuid) from public,anon,authenticated;
revoke all on function public.rpc_record_sale(uuid,uuid,jsonb,bigint,bigint,text,text,uuid) from public,anon,authenticated;
revoke all on function public.rpc_record_payment(uuid,uuid,bigint,text,text,uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function public.rpc_adjust_stock(uuid,text,numeric,text,text,uuid) from public,anon,authenticated;
revoke all on function public.rpc_create_invoice(uuid,uuid,jsonb,date,text,uuid) from public,anon,authenticated;
revoke all on function public.rpc_void_invoice(uuid,uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.rpc_confirm_payment_claim(uuid,boolean,uuid) from public,anon,authenticated;
grant execute on function public.is_member(uuid) to authenticated,service_role;
grant execute on function public.rpc_accept_client_invitation(text,uuid) to service_role;
grant execute on function public.rpc_record_sale(uuid,uuid,jsonb,bigint,bigint,text,text,uuid) to service_role;
grant execute on function public.rpc_record_payment(uuid,uuid,bigint,text,text,uuid,uuid,boolean) to service_role;
grant execute on function public.rpc_adjust_stock(uuid,text,numeric,text,text,uuid) to service_role;
grant execute on function public.rpc_create_invoice(uuid,uuid,jsonb,date,text,uuid) to service_role;
grant execute on function public.rpc_void_invoice(uuid,uuid,text,uuid) to service_role;
grant execute on function public.rpc_confirm_payment_claim(uuid,boolean,uuid) to service_role;






