import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { isMastered } from '../srs'
import { REVIEWABLE, SCENE_LABELS, sceneLabel } from '../types'
import type { CardRecord } from '../types'

function cardFront(c: CardRecord): string {
  return c.prompt ?? c.situation ?? c.title ?? ''
}

function cardBack(c: CardRecord): string {
  if (c.type === 'produce') return c.answer ?? ''
  if (c.type === 'pick') return c.options?.find(o => o.correct)?.text ?? ''
  if (c.type === 'register') return `软:${c.soft}\n中:${c.neutral}\n硬:${c.firm}`
  return ''
}

function statusChip(c: CardRecord) {
  if (!REVIEWABLE.includes(c.type)) return <span className="text-xs text-slate-300">阅读</span>
  if (isMastered(c)) return <span className="text-xs font-medium text-emerald-600">已掌握</span>
  if (c.state === 'new') return <span className="text-xs text-slate-400">新</span>
  return <span className="text-xs text-sky-600">复习中 · {Math.round(c.interval)}天</span>
}

export default function Deck() {
  const cards = useLiveQuery(() => db.cards.toArray())
  if (!cards) return <div className="p-8 text-center text-slate-300">载入中…</div>

  const scenes = Object.keys(SCENE_LABELS)
  const extraScenes = [...new Set(cards.map(c => c.scene))].filter(s => !scenes.includes(s))
  const allScenes = [...scenes, ...extraScenes].filter(s => cards.some(c => c.scene === s))

  return (
    <div className="mx-auto max-w-md px-5 pt-10">
      <h1 className="text-2xl font-bold">牌组</h1>
      <p className="mt-1 text-sm text-slate-400">按场景分组 · 掌握进度</p>
      <div className="mt-6 space-y-3">
        {allScenes.map(scene => {
          const group = cards.filter(c => c.scene === scene)
          const reviewable = group.filter(c => REVIEWABLE.includes(c.type))
          const mastered = reviewable.filter(isMastered).length
          const pct = reviewable.length ? Math.round((mastered / reviewable.length) * 100) : 0
          return (
            <details key={scene} className="group rounded-2xl border border-slate-200 bg-white shadow-sm">
              <summary className="cursor-pointer list-none p-4 [&::-webkit-details-marker]:hidden">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{sceneLabel(scene)}</span>
                  <span className="text-sm text-slate-400">
                    {reviewable.length > 0 ? `${mastered} / ${reviewable.length}` : `${group.length} 篇`}
                  </span>
                </div>
                {reviewable.length > 0 && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-emerald-400" style={{ width: `${pct}%` }} />
                  </div>
                )}
              </summary>
              <ul className="border-t border-slate-100 px-4 pb-3">
                {group.map(c => (
                  <li key={c.id} className="border-b border-slate-50 py-3 last:border-b-0">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm leading-relaxed text-slate-600">{cardFront(c)}</p>
                      {statusChip(c)}
                    </div>
                    {cardBack(c) && (
                      <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-indigo-900/70">
                        {cardBack(c)}
                      </p>
                    )}
                    <div className="mt-1 flex flex-wrap gap-x-3">
                      {c.usedAt != null && <p className="text-xs text-emerald-600">✓ 工作里用过</p>}
                      {c.flags.length > 0 && (
                        <p className="text-xs text-amber-500">🏷 {c.flags.join(' · ')}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          )
        })}
      </div>
      <div className="h-8" />
    </div>
  )
}
