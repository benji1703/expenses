begin;

-- Foreign keys do not automatically index the referencing column. This index
-- supports embedded receipt counts, monthly_summary and expense-delete cascades
-- without scanning all receipt rows for each expense.
create index if not exists expense_receipts_expense_idx
  on public.expense_receipts(expense_id);

commit;
