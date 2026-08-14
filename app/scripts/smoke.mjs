import { chromium } from 'playwright'

const BASE = 'http://localhost:4173/Habla-ingles/'
const shots = '/tmp/claude-0/-home-user-Habla-ingles/3e754a22-9d07-56b8-b170-7b43c4a72bcc/scratchpad'
const fails = []
const ok = (name, cond) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`)
  if (!cond) fails.push(name)
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
ok('home shows jot button', await page.getByText('记一笔(刚才卡住了?)').isVisible().catch(() => false))
await page.screenshot({ path: `${shots}/1-home.png` })

// --- Jot a note ---
await page.getByText('记一笔(刚才卡住了?)').click()
await page.waitForTimeout(300)
await page.locator('textarea').fill('想跟同事说数据对不上但不想显得在指责')
await page.getByRole('button', { name: '存下' }).click()
await page.waitForTimeout(900)
ok('jot modal closed', !(await page.locator('textarea').isVisible().catch(() => false)))

// --- New motivation UI on home ---
ok('week dots rendered', (await page.locator('div.flex.h-8.w-8').count()) === 7)
ok('used counter tile', await page.getByText('真实用过').isVisible().catch(() => false))
ok('one-card shortcut offered', await page.getByText('今天只有一分钟?来一张就算数').isVisible().catch(() => false))

// --- One-card mode counts as a check-in ---
await page.getByText('今天只有一分钟?来一张就算数').click()
await page.waitForTimeout(800)
ok('one-card round shows 1 / 1', await page.getByText('1 / 1').isVisible().catch(() => false))
{
  const flip = page.getByRole('button', { name: '翻面' })
  if (await flip.isVisible().catch(() => false)) {
    await flip.click()
    await page.waitForTimeout(300)
    ok('used button present', await page.getByText('这句我在工作里用过了').isVisible().catch(() => false))
    await page.getByText('这句我在工作里用过了').click()
    await page.waitForTimeout(250)
    ok('used button toggles to checked', await page.getByText('✓ 这句我在工作里用过了').isVisible().catch(() => false))
  } else {
    const opts = page.locator('button.w-full.rounded-xl.border.p-4')
    await opts.first().click()
    await page.waitForTimeout(400)
  }
  await page.getByRole('button', { name: '顺', exact: true }).click()
  await page.waitForTimeout(600)
}
ok('one-card round finished', await page.getByText('这组练完了').isVisible().catch(() => false))
ok('repeat label says 再来一张', await page.getByText('再来一张?').isVisible().catch(() => false))
await page.screenshot({ path: `${shots}/10-one-card-finish.png` })
await page.getByRole('button', { name: '今天就到这' }).click()
await page.waitForTimeout(600)
ok('one card counted as today done', await page.getByText('今天已完成 ✓').isVisible().catch(() => false))
{
  const usedTile = page.locator('div.rounded-2xl', { hasText: '真实用过' }).first()
  const usedVal = (await usedTile.locator('p').first().innerText().catch(() => '?')).trim()
  ok(`used counter incremented (got ${usedVal})`, usedVal === '1')
}
await page.screenshot({ path: `${shots}/11-home-with-progress.png` })

// --- Session: run one full round ---
await page.getByText('再来一组', { exact: true }).click()
await page.waitForTimeout(800)
await page.screenshot({ path: `${shots}/2-session-first-card.png` })

let steps = 0
let ratedCards = 0
let sawTypes = new Set()
while (steps < 20) {
  steps++
  if (await page.getByText('这组练完了').isVisible().catch(() => false)) break
  const flip = page.getByRole('button', { name: '翻面' })
  const readDone = page.getByRole('button', { name: '读完了' })
  const cont = page.getByRole('button', { name: '继续', exact: true })
  const goodBtn = page.getByRole('button', { name: '顺', exact: true })

  if (await flip.isVisible().catch(() => false)) {
    await flip.click()
    await page.waitForTimeout(300)
    if (ratedCards === 0) await page.screenshot({ path: `${shots}/3-card-back.png` })
    // toggle a feedback flag once to test persistence
    if (ratedCards === 0) {
      await page.getByRole('button', { name: '太简单' }).click()
      await page.waitForTimeout(200)
    }
    await goodBtn.click()
    ratedCards++
    sawTypes.add('produce-or-register')
  } else if (await goodBtn.isVisible().catch(() => false)) {
    await goodBtn.click()
    ratedCards++
  } else if (await readDone.isVisible().catch(() => false)) {
    sawTypes.add('note')
    await readDone.click()
  } else if (await cont.isVisible().catch(() => false)) {
    sawTypes.add('listen')
    await cont.click()
  } else {
    // pick card: click first option button in the option area
    const opts = page.locator('button.w-full.rounded-xl.border.p-4')
    const n = await opts.count()
    if (n > 0) {
      sawTypes.add('pick')
      await opts.first().click()
      await page.waitForTimeout(400)
      await page.screenshot({ path: `${shots}/4-pick-revealed.png` })
      // after reveal, rating buttons appear
      await page.getByRole('button', { name: '顺', exact: true }).click()
      ratedCards++
    } else {
      console.log('STUCK: no known button found at step', steps)
      await page.screenshot({ path: `${shots}/stuck-${steps}.png` })
      fails.push('stuck in session')
      break
    }
  }
  await page.waitForTimeout(300)
}
ok('session reached finish page', await page.getByText('这组练完了').isVisible().catch(() => false))
ok(`rated some cards (${ratedCards})`, ratedCards >= 3)
await page.screenshot({ path: `${shots}/5-finish.png` })
ok('finish shows good list', await page.getByText('能直接说出口').isVisible().catch(() => false))
ok('finish has another-round button', await page.getByText('再来一组?').isVisible().catch(() => false))

// --- Exit, check home updated ---
await page.getByRole('button', { name: '今天就到这' }).click()
await page.waitForTimeout(600)
ok('home shows today done', await page.getByText('今天已完成 ✓').isVisible().catch(() => false))
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

// --- Reload: persistence check ---
await page.reload()
await page.waitForTimeout(1200)
ok('after reload still today-done (IndexedDB persisted)', await page.getByText('今天已完成 ✓').isVisible().catch(() => false))

console.log(fails.length ? `\n${fails.length} FAILURES: ${fails.join('; ')}` : '\nALL CHECKS PASSED')
await browser.close()
process.exit(fails.length ? 1 : 0)
