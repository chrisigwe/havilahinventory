# Havilah Inventory

Mobile-first inventory & bar sales app for Havilah Suite Ltd (Awka & Nnewi).
Shares the Supabase project with the front desk register: same staff, same
branches, one stock ledger.

## Setup

1. Run `10_auth_rls.sql` in the Supabase SQL Editor (once).
2. Create logins: Supabase Dashboard → Authentication → Add user
   (email + password; emails like `chidi.openbar@havilah.local` are fine).
3. Link each login to its staff row — template at the bottom of `10_auth_rls.sql`
   (sets `auth_user_id` and the barman's `default_location_id`).
4. `cp .env.example .env` and fill in the project URL + anon key
   (Dashboard → Settings → API).
5. `npm install && npm run dev`

## Deploy (Netlify)

Push to GitHub → import in Netlify → add the two `VITE_` environment
variables → deploy. `netlify.toml` handles the SPA redirect.

## How it behaves

- Barman signs in, lands on Sales with their bar preselected.
- "Record a sale": search item (most-sold first, live stock shown),
  qty stepper, tier + payment chips, optional split; price is editable
  because real prices sometimes deviate from catalog.
- PR / damaged are write-offs (stock_movements), never sales rows.
- Every saved sale writes its own stock deduction via the DB trigger —
  the app never computes stock, it only reads `v_stock_on_hand`.
- Stock tab: on-hand by location, negatives in red (they mean a count
  or a missed entry is needed).
- Store tab (storekeeper / manager / gm / admin only): Receive records
  deliveries into the store with unit cost; Disburse moves stock from
  the store to a department. Several items are staged and saved in one
  go, and Disburse warns when a line exceeds what the store holds.

- Fix tab (manager / gm / admin only): last 14 days of sales and stock
  movements, each editable (quantity, price/cost) or deletable. Deleting
  a sale reverses its stock deduction automatically; editing one restates
  its payment record to the new total. Sale deductions are hidden from
  the list — correct the sale itself and the movement follows.
  A second view, Change history, shows every deletion and edit with
  who did it and when. That log is written by database triggers
  (15_audit_log.sql), so corrections made outside the app are recorded
  too. It is append-only: nobody can edit or delete the log itself.
  Storekeepers have the same Fix tab as managers (18_storekeeper_full_rights.sql).

## Branch scope

Only GM and admin see both branches (21_branch_scope.sql). They get a
branch selector in the header; switching reloads the whole app against
that branch, so every screen — sales, stock, credit, counts, corrections
— shows the selected branch. They can also record in either branch
(26_admin_cross_branch_write.sql). Everyone else has no selector and is
pinned to their own branch by RLS regardless of what the client asks for. Managers,
store managers, auditors and bar staff are confined to their own branch —
they keep every capability their role carries, but only within it.
Someone who works both branches needs one account per branch.

- Credit tab: outstanding balances per customer, a full statement
  (credit taken, payments received, balance) and Record payment for
  recovery by POS/cash/transfer. Print / PDF uses the browser's print
  dialog — "Save as PDF" produces the invoice.
- Count tab: the store manager starts a count for a location, enters
  physical quantities against what the system says, and submits it.
  An auditor then verifies, and any variance posts automatically as
  an adjustment so the ledger matches the shelf. Only an auditor can
  verify — enforced by verify_stock_count(), not the UI.

## Kitchen, Housekeeping and Others

These are consuming departments (`consumes_on_issue`). Stock disbursed
to them is expensed on issue: it leaves the store and does not build up
as a balance there. Consumption stays attributed to the department for
reporting via `v_consumption`. They are not sales points, so they never
appear on the Sales screen — kitchen staff can be given their own sales
point later by flipping `is_sales_point`.

## Who sees what

`staff_locations` assigns each person their departments (14_staff_locations.sql).
Barmen see only their own areas on both the Sales and Stock tabs.
Storekeepers, managers, GM and admin see every location — as does
anyone with no assignment yet, so nobody is locked out by omission.

At Nnewi, OpenBar staff are assigned OpenBar *and* Lounge, since
Lounge is a location there. At Awka, Lounge is a price tier, so
OpenBar staff reach it through the tier chips instead.

## Who can do what

Location is never locked: `default_location_id` only preselects a
staff member's usual bar, and anyone can switch. Awka's OpenBar staff
ring up Lounge-priced sales via the tier chips on the same screen.
Recording is open to all active staff for their own branch; editing
and deleting history stay manager-only (enforced by RLS, not the UI).


## Offline behaviour

Writes that fail because the connection dropped are kept in
localStorage and retried automatically when it returns (`src/lib/outbox.js`).
A banner shows how many entries are waiting. Only connection errors are
queued — a real rejection (bad data, a permission error) surfaces to the
user immediately instead of being silently swallowed.

## Sales are recorded as a basket

Add several items, adjust tier and price per line, then take payment once.
The payment split is allocated across the lines automatically. Overdrawing
a location asks for confirmation rather than blocking.

## Backups

See BACKUP.md.


## Sales reporting model (change request section 4)

Gross Sales and money collected are separate figures and are never
summed together:

    Gross Sales      = sum(qty x unit price)      -- goods off the shelf
    Received at sale = POS + Cash on those sales
    Credit raised    = Gross Sales - Received     -- derived, not typed
    Debt recovered   = repayments received today against earlier credit
    Total money in   = Received + Debt recovered

Debt recovery never increases Gross Sales. The panel on the Sales
screen shows all five, per location per day, for checking against the
Book of Records. Views: `v_reconciliation`, `v_debt_recovered_daily`.

## Backdating

The date on a sale defaults to today. Storekeeper/manager/gm/admin can
change it; bar staff cannot (enforced by `validate_sale_date()`, not the
UI). Future dates are refused, and nothing may be dated before the
branch's `opening_balance_date`. Backdated rows carry an optional reason
and show a "backdated" marker. All reporting keys off `business_date`.

## Opening balances

More > Stock count > Opening balance: pick a location and date, enter
counted quantities, post. Writes adjustment movements for
(counted - system) and sets the branch's opening-balance date, which
then bounds backdating. Manager-only, and deliberately skips the
auditor step — every such posting is written to the audit log saying so.

## Variances

More > Variances lists any sale where POS + Cash + Credit does not equal
quantity x unit price, with operator and amount (`v_sale_variances`).
Bar staff cannot save an unbalanced sale at all; managers can override
with a confirmation, and the override lands here.


## One customer, one record

Customer names are normalised in the database (`normalize_customer_name`):
titles, bracketed asides, "c/o ..." attributions and punctuation are
stripped, so "Mr Chike", "Mr. Chike", "Mr Chike c/o Kelvin" and
"Mr Chike (Caleb)" all reduce to the key `chike`. A unique index on
(branch_id, name_key) means a second record cannot be created for the
same person, and the app reuses the existing one if a barman types a
different spelling.

Who served the customer goes in `served_by`, not in the name.
`v_customer_similar` lists near-matches the key cannot catch (a surname
added later, a typo); `merge_customers(keep, merge[])` folds them
together, moving sales and repayments to the surviving record.

Catalog editing is GM and admin only, enforced by RLS.


## Receipts

Every basket is stamped with a `receipt_id`, so its lines can be pulled
back together and printed as one document however it was paid — POS,
cash, credit or a split. The receipt shows department, item, tier, qty,
unit price and amount, then a payment table naming each method and its
amount; a credit portion is labelled as outstanding. Customer is optional
on cash and POS sales (blank prints as "Walk-in") and required for credit.

Reprint from the Sales screen: tap any row under Today, or use "Receipt
for the last sale" straight after saving. `27_receipts.sql` also groups
existing app-entered sales into receipts so older sales can be printed.


## Credit is per department

OpenBar's debtors are not MainBar's. A customer is still one record
(so a name is never split in two), but credit taken and repayments are
tracked per location: `v_customer_balances_by_location`, and
`credit_repayments.location_id`. The Credit tab has department chips,
each showing only what is owed to that department, and a statement
prints with the department in its header.

A repayment always belongs to the department whose credit it settles —
paying at OpenBar does not clear a MainBar debt.

## Staff fixing their own mistakes

Bar staff get More > Corrections showing only entries they themselves
recorded, from today and yesterday. They can edit quantity, price and
payment split — they cannot delete anything (29_staff_no_delete.sql).
Removing a record is store manager, manager, GM or admin only. The edit
window is enforced by `app_owns_recent()` in RLS, so it cannot be
widened from the client. They cannot see the change
history, and anything they alter is written to it under their name.
Backdating remains editor-only.
