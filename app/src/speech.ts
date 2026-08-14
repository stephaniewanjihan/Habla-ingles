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
