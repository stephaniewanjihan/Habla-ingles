import { chromium } from 'playwright'

const BASE = 'http://localhost:4173/Habla-ingles/'
const shots = '/tmp/claude-0/-home-user-Habla-ingles/3e754a22-9d07-56b8-b170-7b43c4a72bcc/scratchpad'
const fails = []
const ok = (name, cond) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`)
  if (!cond) fails.push(name)
}


// 处理当前这张卡:填空卡先看答案再评分,其余照旧
async function answerCurrentCard(page) {
  const clozeInput = page.getByPlaceholder('填上缺的那几个词')
  const flip = page.getByRole('button', { name: '翻面' })
  const read = page.getByRole('button', { name: '读完了' })
  const cont = page.getByRole('button', { name: '继续', exact: true })
  if (await clozeInput.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: '想不起来' }).click()
    await page.waitForTimeout(300)
  } else if (await flip.isVisible().catch(() => false)) {
    await flip.click()
    await page.waitForTimeout(250)
  } else if (await read.isVisible().catch(() => false)) {
    await read.click(); await page.waitForTimeout(250); return 'extra'
  } else if (await cont.isVisible().catch(() => false)) {
    await cont.click(); await page.waitForTimeout(250); return 'extra'
  } else {
    const opts = page.locator('button.w-full.p-4.text-left')
    if (!(await opts.count())) return false
    await opts.first().click()
    await page.waitForTimeout(350)
  }
  const good = page.getByRole('button', { name: '顺', exact: true })
  if (!(await good.isVisible().catch(() => false))) return false
  await good.click()
  await page.waitForTimeout(250)
  return 'rated'
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text()) })
page.on('pageerror', e => { console.log('PAGE ERROR:', e.message); fails.push('pageerror: ' + e.message) })

await page.goto(BASE)
await page.waitForTimeout(1500)

// --- Home ---
ok('home shows start button', await page.getByText('开始今天的一组').isVisible().catch(() => false))
ok('home shows mastered counter', await page.getByText('已掌握表达').isVisible().catch(() => false))
ok('home shows jot button', await page.getByText('三秒记下来').isVisible().catch(() => false))
await page.screenshot({ path: `${shots}/1-home.png` })

// --- Jot a note ---
await page.getByText('三秒记下来').click()
await page.waitForTimeout(300)
await page.locator('textarea').fill('想跟同事说数据对不上但不想显得在指责')
await page.getByRole('button', { name: '存下', exact: true }).click()
await page.waitForTimeout(900)
ok('jot modal closed', !(await page.locator('textarea').isVisible().catch(() => false)))

// --- New motivation UI on home ---
ok('week strip rendered', (await page.locator('div.h-\\[30px\\]').count()) === 7)
ok('week-days tile shown', await page.getByText('本周练习天').isVisible().catch(() => false))
ok('one-card shortcut offered', await page.getByText('今天只有一分钟?来一张就算数').isVisible().catch(() => false))

// --- One-card mode counts as a check-in ---
await page.getByText('今天只有一分钟?来一张就算数').click()
await page.waitForTimeout(800)
ok('one-card round shows 1 / 1', await page.getByText('1 / 1').isVisible().catch(() => false))
{
  const clozeInput = page.getByPlaceholder('填上缺的那几个词')
  if (await clozeInput.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: '想不起来' }).click()
  } else if (await page.getByRole('button', { name: '翻面' }).isVisible().catch(() => false)) {
    await page.getByRole('button', { name: '翻面' }).click()
  } else {
    await page.locator('button.w-full.p-4.text-left').first().click()
  }
  await page.waitForTimeout(400)
  // 翻面后解释展开,评分按钮必须仍在首屏——她真实遇到过按钮被挤出屏幕
  const btn = page.getByRole('button', { name: '顺', exact: true })
  const box = await btn.boundingBox().catch(() => null)
  const vh = page.viewportSize().height
  ok('rating buttons stay on screen without scrolling',
     !!box && box.y >= 0 && box.y + box.height <= vh + 1)
  await page.screenshot({ path: `${shots}/14-sticky.png` })
  await btn.click()
  await page.waitForTimeout(600)
}
ok('one-card round finished', await page.getByText('这组练完了').isVisible().catch(() => false))
ok('repeat label says 再来一张', await page.getByText('再来一张?').isVisible().catch(() => false))
await page.screenshot({ path: `${shots}/10-one-card-finish.png` })
await page.getByRole('button', { name: '今天就到这' }).click()
await page.waitForTimeout(600)
ok('one card counted as today done', await page.getByText('今天已完成').isVisible().catch(() => false))
await page.screenshot({ path: `${shots}/11-home-with-progress.png` })

// --- Session: run one full round ---
await page.getByText('再来一组', { exact: true }).click()
await page.waitForTimeout(800)
await page.screenshot({ path: `${shots}/2-session-first-card.png` })

let steps = 0
let ratedCards = 0
let flagged = false
while (steps < 20) {
  steps++
  if (await page.getByText('这组练完了').isVisible().catch(() => false)) break
  // 顺手在第一张翻开的卡上打个标记,验证反馈标记会存下来
  if (!flagged && (await page.getByRole('button', { name: '太简单' }).isVisible().catch(() => false))) {
    await page.getByRole('button', { name: '太简单' }).click()
    await page.waitForTimeout(150)
    flagged = true
  }
  const outcome = await answerCurrentCard(page)
  if (outcome === 'rated') {
    ratedCards++
    if (ratedCards === 1) await page.screenshot({ path: `${shots}/3-card-back.png` })
  } else if (outcome !== 'extra') {
    console.log('STUCK: no known button found at step', steps)
    await page.screenshot({ path: `${shots}/stuck-${steps}.png` })
    fails.push('stuck in session')
    break
  }
  await page.waitForTimeout(200)
}
ok('session reached finish page', await page.getByText('这组练完了').isVisible().catch(() => false))
ok(`rated some cards (${ratedCards})`, ratedCards >= 3)
await page.screenshot({ path: `${shots}/5-finish.png` })
ok('finish shows good list', await page.getByText('能直接说出口').isVisible().catch(() => false))
ok('finish has another-round button', await page.getByText('再来一组?').isVisible().catch(() => false))

// --- Exit, check home updated ---
await page.getByRole('button', { name: '今天就到这' }).click()
await page.waitForTimeout(600)
ok('home shows today done', await page.getByText('今天已完成').isVisible().catch(() => false))
ok('streak label visible', await page.getByText(/连续/).first().isVisible().catch(() => false))
await page.screenshot({ path: `${shots}/6-home-after.png` })

// --- Deck tab ---
await page.getByRole('button', { name: /牌组/ }).click()
await page.waitForTimeout(500)
ok('deck shows email scene', await page.getByText('写邮件', { exact: true }).isVisible().catch(() => false))
await page.getByText('写邮件', { exact: true }).click()
await page.waitForTimeout(400)
await page.screenshot({ path: `${shots}/7-deck.png` })

// --- Review tab ---
await page.getByRole('button', { name: /回顾/ }).click()
await page.waitForTimeout(500)
ok('review page renders', await page.getByText('每周回顾').isVisible().catch(() => false))
await page.screenshot({ path: `${shots}/8-review.png` })

// --- Inbox tab ---
await page.getByRole('button', { name: /收集箱/ }).click()
await page.waitForTimeout(500)
ok('inbox shows jotted item', await page.getByText('想跟同事说数据对不上').isVisible().catch(() => false))
ok('inbox has copy-for-claude button', await page.getByText('复制全部,拿去 Claude 转卡片').isVisible().catch(() => false))
ok('inbox has export button', await page.getByText('导出全部数据').isVisible().catch(() => false))
await page.screenshot({ path: `${shots}/9-inbox.png` })

// --- Import path: the Claude round-trip she'll run every couple of weeks ---
await page.locator('input[type=file]').setInputFiles('/tmp/claude-0/-home-user-Habla-ingles/3e754a22-9d07-56b8-b170-7b43c4a72bcc/scratchpad/test-import.json')
await page.waitForTimeout(900)
const importMsg = await page.locator('div.bg-blue-soft').first().innerText().catch(() => '')
ok(`import added 2 and skipped 2 malformed (got: ${importMsg.trim()})`,
   importMsg.includes('新增 2 张卡') && importMsg.includes('跳过 2 条'))
await page.screenshot({ path: `${shots}/12-import.png` })

// Imported cards must actually reach the deck
await page.getByRole('button', { name: /牌组/ }).click()
await page.waitForTimeout(500)
await page.getByText('写邮件', { exact: true }).click()
await page.waitForTimeout(400)
ok('imported card visible in deck', await page.getByText('测试用:临时通知对方今天无法回复').isVisible().catch(() => false))
await page.getByRole('button', { name: /收集箱/ }).click()
await page.waitForTimeout(400)

// --- Learning phase: a brand-new card must come back inside the same round ---
await page.evaluate(async () => {
  const db = await new Promise(res => { const r = indexedDB.open('chunk'); r.onsuccess = () => res(r.result) })
  const all = await new Promise(res => { const r = db.transaction('cards','readonly').objectStore('cards').getAll(); r.onsuccess = () => res(r.result) })
  // 清掉到期卡,让这一组只可能抽到新卡,便于观察学习阶段
  const tx = db.transaction('cards','readwrite')
  for (const c of all) if (c.state !== 'new') tx.objectStore('cards').put({ ...c, due: Date.now() + 30 * 86400000 })
  await new Promise(res => { tx.oncomplete = res })
})
await page.getByRole('button', { name: /今天/ }).first().click()
await page.waitForTimeout(400)
await page.getByText('再来一组', { exact: true }).click()
await page.waitForTimeout(900)
{
  const readTotal = async () => {
    const t = await page.getByText(/^\d+ \/ \d+$/).first().innerText().catch(() => '1 / 5')
    return parseInt(t.split('/')[1].trim(), 10)
  }
  const plannedSize = await readTotal()
  let maxSize = plannedSize
  for (let i = 0; i < 16; i++) {
    if (await page.getByText('这组练完了').isVisible().catch(() => false)) break
    maxSize = Math.max(maxSize, await readTotal())
    const outcome = await answerCurrentCard(page)
    if (outcome === 'extra') continue
    if (!outcome) break
  }
  // 学习阶段的卡会被塞回本组,所以实际出现的张数必然多于计划的张数。
  // (重复出现时会换成变式场景,所以不能按文字比对)
  // 学习阶段的卡会被塞回本组,所以这一组的总张数会在过程中变多
  ok(`round grows so new cards come back in the same session (planned ${plannedSize}, grew to ${maxSize})`,
     maxSize > plannedSize)
}
await page.getByRole('button', { name: '今天就到这' }).click()
await page.waitForTimeout(500)

// --- Variant review: seeing a card a second time must change the scenario ---
const variantInfo = await page.evaluate(async () => {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('chunk')
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
  const read = db.transaction('cards', 'readonly').objectStore('cards')
  const all = await new Promise(res => {
    const r = read.getAll()
    r.onsuccess = () => res(r.result)
  })
  const target = all.find(c => c.type === 'produce' && c.variants && c.variants.length)
  // 假装这张卡已经复习过一次并且今天到期,下一轮必定先出它
  const tx = db.transaction('cards', 'readwrite')
  tx.objectStore('cards').put({ ...target, state: 'review', reps: 1, interval: 1, due: 1 })
  await new Promise(res => { tx.oncomplete = res })
  return { basePrompt: target.prompt, variantPrompt: target.variants[0].prompt }
})

await page.getByRole('button', { name: /今天/ }).first().click()
await page.waitForTimeout(400)
await page.getByText('再来一组', { exact: true }).click()
await page.waitForTimeout(900)
const shownPrompt = await page
  .locator('p.text-\\[20px\\], p.text-\\[17px\\]')
  .first().innerText().catch(() => '')
ok('second sighting shows the variant scenario, not the original',
   shownPrompt.trim() === variantInfo.variantPrompt.trim() && shownPrompt.trim() !== variantInfo.basePrompt.trim())
ok('variant badge explains the switch', await page.getByText('换个场合').isVisible().catch(() => false))
await page.screenshot({ path: `${shots}/13-variant.png` })
await page.getByText('✕ 退出').click()
await page.waitForTimeout(500)

// --- Cloze grading: the whole point of the new format ---
{
  // 让一张有关键词组的 produce 卡成为下一组的第一张
  const target = await page.evaluate(async () => {
    const db = await new Promise(res => { const r = indexedDB.open('chunk'); r.onsuccess = () => res(r.result) })
    const all = await new Promise(res => { const r = db.transaction('cards','readonly').objectStore('cards').getAll(); r.onsuccess = () => res(r.result) })
    const c = all.find(x => x.type === 'produce' && x.chunk && x.answer && x.answer.includes(x.chunk))
    const tx = db.transaction('cards','readwrite')
    for (const x of all) if (x.id !== c.id) tx.objectStore('cards').put({ ...x, state: 'review', due: Date.now() + 30 * 86400000 })
    tx.objectStore('cards').put({ ...c, state: 'review', reps: 0, interval: 1, due: 1 })
    await new Promise(res => { tx.oncomplete = res })
    return { chunk: c.chunk }
  })

  await page.getByRole('button', { name: /今天/ }).first().click()
  await page.waitForTimeout(400)
  await page.getByText('再来一组', { exact: true }).click()
  await page.waitForTimeout(900)

  const input = page.getByPlaceholder('填上缺的那几个词')
  ok('cloze card is shown with a gap to fill', await input.isVisible().catch(() => false))

  // 先故意答错
  await input.fill('definitely not the answer')
  await page.getByRole('button', { name: '对答案' }).click()
  await page.waitForTimeout(400)
  ok('wrong answer is rejected, card stays open',
     (await input.isVisible().catch(() => false)) &&
     !(await page.getByRole('button', { name: '顺', exact: true }).isVisible().catch(() => false)))
  await page.screenshot({ path: `${shots}/15-cloze-wrong.png` })

  // 再用大小写和标点都不同的正确答案,应该照样判对
  await input.fill(target.chunk.toUpperCase() + '.')
  await page.getByRole('button', { name: '对答案' }).click()
  await page.waitForTimeout(900)
  ok('correct answer accepted despite case and punctuation',
     await page.getByRole('button', { name: '顺', exact: true }).isVisible().catch(() => false))
  ok('explanation is revealed after answering',
     await page.getByText('不自然').isVisible().catch(() => false))
  await page.screenshot({ path: `${shots}/16-cloze-right.png` })
  await page.getByRole('button', { name: '顺', exact: true }).click()
  await page.waitForTimeout(400)
  await page.getByText('✕ 退出').click()
  await page.waitForTimeout(400)
}

// --- Reload: persistence check ---
await page.reload()
await page.waitForTimeout(1200)
ok('after reload still today-done (IndexedDB persisted)', await page.getByText('今天已完成').isVisible().catch(() => false))

console.log(fails.length ? `\n${fails.length} FAILURES: ${fails.join('; ')}` : '\nALL CHECKS PASSED')
await browser.close()
process.exit(fails.length ? 1 : 0)
