import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getMeta } from '../db'
import { computeStreak, dayKey, isMastered } from '../srs'
import { REVIEWABLE } from '../types'

function JotModal({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('')
  const [saved, setSaved] = useState(false)
  const save = async () => {
    if (!text.trim()) return
    await db.inbox.add({ text: text.trim(), createdAt: Date.now() })
    setSaved(true)
    setTimeout(onClose, 600)
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onClose}>
      <div
        className="w-full rounded-t-2xl bg-white p-5 pb-8"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="font-bold">记一笔</h3>
        <p className="mt-1 text-xs text-slate-400">刚才哪里卡住了?用中文写下情境,以后转成卡片。</p>
        <textarea
          autoFocus
          value={text}
          onChange={e => setText(e.target.value)}
          rows={3}
          placeholder="例:想说这个数据我核对完了但有个地方对不上,不知道怎么说才不像指责别人"
          className="mt-3 w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-indigo-400 focus:outline-none"
        />
        <div className="mt-3 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-slate-500">
            取消
          </button>
          <button onClick={save} className="flex-1 rounded-xl bg-indigo-600 py-2.5 font-medium text-white">
            {saved ? '存好了 ✓' : '存下'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Home({ onStartSession }: { onStartSession: () => void }) {
  const [jotOpen, setJotOpen] = useState(false)

  const stats = useLiveQuery(async () => {
    const endOfToday = new Date()
    endOfToday.setHours(23, 59, 59, 999)
    const cards = await db.cards.toArray()
    const reviewable = cards.filter(c => REVIEWABLE.includes(c.type))
    const dueCount = reviewable.filter(c => c.due !== null && c.due <= endOfToday.getTime()).length
    const newCount = reviewable.filter(c => c.state === 'new').length
    const mastered = reviewable.filter(isMastered).length
    const checkins = await getMeta<string[]>('checkins', [])
    const { streak, makeupUsedThisWeek } = computeStreak(checkins)
    const todayDone = checkins.includes(dayKey(Date.now()))
    return { dueCount, newCount, mastered, streak, makeupUsedThisWeek, todayDone }
  })

  if (!stats) return <div className="p-8 text-center text-slate-300">载入中…</div>

  return (
    <div className="mx-auto max-w-md px-5 pt-10">
      <p className="text-sm text-slate-400">
        {new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}
      </p>
      <h1 className="mt-1 text-2xl font-bold">
        {stats.todayDone ? '今天已完成 ✓' : '来一组,两三分钟'}
      </h1>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-3xl font-bold text-indigo-600">{stats.mastered}</p>
          <p className="mt-1 text-xs text-slate-400">已掌握表达</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-3xl font-bold text-slate-700">
            {stats.streak}
            <span className="ml-1 text-base font-normal text-slate-400">天</span>
          </p>
          <p className="mt-1 text-xs text-slate-400">
            连续 · 本周补签{stats.makeupUsedThisWeek ? '已用' : '可用'}
          </p>
        </div>
      </div>

      <button
        onClick={onStartSession}
        className="mt-6 w-full rounded-2xl bg-indigo-600 py-4 text-lg font-medium text-white shadow-md shadow-indigo-200 active:scale-[0.99]"
      >
        {stats.todayDone ? '再来一组' : '开始今天的一组'}
      </button>
      <p className="mt-2 text-center text-xs text-slate-400">
        到期 {stats.dueCount} 张 · 还没见过的新卡 {stats.newCount} 张
      </p>

      <button
        onClick={() => setJotOpen(true)}
        className="mt-8 w-full rounded-2xl border-2 border-dashed border-slate-300 py-4 font-medium text-slate-500 active:bg-slate-100"
      >
        ✏️ 记一笔(刚才卡住了?)
      </button>

      {jotOpen && <JotModal onClose={() => setJotOpen(false)} />}
    </div>
  )
}
