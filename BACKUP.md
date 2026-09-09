# Weekly backup (audit finding 15)

Supabase takes its own daily backups on paid plans, but they are not
exports you control. A weekly CSV copy costs nothing and makes any
future reconciliation trivial.

## Option A — dashboard, 2 minutes a week

SQL Editor, run each query, then "Download CSV" on the results:

```sql
select * from stock_items;
select * from stock_movements where business_date >= current_date - 400;
select s.*, p.method, p.amount as payment_amount
  from sales s left join sale_payments p on p.sale_id = s.id
 where s.business_date >= current_date - 400;
select * from customers;
select * from credit_repayments;
select * from inventory_audit;
```

Keep them in a dated folder on Drive: `havilah-backup-2026-09-14/`.

## Option B — one command, if you have psql locally

```bash
PGPASSWORD='...' pg_dump \
  -h db.lhjqgxcfktulaughgfhz.supabase.co -U postgres -d postgres \
  -t 'stock_*' -t 'sales' -t 'sale_payments' -t 'customers' \
  -t 'credit_repayments' -t 'inventory_audit' -t 'staff' -t 'branches' \
  --data-only --column-inserts \
  > havilah-$(date +%F).sql
```

The connection string is in Dashboard → Settings → Database.

## What to check occasionally

```sql
-- sales with no payment recorded: money owed, or an entry mistake
select count(*) from sales s
where not exists (select 1 from sale_payments p where p.sale_id = s.id);

-- negative stock: a missed entry somewhere
select * from v_stock_on_hand where qty_on_hand < 0;

-- counts waiting on the auditor
select * from stock_counts where status = 'submitted';
```
