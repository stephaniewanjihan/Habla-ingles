import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getMeta, setMeta } from '../db'
import { computeStreak, dayKey, isMastered, latestMilestone, startOfWeek, DAY } from '../srs'
import { REVIEWABLE } from '../types'

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

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
      <div className="w-full rounded-t-2xl bg-white p-5 pb-8" onClick={e => e.stopPropagation()}>
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

function WeekDots({ checkins }: { checkins: string[] }) {
  const monday = startOfWeek()
  const todayKey = dayKey(Date.now())
  return (
    <div className="mt-5 flex justify-between px-1">
      {WEEKDAYS.map((label, i) => {
        const key = dayKey(monday + i * DAY)
        const done = checkins.includes(key)
        const isToday = key === todayKey
        const future = monday + i * DAY > Date.now() && !isToday
        return (
          <div key={label} className="flex flex-col items-center gap-1.5">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs ${
                done
                  ? 'bg-emerald-500 text-white'
                  : future
                    ? 'border border-slate-200 text-slate-300'
                    : 'border border-slate-300 text-slate-300'
              } ${isToday && !done ? 'ring-2 ring-indigo-300 ring-offset-1' : ''}`}
            >
              {done ? '✓' : ''}
            </div>
            <span className={`text-[10px] ${isToday ? 'text-indigo-500' : 'text-slate-300'}`}>{label}</span>
          </div>
        )
      })}
    </div>
  )
}

export default function Home({ onStartSession }: { onStartSession: (mode: 'full' | 'one') => void }) {
  const [jotOpen, setJotOpen] = useState(false)

  const stats = useLiveQuery(async () => {
    const endOfToday = new Date()
    endOfToday.setHours(23, 59, 59, 999)
    const cards = await db.cards.toArray()
    const reviewable = cards.filter(c => REVIEWABLE.includes(c.type))
    const dueCount = reviewable.filter(c => c.due !== null && c.due <= endOfToday.getTime()).length
    const newCount = reviewable.filter(c => c.state === 'new').length
    const mastered = reviewable.filter(isMastered).length
    const used = cards.filter(c => c.usedAt != null).length
    const checkins = await getMeta<string[]>('checkins', [])
    const { streak, makeupUsedThisWeek } = computeStreak(checkins)
    const todayDone = checkins.includes(dayKey(Date.now()))
    const seenMilestones = await getMeta<number[]>('milestonesSeen', [])
    const milestone = latestMilestone(mastered)
    const showMilestone = milestone !== null && !seenMilestones.includes(milestone) ? milestone : null
    return { dueCount, newCount, mastered, used, streak, makeupUsedThisWeek, todayDone, checkins, showMilestone }
  })

  if (!stats) return <div className="p-8 text-center text-slate-300">载入中…</div>

  const dismissMilestone = async () => {
    const seen = await getMeta<number[]>('milestonesSeen', [])
    await setMeta('milestonesSeen', [...seen, stats.showMilestone!])
  }

  return (
    <div className="mx-auto max-w-md px-5 pt-10">
      <p className="text-sm text-slate-400">
        {new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}
      </p>
      <h1 className="mt-1 text-2xl font-bold">{stats.todayDone ? '今天已完成 ✓' : '来一组,两三分钟'}</h1>

      {stats.showMilestone !== null && (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex-1">
            <p className="font-medium text-emerald-900">你已经掌握 {stats.showMilestone} 条表达了</p>
            <p className="mt-1 text-xs leading-relaxed text-emerald-700">
              这不是打开 app 的次数,是真的能在会上直接说出口的句子数。
            </p>
          </div>
          <button onClick={dismissMilestone} className="text-sm text-emerald-500">
            知道了
          </button>
        </div>
      )}

      <div className="mt-6 grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <p className="text-2xl font-bold text-indigo-600">{stats.mastered}</p>
          <p className="mt-1 text-[11px] leading-tight text-slate-400">已掌握表达</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <p className="text-2xl font-bold text-emerald-600">{stats.used}</p>
          <p className="mt-1 text-[11px] leading-tight text-slate-400">真实用过</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <p className="text-2xl font-bold text-slate-700">
            {stats.streak}
            <span className="ml-0.5 text-sm font-normal text-slate-400">天</span>
          </p>
          <p className="mt-1 text-[11px] leading-tight text-slate-400">
            连续 · 补签{stats.makeupUsedThisWeek ? '已用' : '可用'}
          </p>
        </div>
      </div>

      <WeekDots checkins={stats.checkins} />

      <button
        onClick={() => onStartSession('full')}
        className="mt-6 w-full rounded-2xl bg-indigo-600 py-4 text-lg font-medium text-white shadow-md shadow-indigo-200 active:scale-[0.99]"
      >
        {stats.todayDone ? '再来一组' : '开始今天的一组'}
      </button>
      <p className="mt-2 text-center text-xs text-slate-400">
        5 张 · 到期 {stats.dueCount} 张 · 新卡 {stats.newCount} 张
      </p>

      {!stats.todayDone && (
        <button
          onClick={() => onStartSession('one')}
          className="mt-3 w-full rounded-2xl border border-slate-200 bg-white py-3 text-sm font-medium text-slate-500"
        >
          今天只有一分钟?来一张就算数
        </button>
      )}

      <button
        onClick={() => setJotOpen(true)}
        className="mt-8 w-full rounded-2xl border-2 border-dashed border-slate-300 py-4 font-medium text-slate-500 active:bg-slate-100"
      >
        ✏️ 记一笔(刚才卡住了?)
      </button>

      {jotOpen && <JotModal onClose={() => setJotOpen(false)} />}
      <div className="h-8" />
    </div>
  )
}
