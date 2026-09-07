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

## Who can do what

Location is never locked: `default_location_id` only preselects a
staff member's usual bar, and anyone can switch. Awka's OpenBar staff
ring up Lounge-priced sales via the tier chips on the same screen.
Recording is open to all active staff for their own branch; editing
and deleting history stay manager-only (enforced by RLS, not the UI).
