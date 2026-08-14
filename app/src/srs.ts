import type { CardRecord, Rating } from './types'

export const DAY = 86400000
/** 间隔达到该天数即算"已掌握" */
export const MASTERY_DAYS = 21

/** 简化版 SM-2:没想起来→重置 1 天;不确定→×1.3;顺→×2.4 */
export function rate(card: CardRecord, rating: Rating, now = Date.now()): CardRecord {
  let interval: number
  let lapses = card.lapses
  if (rating === 'again') {
    if (card.state === 'review') lapses += 1
    interval = 1
  } else if (rating === 'unsure') {
    interval = Math.max(1, (card.interval || 1) * 1.3)
  } else {
    interval = Math.max(2, (card.interval || 1) * 2.4)
  }
  const masteredAt = card.masteredAt ?? (interval >= MASTERY_DAYS ? now : null)
  return {
    ...card,
    state: 'review',
    interval,
    due: now + interval * DAY,
    reps: card.reps + 1,
    lapses,
    masteredAt,
    lastSeen: now,
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
