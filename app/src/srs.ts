import type { CardRecord, Rating } from './types'

export const DAY = 86400000
/** 间隔达到该天数即算"已掌握" */
export const MASTERY_DAYS = 21

/**
 * 学习阶段:新卡先在短间隔内连过几关,再进入按天计的间隔复习。
 * 第 0 关 = 本次练习稍后再出一次;第 1 关 = 十分钟后(当天再见一次);
 * 连过两关才毕业到 1 天,然后才走 SM-2 的乘数。
 * 完全陌生的材料只见一次是记不住的,这几关就是为此存在。
 */
/** 每答对一次之后的等待时间:先"本组稍后再来一次",再"当天再来一次",第三次才毕业 */
export const LEARNING_STEPS_MS = [0, 10 * 60 * 1000]
const GRADUATING_INTERVAL = 1

/** 答错(step 0)立刻重来;之后按 LEARNING_STEPS_MS 走 */
function learningDelay(step: number): number {
  return step === 0 ? 0 : LEARNING_STEPS_MS[step - 1]
}

/** 简化版 SM-2,前面加了学习阶段;没想起来则退回学习阶段重来 */
export function rate(card: CardRecord, rating: Rating, now = Date.now()): CardRecord {
  const inLearning = card.state === 'new' || card.state === 'learning'
  const step = card.step ?? 0

  if (inLearning) {
    let nextStep: number
    let unsureDelay = 0
    if (rating === 'again') nextStep = 0
    else if (rating === 'unsure') {
      // 原地踏步但不立刻重看——同一张卡连着看没有检索价值,十分钟后再见
      nextStep = step
      unsureDelay = 10 * 60 * 1000
    } else nextStep = step + 1

    if (nextStep > LEARNING_STEPS_MS.length) {
      // 毕业:进入按天计的间隔复习
      return {
        ...card,
        state: 'review',
        step: undefined,
        interval: GRADUATING_INTERVAL,
        due: now + GRADUATING_INTERVAL * DAY,
        reps: card.reps + 1,
        lastSeen: now,
      }
    }
    return {
      ...card,
      state: 'learning',
      step: nextStep,
      interval: 0,
      due: now + Math.max(learningDelay(nextStep), unsureDelay),
      reps: card.reps + 1,
      lastSeen: now,
    }
  }

  if (rating === 'again') {
    // 复习中忘掉了:退回学习阶段,当次练习里就要再见一面
    return {
      ...card,
      state: 'learning',
      step: 0,
      interval: 0,
      due: now,
      reps: card.reps + 1,
      lapses: card.lapses + 1,
      lastSeen: now,
    }
  }

  const interval =
    rating === 'unsure'
      ? Math.max(1, (card.interval || 1) * 1.3)
      : Math.max(2, (card.interval || 1) * 2.4)
  return {
    ...card,
    state: 'review',
    step: undefined,
    interval,
    due: now + interval * DAY,
    reps: card.reps + 1,
    masteredAt: card.masteredAt ?? (interval >= MASTERY_DAYS ? now : null),
    lastSeen: now,
  }
}

/**
 * 按复习次数轮换情境:第 1 次见原始情境,之后依次走 variants,循环。
 * 同一句话在不同场合反复出现,更接近真实工作里被触发的样子。
 */
export function viewFor(card: CardRecord): {
  prompt?: string
  situation?: string
  answer?: string
  note?: string
  variantIndex: number
  variantCount: number
} {
  const variants = card.variants ?? []
  const total = variants.length + 1
  const i = total > 1 ? card.reps % total : 0
  if (i === 0) {
    return {
      prompt: card.prompt,
      situation: card.situation,
      answer: card.answer,
      note: card.note,
      variantIndex: 0,
      variantCount: total,
    }
  }
  const v = variants[i - 1]
  return {
    prompt: v.prompt ?? card.prompt,
    situation: v.situation ?? card.situation,
    answer: v.answer ?? card.answer,
    note: v.note ?? card.note,
    variantIndex: i,
    variantCount: total,
  }
}

export function isMastered(card: CardRecord): boolean {
  return card.interval >= MASTERY_DAYS
}

export function dayKey(ts: number): string {
  const d = new Date(ts)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function isoWeekKey(ts: number): string {
  const date = new Date(ts)
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((d.getTime() - yearStart) / DAY + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/** 掌握数里程碑:只挂在真实能力增长上,不奖励打开次数 */
export const MASTERY_MILESTONES = [10, 25, 50, 100, 150]

export function latestMilestone(masteredCount: number): number | null {
  let hit: number | null = null
  for (const m of MASTERY_MILESTONES) if (masteredCount >= m) hit = m
  return hit
}

/** 本周一 00:00 的时间戳 */
export function startOfWeek(now = Date.now()): number {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  const shift = (d.getDay() + 6) % 7
  return d.getTime() - shift * DAY
}

export interface StreakInfo {
  streak: number
  /** 本周的补签是否已被用掉 */
  makeupUsedThisWeek: boolean
}

/**
 * 连续天数:从今天往回数。每个 ISO 周自动附赠一次"补签",
 * 用来抹平一天的缺勤;纯补签凑不出连续(必须有真实打卡)。
 * 今天还没打卡不算断,从昨天起算。
 */
export function computeStreak(checkins: string[], now = Date.now()): StreakInfo {
  const set = new Set(checkins)
  const usedWeeks = new Set<string>()
  const tentativeWeeks = new Set<string>()
  let streak = 0
  let pending = 0
  let cursor = now
  if (set.has(dayKey(cursor))) streak++
  cursor -= DAY
  for (let i = 0; i < 3660; i++) {
    if (set.has(dayKey(cursor))) {
      // 真实打卡:把中间靠补签垫着的缺勤一并计入,补签正式消耗
      streak += pending + 1
      for (const w of tentativeWeeks) usedWeeks.add(w)
      tentativeWeeks.clear()
      pending = 0
    } else {
      const wk = isoWeekKey(cursor)
      if (!usedWeeks.has(wk) && !tentativeWeeks.has(wk)) {
        tentativeWeeks.add(wk)
        pending++
      } else {
        break
      }
    }
    cursor -= DAY
  }
  // 走到头仍未遇到真实打卡的 pending 不算,补签也不消耗
  return { streak, makeupUsedThisWeek: usedWeeks.has(isoWeekKey(now)) }
}
