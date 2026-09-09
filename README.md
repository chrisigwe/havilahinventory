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

Only GM and admin see both branches (21_branch_scope.sql). Managers,
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
