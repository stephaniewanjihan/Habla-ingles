import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, exportAll, mergeCards, restoreAll, type ExportBundle } from '../db'
import type { CardContent } from '../types'

const CLAUDE_PROMPT_HEADER = `请把下面这些我在真实工作中卡壳的情境,转成职场英语训练卡片。要求:
- 输出严格的 JSON 数组,每张卡含 id(格式:场景-序号,如 email-23)、type(produce/pick/register)、scene(email/slack/meeting-disagree/chasing/asking-help/presenting/small-talk 之一)、以及对应卡型的字段
- produce 卡:prompt(中文情境)、answer(英式英语答案)、note(中文解释语气和场合)
- 英文必须是英国职场用法,note 要解释语气强弱和使用场合,不能只翻译
- id 不要与我现有牌组重复(可以用大序号,比如从 90 开始编号)

我的卡壳情境:
`

export default function Inbox() {
  const items = useLiveQuery(() => db.inbox.orderBy('createdAt').reverse().toArray())
  const [msg, setMsg] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const flash = (m: string) => {
    setMsg(m)
    setTimeout(() => setMsg(null), 3500)
  }

  const copyForClaude = async () => {
    if (!items || items.length === 0) return
    const text = CLAUDE_PROMPT_HEADER + items.map((it, i) => `${i + 1}. ${it.text}`).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      flash('已复制。打开 Claude 粘贴发送,把返回的 JSON 用下面的"导入"按钮导回来。')
    } catch {
      flash('复制失败,请手动长按选择文本。')
    }
  }

  const doExport = async () => {
    const bundle = await exportAll()
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `chunk-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    flash('已导出备份文件。')
  }

  const doImport = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as unknown
      if (Array.isArray(parsed)) {
        const { added, skipped } = await mergeCards(parsed as CardContent[])
        flash(`导入完成:新增 ${added} 张卡${skipped ? `,跳过 ${skipped} 条(已存在或格式不对)` : ''}。`)
      } else if (
        typeof parsed === 'object' && parsed !== null && (parsed as ExportBundle).app === 'chunk' && Array.isArray((parsed as ExportBundle).cards)
      ) {
        if (!window.confirm('这是一份完整备份,恢复会覆盖当前所有卡片和进度。继续吗?')) return
        await restoreAll(parsed as ExportBundle)
        flash('备份已恢复。')
      } else {
        flash('看不懂这个文件:应为卡片 JSON 数组,或本应用导出的备份。')
      }
    } catch {
      flash('文件解析失败,确认是有效的 JSON。')
    }
  }

  if (!items) return <div className="p-8 text-center text-slate-300">载入中…</div>

  return (
    <div className="mx-auto max-w-md px-5 pt-10">
      <h1 className="text-2xl font-bold">收集箱</h1>
      <p className="mt-1 text-sm text-slate-400">记下的卡壳时刻,攒几条后拿去 Claude 转成卡片</p>

      {msg && <div className="mt-4 rounded-xl bg-indigo-50 p-3 text-sm text-indigo-700">{msg}</div>}

      <div className="mt-6 space-y-3">
        {items.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
            还没有记录。在"今天"页点"记一笔",卡壳的瞬间就存在这里。
          </div>
        )}
        {items.map(it => (
          <div key={it.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm leading-relaxed text-slate-700">{it.text}</p>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-slate-300">
                {new Date(it.createdAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}
              </span>
              <button onClick={() => db.inbox.delete(it.id!)} className="text-xs text-slate-400">
                删除
              </button>
            </div>
          </div>
        ))}
      </div>

      {items.length > 0 && (
        <button
          onClick={copyForClaude}
          className="mt-4 w-full rounded-xl bg-indigo-600 py-3 font-medium text-white"
        >
          复制全部,拿去 Claude 转卡片
        </button>
      )}

      <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-bold">数据</h2>
        <p className="mt-1 text-xs text-slate-400">
          所有数据只存在这台手机上。换手机、给 Claude 反馈,都靠导出文件。
        </p>
        <div className="mt-3 flex gap-2">
          <button onClick={doExport} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600">
            导出全部数据
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600"
          >
            导入
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) void doImport(f)
              e.target.value = ''
            }}
          />
        </div>
      </div>
      <div className="h-8" />
    </div>
  )
}
