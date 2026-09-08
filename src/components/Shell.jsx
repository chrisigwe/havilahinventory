import { supabase } from '../lib/supabase'
import Logo from './Logo'

const STOCK_ROLES = ['storekeeper', 'manager', 'gm', 'admin']
const FIX_ROLES = ['storekeeper', 'manager', 'gm', 'admin']

export default function Shell({ staff, tab, onTab, children }) {
  const tabs = [['sales', 'Sales']]
  if (STOCK_ROLES.includes(staff.role)) tabs.push(['store', 'Store'])
  tabs.push(['stock', 'Stock'])
  if (FIX_ROLES.includes(staff.role)) tabs.push(['fix', 'Fix'])
  return (
    <div className="min-h-dvh pb-24">
      <header className="px-5 pt-5 pb-3 flex items-baseline justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Logo className="w-5 h-5 shrink-0 text-amber" />
          <span className="font-bold text-lg shrink-0">Havilah</span>
          <span className="text-dim text-lg truncate">· {staff.full_name}</span>
        </div>
        <button onClick={() => supabase.auth.signOut()} className="text-dim text-sm">Sign out</button>
      </header>
      {children}
      <nav className="fixed bottom-0 inset-x-0 bg-surface border-t border-line flex"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {tabs.map(([k, label]) => (
          <button key={k} onClick={() => onTab(k)}
            className={`flex-1 h-16 text-lg font-semibold ${tab === k ? 'text-amber' : 'text-dim'}`}>
            {label}
          </button>
        ))}
      </nav>
    </div>
  )
}
