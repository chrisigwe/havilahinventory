import { useCallback, useEffect, useMemo, useState } from 'react'
import { naira, lagosToday, tierLabel, methodLabel } from '../lib/format'
import { loadStockMap, loadPopular, loadToday, saveSale, saveWriteoff } from '../lib/data'
import ItemPicker from '../components/ItemPicker'

export default function SalesEntry({ boot }) {
  const { staff, locations, tiers, methods, items } = boot
  const salesPoints = locations.filter(l => l.is_sales_point && !l.is_store)
  const date = lagosToday()
  const [locationId, setLocationId] = useState(staff.default_location_id || salesPoints[0]?.id)
  const [stockMap, setStockMap] = useState({})
  const [popular, setPopular] = useState({})
  const [today, setToday] = useState([])
  const [picking, setPicking] = useState(false)
  const [draft, setDraft] = useState(null) // { item, tier, qty, unitPrice, method, split, writeoff }
  const [toast, setToast] = useState(null)
  const itemById = useMemo(() => Object.fromEntries(items.map(i => [i.id, i])), [items])

  const refresh = useCallback(() => {
    const since = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10)
    loadStockMap(staff.branch_id).then(setStockMap).catch(console.error)
    loadPopular(staff.branch_id, since).then(setPopular).catch(console.error)
    loadToday(staff.branch_id, date).then(setToday).catch(console.error)
  }, [staff.branch_id, date])
  useEffect(refresh, [refresh])

  function priceFor(item, tier) {
    if (tier === 'lounge') return Number(item.lounge_price ?? item.selling_price)
    if (tier === 'staff') return Number(item.staff_price ?? item.selling_price)
    return Number(item.selling_price)
  }
  function startDraft(item) {
    setPicking(false)
    setDraft({ item, tier: 'general', qty: 1, unitPrice: priceFor(item, 'general'),
               method: methods[0], split: null, writeoff: null })
  }
  function setTier(t) {
    setDraft(d => ({ ...d, tier: t, unitPrice: priceFor(d.item, t) }))
  }

  async function save() {
    const d = draft
    try {
      if (d.writeoff) {
        await saveWriteoff({ staff, item: d.item, locationId, kind: d.writeoff,
          qty: d.qty, unitValue: d.unitPrice, date })
        setToast(`${d.qty} × ${d.item.name} written off`)
      } else {
        const total = d.qty * d.unitPrice
        const payments = d.split
          ? methods.map(m => ({ method: m, amount: Number(d.split[m] || 0) }))
          : [{ method: d.method, amount: total }]
        await saveSale({ staff, item: d.item, locationId, tier: d.tier,
          qty: d.qty, unitPrice: d.unitPrice, payments, date })
        setToast(`Saved · ${d.qty} × ${d.item.name} · ${naira(total)}`)
      }
      setDraft(null); refresh()
      setTimeout(() => setToast(null), 2500)
    } catch (e) { alert('Not saved: ' + e.message) }
  }

  const todayTotal = today.reduce((s, r) => s + Number(r.amount || r.qty * r.unit_price), 0)

  return (
    <div className="px-5">
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
        Record a sale
      </button>

      <section className="mt-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-dim">Today</h2>
          <span className="tnum font-bold text-lg">{naira(todayTotal)}</span>
        </div>
        <ul className="mt-2 divide-y divide-line/60">
          {today.map(r => (
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

      {picking && (
        <ItemPicker items={items} stockMap={stockMap} locationId={locationId}
          popular={popular} onPick={startDraft} onClose={() => setPicking(false)} />
      )}

      {draft && (
        <div className="fixed inset-0 z-50 bg-bg flex flex-col">
          <div className="p-5 flex-1 overflow-y-auto">
            <button onClick={() => setDraft(null)} className="text-dim">Back</button>
            <h2 className="mt-3 text-3xl font-bold leading-tight">{draft.item.name}</h2>
            <p className="mt-1 text-2xl tnum text-amber font-bold">{naira(draft.unitPrice * draft.qty)}</p>

            <div className="mt-6 flex items-center gap-5">
              <Step onClick={() => setDraft(d => ({ ...d, qty: Math.max(1, d.qty - 1) }))}>−</Step>
              <span className="tnum text-4xl font-bold w-16 text-center">{draft.qty}</span>
              <Step onClick={() => setDraft(d => ({ ...d, qty: d.qty + 1 }))}>+</Step>
            </div>

            {!draft.writeoff && <>
              <Row label="Price tier">
                {tiers.map(t => (
                  <Chip key={t} active={draft.tier === t} onClick={() => setTier(t)}>{tierLabel[t] || t}</Chip>
                ))}
              </Row>
              <Row label="Unit price">
                <input type="number" inputMode="decimal" value={draft.unitPrice}
                  onChange={e => setDraft(d => ({ ...d, unitPrice: Number(e.target.value) }))}
                  className="h-12 w-36 px-3 rounded-xl bg-surface border border-line tnum" />
              </Row>
              <Row label="Paid by">
                {methods.map(m => (
                  <Chip key={m} active={!draft.split && draft.method === m}
                    onClick={() => setDraft(d => ({ ...d, method: m, split: null }))}>{methodLabel[m] || m}</Chip>
                ))}
                <Chip active={!!draft.split}
                  onClick={() => setDraft(d => ({ ...d, split: d.split || Object.fromEntries(methods.map(m => [m, ''])) }))}>
                  Split
                </Chip>
              </Row>
              {draft.split && (
                <div className="mt-3 space-y-2">
                  {methods.map(m => (
                    <div key={m} className="flex items-center gap-3">
                      <span className="w-20 text-dim">{methodLabel[m] || m}</span>
                      <input type="number" inputMode="decimal" placeholder="0"
                        value={draft.split[m]}
                        onChange={e => setDraft(d => ({ ...d, split: { ...d.split, [m]: e.target.value } }))}
                        className="h-12 flex-1 px-3 rounded-xl bg-surface border border-line tnum" />
                    </div>
                  ))}
                  <SplitCheck draft={draft} />
                </div>
              )}
            </>}

            <Row label="Or record instead">
              <Chip active={draft.writeoff === 'complimentary'}
                onClick={() => setDraft(d => ({ ...d, writeoff: d.writeoff === 'complimentary' ? null : 'complimentary' }))}>
                PR / free
              </Chip>
              <Chip active={draft.writeoff === 'damage'}
                onClick={() => setDraft(d => ({ ...d, writeoff: d.writeoff === 'damage' ? null : 'damage' }))}>
                Damaged
              </Chip>
            </Row>
          </div>
          <div className="p-5 border-t border-line">
            <button onClick={save}
              className="w-full h-16 rounded-2xl bg-amber text-bg text-xl font-bold active:bg-amber-deep">
              {draft.writeoff ? 'Save write-off' : 'Save sale'}
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-24 inset-x-5 z-30 bg-raise border border-line rounded-xl px-4 py-3 text-center">
          {toast}
        </div>
      )}
    </div>
  )
}

function Step({ children, onClick }) {
  return <button onClick={onClick}
    className="h-16 w-16 rounded-2xl bg-surface border border-line text-3xl font-bold active:bg-raise">{children}</button>
}
function Row({ label, children }) {
  return (
    <div className="mt-6">
      <div className="text-dim mb-2">{label}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}
function Chip({ active, onClick, children }) {
  return <button onClick={onClick}
    className={`h-12 px-4 rounded-xl border font-semibold ${active
      ? 'bg-amber text-bg border-amber' : 'border-line text-ink'}`}>{children}</button>
}
function SplitCheck({ draft }) {
  const entered = Object.values(draft.split).reduce((s, v) => s + Number(v || 0), 0)
  const total = draft.qty * draft.unitPrice
  const diff = total - entered
  if (Math.abs(diff) < 0.01) return <p className="text-leaf">Split matches the total.</p>
  return <p className="text-clay tnum">{diff > 0 ? naira(diff) + ' left to allocate' : naira(-diff) + ' over the total'}</p>
}
