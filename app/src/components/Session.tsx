import { useEffect, useMemo, useRef, useState } from 'react'
import { db, getMeta, setMeta } from '../db'
import { rate, dayKey } from '../srs'
import { FLAGS, REVIEWABLE, sceneLabel } from '../types'
import type { CardRecord, Flag, Rating } from '../types'

const ROUND_REVIEW_SLOTS = 4
const TIME_LIMIT_MS = 5 * 60 * 1000

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** 一组 5 张:到期复习 3 + 新卡 1 + note/listen 1,不足互补 */
export async function buildRound(): Promise<CardRecord[]> {
  const endOfToday = new Date()
  endOfToday.setHours(23, 59, 59, 999)
  const due = (await db.cards.where('due').belowOrEqual(endOfToday.getTime()).toArray())
    .filter(c => REVIEWABLE.includes(c.type))
    .sort((a, b) => (a.due ?? 0) - (b.due ?? 0))
  const news = shuffle(
    (await db.cards.where('state').equals('new').toArray()).filter(c =>
      REVIEWABLE.includes(c.type),
    ),
  )
  const extras = (await db.cards.toArray())
    .filter(c => c.type === 'note' || c.type === 'listen')
    .sort((a, b) => (a.lastSeen ?? 0) - (b.lastSeen ?? 0))

  const queue: CardRecord[] = due.slice(0, 3)
  while (queue.length < ROUND_REVIEW_SLOTS && news.length) queue.push(news.shift()!)
  let di = 3
  while (queue.length < ROUND_REVIEW_SLOTS && di < due.length) queue.push(due[di++])
  if (extras.length) queue.splice(Math.min(2, queue.length), 0, extras[0])
  return queue
}

function cardMainText(c: CardRecord): string {
  if (c.type === 'produce') return c.answer ?? ''
  if (c.type === 'pick') return c.options?.find(o => o.correct)?.text ?? ''
  if (c.type === 'register') return c.neutral ?? ''
  return c.title ?? ''
}

function FlagChips({ card }: { card: CardRecord }) {
  const [flags, setFlags] = useState<Flag[]>(card.flags ?? [])
  useEffect(() => setFlags(card.flags ?? []), [card.id])
  const toggle = async (f: Flag) => {
    const next = flags.includes(f) ? flags.filter(x => x !== f) : [...flags, f]
    setFlags(next)
    await db.cards.update(card.id, { flags: next })
  }
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {FLAGS.map(f => (
        <button
          key={f}
          onClick={() => toggle(f)}
          className={`rounded-full border px-3 py-1 text-xs ${
            flags.includes(f)
              ? 'border-amber-400 bg-amber-100 text-amber-800'
              : 'border-slate-200 bg-white text-slate-400'
          }`}
        >
          {f}
        </button>
      ))}
    </div>
  )
}

function SceneChip({ scene }: { scene: string }) {
  return (
    <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-600">
      {sceneLabel(scene)}
    </span>
  )
}

const RATING_BUTTONS: { rating: Rating; label: string; cls: string }[] = [
  { rating: 'again', label: '没想起来', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  { rating: 'unsure', label: '想起来了但不确定', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  { rating: 'good', label: '顺', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
]

export default function Session({ onExit }: { onExit: () => void }) {
  const [queue, setQueue] = useState<CardRecord[] | null>(null)
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [pickChoice, setPickChoice] = useState<number | null>(null)
  const [finished, setFinished] = useState(false)
  const [cutShort, setCutShort] = useState(false)
  const ratingsRef = useRef<Map<string, Rating>>(new Map())
  const repeatedRef = useRef<Set<string>>(new Set())
  const startRef = useRef(Date.now())

  useEffect(() => {
    buildRound().then(q => {
      if (q.length === 0) {
        setFinished(true)
        setQueue([])
      } else {
        setQueue(q)
      }
    })
  }, [])

  const card = queue && index < queue.length ? queue[index] : null

  const pickOrder = useMemo(() => {
    if (!card || card.type !== 'pick' || !card.options) return []
    return shuffle(card.options.map((_, i) => i))
  }, [card?.id, index])

  const finishRound = async () => {
    const checkins = await getMeta<string[]>('checkins', [])
    const today = dayKey(Date.now())
    if (!checkins.includes(today)) await setMeta('checkins', [...checkins, today])
    setFinished(true)
  }

  const advance = (nextQueue?: CardRecord[]) => {
    const q = nextQueue ?? queue!
    setRevealed(false)
    setPickChoice(null)
    if (Date.now() - startRef.current > TIME_LIMIT_MS && index + 1 < q.length) {
      setCutShort(true)
      void finishRound()
      return
    }
    if (index + 1 >= q.length) {
      void finishRound()
    } else {
      setIndex(index + 1)
    }
  }

  const onRate = async (r: Rating) => {
    if (!card) return
    const fresh = (await db.cards.get(card.id))!
    await db.cards.put(rate(fresh, r))
    ratingsRef.current.set(card.id, r)
    let nextQueue = queue!
    if (r === 'again' && !repeatedRef.current.has(card.id)) {
      repeatedRef.current.add(card.id)
      nextQueue = [...queue!, card]
      setQueue(nextQueue)
    }
    advance(nextQueue)
  }

  const onExtraDone = async () => {
    if (!card) return
    await db.cards.update(card.id, { lastSeen: Date.now() })
    advance()
  }

  if (!queue) {
    return <div className="flex min-h-screen items-center justify-center text-slate-400">载入中…</div>
  }

  if (finished) {
    const seen = queue.filter(c => REVIEWABLE.includes(c.type))
    const uniq = [...new Map(seen.map(c => [c.id, c])).values()]
    const good = uniq.filter(c => ratingsRef.current.get(c.id) === 'good')
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-8">
        <h2 className="text-xl font-bold">这组练完了</h2>
        {cutShort && <p className="mt-1 text-sm text-slate-400">五分钟到了,先收尾——剩下的卡还在队列里。</p>}
        <p className="mt-4 text-sm text-slate-500">
          {good.length > 0 ? '这几条,你现在能直接说出口:' : '这组还没有"顺"的卡——正常,多见几次就有了。'}
        </p>
        <ul className="mt-3 space-y-3">
          {good.map(c => (
            <li key={c.id} className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="font-medium text-emerald-900">{cardMainText(c)}</p>
              <p className="mt-1 text-xs text-emerald-600">{sceneLabel(c.scene)}</p>
            </li>
          ))}
        </ul>
        <div className="mt-auto space-y-3 pt-8">
          <button
            onClick={() => {
              setQueue(null)
              setIndex(0)
              setFinished(false)
              setCutShort(false)
              ratingsRef.current = new Map()
              repeatedRef.current = new Set()
              startRef.current = Date.now()
              buildRound().then(q => {
                if (q.length === 0) {
                  setFinished(true)
                  setQueue([])
                } else setQueue(q)
              })
            }}
            className="w-full rounded-xl border border-indigo-200 bg-indigo-50 py-3 font-medium text-indigo-700"
          >
            再来一组?
          </button>
          <button onClick={onExit} className="w-full rounded-xl bg-indigo-600 py-3 font-medium text-white">
            今天就到这
          </button>
        </div>
      </div>
    )
  }

  if (!card) return null

  const progress = `${Math.min(index + 1, queue.length)} / ${queue.length}`

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-6">
      <div className="flex items-center justify-between text-sm text-slate-400">
        <button onClick={onExit} className="text-slate-400">
          ✕ 退出
        </button>
        <span>{progress}</span>
      </div>

      <div className="mt-6 flex-1">
        <SceneChip scene={card.scene} />

        {card.type === 'produce' && (
          <div className="mt-4">
            <p className="text-lg leading-relaxed">{card.prompt}</p>
            {!revealed ? (
              <p className="mt-6 text-sm text-slate-400">心里(或小声)把英文说出来,再翻面对答案。</p>
            ) : (
              <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-lg font-medium leading-relaxed text-indigo-900">{card.answer}</p>
                <p className="mt-3 border-t border-slate-100 pt-3 text-sm leading-relaxed text-slate-500">{card.note}</p>
                <FlagChips card={card} />
              </div>
            )}
          </div>
        )}

        {card.type === 'pick' && (
          <div className="mt-4">
            <p className="text-lg leading-relaxed">{card.prompt}</p>
            <div className="mt-5 space-y-3">
              {pickOrder.map(i => {
                const opt = card.options![i]
                const chosen = pickChoice === i
                let cls = 'border-slate-200 bg-white'
                if (revealed) {
                  if (opt.correct) cls = 'border-emerald-300 bg-emerald-50'
                  else if (chosen) cls = 'border-rose-300 bg-rose-50'
                  else cls = 'border-slate-200 bg-white opacity-60'
                }
                return (
                  <button
                    key={i}
                    disabled={revealed}
                    onClick={() => {
                      setPickChoice(i)
                      setRevealed(true)
                    }}
                    className={`w-full rounded-xl border p-4 text-left leading-relaxed shadow-sm ${cls}`}
                  >
                    {opt.text}
                    {revealed && opt.correct && <span className="ml-2">✅</span>}
                    {revealed && chosen && !opt.correct && <span className="ml-2">❌</span>}
                  </button>
                )
              })}
            </div>
            {revealed && (
              <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-sm leading-relaxed text-slate-500">{card.note}</p>
                <FlagChips card={card} />
              </div>
            )}
          </div>
        )}

        {card.type === 'register' && (
          <div className="mt-4">
            <p className="text-lg leading-relaxed">{card.situation}</p>
            {!revealed ? (
              <p className="mt-6 text-sm text-slate-400">先想:这个场合你会用哪一档?那句话怎么说?</p>
            ) : (
              <div className="mt-6 space-y-3">
                {([
                  ['soft', '软', 'text-sky-700 bg-sky-50 border-sky-200'],
                  ['neutral', '中性', 'text-indigo-700 bg-indigo-50 border-indigo-200'],
                  ['firm', '硬', 'text-rose-700 bg-rose-50 border-rose-200'],
                ] as const).map(([key, label, cls]) => (
                  <div key={key} className={`rounded-xl border p-4 ${cls}`}>
                    <span className="text-xs font-bold">{label}</span>
                    <p className="mt-1 leading-relaxed">{card[key]}</p>
                  </div>
                ))}
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-sm leading-relaxed text-slate-500">{card.note}</p>
                  <FlagChips card={card} />
                </div>
              </div>
            )}
          </div>
        )}

        {card.type === 'note' && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold">{card.title}</h3>
            <p className="mt-3 leading-relaxed text-slate-600">{card.body}</p>
          </div>
        )}

        {card.type === 'listen' && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold">{card.title}</h3>
            <p className="mt-1 text-sm text-slate-400">{card.source}</p>
            <p className="mt-3 leading-relaxed text-slate-600">{card.task}</p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate-500">
              {card.questions?.map((q, i) => <li key={i}>{q}</li>)}
            </ul>
            {card.url && (
              <a
                href={card.url}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
              >
                打开节目 ↗
              </a>
            )}
          </div>
        )}
      </div>

      <div className="pt-6">
        {REVIEWABLE.includes(card.type) ? (
          !revealed && card.type !== 'pick' ? (
            <button
              onClick={() => setRevealed(true)}
              className="w-full rounded-xl bg-indigo-600 py-3.5 font-medium text-white"
            >
              翻面
            </button>
          ) : revealed ? (
            <div className="grid grid-cols-3 gap-2">
              {RATING_BUTTONS.map(({ rating, label, cls }) => (
                <button
                  key={rating}
                  onClick={() => onRate(rating)}
                  className={`rounded-xl border py-3 text-sm font-medium leading-tight ${cls}`}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-center text-sm text-slate-300">选一个你觉得自然的说法</p>
          )
        ) : (
          <button onClick={onExtraDone} className="w-full rounded-xl bg-indigo-600 py-3.5 font-medium text-white">
            {card.type === 'note' ? '读完了' : '继续'}
          </button>
        )}
      </div>
    </div>
  )
}
