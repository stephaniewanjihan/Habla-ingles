/** 即时反馈:一声清脆的提示音 + 轻微震动。用 Web Audio 合成,不引入音频文件 */

let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function tone(freqs: number[], duration = 0.12, gain = 0.06) {
  const a = audio()
  if (!a) return
  freqs.forEach((f, i) => {
    const osc = a.createOscillator()
    const vol = a.createGain()
    osc.type = 'sine'
    osc.frequency.value = f
    const start = a.currentTime + i * duration * 0.55
    vol.gain.setValueAtTime(0, start)
    vol.gain.linearRampToValueAtTime(gain, start + 0.012)
    vol.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    osc.connect(vol).connect(a.destination)
    osc.start(start)
    osc.stop(start + duration + 0.02)
  })
}

export function playCorrect() {
  tone([660, 880], 0.13)
  navigator.vibrate?.(18)
}

export function playWrong() {
  tone([300, 240], 0.16, 0.05)
  navigator.vibrate?.([14, 40, 14])
}

export function playRoundDone() {
  tone([523, 659, 784, 1047], 0.16, 0.05)
  navigator.vibrate?.(30)
}
