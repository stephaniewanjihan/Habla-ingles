import { useLiveQuery } from 'dexie-react-hooks'
import { db, getMeta } from '../db'
import { computeStreak, isMastered, startOfWeek } from '../srs'
import { REVIEWABLE, sceneLabel } from '../types'
import type { CardRecord } from '../types'

function mainText(c: CardRecord): string {
  if (c.type === 'produce') return c.answer ?? ''
  if (c.type === 'pick') return c.options?.find(o => o.correct)?.text ?? ''
  if (c.type === 'register') return c.neutral ?? ''
  return c.title ?? ''
}

export default function Review() {
  const data = useLiveQuery(async () => {
    const cards = await db.cards.toArray()
    const reviewable = cards.filter(c => REVIEWABLE.includes(c.type))
    const mastered = reviewable.filter(isMastered)
    const weekStart = startOfWeek()
    const newThisWeek = reviewable
      .filter(c => c.masteredAt !== null && c.masteredAt >= weekStart)
      .sort((a, b) => (b.masteredAt ?? 0) - (a.masteredAt ?? 0))
    const checkins = await getMeta<string[]>('checkins', [])
    const weekCheckins = checkins.filter(d => new Date(d + 'T12:00:00').getTime() >= weekStart).length
    const { streak } = computeStreak(checkins)
    return { masteredCount: mastered.length, newThisWeek, streak, weekCheckins }
  })

  if (!data) return <div className="p-8 text-center text-slate-300">载入中…</div>

  return (
    <div className="mx-auto max-w-md px-5 pt-10">
      <h1 className="text-2xl font-bold">每周回顾</h1>
      <p className="mt-1 text-sm text-slate-400">
        本周练了 {data.weekCheckins} 天 · 连续 {data.streak} 天 · 共掌握 {data.masteredCount} 条
      </p>

      <div className="mt-6">
        {data.newThisWeek.length > 0 ? (
          <>
            <p className="text-sm text-slate-500">
              这周新掌握 {data.newThisWeek.length} 条。两周前,这些你可能还得查翻译——现在能张口就来:
            </p>
            <ul className="mt-3 space-y-3">
              {data.newThisWeek.map(c => (
                <li key={c.id} className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="whitespace-pre-line font-medium leading-relaxed text-emerald-900">{mainText(c)}</p>
                  <p className="mt-1 text-xs text-emerald-600">{sceneLabel(c.scene)}</p>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <p className="text-slate-500">这周还没有新掌握的表达。</p>
            <p className="mt-2 text-sm text-slate-400">
              一张卡的复习间隔拉到 21 天以上才算"掌握"——刚开始的两三周这里空着是正常的,先把每天一组坚持住。
            </p>
          </div>
        )}
      </div>
      <div className="h-8" />
    </div>
  )
}
