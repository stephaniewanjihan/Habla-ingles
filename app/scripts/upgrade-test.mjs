// 验证"重新部署不会丢学习进度":
// 用旧版 app 产生真实进度 → 换成新版构建 → 刷新 → 检查进度是否原封不动。
import { chromium } from 'playwright'
import { execSync } from 'node:child_process'

const BASE = 'http://localhost:4173/Habla-ingles/'
const fails = []
const ok = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`); if (!cond) fails.push(name) }

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
page.on('pageerror', e => fails.push('pageerror: ' + e.message))

const snapshot = () => page.evaluate(async () => {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('chunk'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
  })
  const getAll = store => new Promise(res => {
    const r = db.transaction(store, 'readonly').objectStore(store).getAll(); r.onsuccess = () => res(r.result)
  })
  const cards = await getAll('cards')
  const reviewed = cards.filter(c => c.reps > 0)
    .map(c => `${c.id}:reps=${c.reps}:int=${Math.round(c.interval * 1000)}`).sort()
  return {
    reviewed,
    inbox: (await getAll('inbox')).map(i => i.text).sort(),
    meta: JSON.stringify(await getAll('meta')),
    used: cards.filter(c => c.usedAt != null).map(c => c.id).sort(),
    flagged: cards.filter(c => c.flags?.length).map(c => `${c.id}:${c.flags.join()}`).sort(),
  }
})

// --- 1. 用"旧版"产生真实学习进度 ---
await page.goto(BASE)
await page.waitForTimeout(1500)
await page.getByText('三秒记下来').click()
await page.waitForTimeout(300)
await page.locator('textarea').fill('升级测试:这条笔记必须活过一次重新部署')
await page.getByRole('button', { name: '存下', exact: true }).click()
await page.waitForTimeout(800)

await page.getByText('开始今天的一组').click()
await page.waitForTimeout(800)
for (let i = 0; i < 12; i++) {
  if (await page.getByText('这组练完了').isVisible().catch(() => false)) break
  const flip = page.getByRole('button', { name: '翻面' })
  const read = page.getByRole('button', { name: '读完了' })
  const cont = page.getByRole('button', { name: '继续', exact: true })
  if (await flip.isVisible().catch(() => false)) {
    await flip.click(); await page.waitForTimeout(250)
    await page.getByText('这句我用上了(邮件 / 会上)').click().catch(() => {})
    await page.getByRole('button', { name: '太难' }).click().catch(() => {})
    await page.waitForTimeout(200)
    await page.getByRole('button', { name: '顺', exact: true }).click()
  } else if (await read.isVisible().catch(() => false)) { await read.click() }
  else if (await cont.isVisible().catch(() => false)) { await cont.click() }
  else {
    await page.locator('button.w-full.p-4.text-left').first().click()
    await page.waitForTimeout(300)
    await page.getByRole('button', { name: '顺', exact: true }).click()
  }
  await page.waitForTimeout(250)
}
await page.getByRole('button', { name: '今天就到这' }).click()
await page.waitForTimeout(600)

const before = await snapshot()
ok(`旧版产生了真实进度(复习 ${before.reviewed.length} 张)`, before.reviewed.length >= 3)
ok('笔记已存下', before.inbox.some(t => t.includes('升级测试')))

// --- 2. 改代码并重新构建,模拟我发布新版本 ---
console.log('\n>>> 模拟发布新版本:改动源码并重新构建…')
const marker = 'src/components/Home.tsx'
const fs = await import('node:fs')
const orig = fs.readFileSync(marker, 'utf8')
fs.writeFileSync(marker, orig.replace('记一笔</span>', '记一笔(新版)</span>'))
execSync('npm run build', { stdio: 'pipe' })
fs.writeFileSync(marker, orig)

// --- 3. 用户重新打开 app ---
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(2000)
await page.reload({ waitUntil: 'networkidle' })  // service worker 接管后的第二次加载
await page.waitForTimeout(2000)

const newVersionLive = await page.getByText('记一笔(新版)').isVisible().catch(() => false)
ok('新版代码确实生效了(说明这是一次真实的升级)', newVersionLive)

const after = await snapshot()
ok('复习进度完全没变', JSON.stringify(after.reviewed) === JSON.stringify(before.reviewed))
ok('打卡记录 / 连续天数完全没变', after.meta === before.meta)
ok('收集箱笔记还在', JSON.stringify(after.inbox) === JSON.stringify(before.inbox))
ok('"用上了"标记还在', JSON.stringify(after.used) === JSON.stringify(before.used))
ok('卡片反馈标记还在', JSON.stringify(after.flagged) === JSON.stringify(before.flagged))

console.log(fails.length ? `\n${fails.length} FAILURES: ${fails.join('; ')}` : '\n升级安全:所有学习数据在重新部署后完好无损')
await browser.close()
process.exit(fails.length ? 1 : 0)
