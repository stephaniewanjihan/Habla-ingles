import { chromium } from 'playwright'
const dir = '/tmp/claude-0/-home-user-Habla-ingles/3e754a22-9d07-56b8-b170-7b43c4a72bcc/scratchpad/icon'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
for (const [size, out] of [[512, 'pwa-512.png'], [192, 'pwa-192.png'], [180, 'apple-touch-icon.png']]) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
  await page.goto('file://' + dir + '/icon.html')
  await page.evaluate(s => { const el = document.getElementById('icon'); el.setAttribute('width', s); el.setAttribute('height', s) }, size)
  await page.waitForTimeout(150)
  await page.locator('#icon').screenshot({ path: `${dir}/${out}`, omitBackground: false })
  console.log(out, size)
  await page.close()
}
await browser.close()
