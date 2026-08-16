import Dexie, { type EntityTable } from 'dexie'
import type { CardContent, CardRecord, InboxItem } from './types'
import seedDeck from './data/seed-deck.json'

interface MetaRow {
  key: string
  value: unknown
}

class ChunkDB extends Dexie {
  cards!: EntityTable<CardRecord, 'id'>
  inbox!: EntityTable<InboxItem, 'id'>
  meta!: EntityTable<MetaRow, 'key'>

  constructor() {
    super('chunk')
    this.version(1).stores({
      cards: 'id, scene, type, state, due',
      inbox: '++id, createdAt',
      meta: 'key',
    })
  }
}

export const db = new ChunkDB()

export function freshRecord(c: CardContent, now = Date.now()): CardRecord {
  return {
    ...c,
    state: 'new',
    interval: 0,
    due: null,
    reps: 0,
    lapses: 0,
    masteredAt: null,
    usedAt: null,
    addedAt: now,
    lastSeen: null,
    flags: [],
  }
}

function seedHash(): string {
  const str = JSON.stringify(seedDeck)
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0
  return String(h)
}

/**
 * 首次启动灌入种子牌组;之后每当种子内容变了(新增字段、修正文案),
 * 把内容字段同步到已有卡片上——复习进度(间隔、到期、次数、标记)原样保留。
 * 没有这一步,老设备永远拿不到新内容,只有全新安装才看得到。
 */
/** 已从种子里移除、且要从老设备上清掉的卡(产品负责人明确不要的内容) */
const RETIRED_IDS = ['dialogue-13']

export async function ensureSeeded(): Promise<void> {
  await db.cards.bulkDelete(RETIRED_IDS)
  const hash = seedHash()
  const now = Date.now()
  const count = await db.cards.count()
  if (count === 0) {
    // bulkPut 保证并发调用时幂等(同一份种子重复灌入结果一致)
    await db.cards.bulkPut((seedDeck as CardContent[]).map(c => freshRecord(c, now)))
    await setMeta('seedHash', hash)
    return
  }
  const prev = await getMeta<string | null>('seedHash', null)
  if (prev === hash) return
  await db.transaction('rw', db.cards, db.meta, async () => {
    for (const sc of seedDeck as CardContent[]) {
      const existing = await db.cards.get(sc.id)
      if (!existing) {
        await db.cards.add(freshRecord(sc, now))
      } else {
        const { state, step, interval, due, reps, lapses, masteredAt, usedAt, addedAt, lastSeen, flags } = existing
        await db.cards.put({ ...sc, state, step, interval, due, reps, lapses, masteredAt, usedAt, addedAt, lastSeen, flags })
      }
    }
    await db.meta.put({ key: 'seedHash', value: hash })
  })
}

/**
 * 申请持久化存储。不申请的话,iOS/Safari 会把长期不用的站点数据当缓存清掉,
 * 学习进度就没了。装到主屏幕后这个申请通常直接通过。
 */
export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  try {
    if (await navigator.storage.persisted?.()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await db.meta.get(key)
  return row ? (row.value as T) : fallback
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value })
}

export interface ExportBundle {
  app: 'chunk'
  version: 1
  exportedAt: string
  cards: CardRecord[]
  inbox: InboxItem[]
  meta: MetaRow[]
}

export async function exportAll(): Promise<ExportBundle> {
  return {
    app: 'chunk',
    version: 1,
    exportedAt: new Date().toISOString(),
    cards: await db.cards.toArray(),
    inbox: await db.inbox.toArray(),
    meta: await db.meta.toArray(),
  }
}

/** 完整恢复备份(覆盖现有数据) */
export async function restoreAll(bundle: ExportBundle): Promise<void> {
  await db.transaction('rw', db.cards, db.inbox, db.meta, async () => {
    await db.cards.clear()
    await db.inbox.clear()
    await db.meta.clear()
    await db.cards.bulkAdd(bundle.cards)
    await db.inbox.bulkAdd(bundle.inbox.map(({ id: _id, ...rest }) => rest))
    await db.meta.bulkAdd(bundle.meta)
  })
}

const VALID_TYPES: CardContent['type'][] = ['produce', 'pick', 'register', 'note', 'listen']

const REQUIRED_FIELDS: Record<CardContent['type'], (keyof CardContent)[]> = {
  produce: ['prompt', 'answer', 'note'],
  pick: ['prompt', 'options', 'note'],
  register: ['situation', 'soft', 'neutral', 'firm', 'note'],
  note: ['title', 'body'],
  listen: ['title', 'task'],
}

/** 合并新卡片(Claude 生成的卡片数组):已有 id 跳过,新 id 作为新卡加入 */
export async function mergeCards(cards: CardContent[]): Promise<{ added: number; skipped: number }> {
  let added = 0
  let skipped = 0
  const now = Date.now()
  await db.transaction('rw', db.cards, async () => {
    for (const c of cards) {
      if (!c.id || !c.scene || !VALID_TYPES.includes(c.type)) {
        skipped++
        continue
      }
      // 缺了本卡型的必填字段就跳过,否则会进来一张点开是空白的卡
      const required = REQUIRED_FIELDS[c.type]
      if (required.some(f => c[f] === undefined || c[f] === null)) {
        skipped++
        continue
      }
      const existing = await db.cards.get(c.id)
      if (existing) {
        skipped++
      } else {
        await db.cards.add(freshRecord(c, now))
        added++
      }
    }
  })
  return { added, skipped }
}
