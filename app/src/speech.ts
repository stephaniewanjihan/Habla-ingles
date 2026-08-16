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

/**
 * 系统语音列表是异步加载的:冷启动后 getVoices() 常常先返回空数组,
 * 直接分配就会全员落到默认声(通常是男声)。播放前必须等它就绪。
 */
function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!canSpeak) return Promise.resolve([])
  const now = speechSynthesis.getVoices()
  if (now.length) return Promise.resolve(now)
  return new Promise(resolve => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      resolve(speechSynthesis.getVoices())
    }
    speechSynthesis.addEventListener('voiceschanged', finish, { once: true })
    setTimeout(finish, 1500)
  })
}

if (canSpeak) {
  // 启动即预热,列表到位后刷新单句朗读用的默认声
  void loadVoices().then(() => {
    voice = pickVoice()
  })
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

/** 常见系统语音的性别名单:按名字判断,不同平台通用 */
const FEMALE_VOICES = /kate|serena|martha|sonia|libby|stephanie|susan|samantha|karen|moira|tessa|fiona|allison|ava|nicky|joelle|shelley|kathy|flo|sandy|anna|emily|catherine|veena|zoe|kara|helena|hazel/i
const MALE_VOICES = /daniel|arthur|oliver|alex\b|aaron|fred|gordon|lee\b|rishi|james|thomas|albert|bruce|junior|ralph|reed|rocko|eddy/i

function poolByGender(vs: SpeechSynthesisVoice[]): { f: SpeechSynthesisVoice[]; m: SpeechSynthesisVoice[] } {
  const en = [...vs.filter(v => v.lang === 'en-GB'), ...vs.filter(v => v.lang.startsWith('en') && v.lang !== 'en-GB')]
  return {
    f: en.filter(v => FEMALE_VOICES.test(v.name) && !MALE_VOICES.test(v.name)),
    m: en.filter(v => MALE_VOICES.test(v.name) && !FEMALE_VOICES.test(v.name)),
  }
}

/** 按角色声明的性别分配声音;同性别多角色尽量用不同的声音 */
function voicesForCast(
  speakers: string[],
  cast: Record<string, 'm' | 'f'> | undefined,
  allVoices: SpeechSynthesisVoice[],
): Map<string, SpeechSynthesisVoice | null> {
  const { f, m } = poolByGender(allVoices)
  const used = new Set<string>()
  const pickFrom = (pool: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null => {
    const fresh = pool.find(v => !used.has(v.name)) ?? pool[0] ?? null
    if (fresh) used.add(fresh.name)
    return fresh
  }
  const all = [...f, ...m]
  return new Map(
    speakers.map(sp => {
      const g = cast?.[sp]
      const voice = g === 'f' ? pickFrom(f) ?? pickFrom(all) : g === 'm' ? pickFrom(m) ?? pickFrom(all) : pickFrom(all)
      return [sp, voice]
    }),
  )
}

/** 播放期间保持屏幕常亮:iOS 锁屏会掐断语音合成 */
let wakeLock: { release: () => Promise<void> } | null = null

async function acquireWakeLock(): Promise<void> {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }
    if (nav.wakeLock) wakeLock = await nav.wakeLock.request('screen')
  } catch {
    /* 低电量模式等场景会拒绝,拒绝就算了 */
  }
}

function releaseWakeLock(): void {
  void wakeLock?.release().catch(() => {})
  wakeLock = null
}

export interface DialoguePlayer {
  stop: () => void
}

/** 顺序朗读整段对话,不同角色不同声音;onLine 用于高亮当前句 */
export function playDialogue(
  lines: { speaker: string; text: string }[],
  onLine: (index: number) => void,
  onDone: () => void,
  cast?: Record<string, 'm' | 'f'>,
): DialoguePlayer {
  if (!canSpeak || lines.length === 0) {
    onDone()
    return { stop: () => {} }
  }
  speechSynthesis.cancel()
  const speakers = [...new Set(lines.map(l => l.speaker))]
  let voices = new Map<string, SpeechSynthesisVoice | null>()
  let stopped = false
  let i = 0
  void acquireWakeLock()

  // 切到后台再回来时,iOS 会把语音挂起——回前台立刻恢复,并重新拿回屏幕常亮
  const onVisible = () => {
    if (document.hidden || stopped) return
    if (speechSynthesis.paused) speechSynthesis.resume()
    void acquireWakeLock()
  }
  document.addEventListener('visibilitychange', onVisible)

  const cleanup = () => {
    document.removeEventListener('visibilitychange', onVisible)
    releaseWakeLock()
  }

  const next = () => {
    if (stopped) return
    if (i >= lines.length) {
      cleanup()
      onDone()
      return
    }
    const line = lines[i]
    onLine(i)
    const u = new SpeechSynthesisUtterance(line.text)
    const v = voices.get(line.speaker)
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
  // 等系统语音列表就绪再分配角色声音,否则性别分配会整体落空
  void loadVoices().then(vs => {
    if (stopped) return
    voices = voicesForCast(speakers, cast, vs)
    next()
  })
  return {
    stop: () => {
      stopped = true
      speechSynthesis.cancel()
      cleanup()
    },
  }
}
