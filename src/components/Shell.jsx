import { supabase } from '../lib/supabase'
import Logo from './Logo'

const STOCK_ROLES = ['storekeeper', 'manager', 'gm', 'admin']
const FIX_ROLES = ['storekeeper', 'manager', 'gm', 'admin']
const CREDIT_ROLES = ['bar', 'storekeeper', 'manager', 'gm', 'admin']
const COUNT_ROLES = ['storekeeper', 'manager', 'gm', 'admin', 'auditor']

export default function Shell({ staff, tab, onTab, children }) {
  const auditorOnly = staff.role === 'auditor'
  const tabs = auditorOnly ? [] : [['sales', 'Sales']]
  if (STOCK_ROLES.includes(staff.role)) tabs.push(['store', 'Store'])
  tabs.push(['stock', 'Stock'])
  if (CREDIT_ROLES.includes(staff.role)) tabs.push(['credit', 'Credit'])
  if (COUNT_ROLES.includes(staff.role)) tabs.push(['count', 'Count'])
  if (FIX_ROLES.includes(staff.role)) tabs.push(['fix', 'Fix'])
  return (
    <div className="min-h-dvh pb-24">
      <header className="px-5 pt-5 pb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Logo className="w-5 h-5 shrink-0 text-amber" />
          <span className="font-bold text-lg shrink-0">Havilah</span>
          <span className="text-dim text-sm truncate">· {staff.full_name}</span>
        </div>
        <button onClick={() => supabase.auth.signOut()} className="text-dim text-sm shrink-0">Sign out</button>
      </header>
      {children}
      <nav className="fixed bottom-0 inset-x-0 bg-surface border-t border-line flex overflow-x-auto"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {tabs.map(([k, label]) => (
          <button key={k} onClick={() => onTab(k)}
            className={`flex-1 min-w-[5rem] h-16 text-base font-semibold ${tab === k ? 'text-amber' : 'text-dim'}`}>
            {label}
          </button>
        ))}
      </nav>
    </div>
  )
}
