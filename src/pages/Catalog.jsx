import { useMemo, useState } from 'react'
import { naira } from '../lib/format'
import { saveItemPrices, createItem } from '../lib/data'
import { useToast } from '../components/Toast'

export default function Catalog({ boot, onChanged }) {
  const { staff, items, tiers } = boot
  const toast = useToast()
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState(null)
  const [adding, setAdding] = useState(null)
  const [busy, setBusy] = useState(false)

  const list = useMemo(() => {
    const n = q.trim().toLowerCase()
    return items.filter(i => !n || i.name.toLowerCase().includes(n))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [items, q])

  async function save() {
    setBusy(true)
    try {
      const patch = {
        name: edit.name.trim(),
        selling_price: Number(edit.selling_price) || 0,
        lounge_price: edit.lounge_price === '' ? null : Number(edit.lounge_price),
        staff_price: edit.staff_price === '' ? null : Number(edit.staff_price),
        cost_price: edit.cost_price === '' ? null : Number(edit.cost_price),
        is_active: edit.is_active,
      }
      await saveItemPrices(edit.id, patch)
      toast('Saved', 'success'); setEdit(null); onChanged?.()
    } catch (e) { toast('Not saved: ' + e.message, 'error') }
    setBusy(false)
  }

  async function add() {
    setBusy(true)
    try {
      await createItem(staff.branch_id, {
        code: adding.code.trim(),
        name: adding.name.trim(),
        selling_price: Number(adding.selling_price) || 0,
        lounge_price: adding.lounge_price === '' ? null : Number(adding.lounge_price),
        cost_price: adding.cost_price === '' ? null : Number(adding.cost_price),
        is_active: true,
      })
      toast('Item added', 'success'); setAdding(null); onChanged?.()
    } catch (e) { toast('Not added: ' + e.message, 'error') }
    setBusy(false)
  }

  return (
    <div className="px-5">
      <div className="flex gap-2 py-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search items"
          className="flex-1 h-12 px-4 rounded-xl bg-surface border border-line placeholder:text-dim" />
        <button onClick={() => setAdding({ code: '', name: '', selling_price: '', lounge_price: '', cost_price: '' })}
          className="h-12 px-4 rounded-xl bg-amber text-bg font-bold">+ New</button>
      </div>

      <ul className="divide-y divide-line/60">
        {list.map(i => (
          <li key={i.id}>
            <button onClick={() => setEdit({ ...i,
              lounge_price: i.lounge_price ?? '', staff_price: i.staff_price ?? '',
              cost_price: i.cost_price ?? '' })}
              className="w-full text-left py-3 flex items-center gap-3">
              <span className="flex-1 min-w-0 truncate font-semibold">{i.name}</span>
              {i.cost_price != null && (
                <span className="text-dim text-sm tnum">cost {naira(i.cost_price)}</span>
              )}
              <span className="tnum">{naira(i.selling_price)}</span>
            </button>
          </li>
        ))}
        {!list.length && <li className="py-8 text-center text-dim">Nothing matches.</li>}
      </ul>

      {(edit || adding) && (
        <div className="fixed inset-0 z-50 bg-bg flex flex-col">
          <div className="p-5 flex-1 overflow-y-auto">
            <button onClick={() => { setEdit(null); setAdding(null) }} className="text-dim">Back</button>
            <h2 className="mt-3 text-2xl font-bold">{edit ? edit.name : 'New item'}</h2>

            {adding && (
              <Field label="Stock code">
                <input value={adding.code} onChange={e => setAdding(a => ({ ...a, code: e.target.value }))}
                  className="h-14 w-full px-4 rounded-xl bg-surface border border-line" />
              </Field>
            )}

            <Field label="Name">
              <input value={edit ? edit.name : adding.name}
                onChange={e => edit ? setEdit(x => ({ ...x, name: e.target.value }))
                                    : setAdding(a => ({ ...a, name: e.target.value }))}
                className="h-14 w-full px-4 rounded-xl bg-surface border border-line" />
            </Field>

            <Field label="Selling price">
              <Num value={edit ? edit.selling_price : adding.selling_price}
                onChange={v => edit ? setEdit(x => ({ ...x, selling_price: v }))
                                    : setAdding(a => ({ ...a, selling_price: v }))} />
            </Field>

            {tiers.includes('lounge') && (
              <Field label="Lounge price">
                <Num value={edit ? edit.lounge_price : adding.lounge_price}
                  onChange={v => edit ? setEdit(x => ({ ...x, lounge_price: v }))
                                      : setAdding(a => ({ ...a, lounge_price: v }))} />
              </Field>
            )}

            {edit && tiers.includes('staff') && (
              <Field label="Staff price (blank = uses selling price)">
                <Num value={edit.staff_price} onChange={v => setEdit(x => ({ ...x, staff_price: v }))} />
              </Field>
            )}

            <Field label="Cost price (what you pay for it)">
              <Num value={edit ? edit.cost_price : adding.cost_price}
                onChange={v => edit ? setEdit(x => ({ ...x, cost_price: v }))
                                    : setAdding(a => ({ ...a, cost_price: v }))} />
            </Field>

            {edit && (
              <label className="mt-6 flex items-center gap-3">
                <input type="checkbox" checked={edit.is_active} className="w-5 h-5"
                  onChange={e => setEdit(x => ({ ...x, is_active: e.target.checked }))} />
                <span>Active — appears when recording sales</span>
              </label>
            )}
          </div>
          <div className="p-5 border-t border-line">
            <button onClick={edit ? save : add} disabled={busy}
              className="w-full h-16 rounded-2xl bg-amber text-bg text-xl font-bold disabled:opacity-40">
              {busy ? 'Saving…' : edit ? 'Save changes' : 'Add item'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const Field = ({ label, children }) => (
  <div className="mt-5"><div className="text-dim mb-2">{label}</div>{children}</div>
)
const Num = ({ value, onChange }) => (
  <input type="number" inputMode="decimal" value={value}
    onChange={e => onChange(e.target.value)}
    className="h-14 w-full px-4 rounded-xl bg-surface border border-line tnum" />
)
