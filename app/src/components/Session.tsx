import { useEffect, useMemo, useRef, useState } from 'react'
import { db, getMeta, setMeta } from '../db'
import { rate, dayKey, viewFor } from '../srs'
import { FLAGS, REVIEWABLE, sceneLabel } from '../types'
import { buildCloze, isCorrect, isNearMiss } from '../cloze'
import { playCorrect, playWrong, playRoundDone } from '../feedback'
import { canSpeak, speak, playDialogue, type DialoguePlayer } from '../speech'
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
export async function buildRound(mode: 'full' | 'one' | 'listen' = 'full'): Promise<CardRecord[]> {
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
  // 学习阶段的卡优先级最高:它们是刚见过、还没记牢的
  const learning = (await db.cards.where('state').equals('learning').toArray())
    .filter(c => REVIEWABLE.includes(c.type) && (c.due ?? 0) <= Date.now())
    .sort((a, b) => (a.due ?? 0) - (b.due ?? 0))
  due.unshift(...learning)

  if (mode === 'one') {
    const one = due[0] ?? news[0]
    return one ? [one] : []
  }

  if (mode === 'listen') {
    // 磨耳朵:取最久没听的一段对话
    const dialogues = (await db.cards.toArray())
      .filter(c => c.type === 'listen' && c.dialogue?.length)
      .sort((a, b) => (a.lastSeen ?? 0) - (b.lastSeen ?? 0))
    return dialogues.length ? [dialogues[0]] : []
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
  useEffect(() => setFlags(card.flags ?? []), [card.id])

  const toggleFlag = async (f: Flag) => {
    const next = flags.includes(f) ? flags.filter(x => x !== f) : [...flags, f]
    setFlags(next)
    await db.cards.update(card.id, { flags: next })
  }

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {FLAGS.map(f => (
        <button
          key={f}
          onClick={() => toggleFlag(f)}
          className={`rounded-full px-3 py-1.5 text-[12px] ${
            flags.includes(f) ? 'bg-orange-soft text-orange' : 'bg-fill text-label3'
          }`}
        >
          {f}
        </button>
      ))}
    </div>
  )
}

function SpeakButton({ text }: { text?: string }) {
  if (!text || !canSpeak) return null
  return (
    <button
      onClick={e => {
        e.stopPropagation()
        speak(text)
      }}
      aria-label="朗读"
      className="ml-2 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-soft text-blue active:opacity-70"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
        <path d="M4 9v6h4l5 4V5L8 9H4z" />
        <path d="M16 8.5a4.5 4.5 0 010 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M18.2 6a8 8 0 010 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </button>
  )
}

function DialogueCard({ card }: { card: CardRecord }) {
  const [playing, setPlaying] = useState(false)
  const [line, setLine] = useState(-1)
  const [showText, setShowText] = useState(false)
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const playerRef = useRef<DialoguePlayer | null>(null)

  useEffect(() => () => playerRef.current?.stop(), [])

  const togglePlay = () => {
    if (playing) {
      playerRef.current?.stop()
      setPlaying(false)
      setLine(-1)
    } else {
      setPlaying(true)
      playerRef.current = playDialogue(
        card.dialogue!,
        i => setLine(i),
        () => {
          setPlaying(false)
          setLine(-1)
        },
      )
    }
  }

  const pickAnswer = (qi: number, oi: number, correct: boolean) => {
    if (answers[qi] !== undefined) return
    setAnswers(a => ({ ...a, [qi]: oi }))
    if (correct) playCorrect()
    else playWrong()
  }

  return (
    <div className="mt-4">
      <div className="group-card p-5">
        <h3 className="title-md">{card.title}</h3>
        <p className="mt-2 text-[14px] leading-relaxed text-label2">{card.task}</p>
        <div className="mt-4 flex items-center gap-2.5">
          <button
            onClick={togglePlay}
            className={`flex-1 rounded-[12px] py-3 text-[16px] font-medium ${
              playing ? 'bg-fill text-label' : 'bg-blue text-white'
            } active:opacity-80`}
          >
            {playing ? '■ 停止' : '▶ 播放对话'}
          </button>
          <button
            onClick={() => setShowText(t => !t)}
            className="rounded-[12px] bg-fill px-4 py-3 text-[15px] text-blue active:opacity-70"
          >
            {showText ? '隐藏文字' : '显示文字'}
          </button>
        </div>
        {!canSpeak && (
          <p className="mt-2 text-[13px] text-orange">这台设备不支持语音朗读,只能看文字。</p>
        )}
        {showText && (
          <div className="mt-4 space-y-2.5">
            {card.dialogue!.map((l, i) => (
              <p
                key={i}
                className={`rounded-[10px] px-3 py-2 text-[15px] leading-relaxed ${
                  i === line ? 'bg-blue-soft text-label' : 'text-label2'
                }`}
              >
                <span className="font-semibold text-label">{l.speaker}:</span> {l.text}
              </p>
            ))}
          </div>
        )}
      </div>

      {card.quiz?.map((q, qi) => {
        const answered = answers[qi] !== undefined
        return (
          <div key={qi} className="group-card mt-3 p-4">
            <p className="text-[15px] font-medium leading-relaxed">{q.q}</p>
            <div className="mt-3 space-y-2">
              {q.options.map((o, oi) => {
                let cls = 'bg-fill/60'
                if (answered) {
                  if (o.correct) cls = 'bg-green-soft ring-[1.5px] ring-green'
                  else if (answers[qi] === oi) cls = 'bg-red-soft ring-[1.5px] ring-red anim-shake'
                  else cls = 'bg-fill/60 opacity-50'
                }
                return (
                  <button
                    key={oi}
                    disabled={answered}
                    onClick={() => pickAnswer(qi, oi, o.correct)}
                    className={`w-full rounded-[12px] p-3 text-left text-[14px] leading-relaxed ${cls}`}
                  >
                    {o.text}
                  </button>
                )
              })}
            </div>
            {answered && q.why && (
              <p className="mt-3 text-[13px] leading-relaxed text-label2">{q.why}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.min(100, (done / total) * 100) : 0
  return (
    <div className="h-2 flex-1 overflow-hidden rounded-full bg-fill">
      <div
        className="h-full rounded-full bg-green transition-[width] duration-300 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
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

export default function Session({ mode, onExit }: { mode: 'full' | 'one' | 'listen'; onExit: () => void }) {
  const [queue, setQueue] = useState<CardRecord[] | null>(null)
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [pickChoice, setPickChoice] = useState<number | null>(null)
  const [finished, setFinished] = useState(false)
  const [cutShort, setCutShort] = useState(false)
  const [typed, setTyped] = useState('')
  const [verdict, setVerdict] = useState<'right' | 'wrong' | null>(null)
  const [doneCount, setDoneCount] = useState(0)
  const ratingsRef = useRef<Map<string, Rating>>(new Map())
  const repeatedRef = useRef<Map<string, number>>(new Map())
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
  // 有关键词组就走填空(有唯一答案、能即时判对错);没有就退回原来的产出模式
  const cloze = card?.type === 'produce' ? buildCloze(view?.answer, card.chunk) : null

  const checkCloze = () => {
    if (!cloze || !typed.trim()) return
    if (isCorrect(typed, cloze.answer)) {
      setVerdict('right')
      playCorrect()
      setTimeout(() => setRevealed(true), 520)
    } else {
      setVerdict('wrong')
      playWrong()
    }
  }

  const pickOrder = useMemo(() => {
    if (!card || card.type !== 'pick' || !card.options) return []
    return shuffle(card.options.map((_, i) => i))
  }, [card?.id, index])

  const finishRound = async () => {
    const checkins = await getMeta<string[]>('checkins', [])
    const today = dayKey(Date.now())
    if (!checkins.includes(today)) await setMeta('checkins', [...checkins, today])
    playRoundDone()
    setFinished(true)
  }

  const advance = (nextQueue?: CardRecord[]) => {
    const q = nextQueue ?? queue!
    setRevealed(false)
    setPickChoice(null)
    setTyped('')
    setVerdict(null)
    setDoneCount(n => n + 1)
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
    const updated = rate(fresh, r)
    await db.cards.put(updated)
    ratingsRef.current.set(card.id, r)

    // 学习阶段的卡回炉到本组末尾,但连着看同一张没有检索价值:
    // 只在答"没想起来"时回炉,且中间至少要隔两张别的卡;
    // 隔不开(组太短/已到末尾)就留给下一组——它仍然到期,跑不掉。
    // 一分钟模式严格只出一张,永不组内重复。
    let nextQueue = queue!
    const seenAgain = repeatedRef.current.get(card.id) ?? 0
    const cardsAhead = queue!.length - (index + 1)
    const wantsRepeat =
      mode === 'full' &&
      updated.state === 'learning' &&
      (updated.due ?? 0) <= Date.now() + 1000 &&
      cardsAhead >= 2
    if (wantsRepeat && seenAgain < 2) {
      repeatedRef.current.set(card.id, seenAgain + 1)
      nextQueue = [...queue!, updated]
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
              repeatedRef.current = new Map()
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
            {mode === 'one' ? '再来一张?' : mode === 'listen' ? '再听一段?' : '再来一组?'}
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
    <div className="mx-auto max-w-md px-4 pt-12 pb-44">
      <div className="flex items-center gap-3 text-[15px] text-label2">
        <button onClick={onExit} className="text-blue">
          ✕ 退出
        </button>
        <ProgressBar done={doneCount} total={queue.length} />
        <span className="tabular-nums text-[13px]">{progress}</span>
      </div>

      <div className="mt-6">
        <div className="flex items-center gap-2">
          <SceneChip scene={card.scene} />
          {view!.variantIndex > 0 && (
            <span className="rounded-full bg-fill px-2.5 py-1 text-[12px] text-label2">
              换个场合 · 第 {view!.variantIndex + 1} 种
            </span>
          )}
        </div>

        {card.type === 'produce' && cloze && !revealed && (
          <div className="mt-4">
            <p className="text-[17px] leading-relaxed text-label2">{view!.prompt}</p>
            <div className={`group-card mt-4 p-4 ${verdict === 'wrong' ? 'anim-shake' : ''}`}>
              <p className="text-[19px] leading-relaxed">
                <span className="text-label2">{cloze.before}</span>
                <span className="mx-0.5 inline-block min-w-[92px] rounded-[6px] border-b-2 border-blue bg-blue-soft px-2 text-center font-medium text-blue">
                  {verdict === 'right' ? cloze.answer : '?'}
                </span>
                <span className="text-label2">{cloze.after}</span>
              </p>
            </div>
            <input
              value={typed}
              onChange={e => setTyped(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') checkCloze() }}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="填上缺的那几个词"
              className="mt-4 w-full rounded-[12px] bg-card p-3.5 text-[17px] text-label placeholder:text-label3 focus:outline-none"
            />
            {verdict === 'wrong' && (
              <p className="mt-2 text-[14px] text-orange">
                {isNearMiss(typed, cloze.answer) ? '很接近了,只差一个词——再试一次?' : '不对。再想想,或者直接看答案。'}
              </p>
            )}
          </div>
        )}

        {card.type === 'produce' && (!cloze || revealed) && (
          <div className="mt-4">
            <p className="text-[20px] font-medium leading-relaxed">{view!.prompt}</p>
            {!revealed ? (
              <p className="mt-6 text-[15px] text-label2">心里(或小声)把英文说出来,再翻面对答案。</p>
            ) : (
              <div className={`group-card mt-6 p-4 ${verdict === 'right' ? 'anim-pop' : ''}`}>
                <div className="flex items-start justify-between gap-1">
                  <p className="text-[19px] font-medium leading-relaxed text-blue">{view!.answer}</p>
                  <SpeakButton text={view!.answer} />
                </div>
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
                  if (opt.correct) cls = 'bg-green-soft ring-[1.5px] ring-green' + (chosen ? ' anim-pop' : '')
                  else if (chosen) cls = 'bg-red-soft ring-[1.5px] ring-red anim-shake'
                  else cls = 'bg-card opacity-50'
                }
                return (
                  <button
                    key={i}
                    disabled={revealed}
                    onClick={() => {
                      setPickChoice(i)
                      setRevealed(true)
                      if (opt.correct) playCorrect()
                      else playWrong()
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
                <div className="mb-2 flex items-center gap-1 text-[14px] text-blue">
                  <SpeakButton text={card.options?.find(o => o.correct)?.text} />
                  <span>听正确说法</span>
                </div>
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
                    <div className="flex items-start justify-between gap-1">
                      <p className="mt-1.5 text-[16px] leading-relaxed text-label">{card[key]}</p>
                      <SpeakButton text={card[key]} />
                    </div>
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

        {card.type === 'listen' && card.dialogue && <DialogueCard key={card.id} card={card} />}

        {card.type === 'listen' && !card.dialogue && (
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

      <div className="fixed bottom-0 left-0 right-0 bg-bar px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur-xl" style={{ borderTop: '0.5px solid var(--sep)' }}>
        <div className="mx-auto max-w-md">
        {REVIEWABLE.includes(card.type) ? (
          cloze && !revealed ? (
            <div className="flex gap-2.5">
              <button
                onClick={() => { setVerdict(null); setRevealed(true) }}
                className="flex-1 rounded-[14px] bg-fill py-4 text-[15px] text-label active:opacity-70"
              >
                想不起来
              </button>
              <button
                onClick={checkCloze}
                disabled={!typed.trim()}
                className="flex-[1.4] rounded-[14px] bg-blue py-4 text-[17px] font-semibold text-white active:opacity-80 disabled:opacity-40"
              >
                对答案
              </button>
            </div>
          ) : !revealed && card.type !== 'pick' ? (
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
    </div>
  )
}
