export type CardType = 'produce' | 'pick' | 'register' | 'note' | 'listen'

export interface PickOption {
  text: string
  correct: boolean
}

/** 卡片内容,与 /seed 下 JSON 的字段一一对应 */
export interface CardContent {
  id: string
  type: CardType
  scene: string
  // produce / pick
  prompt?: string
  answer?: string
  options?: PickOption[]
  // register
  situation?: string
  soft?: string
  neutral?: string
  firm?: string
  // note / listen
  title?: string
  body?: string
  source?: string
  url?: string
  task?: string
  questions?: string[]
  // 所有可复习卡型都有 note
  note?: string
}

export const FLAGS = ['不自然', '用不上', '太简单', '太难'] as const
export type Flag = (typeof FLAGS)[number]

export interface CardRecord extends CardContent {
  state: 'new' | 'review'
  /** 间隔天数,新卡为 0 */
  interval: number
  /** 到期时间戳,新卡为 null */
  due: number | null
  reps: number
  lapses: number
  /** 首次达到掌握线(间隔≥21天)的时间 */
  masteredAt: number | null
  /** 首次被标记"在真实工作里用过"的时间 */
  usedAt: number | null
  addedAt: number
  lastSeen: number | null
  flags: Flag[]
}

export interface InboxItem {
  id?: number
  text: string
  createdAt: number
}

export type Rating = 'again' | 'unsure' | 'good'

export const REVIEWABLE: CardType[] = ['produce', 'pick', 'register']

export const SCENE_LABELS: Record<string, string> = {
  email: '写邮件',
  slack: 'Slack 快回',
  'meeting-disagree': '会上表达不同意',
  chasing: '催进度',
  'asking-help': '请人帮忙',
  presenting: '做汇报',
  'small-talk': 'Small talk',
  culture: '文化与听力',
}

export function sceneLabel(scene: string): string {
  return SCENE_LABELS[scene] ?? scene
}
