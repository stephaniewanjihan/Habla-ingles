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
  if (!REVIEWABLE.includes(c.type)) return <span className="shrink-0 text-[12px] text-label3">阅读</span>
  if (isMastered(c)) return <span className="shrink-0 text-[12px] font-medium text-green">已掌握</span>
  if (c.state === 'new') return <span className="shrink-0 text-[12px] text-label3">新</span>
  return <span className="shrink-0 text-[12px] text-blue">{Math.round(c.interval)}天后</span>
}

export default function Deck() {
  const cards = useLiveQuery(() => db.cards.toArray())
  if (!cards) return <div className="pt-24 text-center text-label3">载入中…</div>

  const scenes = Object.keys(SCENE_LABELS)
  const extraScenes = [...new Set(cards.map(c => c.scene))].filter(s => !scenes.includes(s))
  const allScenes = [...scenes, ...extraScenes].filter(s => cards.some(c => c.scene === s))

  return (
    <div className="mx-auto max-w-md px-4 pt-12">
      <h1 className="title-lg">牌组</h1>
      <p className="mt-1 text-[15px] text-label2">按场景分组 · 掌握进度</p>
      <div className="mt-5 space-y-3">
        {allScenes.map(scene => {
          const group = cards.filter(c => c.scene === scene)
          const reviewable = group.filter(c => REVIEWABLE.includes(c.type))
          const mastered = reviewable.filter(isMastered).length
          const pct = reviewable.length ? Math.round((mastered / reviewable.length) * 100) : 0
          return (
            <details key={scene} className="group-card">
              <summary className="cursor-pointer list-none p-4 [&::-webkit-details-marker]:hidden">
                <div className="flex items-center justify-between">
                  <span className="text-[17px]">{sceneLabel(scene)}</span>
                  <span className="text-[15px] text-label2">
                    {reviewable.length > 0 ? `${mastered} / ${reviewable.length}` : `${group.length} 篇`}
                  </span>
                </div>
                {reviewable.length > 0 && (
                  <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-fill">
                    <div className="h-full rounded-full bg-green" style={{ width: `${pct}%` }} />
                  </div>
                )}
              </summary>
              <ul className="px-4 pb-3" style={{ borderTop: '0.5px solid var(--sep)' }}>
                {group.map(c => (
                  <li key={c.id} className="row-sep py-3 last:border-b-0">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[15px] leading-relaxed text-label">{cardFront(c)}</p>
                      {statusChip(c)}
                    </div>
                    {cardBack(c) && (
                      <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed text-blue">
                        {cardBack(c)}
                      </p>
                    )}
                    <div className="mt-1 flex flex-wrap gap-x-3">
                      {c.flags.length > 0 && (
                        <p className="text-[12px] text-orange">{c.flags.join(' · ')}</p>
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
