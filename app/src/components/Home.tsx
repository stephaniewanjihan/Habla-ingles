import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getMeta, setMeta } from '../db'
import { computeStreak, dayKey, isMastered, latestMilestone, startOfWeek, DAY } from '../srs'
import { REVIEWABLE } from '../types'

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

function JotSheet({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('')
  const [saved, setSaved] = useState(false)
  const save = async () => {
    if (!text.trim()) return
    await db.inbox.add({ text: text.trim(), createdAt: Date.now() })
    setSaved(true)
    setTimeout(onClose, 600)
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/30 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="w-full rounded-t-[20px] bg-bg px-4 pt-3 pb-9"
        onClick={e => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-label3" />
        <h3 className="title-md">记一笔</h3>
        <p className="mt-1 text-[13px] text-label2">刚才哪里卡住了?用中文写下情境。</p>
        <textarea
          autoFocus
          value={text}
          onChange={e => setText(e.target.value)}
          rows={3}
          placeholder="例:想说这个数据我核对完了但有个地方对不上,不知道怎么说才不像指责别人"
          className="mt-3 w-full rounded-[12px] bg-card p-3.5 text-[16px] leading-relaxed text-label placeholder:text-label3 focus:outline-none"
        />
        <div className="mt-3 flex gap-2.5">
          <button onClick={onClose} className="flex-1 rounded-[12px] bg-fill py-3 text-[17px] text-label">
            取消
          </button>
          <button onClick={save} className="flex-1 rounded-[12px] bg-blue py-3 text-[17px] font-medium text-white">
            {saved ? '已存下' : '存下'}
          </button>
        </div>
      </div>
    </div>
  )
}

function WeekStrip({ checkins }: { checkins: string[] }) {
  const monday = startOfWeek()
  const todayKey = dayKey(Date.now())
  return (
    <div className="group-card mt-4 px-3 py-3.5">
      <div className="flex justify-between">
        {WEEKDAYS.map((label, i) => {
          const key = dayKey(monday + i * DAY)
          const done = checkins.includes(key)
          const isToday = key === todayKey
          return (
            <div key={label} className="flex flex-col items-center gap-2">
              <span className={`text-[11px] ${isToday ? 'text-blue' : 'text-label3'}`}>{label}</span>
              <div
                className={`flex h-[30px] w-[30px] items-center justify-center rounded-full text-[13px] font-medium ${
                  done ? 'bg-green text-white' : 'bg-fill/70 text-transparent'
                } ${isToday && !done ? 'ring-[1.5px] ring-blue' : ''}`}
              >
                ✓
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Stat({ value, label, tone }: { value: number; label: string; tone?: 'blue' | 'green' }) {
  const color = tone === 'blue' ? 'text-blue' : tone === 'green' ? 'text-green' : 'text-label'
  return (
    <div className="flex-1 px-1 py-3.5 text-center">
      <p className={`text-[26px] font-semibold tabular-nums ${color}`} style={{ letterSpacing: '-0.4px' }}>
        {value}
      </p>
      <p className="mt-0.5 text-[11px] text-label2">{label}</p>
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
    const checkins = await getMeta<string[]>('checkins', [])
    const weekStart = startOfWeek()
    const weekDays = checkins.filter(d => new Date(d + 'T12:00:00').getTime() >= weekStart).length
    const { streak, makeupUsedThisWeek } = computeStreak(checkins)
    const todayDone = checkins.includes(dayKey(Date.now()))
    const seenMilestones = await getMeta<number[]>('milestonesSeen', [])
    const milestone = latestMilestone(mastered)
    const showMilestone = milestone !== null && !seenMilestones.includes(milestone) ? milestone : null
    return { dueCount, newCount, mastered, weekDays, streak, makeupUsedThisWeek, todayDone, checkins, showMilestone }
  })

  if (!stats) return <div className="pt-24 text-center text-label3">载入中…</div>

  const dismissMilestone = async () => {
    const seen = await getMeta<number[]>('milestonesSeen', [])
    await setMeta('milestonesSeen', [...seen, stats.showMilestone!])
  }

  return (
    <div className="mx-auto max-w-md px-4 pt-12">
      <p className="text-[13px] font-medium text-label2">
        {new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}
      </p>
      <h1 className="title-lg mt-0.5">{stats.todayDone ? '今天已完成' : '来一组'}</h1>

      {stats.showMilestone !== null && (
        <div className="group-card mt-4 flex items-start gap-3 p-4">
          <div className="flex-1">
            <p className="text-[15px] font-semibold text-green">你已经掌握 {stats.showMilestone} 条表达</p>
            <p className="mt-1 text-[13px] leading-relaxed text-label2">
              这不是打开 app 的次数,是真的能在会上直接说出口的句子数。
            </p>
          </div>
          <button onClick={dismissMilestone} className="text-[15px] text-blue">
            好
          </button>
        </div>
      )}

      <div className="group-card mt-5 flex divide-x" style={{ borderColor: 'var(--sep)' }}>
        <Stat value={stats.mastered} label="已掌握表达" tone="blue" />
        <Stat value={stats.weekDays} label="本周练习天" tone="green" />
        <Stat value={stats.streak} label="连续天数" />
      </div>

      <WeekStrip checkins={stats.checkins} />
      <p className="mt-2 px-1 text-[12px] text-label3">
        本周补签{stats.makeupUsedThisWeek ? '已用掉' : '还没用'} · 缺一天不断连续
      </p>

      <button
        onClick={() => onStartSession('full')}
        className="mt-6 w-full rounded-[14px] bg-blue py-4 text-[17px] font-semibold text-white active:opacity-80"
      >
        {stats.todayDone ? '再来一组' : '开始今天的一组'}
      </button>
      <p className="mt-2 text-center text-[13px] text-label2">
        5 张 · 到期 {stats.dueCount} 张 · 新卡 {stats.newCount} 张
      </p>

      {!stats.todayDone && (
        <button
          onClick={() => onStartSession('one')}
          className="mt-3 w-full rounded-[14px] bg-fill py-3.5 text-[15px] text-label active:opacity-70"
        >
          今天只有一分钟?来一张就算数
        </button>
      )}

      <button
        onClick={() => setJotOpen(true)}
        className="group-card mt-8 flex w-full items-center gap-3 p-4 text-left active:opacity-70"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-soft text-blue">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </span>
        <span className="flex-1">
          <span className="block text-[16px] text-label">记一笔</span>
          <span className="block text-[13px] text-label2">刚才卡住了?三秒记下来</span>
        </span>
        <svg width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="var(--label3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 1l6 6-6 6" />
        </svg>
      </button>

      {jotOpen && <JotSheet onClose={() => setJotOpen(false)} />}
      <div className="h-8" />
    </div>
  )
}
