import { useCallback, useEffect, useMemo, useState } from 'react'
import { naira, lagosToday, tierLabel, methodLabel } from '../lib/format'
import { loadStockMap, loadPopular, loadToday, saveBasket, saveWriteoff,
         loadDailySummary, loadCustomers, createCustomer } from '../lib/data'
import { enqueue, flush, isConnectionError } from '../lib/outbox'
import { useToast } from '../components/Toast'
import ItemPicker from '../components/ItemPicker'

export default function SalesEntry({ boot }) {
  const { staff, locations, tiers, methods, items } = boot
  const toast = useToast()
  const salesPoints = locations.filter(l => l.is_sales_point && !l.is_store)
  const date = lagosToday()

  const [locationId, setLocationId] = useState(staff.default_location_id || salesPoints[0]?.id)
  const [stockMap, setStockMap] = useState({})
  const [popular, setPopular] = useState({})
  const [today, setToday] = useState([])
  const [summary, setSummary] = useState(null)
  const [customers, setCustomers] = useState([])

  const [basket, setBasket] = useState([])          // [{ key, item, tier, qty, unitPrice }]
  const [picking, setPicking] = useState(false)
  const [tuning, setTuning] = useState(null)        // line being adjusted
  const [paying, setPaying] = useState(null)        // payment step
  const [writeoff, setWriteoff] = useState(null)    // separate PR/damage flow
  const [busy, setBusy] = useState(false)

  const itemById = useMemo(() => Object.fromEntries(items.map(i => [i.id, i])), [items])

  const refresh = useCallback(() => {
    loadStockMap(staff.branch_id).then(setStockMap).catch(() => {})
    loadPopular(staff.branch_id).then(setPopular).catch(() => {})
    loadToday(staff.branch_id, date).then(setToday).catch(() => {})
    loadDailySummary(staff.branch_id, date).then(setSummary).catch(() => {})
    loadCustomers(staff.branch_id).then(setCustomers).catch(() => setCustomers([]))
  }, [staff.branch_id, date])
  useEffect(refresh, [refresh])

  const priceFor = (item, tier) =>
    tier === 'lounge' ? Number(item.lounge_price ?? item.selling_price)
    : tier === 'staff' ? Number(item.staff_price ?? item.selling_price)
    : Number(item.selling_price)

  const onHand = (itemId) => stockMap[`${itemId}:${locationId}`] ?? 0
  const basketTotal = basket.reduce((s, l) => s + l.qty * l.unitPrice, 0)

  function addToBasket(item) {
    setPicking(false)
    setBasket(b => {
      const at = b.findIndex(l => l.item.id === item.id && l.tier === 'general')
      if (at >= 0) {
        const copy = [...b]; copy[at] = { ...copy[at], qty: copy[at].qty + 1 }; return copy
      }
      return [...b, { key: crypto.randomUUID(), item, tier: 'general', qty: 1,
                      unitPrice: priceFor(item, 'general') }]
    })
  }
  const patchLine = (key, patch) =>
    setBasket(b => b.map(l => l.key === key ? { ...l, ...patch } : l))
  const dropLine = (key) => setBasket(b => b.filter(l => l.key !== key))

  // finding 4: warn before recording more than the location holds
  function startPayment() {
    const over = basket.filter(l => l.qty > onHand(l.item.id))
    if (over.length) {
      const names = over.map(l => `${l.item.name} (${onHand(l.item.id)} left, selling ${l.qty})`).join('\n')
      if (!window.confirm(`More than the shelf shows:\n\n${names}\n\nRecord anyway?`)) return
    }
    setPaying({
      method: methods[0], split: null,
      customerId: null, newCustomer: '',
    })
  }

  const creditAmount = (p) =>
    p.split ? Number(p.split.credit || 0) : (p.method === 'credit' ? basketTotal : 0)

  async function commit() {
    setBusy(true)
    try {
      let customerId = paying.customerId
      if (creditAmount(paying) > 0) {
        if (!customerId && paying.newCustomer.trim()) {
          const c = await createCustomer(staff.branch_id, paying.newCustomer, null)
          customerId = c.id; setCustomers(cs => [...cs, c])
        }
        if (!customerId) { toast('Credit sales need a customer name.', 'error'); setBusy(false); return }
      }
      const payments = paying.split
        ? methods.map(m => ({ method: m, amount: Number(paying.split[m] || 0) }))
        : [{ method: paying.method, amount: basketTotal }]

      const payload = {
        staffLite: { id: staff.id, branch_id: staff.branch_id },
        locationId, date, customerId,
        lines: basket.map(l => ({ item: { id: l.item.id, name: l.item.name },
                                  tier: l.tier, qty: l.qty, unitPrice: l.unitPrice })),
        payments,
      }
      try {
        await saveBasket({ staff, locationId, lines: basket, payments, date, customerId })
        toast(`Saved · ${basket.length} item${basket.length > 1 ? 's' : ''} · ${naira(basketTotal)}`, 'success')
      } catch (e) {
        if (!isConnectionError(e)) throw e
        enqueue({ kind: 'basket', payload })
        toast('No connection — saved and will send when you are back online')
      }
      setBasket([]); setPaying(null); refresh(); flush()
    } catch (e) {
      toast('Not saved: ' + e.message, 'error')
    }
    setBusy(false)
  }

  async function commitWriteoff() {
    setBusy(true)
    const w = writeoff
    try {
      const payload = { staffLite: { id: staff.id, branch_id: staff.branch_id },
        itemId: w.item.id, locationId, kind: w.kind, qty: w.qty, unitValue: w.unitValue, date }
      try {
        await saveWriteoff({ staff, item: w.item, locationId, kind: w.kind,
          qty: w.qty, unitValue: w.unitValue, date })
        toast(`${w.qty} × ${w.item.name} recorded as ${w.kind === 'damage' ? 'damaged' : 'PR'}`, 'success')
      } catch (e) {
        if (!isConnectionError(e)) throw e
        enqueue({ kind: 'writeoff', payload })
        toast('No connection — saved and will send when you are back online')
      }
      setWriteoff(null); refresh(); flush()
    } catch (e) { toast('Not saved: ' + e.message, 'error') }
    setBusy(false)
  }

  const todayTotal = today.reduce((s, r) => s + Number(r.amount || r.qty * r.unit_price), 0)

  return (
    <div className="px-5 pb-40">
      <div className="flex gap-2 overflow-x-auto py-2 -mx-1 px-1">
        {salesPoints.map(l => (
          <button key={l.id} onClick={() => setLocationId(l.id)}
            className={`shrink-0 h-11 px-4 rounded-full border ${l.id === locationId
              ? 'bg-amber text-bg border-amber font-bold' : 'border-line text-dim'}`}>
            {l.name}
          </button>
        ))}
      </div>

      <button onClick={() => setPicking(true)}
        className="mt-3 w-full h-16 rounded-2xl bg-amber text-bg text-xl font-bold active:bg-amber-deep">
        + Add item
      </button>

      {!!basket.length && (
        <ul className="mt-4 divide-y divide-line/60 rounded-2xl border border-line bg-surface px-4">
          {basket.map(l => (
            <li key={l.key} className="py-3">
              <div className="flex items-center gap-3">
                <button onClick={() => setTuning(l.key)} className="flex-1 min-w-0 text-left">
                  <div className="font-semibold truncate">{l.item.name}</div>
                  <div className="text-dim text-sm">
                    {tierLabel[l.tier] || l.tier} · {naira(l.unitPrice)} each
                  </div>
                </button>
                <button onClick={() => patchLine(l.key, { qty: Math.max(1, l.qty - 1) })}
                  className="h-11 w-11 rounded-xl bg-raise border border-line text-2xl">−</button>
                <span className="tnum w-8 text-center font-bold">{l.qty}</span>
                <button onClick={() => patchLine(l.key, { qty: l.qty + 1 })}
                  className="h-11 w-11 rounded-xl bg-raise border border-line text-2xl">+</button>
                <span className="tnum w-20 text-right">{naira(l.qty * l.unitPrice)}</span>
              </div>
              {l.qty > onHand(l.item.id) && (
                <p className="text-clay text-sm mt-1">Only {onHand(l.item.id)} on the shelf</p>
              )}
            </li>
          ))}
        </ul>
      )}

      <section className="mt-6">
        <div className="flex items-baseline justify-between">
          <div>
            <h2 className="text-dim">Today</h2>
            <p className="text-dim text-sm">
              {new Date(date + 'T12:00:00').toLocaleDateString('en-NG',
                { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
          <span className="tnum font-bold text-lg">{naira(todayTotal)}</span>
        </div>

        {summary && (
          <div className="mt-3 rounded-2xl border border-line bg-surface p-4">
            <div className="grid grid-cols-3 gap-3">
              {methods.map(m => (
                <div key={m}>
                  <div className="text-dim text-sm">{methodLabel[m] || m}</div>
                  <div className="tnum font-bold">{naira(summary.byMethod[m] || 0)}</div>
                </div>
              ))}
            </div>
            {!!summary.nonRevenue.length && (
              <div className="mt-3 pt-3 border-t border-line">
                <div className="text-dim text-sm mb-1">Not income — stock out without payment</div>
                {summary.nonRevenue.map(r => (
                  <div key={r.kind} className="flex justify-between text-sm">
                    <span className="text-dim">{r.kind === 'complimentary' ? 'PR / free' : 'Damaged'}</span>
                    <span className="tnum">{r.qty} units{Number(r.value) > 0 && ` · ${naira(r.value)}`}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <ul className="mt-3 divide-y divide-line/60">
          {today.slice(0, 20).map(r => (
            <li key={r.id} className="py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{itemById[r.stock_item_id]?.name || '—'}</div>
                <div className="text-dim text-sm">{tierLabel[r.tier] || r.tier} · {r.qty} × {naira(r.unit_price)}</div>
              </div>
              <div className="tnum font-semibold">{naira(r.amount ?? r.qty * r.unit_price)}</div>
            </li>
          ))}
          {!today.length && <li className="py-6 text-dim">No sales recorded yet — the first one goes on top.</li>}
        </ul>
      </section>

      {!!basket.length && (
        <div className="fixed bottom-20 inset-x-0 px-5 pb-2 z-20">
          <button onClick={startPayment}
            className="w-full h-16 rounded-2xl bg-amber text-bg text-xl font-bold shadow-lg active:bg-amber-deep">
            Take payment · {naira(basketTotal)}
          </button>
        </div>
      )}

      {picking && (
        <ItemPicker items={items} stockMap={stockMap} locationId={locationId}
          popular={popular} onPick={addToBasket} onClose={() => setPicking(false)}
          onWriteoff={(item) => { setPicking(false)
            setWriteoff({ item, kind: 'damage', qty: 1, unitValue: Number(item.selling_price) }) }} />
      )}

      {tuning && (() => {
        const l = basket.find(x => x.key === tuning)
        if (!l) return null
        return (
          <Sheet onClose={() => setTuning(null)}>
            <h2 className="text-2xl font-bold">{l.item.name}</h2>
            <Row label="Price tier">
              {tiers.map(t => (
                <Chip key={t} active={l.tier === t}
                  onClick={() => patchLine(l.key, { tier: t, unitPrice: priceFor(l.item, t) })}>
                  {tierLabel[t] || t}
                </Chip>
              ))}
            </Row>
            <Row label="Unit price">
              <input type="number" inputMode="decimal" value={l.unitPrice}
                onChange={e => patchLine(l.key, { unitPrice: Number(e.target.value) })}
                className="h-12 w-36 px-3 rounded-xl bg-surface border border-line tnum" />
            </Row>
            <button onClick={() => { dropLine(l.key); setTuning(null) }}
              className="mt-8 w-full h-12 rounded-xl border border-clay text-clay font-semibold">
              Remove from basket
            </button>
            <button onClick={() => setTuning(null)}
              className="mt-3 w-full h-14 rounded-2xl bg-amber text-bg text-lg font-bold">Done</button>
          </Sheet>
        )
      })()}

      {paying && (
        <Sheet onClose={() => setPaying(null)}>
          <h2 className="text-2xl font-bold">Payment</h2>
          <p className="mt-1 text-3xl tnum text-amber font-bold">{naira(basketTotal)}</p>
          <p className="text-dim mt-1">{basket.length} item{basket.length > 1 ? 's' : ''}</p>

          <Row label="Paid by">
            {methods.map(m => (
              <Chip key={m} active={!paying.split && paying.method === m}
                onClick={() => setPaying(p => ({ ...p, method: m, split: null }))}>
                {methodLabel[m] || m}
              </Chip>
            ))}
            <Chip active={!!paying.split}
              onClick={() => setPaying(p => ({ ...p,
                split: p.split || Object.fromEntries(methods.map(m => [m, ''])) }))}>
              Split
            </Chip>
          </Row>

          {paying.split && (
            <div className="mt-3 space-y-2">
              {methods.map(m => (
                <div key={m} className="flex items-center gap-3">
                  <span className="w-20 text-dim">{methodLabel[m] || m}</span>
                  <input type="number" inputMode="decimal" placeholder="0" value={paying.split[m]}
                    onChange={e => setPaying(p => ({ ...p, split: { ...p.split, [m]: e.target.value } }))}
                    className="h-12 flex-1 px-3 rounded-xl bg-surface border border-line tnum" />
                </div>
              ))}
              <SplitCheck split={paying.split} total={basketTotal} />
            </div>
          )}

          {creditAmount(paying) > 0 && (
            <div className="mt-6">
              <div className="text-dim mb-2">Customer (for the credit)</div>
              <select value={paying.customerId || ''}
                onChange={e => setPaying(p => ({ ...p, customerId: e.target.value || null }))}
                className="h-12 w-full px-3 rounded-xl bg-surface border border-line">
                <option value="">— new customer —</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {!paying.customerId && (
                <input value={paying.newCustomer} placeholder="Customer name"
                  onChange={e => setPaying(p => ({ ...p, newCustomer: e.target.value }))}
                  className="mt-2 h-12 w-full px-3 rounded-xl bg-surface border border-line" />
              )}
            </div>
          )}

          <button onClick={commit} disabled={busy}
            className="mt-8 w-full h-16 rounded-2xl bg-amber text-bg text-xl font-bold disabled:opacity-40">
            {busy ? 'Saving…' : 'Save sale'}
          </button>
        </Sheet>
      )}

      {writeoff && (
        <Sheet onClose={() => setWriteoff(null)}>
          <h2 className="text-2xl font-bold">{writeoff.item.name}</h2>
          <p className="text-dim mt-1">Not a sale — this leaves stock without income.</p>
          <Row label="Reason">
            <Chip active={writeoff.kind === 'complimentary'}
              onClick={() => setWriteoff(w => ({ ...w, kind: 'complimentary' }))}>PR / free</Chip>
            <Chip active={writeoff.kind === 'damage'}
              onClick={() => setWriteoff(w => ({ ...w, kind: 'damage' }))}>Damaged</Chip>
          </Row>
          <Row label="Quantity">
            <button onClick={() => setWriteoff(w => ({ ...w, qty: Math.max(1, w.qty - 1) }))}
              className="h-14 w-14 rounded-xl bg-surface border border-line text-2xl">−</button>
            <span className="tnum text-3xl font-bold w-14 text-center">{writeoff.qty}</span>
            <button onClick={() => setWriteoff(w => ({ ...w, qty: w.qty + 1 }))}
              className="h-14 w-14 rounded-xl bg-surface border border-line text-2xl">+</button>
          </Row>
          <Row label="Value per unit">
            <input type="number" inputMode="decimal" value={writeoff.unitValue}
              onChange={e => setWriteoff(w => ({ ...w, unitValue: Number(e.target.value) }))}
              className="h-12 w-36 px-3 rounded-xl bg-surface border border-line tnum" />
          </Row>
          <button onClick={commitWriteoff} disabled={busy}
            className="mt-8 w-full h-16 rounded-2xl bg-amber text-bg text-xl font-bold disabled:opacity-40">
            {busy ? 'Saving…' : 'Save write-off'}
          </button>
        </Sheet>
      )}
    </div>
  )
}

function Sheet({ children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 bg-bg flex flex-col">
      <div className="p-5 flex-1 overflow-y-auto">
        <button onClick={onClose} className="text-dim">Back</button>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  )
}
function Row({ label, children }) {
  return (
    <div className="mt-6">
      <div className="text-dim mb-2">{label}</div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}
function Chip({ active, onClick, children }) {
  return <button onClick={onClick}
    className={`h-12 px-4 rounded-xl border font-semibold ${active
      ? 'bg-amber text-bg border-amber' : 'border-line text-ink'}`}>{children}</button>
}
function SplitCheck({ split, total }) {
  const entered = Object.values(split).reduce((s, v) => s + Number(v || 0), 0)
  const diff = total - entered
  if (Math.abs(diff) < 0.01) return <p className="text-leaf">Split matches the total.</p>
  return <p className="text-clay tnum">
    {diff > 0 ? naira(diff) + ' left to allocate' : naira(-diff) + ' over the total'}
  </p>
}
