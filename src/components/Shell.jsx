import { supabase } from '../lib/supabase'
import Logo from './Logo'
import PendingBanner from './PendingBanner'

const STOCK_ROLES = ['storekeeper', 'manager', 'gm', 'admin']

const MORE = ['credit', 'count', 'catalog', 'variance', 'fix']

export default function Shell({ staff, tab, onTab, children,
                                branches = [], viewBranch, onBranch }) {
  const auditorOnly = staff.role === 'auditor'
  const tabs = auditorOnly ? [] : [['sales', 'Sales']]
  if (STOCK_ROLES.includes(staff.role)) tabs.push(['store', 'Store'])
  tabs.push(['stock', 'Stock'])
  tabs.push(['more', 'More'])
  return (
    <div className="min-h-dvh pb-24">
      <header className="px-5 pt-5 pb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Logo className="w-5 h-5 shrink-0 text-amber" />
          <span className="font-bold text-lg shrink-0">Havilah</span>
          <span className="text-dim text-sm truncate">· {staff.full_name}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {branches.length > 1 && (
            <select value={viewBranch || ''} onChange={e => onBranch(e.target.value)}
              className="h-9 px-2 rounded-lg bg-surface border border-line text-sm">
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.slug.toUpperCase()}</option>
              ))}
            </select>
          )}
          <button onClick={() => supabase.auth.signOut()} className="text-dim text-sm">Sign out</button>
        </div>
      </header>
      <PendingBanner />
      {children}
      <nav className="fixed bottom-0 inset-x-0 bg-surface border-t border-line flex"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {tabs.map(([k, label]) => (
          <button key={k} onClick={() => onTab(k)}
            className={`flex-1 h-16 text-lg font-semibold ${tab === k || (k === 'more' && MORE.includes(tab)) ? 'text-amber' : 'text-dim'}`}>
            {label}
          </button>
        ))}
      </nav>
    </div>
  )
}
