import { useEffect, useMemo, useRef, useState } from 'react'
import { db, getMeta, setMeta } from '../db'
import { rate, dayKey, viewFor } from '../srs'
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

/**
 * 一组 5 张:到期复习 3 + 新卡 1 + note/listen 1,不足互补。
 * mode='one' 时只出 1 张(最急的到期卡,没有就出新卡)——
 * 给"只有一分钟"的日子用,照样算打卡。
 */
export async function buildRound(mode: 'full' | 'one' = 'full'): Promise<CardRecord[]> {
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

  if (mode === 'one') {
    const one = due[0] ?? news[0]
    return one ? [one] : []
  }

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

function CardFooter({ card }: { card: CardRecord }) {
  const [flags, setFlags] = useState<Flag[]>(card.flags ?? [])
  const [used, setUsed] = useState<boolean>(card.usedAt != null)
  useEffect(() => {
    setFlags(card.flags ?? [])
    setUsed(card.usedAt != null)
  }, [card.id])

  const toggleFlag = async (f: Flag) => {
    const next = flags.includes(f) ? flags.filter(x => x !== f) : [...flags, f]
    setFlags(next)
    await db.cards.update(card.id, { flags: next })
  }
  const toggleUsed = async () => {
    const next = !used
    setUsed(next)
    await db.cards.update(card.id, { usedAt: next ? Date.now() : null })
  }

  return (
    <>
      <button
        onClick={toggleUsed}
        className={`mt-4 w-full rounded-[10px] py-2.5 text-[14px] font-medium ${
          used
            ? 'bg-green-soft text-green'
            : 'bg-fill text-label2'
        }`}
      >
        {used ? '✓ 这句我用上了' : '这句我用上了(邮件 / 会上)'}
      </button>
      <div className="mt-3 flex flex-wrap gap-2">
        {FLAGS.map(f => (
          <button
            key={f}
            onClick={() => toggleFlag(f)}
            className={`rounded-full px-3 py-1.5 text-[12px] ${
              flags.includes(f)
                ? 'bg-orange-soft text-orange'
                : 'bg-fill text-label3'
            }`}
          >
            {f}
          </button>
        ))}
      </div>
    </>
  )
}

function SceneChip({ scene }: { scene: string }) {
  return (
    <span className="rounded-full bg-blue-soft px-2.5 py-1 text-[12px] font-medium text-blue">
      {sceneLabel(scene)}
    </span>
  )
}

const RATING_BUTTONS: { rating: Rating; label: string; cls: string }[] = [
  { rating: 'again', label: '没想起来', cls: 'bg-red-soft text-red' },
  { rating: 'unsure', label: '不太确定', cls: 'bg-orange-soft text-orange' },
  { rating: 'good', label: '顺', cls: 'bg-green-soft text-green' },
]

export default function Session({ mode, onExit }: { mode: 'full' | 'one'; onExit: () => void }) {
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
    buildRound(mode).then(q => {
      if (q.length === 0) {
        setFinished(true)
        setQueue([])
      } else {
        setQueue(q)
      }
    })
  }, [])

  const card = queue && index < queue.length ? queue[index] : null
  const view = card ? viewFor(card) : null

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
    return <div className="flex min-h-screen items-center justify-center text-label3">载入中…</div>
  }

  if (finished) {
    const seen = queue.filter(c => REVIEWABLE.includes(c.type))
    const uniq = [...new Map(seen.map(c => [c.id, c])).values()]
    const good = uniq.filter(c => ratingsRef.current.get(c.id) === 'good')
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-4 pt-14 pb-8">
        <h2 className="title-lg">这组练完了</h2>
        {cutShort && <p className="mt-1.5 text-[13px] text-label2">五分钟到了,先收尾——剩下的卡还在队列里。</p>}
        <p className="mt-4 text-[15px] text-label2">
          {good.length > 0 ? '这几条,你现在能直接说出口:' : '这组还没有"顺"的卡——正常,多见几次就有了。'}
        </p>
        <ul className="mt-3 space-y-3">
          {good.map(c => (
            <li key={c.id} className="group-card p-4">
              <p className="text-[16px] font-medium leading-relaxed text-label">{cardMainText(c)}</p>
              <p className="mt-1.5 text-[12px] text-green">{sceneLabel(c.scene)}</p>
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
              buildRound(mode).then(q => {
                if (q.length === 0) {
                  setFinished(true)
                  setQueue([])
                } else setQueue(q)
              })
            }}
            className="w-full rounded-[14px] bg-fill py-3.5 text-[17px] text-label active:opacity-70"
          >
            {mode === 'one' ? '再来一张?' : '再来一组?'}
          </button>
          <button onClick={onExit} className="w-full rounded-[14px] bg-blue py-3.5 text-[17px] font-semibold text-white active:opacity-80">
            今天就到这
          </button>
        </div>
      </div>
    )
  }

  if (!card) return null

  const progress = `${Math.min(index + 1, queue.length)} / ${queue.length}`

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-4 pt-12 pb-6">
      <div className="flex items-center justify-between text-[15px] text-label2">
        <button onClick={onExit} className="text-blue">
          ✕ 退出
        </button>
        <span>{progress}</span>
      </div>

      <div className="mt-6 flex-1">
        <div className="flex items-center gap-2">
          <SceneChip scene={card.scene} />
          {view!.variantIndex > 0 && (
            <span className="rounded-full bg-fill px-2.5 py-1 text-[12px] text-label2">
              换个场合 · 第 {view!.variantIndex + 1} 种
            </span>
          )}
        </div>

        {card.type === 'produce' && (
          <div className="mt-4">
            <p className="text-[20px] font-medium leading-relaxed">{view!.prompt}</p>
            {!revealed ? (
              <p className="mt-6 text-[15px] text-label2">心里(或小声)把英文说出来,再翻面对答案。</p>
            ) : (
              <div className="group-card mt-6 p-4">
                <p className="text-[19px] font-medium leading-relaxed text-blue">{view!.answer}</p>
                <p className="row-sep mt-3.5 pb-3.5 text-[14px] leading-relaxed text-label2" style={{ borderBottom: 'none', borderTop: '0.5px solid var(--sep)', paddingTop: '14px', paddingBottom: 0 }}>{view!.note}</p>
                <CardFooter card={card} />
              </div>
            )}
          </div>
        )}

        {card.type === 'pick' && (
          <div className="mt-4">
            <p className="text-[20px] font-medium leading-relaxed">{view!.prompt}</p>
            <div className="mt-5 space-y-3">
              {pickOrder.map(i => {
                const opt = card.options![i]
                const chosen = pickChoice === i
                let cls = 'bg-card'
                if (revealed) {
                  if (opt.correct) cls = 'bg-green-soft ring-[1.5px] ring-green'
                  else if (chosen) cls = 'bg-red-soft ring-[1.5px] ring-red'
                  else cls = 'bg-card opacity-50'
                }
                return (
                  <button
                    key={i}
                    disabled={revealed}
                    onClick={() => {
                      setPickChoice(i)
                      setRevealed(true)
                    }}
                    className={`w-full rounded-[14px] p-4 text-left text-[16px] leading-relaxed ${cls}`}
                  >
                    {opt.text}
                    {revealed && opt.correct && <span className="ml-2">✅</span>}
                    {revealed && chosen && !opt.correct && <span className="ml-2">❌</span>}
                  </button>
                )
              })}
            </div>
            {revealed && (
              <div className="group-card mt-4 p-4">
                <p className="text-[14px] leading-relaxed text-label2">{view!.note}</p>
                <CardFooter card={card} />
              </div>
            )}
          </div>
        )}

        {card.type === 'register' && (
          <div className="mt-4">
            <p className="text-[20px] font-medium leading-relaxed">{view!.situation}</p>
            {!revealed ? (
              <p className="mt-6 text-[15px] text-label2">先想:这个场合你会用哪一档?那句话怎么说?</p>
            ) : (
              <div className="mt-6 space-y-3">
                {([
                  ['soft', '软', 'text-blue bg-blue-soft'],
                  ['neutral', '中性', 'text-orange bg-orange-soft'],
                  ['firm', '硬', 'text-red bg-red-soft'],
                ] as const).map(([key, label, cls]) => (
                  <div key={key} className={`rounded-[14px] p-4 ${cls}`}>
                    <span className="text-[12px] font-semibold">{label}</span>
                    <p className="mt-1.5 text-[16px] leading-relaxed text-label">{card[key]}</p>
                  </div>
                ))}
                <div className="group-card p-4">
                  <p className="text-[14px] leading-relaxed text-label2">{view!.note}</p>
                  <CardFooter card={card} />
                </div>
              </div>
            )}
          </div>
        )}

        {card.type === 'note' && (
          <div className="group-card mt-4 p-5">
            <h3 className="title-md">{card.title}</h3>
            <p className="mt-3 text-[16px] leading-relaxed text-label2">{card.body}</p>
          </div>
        )}

        {card.type === 'listen' && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="title-md">{card.title}</h3>
            <p className="mt-1 text-[13px] text-label3">{card.source}</p>
            <p className="mt-3 text-[16px] leading-relaxed text-label2">{card.task}</p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-[14px] leading-relaxed text-label2">
              {card.questions?.map((q, i) => <li key={i}>{q}</li>)}
            </ul>
            {card.url && (
              <a
                href={card.url}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-block rounded-[10px] bg-blue px-4 py-2.5 text-[15px] font-medium text-white"
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
              className="w-full rounded-[14px] bg-blue py-4 text-[17px] font-semibold text-white active:opacity-80"
            >
              翻面
            </button>
          ) : revealed ? (
            <div className="grid grid-cols-3 gap-2">
              {RATING_BUTTONS.map(({ rating, label, cls }) => (
                <button
                  key={rating}
                  onClick={() => onRate(rating)}
                  className={`rounded-[14px] py-3.5 text-[15px] font-medium ${cls}`}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-center text-[14px] text-label3">选一个你觉得自然的说法</p>
          )
        ) : (
          <button onClick={onExtraDone} className="w-full rounded-[14px] bg-blue py-4 text-[17px] font-semibold text-white active:opacity-80">
            {card.type === 'note' ? '读完了' : '继续'}
          </button>
        )}
      </div>
    </div>
  )
}
