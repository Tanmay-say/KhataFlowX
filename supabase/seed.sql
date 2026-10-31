insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
values('00000000-0000-4000-8000-000000000001','authenticated','authenticated','demo.owner@khataflow.test','',now(),now(),now(),'{}'::jsonb,'{}'::jsonb)
on conflict(id) do nothing;

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
values('00000000-0000-4000-8000-000000000003','authenticated','authenticated','other.owner@khataflow.test','',now(),now(),now(),'{}'::jsonb,'{}'::jsonb)
on conflict(id) do nothing;

insert into public.businesses(id,name,owner_user_id,settings)
values('10000000-0000-4000-8000-000000000001','Demo Kirana','00000000-0000-4000-8000-000000000001','{"language":"hi","tts_enabled":true,"reminder_days":[1,7]}'::jsonb)
on conflict(id) do nothing;
insert into public.businesses(id,name,owner_user_id,settings)
values('10000000-0000-4000-8000-000000000002','Other Shop','00000000-0000-4000-8000-000000000003','{"language":"en"}'::jsonb)
on conflict(id) do nothing;
insert into public.business_members(business_id,user_id,role)
values('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','owner')
on conflict do nothing;

insert into public.clients(id,business_id,name,preferred_language) values
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Ramesh','hi'),
('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Suresh','hi'),
('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','Pooja','hi'),
('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','Imran','hi'),
('20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','Geeta','hi'),
('20000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000001','Raju','hi'),
('20000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000001','Sunita','hi'),
('20000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000001','Chotu Kirana','hi')
on conflict(id) do nothing;

insert into public.inventory(business_id,item_name,quantity,unit,low_stock_threshold,price_per_unit_paise) values
('10000000-0000-4000-8000-000000000001','atta',100,'kg',10,4500),
('10000000-0000-4000-8000-000000000001','dal',60,'kg',8,12000),
('10000000-0000-4000-8000-000000000001','chawal',80,'kg',10,6500),
('10000000-0000-4000-8000-000000000001','doodh',40,'litre',8,6000),
('10000000-0000-4000-8000-000000000001','sabun',50,'piece',10,2500),
('10000000-0000-4000-8000-000000000001','tel',30,'litre',5,14000),
('10000000-0000-4000-8000-000000000001','cheeni',45,'kg',7,5000),
('10000000-0000-4000-8000-000000000001','chai patti',20,'kg',4,18000),
('10000000-0000-4000-8000-000000000001','namak',35,'kg',5,2000),
('10000000-0000-4000-8000-000000000001','biscuit',75,'packet',12,1000),
('10000000-0000-4000-8000-000000000001','masala',18,'kg',3,9000),
('10000000-0000-4000-8000-000000000001','toothpaste',25,'piece',5,6500)
on conflict do nothing;

insert into public.invoices(id,business_id,client_id,number,items,total_paise,paid_paise,status,issued_at) values
('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','KF-2026-0001','[{"name":"atta","qty":10,"unit":"kg","pricePaise":5000}]'::jsonb,50000,0,'ISSUED',now()-interval '3 days'),
('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','KF-2026-0002','[{"name":"dal","qty":5,"unit":"kg","pricePaise":16000}]'::jsonb,80000,30000,'PARTIAL',now()-interval '2 days'),
('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000003','KF-2026-0003','[{"name":"chawal","qty":5,"unit":"kg","pricePaise":5000}]'::jsonb,25000,25000,'PAID',now()-interval '1 day')
on conflict(id) do nothing;

insert into public.payments(id,business_id,client_id,invoice_id,amount_paise,method,provider,status,idempotency_key,paid_at) values
('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002',30000,'CASH','manual','SUCCEEDED','seed-payment-2',now()-interval '1 day'),
('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000003',25000,'UPI_MOCK','mock','SUCCEEDED','seed-payment-3',now()-interval '1 day')
on conflict(id) do nothing;
insert into public.receipts(business_id,payment_id,number) values
('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','KF-R-2026-0001'),
('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002','KF-R-2026-0002')
on conflict do nothing;
insert into public.document_counters(business_id,document_type,document_year,next_value) values
('10000000-0000-4000-8000-000000000001','invoice',2026,4),
('10000000-0000-4000-8000-000000000001','receipt',2026,3)
on conflict(business_id,document_type,document_year) do update set next_value=greatest(public.document_counters.next_value,excluded.next_value);

insert into public.ledger_entries(business_id,client_id,type,amount_paise,items,invoice_id,source,idempotency_key) values
('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','SALE',50000,'[{"name":"atta","qty":10,"unit":"kg","pricePaise":5000}]'::jsonb,'30000000-0000-4000-8000-000000000001','web','seed-sale-1'),
('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','SALE',80000,'[{"name":"dal","qty":5,"unit":"kg","pricePaise":16000}]'::jsonb,'30000000-0000-4000-8000-000000000002','web','seed-sale-2'),
('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000003','SALE',25000,'[{"name":"chawal","qty":5,"unit":"kg","pricePaise":5000}]'::jsonb,'30000000-0000-4000-8000-000000000003','web','seed-sale-3')
on conflict(business_id,idempotency_key) do nothing;
insert into public.ledger_entries(business_id,client_id,type,amount_paise,invoice_id,payment_id,source,idempotency_key) values
('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','PAYMENT',30000,'30000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001','web','seed-ledger-payment-2'),
('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000003','PAYMENT',25000,'30000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000002','web','seed-ledger-payment-3')
on conflict(business_id,idempotency_key) do nothing;
insert into public.ledger_entries(business_id,client_id,type,amount_paise,items,source,idempotency_key,created_at)
select '10000000-0000-4000-8000-000000000001',
 ('20000000-0000-4000-8000-'||lpad(((n%5)+4)::text,12,'0'))::uuid,
 'SALE',10000+n*100,'[]'::jsonb,'web','seed-extra-'||n,now()-((24-n)::text||' hours')::interval
from generate_series(1,20) as g(n)
on conflict(business_id,idempotency_key) do nothing;
update public.clients c set balance_paise=coalesce((
 select sum(case when e.type='PAYMENT' then -e.amount_paise else e.amount_paise end)
 from public.ledger_entries e where e.business_id=c.business_id and e.client_id=c.id
),0);

