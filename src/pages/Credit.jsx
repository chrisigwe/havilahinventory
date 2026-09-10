import { useCallback, useEffect, useMemo, useState } from 'react'
import { useToast } from '../components/Toast'
import { naira, lagosToday, methodLabel, tierLabel } from '../lib/format'
import { loadBalances, loadCustomerLedger, saveRepayment } from '../lib/data'

export default function Credit({ boot }) {
  const { staff, items, methods, allLocations } = boot
  const [rows, setRows] = useState(null)
  const toast = useToast()
  const [open, setOpen] = useState(null)       // { customer, ledger }
  const [pay, setPay] = useState(null)
  const [busy, setBusy] = useState(false)
  const itemById = useMemo(() => Object.fromEntries(items.map(i => [i.id, i])), [items])
  const locById = useMemo(() => Object.fromEntries((allLocations || []).map(l => [l.id, l])), [allLocations])

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
          <div className="flex-1 overflow-y-auto">
            <div className="p-5 print:hidden">
              <button onClick={() => setOpen(null)} className="text-dim">Back</button>
            </div>

            <div id="invoice-area" className="px-5 pb-6">
              {/* letterhead */}
              <div className="invoice-head">
                <h1 className="text-2xl font-bold">Havilah Suite Ltd</h1>
                <p className="text-dim">{boot.branchName || ''} · Statement of Account</p>
              </div>

              <div className="invoice-meta mt-5">
                <div>
                  <div className="text-dim text-sm">Customer</div>
                  <div className="text-xl font-bold">{open.customer.name}</div>
                  {open.customer.phone && <div className="text-dim text-sm">{open.customer.phone}</div>}
                </div>
                <div className="text-right">
                  <div className="text-dim text-sm">Date</div>
                  <div className="tnum">
                    {new Date().toLocaleDateString('en-NG',
                      { day: 'numeric', month: 'long', year: 'numeric' })}
                  </div>
                </div>
              </div>

              <h3 className="mt-6 mb-2 font-bold">Goods taken on credit</h3>
              <table className="invoice-table">
                <thead>
                  <tr>
                    <th>Date</th><th>Department</th><th>Item</th>
                    <th className="num">Qty</th><th className="num">Unit</th><th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {open.ledger.credit.map(s2 => (
                    <tr key={s2.id}>
                      <td className="tnum">{s2.business_date?.slice(5)}</td>
                      <td>{locById[s2.location_id]?.name || '—'}</td>
                      <td>
                        {itemById[s2.stock_item_id]?.name || '—'}
                        {s2.tier && s2.tier !== 'general' && (
                          <span className="text-dim"> ({tierLabel[s2.tier] || s2.tier})</span>
                        )}
                      </td>
                      <td className="num tnum">{s2.qty}</td>
                      <td className="num tnum">{naira(s2.unit_price)}</td>
                      <td className="num tnum">{naira(s2.credit)}</td>
                    </tr>
                  ))}
                  {!open.ledger.credit.length && (
                    <tr><td colSpan="6" className="text-dim">None recorded.</td></tr>
                  )}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan="5" className="num font-bold">Total credit</td>
                    <td className="num tnum font-bold">{naira(open.customer.credit_taken)}</td>
                  </tr>
                </tfoot>
              </table>

              <h3 className="mt-6 mb-2 font-bold">Payments received</h3>
              <table className="invoice-table">
                <thead>
                  <tr><th>Date</th><th>Method</th><th>Note</th><th className="num">Amount</th></tr>
                </thead>
                <tbody>
                  {open.ledger.repayments.map(r => (
                    <tr key={r.id}>
                      <td className="tnum">{r.paid_on?.slice(5)}</td>
                      <td>{methodLabel[r.method] || r.method}</td>
                      <td className="text-dim">{r.note || ''}</td>
                      <td className="num tnum">{naira(r.amount)}</td>
                    </tr>
                  ))}
                  {!open.ledger.repayments.length && (
                    <tr><td colSpan="4" className="text-dim">None yet.</td></tr>
                  )}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan="3" className="num font-bold">Total paid</td>
                    <td className="num tnum font-bold">{naira(open.customer.repaid)}</td>
                  </tr>
                </tfoot>
              </table>

              <div className="invoice-balance mt-6">
                <span>Balance owing</span>
                <span className="tnum">{naira(open.customer.balance)}</span>
              </div>

              <p className="text-dim text-sm mt-6 invoice-foot">
                Prepared from the Havilah inventory system. Please settle at the front desk
                or with the store manager.
              </p>
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
