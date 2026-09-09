import { useCallback, useEffect, useMemo, useState } from 'react'
import { useToast } from '../components/Toast'
import { naira, lagosToday } from '../lib/format'
import { loadStockMap, loadPopular } from '../lib/data'
import { supabase } from '../lib/supabase'
import { enqueue, flush, isConnectionError } from '../lib/outbox'
import ItemPicker from '../components/ItemPicker'

export default function Store({ boot }) {
  const { staff, allLocations, items } = boot
  const locations = allLocations
  const store = locations.find(l => l.is_store)
  const departments = locations.filter(l => !l.is_store)
  const date = lagosToday()
  const toast = useToast()

  const [mode, setMode] = useState('receive')       // receive | disburse
  const [stockMap, setStockMap] = useState({})
  const [popular, setPopular] = useState({})
  const [picking, setPicking] = useState(false)
  const [lines, setLines] = useState([])            // staged, saved together
  const [toDept, setToDept] = useState(departments[0]?.id)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(() => {
    const since = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10)
    loadStockMap(staff.branch_id).then(setStockMap).catch(console.error)
    loadPopular(staff.branch_id, since).then(setPopular).catch(console.error)
  }, [staff.branch_id])
  useEffect(refresh, [refresh])

  const storeQty = useMemo(
    () => (id) => stockMap[`${id}:${store?.id}`] ?? 0, [stockMap, store])

  function addLine(item) {
    setPicking(false)
    setLines(l => l.some(x => x.item.id === item.id) ? l
      : [...l, { item, qty: 1 }])
  }
  const setQty = (id, q) => setLines(l => l.map(x => x.item.id === id ? { ...x, qty: Math.max(1, q) } : x))
  const drop = (id) => setLines(l => l.filter(x => x.item.id !== id))

  async function save() {
    if (!lines.length) return
    setBusy(true)
    try {
      const dept = departments.find(d => d.id === toDept)
      const issues = mode === 'disburse' && dept?.consumes_on_issue
      const rows = lines.map(l => ({
        branch_id: staff.branch_id,
        stock_item_id: l.item.id,
        movement_type: mode === 'receive' ? 'restock' : (issues ? 'issue' : 'transfer'),
        from_location: mode === 'receive' ? null : store.id,
        to_location:   mode === 'receive' ? store.id : toDept,
        qty: l.qty,
        business_date: date,
        occurred_at: new Date().toISOString(),
        recorded_by: staff.id,
        is_migrated: false,
        note: mode === 'receive' ? 'received into store'
          : `${issues ? 'issued to' : 'to'} ${dept?.name}`,
      }))
      try {
        const { error } = await supabase.from('stock_movements').insert(rows)
        if (error) throw error
        toast(`${rows.length} item${rows.length > 1 ? 's' : ''} ${mode === 'receive' ? 'received' : 'disbursed'}`, 'success')
      } catch (e) {
        if (!isConnectionError(e)) throw e
        enqueue({ kind: 'movements', payload: { rows } })
        toast('No connection — saved and will send when you are back online')
      }
      setLines([]); refresh(); flush()
    } catch (e) { toast('Not saved: ' + e.message, 'error') }
    setBusy(false)
  }

  const overdrawn = mode === 'disburse' && lines.some(l => l.qty > storeQty(l.item.id))

  return (
    <div className="px-5">
      <div className="flex gap-2 py-2">
        {[['receive', 'Receive'], ['disburse', 'Disburse']].map(([k, label]) => (
          <button key={k} onClick={() => { setMode(k); setLines([]) }}
            className={`flex-1 h-12 rounded-xl border font-bold ${mode === k
              ? 'bg-amber text-bg border-amber' : 'border-line text-dim'}`}>
            {label}
          </button>
        ))}
      </div>

      <p className="text-dim text-sm">
        {mode === 'receive'
          ? 'Stock arriving from suppliers, into the store.'
          : 'Stock leaving the store for a department.'}
      </p>
      {mode === 'disburse' && departments.find(d => d.id === toDept)?.consumes_on_issue && (
        <p className="text-dim text-sm mt-2">
          {departments.find(d => d.id === toDept)?.name} is a consuming department —
          this stock is used up on issue, not held as a balance there.
        </p>
      )}

      {mode === 'disburse' && (
        <div className="mt-4">
          <div className="text-dim mb-2">Send to</div>
          <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
            {departments.map(d => (
              <button key={d.id} onClick={() => setToDept(d.id)}
                className={`shrink-0 h-11 px-4 rounded-full border ${d.id === toDept
                  ? 'bg-amber text-bg border-amber font-bold' : 'border-line text-dim'}`}>
                {d.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <button onClick={() => setPicking(true)}
        className="mt-4 w-full h-14 rounded-2xl border-2 border-amber text-amber text-lg font-bold">
        + Add item
      </button>

      <ul className="mt-4 divide-y divide-line/60">
        {lines.map(l => {
          const avail = storeQty(l.item.id)
          const short = mode === 'disburse' && l.qty > avail
          return (
            <li key={l.item.id} className="py-3">
              <div className="flex items-center gap-3">
                <span className="flex-1 min-w-0 truncate font-semibold">{l.item.name}</span>
                <button onClick={() => drop(l.item.id)} className="text-dim px-2">Remove</button>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <button onClick={() => setQty(l.item.id, l.qty - 1)}
                  className="h-12 w-12 rounded-xl bg-surface border border-line text-2xl font-bold">−</button>
                <input type="number" inputMode="numeric" value={l.qty}
                  onChange={e => setQty(l.item.id, Number(e.target.value))}
                  className="h-12 w-20 px-3 rounded-xl bg-surface border border-line tnum text-center" />
                <button onClick={() => setQty(l.item.id, l.qty + 1)}
                  className="h-12 w-12 rounded-xl bg-surface border border-line text-2xl font-bold">+</button>
                <span className={`flex-1 text-right tnum ${short ? 'text-clay' : 'text-dim'}`}>
                  {mode === 'receive' ? '' : `${avail} in store`}
                </span>
              </div>
            </li>
          )
        })}
        {!lines.length && <li className="py-6 text-dim">Nothing added yet.</li>}
      </ul>

      {!!lines.length && (
        <div className="sticky bottom-20 mt-4 pb-2">
          {overdrawn && <p className="text-clay mb-2">More than the store holds — check the count first.</p>}
          <button onClick={save} disabled={busy}
            className="w-full h-16 rounded-2xl bg-amber text-bg text-xl font-bold disabled:opacity-40">
            {busy ? 'Saving…' : mode === 'receive' ? 'Save delivery' : 'Disburse stock'}
          </button>
        </div>
      )}

      {picking && (
        <ItemPicker items={items} stockMap={stockMap} locationId={store?.id}
          popular={popular} onPick={addLine} onClose={() => setPicking(false)} />
      )}

          </div>
  )
}
