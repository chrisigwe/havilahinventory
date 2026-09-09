import { useCallback, useEffect, useMemo, useState } from 'react'
import { useToast } from '../components/Toast'
import { naira, lagosToday, methodLabel } from '../lib/format'
import { loadBalances, loadCustomerLedger, saveRepayment } from '../lib/data'

export default function Credit({ boot }) {
  const { staff, items, methods } = boot
  const [rows, setRows] = useState(null)
  const toast = useToast()
  const [open, setOpen] = useState(null)       // { customer, ledger }
  const [pay, setPay] = useState(null)
  const [busy, setBusy] = useState(false)
  const itemById = useMemo(() => Object.fromEntries(items.map(i => [i.id, i])), [items])

  const refresh = useCallback(() => {
    loadBalances(staff.branch_id).then(setRows).catch(e => toast(e.message, 'error'))
  }, [staff.branch_id])
  useEffect(refresh, [refresh])

  async function openCustomer(c) {
    try {
      const ledger = await loadCustomerLedger(staff.branch_id, c.customer_id)
      setOpen({ customer: c, ledger })
    } catch (e) { toast(e.message, 'error') }
  }

  async function submitPayment() {
    setBusy(true)
    try {
      await saveRepayment({
        staff, customerId: pay.customerId, amount: Number(pay.amount),
        method: pay.method, paidOn: pay.paidOn, note: pay.note,
      })
      setPay(null); setOpen(null); refresh()
    } catch (e) { toast('Not saved: ' + e.message, 'error') }
    setBusy(false)
  }

  if (!rows) return <p className="px-5 text-dim">Loading…</p>
  const owing = rows.filter(r => Number(r.balance) > 0.009)
  const total = owing.reduce((s, r) => s + Number(r.balance), 0)

  return (
    <div className="px-5">
      <div className="flex items-baseline justify-between py-2">
        <h2 className="text-dim">Outstanding credit</h2>
        <span className="tnum font-bold text-lg text-clay">{naira(total)}</span>
      </div>

      <ul className="divide-y divide-line/60">
        {owing.map(c => (
          <li key={c.customer_id} className="py-3 flex items-center gap-3">
            <button onClick={() => openCustomer(c)} className="flex-1 min-w-0 text-left">
              <div className="font-semibold truncate">{c.name}</div>
              <div className="text-dim text-sm">
                {naira(c.credit_taken)} taken · {naira(c.repaid)} repaid
              </div>
            </button>
            <span className="tnum font-bold text-clay">{naira(c.balance)}</span>
          </li>
        ))}
        {!owing.length && <li className="py-8 text-center text-dim">Nobody owes anything.</li>}
      </ul>

      {open && (
        <div className="fixed inset-0 z-50 bg-bg flex flex-col">
          <div className="p-5 flex-1 overflow-y-auto" id="invoice-area">
            <button onClick={() => setOpen(null)} className="text-dim print:hidden">Back</button>

            <div className="mt-3">
              <h2 className="text-2xl font-bold">{open.customer.name}</h2>
              {open.customer.phone && <p className="text-dim">{open.customer.phone}</p>}
              <p className="text-dim text-sm mt-1">
                Statement as at {new Date().toLocaleDateString('en-NG',
                  { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>

            <h3 className="mt-6 text-dim">Credit taken</h3>
            <ul className="mt-1 divide-y divide-line/60">
              {open.ledger.credit.map(s => (
                <li key={s.id} className="py-2 flex items-center gap-3">
                  <span className="tnum text-dim text-sm w-16">{s.business_date?.slice(5)}</span>
                  <span className="flex-1 min-w-0 truncate">
                    {itemById[s.stock_item_id]?.name || '—'} × {s.qty}
                  </span>
                  <span className="tnum">{naira(s.credit)}</span>
                </li>
              ))}
              {!open.ledger.credit.length && <li className="py-2 text-dim">None recorded.</li>}
            </ul>

            <h3 className="mt-6 text-dim">Payments received</h3>
            <ul className="mt-1 divide-y divide-line/60">
              {open.ledger.repayments.map(r => (
                <li key={r.id} className="py-2 flex items-center gap-3">
                  <span className="tnum text-dim text-sm w-16">{r.paid_on?.slice(5)}</span>
                  <span className="flex-1 text-dim">{methodLabel[r.method] || r.method}</span>
                  <span className="tnum text-leaf">{naira(r.amount)}</span>
                </li>
              ))}
              {!open.ledger.repayments.length && <li className="py-2 text-dim">None yet.</li>}
            </ul>

            <div className="mt-6 pt-3 border-t border-line flex items-baseline justify-between">
              <span className="font-bold text-lg">Balance owing</span>
              <span className="tnum font-bold text-lg">{naira(open.customer.balance)}</span>
            </div>
          </div>

          <div className="p-5 border-t border-line flex gap-3 print:hidden">
            <button onClick={() => window.print()}
              className="flex-1 h-14 rounded-2xl border border-line font-bold">Print / PDF</button>
            <button onClick={() => setPay({ customerId: open.customer.customer_id,
              amount: open.customer.balance, method: methods.find(m => m !== 'credit') || 'cash',
              paidOn: lagosToday(), note: '' })}
              className="flex-1 h-14 rounded-2xl bg-amber text-bg font-bold">Record payment</button>
          </div>
        </div>
      )}

      {pay && (
        <div className="fixed inset-0 z-[60] bg-bg flex flex-col">
          <div className="p-5 flex-1 overflow-y-auto">
            <button onClick={() => setPay(null)} className="text-dim">Back</button>
            <h2 className="mt-3 text-2xl font-bold">Record payment</h2>

            <label className="block mt-6 text-dim">Amount</label>
            <input type="number" inputMode="decimal" value={pay.amount}
              onChange={e => setPay(p => ({ ...p, amount: e.target.value }))}
              className="mt-2 h-14 w-full px-4 rounded-xl bg-surface border border-line tnum" />

            <label className="block mt-4 text-dim">Paid by</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {methods.filter(m => m !== 'credit').map(m => (
                <button key={m} onClick={() => setPay(p => ({ ...p, method: m }))}
                  className={`h-12 px-4 rounded-xl border font-semibold ${pay.method === m
                    ? 'bg-amber text-bg border-amber' : 'border-line text-ink'}`}>
                  {methodLabel[m] || m}
                </button>
              ))}
            </div>

            <label className="block mt-4 text-dim">Date received</label>
            <input type="date" value={pay.paidOn}
              onChange={e => setPay(p => ({ ...p, paidOn: e.target.value }))}
              className="mt-2 h-14 w-full px-4 rounded-xl bg-surface border border-line" />

            <label className="block mt-4 text-dim">Note (optional)</label>
            <input value={pay.note} onChange={e => setPay(p => ({ ...p, note: e.target.value }))}
              className="mt-2 h-14 w-full px-4 rounded-xl bg-surface border border-line" />
          </div>
          <div className="p-5 border-t border-line">
            <button onClick={submitPayment} disabled={busy || !(Number(pay.amount) > 0)}
              className="w-full h-16 rounded-2xl bg-amber text-bg text-xl font-bold disabled:opacity-40">
              {busy ? 'Saving…' : 'Save payment'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
