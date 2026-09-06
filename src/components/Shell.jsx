import { supabase } from '../lib/supabase'

export default function Shell({ staff, tab, onTab, children }) {
  return (
    <div className="min-h-dvh pb-24">
      <header className="px-5 pt-5 pb-3 flex items-baseline justify-between">
        <div>
          <span className="font-bold text-lg">Havilah</span>
          <span className="text-dim text-lg"> · {staff.full_name.split(' ')[0]}</span>
        </div>
        <button onClick={() => supabase.auth.signOut()} className="text-dim text-sm">Sign out</button>
      </header>
      {children}
      <nav className="fixed bottom-0 inset-x-0 bg-surface border-t border-line flex"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {[['sales', 'Sales'], ['stock', 'Stock']].map(([k, label]) => (
          <button key={k} onClick={() => onTab(k)}
            className={`flex-1 h-16 text-lg font-semibold ${tab === k ? 'text-amber' : 'text-dim'}`}>
            {label}
          </button>
        ))}
      </nav>
    </div>
  )
}
