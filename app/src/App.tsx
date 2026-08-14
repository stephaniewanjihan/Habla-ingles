import { useEffect, useState, type ReactNode } from 'react'
import { ensureSeeded } from './db'
import Home from './components/Home'
import Deck from './components/Deck'
import Review from './components/Review'
import Inbox from './components/Inbox'
import Session from './components/Session'

type Tab = 'home' | 'deck' | 'review' | 'inbox'

/** SF Symbols 风格的线性图标,统一 1.8 描边 */
const ICONS: Record<Tab, ReactNode> = {
  home: (
    <>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.4v2.2M12 19.4v2.2M2.4 12h2.2M19.4 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6" />
    </>
  ),
  deck: (
    <>
      <rect x="3" y="4.5" width="18" height="12.5" rx="2.6" />
      <path d="M6.5 20h11" />
    </>
  ),
  review: (
    <>
      <path d="M3.5 16l5-5.5 3.5 3.2 6-7.2" />
      <path d="M18 6.5h2.5V9" />
      <path d="M3.5 20.5h17" />
    </>
  ),
  inbox: (
    <>
      <path d="M16.8 3.8a2.1 2.1 0 013 3L8.5 18.1l-4 1 1-4z" />
      <path d="M14.6 6l3.4 3.4" />
    </>
  ),
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'home', label: '今天' },
  { key: 'deck', label: '牌组' },
  { key: 'review', label: '回顾' },
  { key: 'inbox', label: '收集箱' },
]

export default function App() {
  const [ready, setReady] = useState(false)
  const [tab, setTab] = useState<Tab>('home')
  const [session, setSession] = useState<'full' | 'one' | null>(null)

  useEffect(() => {
    ensureSeeded().then(() => setReady(true))
  }, [])

  if (!ready) {
    return <div className="flex min-h-screen items-center justify-center text-label3">载入中…</div>
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

      <nav
        className="fixed bottom-0 left-0 right-0 bg-bar backdrop-blur-xl"
        style={{ borderTop: '0.5px solid var(--sep)' }}
      >
        <div className="mx-auto flex max-w-md">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex flex-1 flex-col items-center gap-1 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] ${
                tab === t.key ? 'text-blue' : 'text-label3'
              }`}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {ICONS[t.key]}
              </svg>
              <span className="text-[10px]">{t.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}
