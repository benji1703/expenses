begin;
-- Keep any referenced category; replace unused household starter categories.
delete from public.categories c where not exists(select 1 from public.expenses e where e.category_id=c.id);
insert into public.categories(name,color) values
 ('רמ״י — דמי היתר','#bd9361'),('רמ״י — רכישת זכויות והיוון','#927a59'),('רמ״י — חכירה והסדרת שימושים','#b5a17b'),
 ('היטל השבחה','#aa7c7c'),('אגרות היתר ורישוי','#a398c3'),('היטלי פיתוח וחיבורי תשתית','#739aa3'),
 ('אדריכלות ותכנון','#7fa18d'),('מדידה ושמאות','#8896b0'),('ייעוץ משפטי','#93939e'),
 ('שלד והריסה','#c19b76'),('חשמל ואינסטלציה','#81a6b1'),('גמרים ומטבח','#d2ac86'),
 ('עבודות חוץ ופיתוח המשק','#93a16e'),('מבנים ותשתיות חקלאיות','#62856a'),('פיקוח וניהול','#829488'),('אחר ובלתי צפוי','#aaa79b')
on conflict(name) do nothing;
alter table public.expenses add column payment_status text not null default 'paid' check(payment_status in ('paid','unpaid','planned'));
alter table public.expenses add column due_on date;
alter table public.expenses add column reference text not null default '' check(length(reference)<=160);
alter table public.expenses add column stage text not null default 'construction' check(stage in ('rights','planning','permits','construction','finishing','infrastructure'));
create index expenses_payment_due_idx on public.expenses(payment_status,due_on);
drop function public.monthly_summary(date);
create function public.monthly_summary(month_start date default null)
returns table(currency text, category_id uuid, total numeric, paid_total numeric, outstanding_total numeric, planned_total numeric, expense_count bigint, receipt_count bigint)
language sql stable security invoker set search_path = '' as $$
 select e.currency,e.category_id,sum(e.amount),
 coalesce(sum(e.amount) filter(where e.payment_status='paid'),0),
 coalesce(sum(e.amount) filter(where e.payment_status='unpaid'),0),
 coalesce(sum(e.amount) filter(where e.payment_status='planned'),0),count(*),count(e.receipt_path)
 from public.expenses e
 where month_start is null or (e.spent_on >= month_start and e.spent_on < (month_start + interval '1 month')::date)
 group by e.currency,e.category_id;
$$;
revoke all on function public.monthly_summary(date) from public;
grant execute on function public.monthly_summary(date) to authenticated;
commit;
