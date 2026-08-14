/** 填空模式:把答案里的关键词组挖掉,让她补上——有唯一答案,能即时判对错 */

export interface Cloze {
  before: string
  answer: string
  after: string
}

export function buildCloze(sentence?: string, chunk?: string): Cloze | null {
  if (!sentence || !chunk) return null
  const i = sentence.toLowerCase().indexOf(chunk.toLowerCase())
  if (i < 0) return null
  return {
    before: sentence.slice(0, i),
    answer: sentence.slice(i, i + chunk.length),
    after: sentence.slice(i + chunk.length),
  }
}

/** 判分从宽:忽略大小写、标点、多余空格和常见的弯引号 */
export function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[.,!?;:—–-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isCorrect(input: string, answer: string): boolean {
  return normalise(input) === normalise(answer)
}

/** 差一点:词数相同且只差一个词,给"接近了"的提示而不是直接判错 */
export function isNearMiss(input: string, answer: string): boolean {
  const a = normalise(input).split(' ')
  const b = normalise(answer).split(' ')
  if (a.length !== b.length || a.length === 0) return false
  const diff = a.filter((w, i) => w !== b[i]).length
  return diff === 1
}
