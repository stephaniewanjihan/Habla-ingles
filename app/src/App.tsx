import { useEffect, useState } from 'react'
import { ensureSeeded } from './db'
import Home from './components/Home'
import Deck from './components/Deck'
import Review from './components/Review'
import Inbox from './components/Inbox'
import Session from './components/Session'

type Tab = 'home' | 'deck' | 'review' | 'inbox'

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'home', label: '今天', icon: '☀️' },
  { key: 'deck', label: '牌组', icon: '🗂' },
  { key: 'review', label: '回顾', icon: '📈' },
  { key: 'inbox', label: '收集箱', icon: '✏️' },
]

export default function App() {
  const [ready, setReady] = useState(false)
  const [tab, setTab] = useState<Tab>('home')
  const [session, setSession] = useState<'full' | 'one' | null>(null)

  useEffect(() => {
    ensureSeeded().then(() => setReady(true))
  }, [])

  if (!ready) {
    return <div className="flex min-h-screen items-center justify-center text-slate-300">载入中…</div>
  }

  if (session) {
    return <Session mode={session} onExit={() => setSession(null)} />
  }

  return (
    <div className="min-h-screen pb-24">
      {tab === 'home' && <Home onStartSession={m => setSession(m)} />}
      {tab === 'deck' && <Deck />}
      {tab === 'review' && <Review />}
      {tab === 'inbox' && <Inbox />}

      <nav className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-md">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] text-xs ${
                tab === t.key ? 'font-medium text-indigo-600' : 'text-slate-400'
              }`}
            >
              <span className="text-lg leading-none">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}
