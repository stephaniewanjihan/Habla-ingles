/**
 * 英式发音朗读:用系统自带的语音合成(iOS 上是本地英音),
 * 不引入音频文件、不联网。听力训练的第一块砖。
 */

let voice: SpeechSynthesisVoice | null = null

function pickVoice(): SpeechSynthesisVoice | null {
  const vs = speechSynthesis.getVoices()
  return (
    // iOS 的高质量英音优先
    vs.find(v => v.lang === 'en-GB' && /daniel|serena|kate|sonia|libby|stephanie/i.test(v.name)) ??
    vs.find(v => v.lang === 'en-GB') ??
    vs.find(v => v.lang.startsWith('en')) ??
    null
  )
}

export const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window

if (canSpeak) {
  speechSynthesis.onvoiceschanged = () => {
    voice = pickVoice()
  }
}

export function speak(text: string): void {
  if (!canSpeak || !text) return
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  if (!voice) voice = pickVoice()
  if (voice) u.voice = voice
  u.lang = 'en-GB'
  u.rate = 0.95
  speechSynthesis.speak(u)
}

/** 给对话里的每个说话人分配一个不同的声音,尽量一男一女的英音 */
function voicesForDialogue(speakers: string[]): Map<string, SpeechSynthesisVoice | null> {
  const vs = canSpeak ? speechSynthesis.getVoices() : []
  const gb = vs.filter(v => v.lang === 'en-GB')
  const en = vs.filter(v => v.lang.startsWith('en'))
  const pool: (SpeechSynthesisVoice | null)[] = []
  const male = gb.find(v => /daniel|arthur|oliver/i.test(v.name))
  const female = gb.find(v => /kate|serena|sonia|libby|martha/i.test(v.name))
  if (female) pool.push(female)
  if (male) pool.push(male)
  for (const v of [...gb, ...en]) {
    if (pool.length >= speakers.length) break
    if (!pool.includes(v)) pool.push(v)
  }
  while (pool.length < speakers.length) pool.push(pool[0] ?? null)
  return new Map(speakers.map((sp, i) => [sp, pool[i % pool.length]]))
}

export interface DialoguePlayer {
  stop: () => void
}

/** 顺序朗读整段对话,不同角色不同声音;onLine 用于高亮当前句 */
export function playDialogue(
  lines: { speaker: string; text: string }[],
  onLine: (index: number) => void,
  onDone: () => void,
): DialoguePlayer {
  if (!canSpeak || lines.length === 0) {
    onDone()
    return { stop: () => {} }
  }
  speechSynthesis.cancel()
  const speakers = [...new Set(lines.map(l => l.speaker))]
  const cast = voicesForDialogue(speakers)
  let stopped = false
  let i = 0

  const next = () => {
    if (stopped) return
    if (i >= lines.length) {
      onDone()
      return
    }
    const line = lines[i]
    onLine(i)
    const u = new SpeechSynthesisUtterance(line.text)
    const v = cast.get(line.speaker)
    if (v) u.voice = v
    u.lang = 'en-GB'
    u.rate = 0.92
    u.onend = () => {
      i += 1
      // 换人说话时停顿一拍,更像真实对话
      setTimeout(next, 260)
    }
    u.onerror = () => {
      i += 1
      setTimeout(next, 100)
    }
    speechSynthesis.speak(u)
  }
  next()
  return {
    stop: () => {
      stopped = true
      speechSynthesis.cancel()
    },
  }
}
