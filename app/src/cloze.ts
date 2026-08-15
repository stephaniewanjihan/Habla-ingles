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

/**
 * 生成一个词组的等价写法集合:缩写和全写互认(you'd = you would,
 * can't = cannot),-ise/-ize 拼法互认,所有格撇号可省。
 * 词组很短,变体数量有上限,不会爆炸。
 */
function equivalents(s: string): Set<string> {
  let base = normalise(s)
  // 英式/美式 -ise 拼法归一
  base = base.replace(/ization\b/g, 'isation').replace(/izing\b/g, 'ising').replace(/ize\b/g, 'ise')
  const tokenVariants = base.split(' ').map(tok => {
    const out = new Set<string>([tok])
    if (tok === "won't") out.add('will not')
    else if (tok === "can't") { out.add('cannot'); out.add('can not') }
    else if (tok === 'cannot') { out.add("can't"); out.add('can not') }
    else if (tok === "shan't") out.add('shall not')
    else if (tok.endsWith("n't")) out.add(tok.slice(0, -3) + ' not')
    if (tok.endsWith("'re")) out.add(tok.slice(0, -3) + ' are')
    if (tok.endsWith("'m")) out.add(tok.slice(0, -2) + ' am')
    if (tok.endsWith("'ve")) out.add(tok.slice(0, -3) + ' have')
    if (tok.endsWith("'ll")) out.add(tok.slice(0, -3) + ' will')
    if (tok.endsWith("'d")) { out.add(tok.slice(0, -2) + ' would'); out.add(tok.slice(0, -2) + ' had') }
    if (tok.endsWith("'s")) { out.add(tok.slice(0, -2) + ' is'); out.add(tok.slice(0, -2) + ' has'); out.add(tok.slice(0, -2) + 's') }
    if (tok.includes("'")) out.add(tok.replace(/'/g, ''))
    return [...out]
  })
  // 有限笛卡尔积,封顶防爆
  let combos: string[] = ['']
  for (const opts of tokenVariants) {
    const next: string[] = []
    for (const c of combos) {
      for (const o of opts) {
        next.push(c ? c + ' ' + o : o)
        if (next.length > 400) break
      }
      if (next.length > 400) break
    }
    combos = next
  }
  return new Set(combos)
}

export function isCorrect(input: string, answer: string): boolean {
  if (normalise(input) === normalise(answer)) return true
  const a = equivalents(input)
  const b = equivalents(answer)
  for (const x of a) if (b.has(x)) return true
  return false
}

/** 差一点:词数相同且只差一个词,给"接近了"的提示而不是直接判错 */
export function isNearMiss(input: string, answer: string): boolean {
  const a = normalise(input).split(' ')
  const b = normalise(answer).split(' ')
  if (a.length !== b.length || a.length === 0) return false
  const diff = a.filter((w, i) => w !== b[i]).length
  return diff === 1
}
