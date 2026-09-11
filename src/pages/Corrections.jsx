import { useCallback, useEffect, useMemo, useState } from 'react'
import { naira, tierLabel, methodLabel } from '../lib/format'
import { loadActivity, deleteEntry, updateEntry, loadAudit,
         loadSalePayments, updateSaleWithPayments } from '../lib/data'
import { useToast } from '../components/Toast'

export default function Corrections({ boot }) {
  const { staff, allLocations, items, methods } = boot
  const toast = useToast()
  const isEditor = ['storekeeper', 'manager', 'gm', 'admin'].includes(staff.role)
  const canEdit = isEditor || staff.role === 'bar'
  const ownOnly = !isEditor
  const [rows, setRows] = useState(null)
  const [view, setView] = useState(canEdit ? 'entries' : 'history')
  const [audit, setAudit] = useState(null)
  const [edit, setEdit] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)

  const itemById = useMemo(() => Object.fromEntries(items.map(i => [i.id, i])), [items])
  const locById  = useMemo(() => Object.fromEntries(allLocations.map(l => [l.id, l])), [allLocations])

  const refresh = useCallback(() => {
    if (canEdit) {
      loadActivity(staff.branch_id, 14, ownOnly ? staff.id : null)
        .then(setRows).catch(e => toast(e.message, 'error'))
    }
    if (!ownOnly) loadAudit(staff.branch_id).then(setAudit).catch(() => setAudit([]))
  }, [staff.branch_id, canEdit, ownOnly, staff.id])
  useEffect(refresh, [refresh])

  function describe(r) {
    const name = itemById[r.stock_item_id]?.name || 'Unknown item'
    if (r.kind === 'sale') {
      return { title: name,
        detail: `Sale · ${tierLabel[r.tier] || r.tier} · ${locById[r.location_id]?.name || ''}`,
        money: naira(r.amount ?? r.qty * r.unit_price) }
    }
    const label = { restock: 'Received', transfer: 'Disbursed', damage: 'Damaged',
                    complimentary: 'PR / free', adjustment: 'Adjustment',
                    opening: 'Opening' }[r.movement_type] || r.movement_type
    const where = r.movement_type === 'transfer'
      ? `to ${locById[r.to_location]?.name || '—'}`
      : (locById[r.to_location]?.name || locById[r.from_location]?.name || 'store')
    return { title: name, detail: `${label} · ${where}`,
             money: r.unit_cost ? naira(r.qty * r.unit_cost) : '' }
  }

  async function openEdit(r) {
    const base = { row: r, qty: r.qty,
      price: r.kind === 'sale' ? r.unit_price : (r.unit_cost ?? ''), payments: null }
    if (r.kind === 'sale') {
      try {
        const pays = await loadSalePayments(r.id)
        // keep the split intact instead of collapsing it to one method
        base.payments = Object.fromEntries(
          methods.map(m => [m, String(pays.find(p => p.method === m)?.amount ?? '')]))
        base.wasSplit = pays.length > 1
      } catch (e) { toast(e.message, 'error') }
    }
    setEdit(base)
  }

  async function doDelete() {
    setBusy(true)
    try {
      await deleteEntry(confirm)
      toast('Entry deleted', 'success'); setConfirm(null); refresh()
    } catch (e) { toast('Not deleted: ' + e.message, 'error') }
    setBusy(false)
  }

  async function doSave() {
    setBusy(true)
    try {
      const qty = Number(edit.qty)
      const unitPrice = edit.price === '' ? null : Number(edit.price)
      if (edit.row.kind === 'sale') {
        const payments = methods.map(m => ({ method: m, amount: Number(edit.payments?.[m] || 0) }))
        const entered = payments.reduce((s, p) => s + p.amount, 0)
        if (Math.abs(entered - qty * unitPrice) > 0.01) {
          toast('Payments must add up to ' + naira(qty * unitPrice), 'error'); setBusy(false); return
        }
        await updateSaleWithPayments(edit.row.id, { qty, unitPrice, payments })
      } else {
        await updateEntry({ ...edit.row, branch_id: staff.branch_id }, { qty, unitPrice })
      }
      toast('Entry updated', 'success'); setEdit(null); refresh()
    } catch (e) { toast('Not updated: ' + e.message, 'error') }
    setBusy(false)
  }

  if (canEdit && !rows) return <p className="px-5 text-dim">Loading…</p>

  return (
    <div className="px-5">
      {canEdit && !ownOnly && <div className="flex gap-2 py-2">
        {[['entries', 'Entries'], ['history', 'Change history']].map(([k, label]) => (
          <button key={k} onClick={() => setView(k)}
            className={`flex-1 h-12 rounded-xl border font-bold ${view === k
              ? 'bg-amber text-bg border-amber' : 'border-line text-dim'}`}>
            {label}
          </button>
        ))}
      </div>}

      {!canEdit && (
        <p className="text-dim text-sm py-2">
          Every edit and deletion at this branch, newest first.
        </p>
      )}

      {view === 'history' ? (
        <ul className="divide-y divide-line/60">
          {(audit || []).map(a => (
            <li key={a.id} className="py-3">
              <div className="flex items-baseline gap-3">
                <span className={`text-sm font-bold ${a.action === 'deleted' ? 'text-clay' : 'text-amber'}`}>
                  {a.action === 'deleted' ? 'Deleted' : 'Edited'}
                </span>
                <span className="flex-1" />
                <span className="tnum text-dim text-sm">
                  {new Date(a.happened_at).toLocaleString('en-NG', { timeZone: 'Africa/Lagos',
                    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="mt-1">{a.summary}</p>
              <p className="text-dim text-sm mt-0.5">by {a.done_by_name || 'unknown'}</p>
            </li>
          ))}
          {audit && !audit.length && (
            <li className="py-8 text-center text-dim">Nothing has been changed or deleted yet.</li>
          )}
          {!audit && <li className="py-8 text-center text-dim">Loading…</li>}
        </ul>
      ) : (
      <>
      <p className="text-dim text-sm pb-2">
        {ownOnly
          ? 'Your own entries from today and yesterday. You can correct them here; ask a manager if something needs removing.'
          : 'Last 14 days. Deleting a sale also reverses its stock deduction.'}
      </p>
      <ul className="divide-y divide-line/60">
        {rows.map(r => {
          const d = describe(r)
          return (
            <li key={`${r.kind}:${r.id}`} className="py-3">
              <div className="flex items-baseline gap-3">
                <span className="flex-1 min-w-0 truncate font-semibold">{d.title}</span>
                <span className="tnum text-dim text-sm">{r.business_date?.slice(5)}</span>
              </div>
              <div className="flex items-center gap-3 mt-1">
                <span className="flex-1 text-dim text-sm truncate">{d.detail}</span>
                <span className="tnum">{r.qty}</span>
                {d.money && <span className="tnum text-dim">{d.money}</span>}
              </div>
              <div className="flex gap-2 mt-2">
                {(isEditor || r.recorded_by === staff.id) && (
                  <button onClick={() => openEdit(r)}
                    className="h-10 px-4 rounded-lg border border-line text-sm font-semibold">Edit</button>
                )}
                {isEditor && (
                  <button onClick={() => setConfirm(r)}
                    className="h-10 px-4 rounded-lg border border-clay text-clay text-sm font-semibold">Delete</button>
                )}
                {r.on_behalf_of && r.recorded_by !== staff.id && (
                  <span className="text-dim text-sm self-center">
                    Recorded on your behalf — ask a manager to correct it
                  </span>
                )}
              </div>
            </li>
          )
        })}
        {!rows.length && <li className="py-8 text-center text-dim">No entries in the last 14 days.</li>}
      </ul>
      </>
      )}

      {edit && (
        <Sheet onClose={() => setEdit(null)}>
          <h2 className="text-2xl font-bold">{describe(edit.row).title}</h2>
          <p className="text-dim mt-1">{describe(edit.row).detail}</p>
          <label className="block mt-6 text-dim">Quantity</label>
          <input type="number" inputMode="decimal" value={edit.qty}
            onChange={e => setEdit({ ...edit, qty: e.target.value })}
            className="mt-2 h-14 w-full px-4 rounded-xl bg-surface border border-line tnum" />
          <label className="block mt-4 text-dim">
            {edit.row.kind === 'sale' ? 'Unit price' : 'Unit cost (optional)'}
          </label>
          <input type="number" inputMode="decimal" value={edit.price}
            onChange={e => setEdit({ ...edit, price: e.target.value })}
            className="mt-2 h-14 w-full px-4 rounded-xl bg-surface border border-line tnum" />
          {edit.row.kind === 'sale' && edit.payments && (
            <div className="mt-5">
              <div className="text-dim mb-2">
                How it was paid{edit.wasSplit ? ' (split preserved)' : ''}
              </div>
              {methods.map(m => (
                <div key={m} className="flex items-center gap-3 mt-2">
                  <span className="w-20 text-dim">{methodLabel[m] || m}</span>
                  <input type="number" inputMode="decimal" placeholder="0"
                    value={edit.payments[m]}
                    onChange={e => setEdit(x => ({ ...x,
                      payments: { ...x.payments, [m]: e.target.value } }))}
                    className="h-12 flex-1 px-3 rounded-xl bg-surface border border-line tnum" />
                </div>
              ))}
              <p className="text-dim text-sm mt-2">
                Must total {naira(Number(edit.qty) * Number(edit.price || 0))}
              </p>
            </div>
          )}
          <button onClick={doSave} disabled={busy}
            className="mt-6 w-full h-14 rounded-2xl bg-amber text-bg text-lg font-bold disabled:opacity-40">
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </Sheet>
      )}

      {confirm && (
        <Sheet onClose={() => setConfirm(null)}>
          <h2 className="text-2xl font-bold">Delete this entry?</h2>
          <p className="text-dim mt-2">
            {describe(confirm).title} · {describe(confirm).detail} · {confirm.qty}
          </p>
          <p className="text-dim mt-3">This cannot be undone. Stock returns to what it was.</p>
          <button onClick={doDelete} disabled={busy}
            className="mt-6 w-full h-14 rounded-2xl bg-clay text-bg text-lg font-bold disabled:opacity-40">
            {busy ? 'Deleting…' : 'Delete'}
          </button>
          <button onClick={() => setConfirm(null)} className="mt-3 w-full h-12 text-dim">Cancel</button>
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
