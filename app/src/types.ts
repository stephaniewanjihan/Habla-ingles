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
  /** 听力对话:多轮脚本,分角色用系统语音朗读 */
  dialogue?: DialogueLine[]
  /** 听力理解题,重点考言外之意 */
  quiz?: QuizQuestion[]
  // 所有可复习卡型都有 note
  note?: string
  /** 这张卡真正要练的词组,填空模式挖掉它 */
  chunk?: string
  /**
   * 变式情境:同一个表达在别的场合同样成立。
   * 复习时按 reps 轮换,避免原样重复导致"认脸不认意思"。
   */
  variants?: CardVariant[]
}

export interface DialogueLine {
  speaker: string
  text: string
}

export interface QuizQuestion {
  q: string
  options: { text: string; correct: boolean }[]
  why?: string
}

export interface CardVariant {
  /** produce / pick:换一个中文情境 */
  prompt?: string
  /** register:换一个中文情境 */
  situation?: string
  /** 该情境下措辞需要微调时才给,否则复用主答案 */
  answer?: string
  /** 该情境特有的提示,可选 */
  note?: string
}

export const FLAGS = ['不自然', '用不上', '太简单', '太难'] as const
export type Flag = (typeof FLAGS)[number]

export interface CardRecord extends CardContent {
  state: 'new' | 'learning' | 'review'
  /** 学习阶段的第几关(0 起),毕业后不再使用 */
  step?: number
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
