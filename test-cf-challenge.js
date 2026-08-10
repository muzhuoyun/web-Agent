// 验证专注模式的 Cloudflare 挑战页处理：
// 1. 模拟挑战页 → 应出现「检测到人机验证页」日志且不屏蔽
// 2. 挑战特征消失（模拟验证通过/同页填充）→ 应继续「调 LLM 判断网站主题」
const http = require('http')
const puppeteer = require('puppeteer-core')
const fs = require('fs')
const os = require('os')
const path = require('path')

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
if (!fs.existsSync(CHROME)) CHROME = 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'
const EXT = path.resolve(__dirname, 'chrome-extension').replace(/\\/g, '/')
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-test-'))

// 模拟 CF 挑战页
const challengeHtml = `<!DOCTYPE html><html><head><title>Just a moment...</title></head>
<body><div class="cf-browser-verification"><h1>Just a moment...</h1>
<p>Checking your browser before accessing this site. Please enable JS and disable any ad blocker.</p>
<div id="challenge-running"></div></div></body></html>`
// 模拟验证通过后的同页内容（挑战特征消失）
const normalHtml = `<!DOCTYPE html><html><head><title>游戏攻略站</title></head>
<body><h1>我的世界攻略</h1><p>今天我们来聊一聊游戏里的隐藏彩蛋。</p></body></html>`

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.end(req.url === '/normal' ? normalHtml : challengeHtml)
})

;(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  const logs = []
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: false,
    ignoreDefaultArgs: ['--disable-extensions', '--disable-component-extensions-with-background-pages'],
    args: [`--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu']
  })
  const extId = await browser.installExtension(EXT)
  // 开启专注模式（写入插件配置）
  const cfgPage = await browser.newPage()
  await cfgPage.goto(`chrome-extension://${extId}/popup/index.html`, { waitUntil: 'networkidle0', timeout: 15000 })
  await cfgPage.evaluate(async () => {
    await chrome.storage.local.set({ 'plugin_cfg_adult-guard': { focusMode: true } })
  })
  await cfgPage.close()

  // 打开模拟挑战页
  const page = await browser.newPage()
  page.on('console', m => {
    const t = m.text()
    if (t.includes('[adult-guard][专注]')) logs.push(t.slice(0, 100))
  })
  await page.goto(`http://127.0.0.1:${port}/challenge`, { waitUntil: 'load', timeout: 15000 })
  // 等 content script 注入 + 500ms 触发判定
  await new Promise(r => setTimeout(r, 4000))
  const state1 = { logs: [...logs], bodyReplaced: await page.evaluate(() => !document.body.innerHTML.includes('challenge-running')) }
  console.log('── 挑战页阶段 ──')
  console.log('日志:', state1.logs.length ? state1.logs.join('\n     ') : '(无)')
  console.log('页面被屏蔽:', state1.bodyReplaced)

  // 模拟验证通过（同页内容变为正常页面）
  await page.evaluate(normalHtml => {
    document.open(); document.write(normalHtml); document.close()
  }, normalHtml)
  await new Promise(r => setTimeout(r, 4000))
  const state2 = { logs: [...logs] }
  console.log('── 验证通过后（同页填充）──')
  console.log('日志:', state2.logs.length ? state2.logs.join('\n     ') : '(无)')

  // 对照：直接打开正常页面（无挑战）
  const page2 = await browser.newPage()
  page2.on('console', m => {
    const t = m.text()
    if (t.includes('[adult-guard][专注]')) logs.push(t.slice(0, 100))
  })
  await page2.goto(`http://127.0.0.1:${port}/normal`, { waitUntil: 'load', timeout: 15000 })
  await new Promise(r => setTimeout(r, 4000))
  console.log('── 对照：无挑战页直接判定 ──')
  console.log('日志:', logs.slice(state2.logs.length).length ? logs.slice(state2.logs.length).join('\n     ') : '(无)')

  await browser.close()
  server.close()
})().catch(e => { console.error('FAIL:', e.message); process.exit(1) })
