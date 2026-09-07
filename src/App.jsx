import { useEffect, useState, useCallback } from 'react'
import { supabase } from './lib/supabase'
import { loadBootstrap } from './lib/data'
import Login from './pages/Login'
import SalesEntry from './pages/SalesEntry'
import Stock from './pages/Stock'
import Store from './pages/Store'
import Shell from './components/Shell'

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = loading
  const [boot, setBoot] = useState(null)
  const [tab, setTab] = useState('sales')
  const [err, setErr] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const refresh = useCallback(() => {
    if (!session) { setBoot(null); return }
    loadBootstrap().then(setBoot).catch(e => setErr(e.message))
  }, [session])

  useEffect(refresh, [refresh])

  if (session === undefined) return <Center>Loading…</Center>
  if (!session) return <Login />
  if (err) return <Center>Couldn't load your profile. {err}</Center>
  if (!boot) return <Center>Loading…</Center>
  if (!boot.staff) return (
    <Center>
      <p className="max-w-xs text-center leading-relaxed">
        You're signed in, but this account isn't linked to a staff record yet.
        Ask a manager to link it, then reload.
      </p>
      <button onClick={() => supabase.auth.signOut()} className="mt-6 text-amber">Sign out</button>
    </Center>
  )

  return (
    <Shell staff={boot.staff} tab={tab} onTab={setTab}>
      {tab === 'sales' ? <SalesEntry boot={boot} />
        : tab === 'store' ? <Store boot={boot} />
        : <Stock boot={boot} />}
    </Shell>
  )
}

function Center({ children }) {
  return <div className="min-h-dvh flex flex-col items-center justify-center text-dim">{children}</div>
}
