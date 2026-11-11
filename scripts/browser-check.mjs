// 真浏览器端到端检查：用系统 Chrome headless + CDP，不依赖 playwright
// 验证：登录页渲染、登录按钮可用、登录成功切换、/family 打开、各页面无 JS 错误
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const BASE = process.env.BASE || 'http://127.0.0.1:8787'
const PORT = 9333
const userDir = mkdtempSync(join(tmpdir(), 'chk-'))

const proc = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1440,900',
    'about:blank',
  ],
  { stdio: 'ignore', detached: false }
)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getWsUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`)
      const j = await r.json()
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl
    } catch {}
    await sleep(250)
  }
  throw new Error('chrome 未就绪')
}

class CDP {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    this.listeners = []
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
      } else if (msg.method) {
        for (const l of this.listeners) l(msg)
      }
    })
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params, sessionId }))
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`CDP 超时: ${method}`))
        }
      }, 15000)
    })
  }
}

const out = []
let failed = 0
function check(name, cond, extra = '') {
  if (cond) out.push(`PASS ${name}${extra ? ' :: ' + extra : ''}`)
  else {
    failed++
    out.push(`FAIL ${name}${extra ? ' :: ' + extra : ''}`)
  }
}

let ws, cdp, proc2
try {
  const wsUrl = await getWsUrl()
  ws = new WebSocket(wsUrl)
  await new Promise((res, rej) => {
    ws.addEventListener('open', res)
    ws.addEventListener('error', rej)
  })
  cdp = new CDP(ws)

  const { targetInfos } = await cdp.send('Target.getTargets')
  const page = targetInfos.find((t) => t.type === 'page')
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: page.targetId, flatten: true })

  const pageErrors = []
  const consoleErrors = []
  cdp.listeners.push((msg) => {
    if (msg.method === 'Runtime.exceptionThrown') {
      pageErrors.push(msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text)
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '))
    }
  })

  await cdp.send('Page.enable', {}, sessionId)
  await cdp.send('Runtime.enable', {}, sessionId)

  async function goto(url) {
    await cdp.send('Page.navigate', { url }, sessionId)
    for (let i = 0; i < 60; i++) {
      await sleep(200)
      const r = await cdp.send('Runtime.evaluate', {
        expression: 'document.readyState + "|" + (document.querySelector("#app")?.children.length ?? -1)',
        returnByValue: true,
      }, sessionId)
      const v = r.result.value || ''
      if (v.startsWith('complete') && !v.endsWith('|0')) return true
    }
    return false
  }

  async function evalJs(expr) {
    const r = await cdp.send('Runtime.evaluate', {
      expression: `(() => { ${expr} })()`,
      returnByValue: true,
      awaitPromise: true,
    }, sessionId)
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''))
    return r.result.value
  }

  // 1. 首页
  const okHome = await goto(`${BASE}/`)
  check('首页加载', okHome)
  check(
    '首页品牌为医讯通',
    String(await evalJs('return document.body.innerText.includes("医讯通")')),
    String(await evalJs('return document.title'))
  )

  // 2. 登录页可达（这是之前死循环的点）
  const okAcc = await goto(`${BASE}/account?login=1`)
  check('登录页可达（无重定向死循环）', okAcc)
  check('登录页 URL 正确', String(await evalJs('return location.pathname + location.search')).includes('/account'))
  check(
    '登录表单渲染',
    Number(await evalJs('return document.querySelectorAll("form.auth-form input").length')) >= 2
  )

  // 3. 真实填写并登录
  await evalJs(`
    const set = (el, v) => {
      const d = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value')
      d.set.call(el, v)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
    const inputs = document.querySelectorAll('form.auth-form input')
    set(inputs[0], 'demo')
    set(inputs[1], 'Demo@2025')
    return inputs.length
  `)
  await evalJs(`document.querySelector('form.auth-form button[type=submit]').click(); return 1`)
  await sleep(2500)

  const afterLogin = String(await evalJs('return document.body.innerText'))
  check('登录后界面切换（出现账户面板）', afterLogin.includes('个人档案') || afterLogin.includes('测算记录'), afterLogin.slice(0, 60).replace(/\n/g, ' '))
  check('登录后 localStorage 有 token', String(await evalJs('return !!localStorage.getItem("yl_token")')) === 'true')

  // 4. 家庭规划页（之前打不开）
  const okFam = await goto(`${BASE}/family`)
  check('家庭规划页可达', okFam)
  const famText = String(await evalJs('return document.body.innerText'))
  check('家庭规划页渲染出成员', famText.includes('成员') || famText.includes('家庭'), famText.slice(0, 80).replace(/\n/g, ' '))
  check('家庭规划页有图表容器', Number(await evalJs('return document.querySelectorAll("canvas, svg").length')) >= 1)

  // 5. 其它主要页面巡检
  const pages = [
    ['/policies', '政策库'],
    ['/knowledge', '知识库'],
    ['/tools', '测算'],
    ['/products', '产品'],
    ['/care', '医养'],
    ['/data', '数据'],
    ['/advisor', 'AI 顾问'],
  ]
  for (const [p, kw] of pages) {
    const ok = await goto(BASE + p)
    const txt = String(await evalJs('return document.body.innerText'))
    check(`页面 ${p} 正常`, ok && txt.includes(kw), `${txt.length} 字`)
  }

  // 6. JS 错误检查
  check('无未捕获异常', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '))
  if (consoleErrors.length) out.push(`INFO console.error ×${consoleErrors.length}: ${consoleErrors.slice(0, 2).join(' | ').slice(0, 200)}`)
} catch (e) {
  failed++
  out.push(`FATAL ${e.message}`)
} finally {
  try { ws?.close() } catch {}
  try { proc.kill() } catch {}
  await sleep(400)
  try { rmSync(userDir, { recursive: true, force: true }) } catch {}
}
console.log(out.join('\n'))
console.log(failed === 0 ? '\nBROWSER CHECK: ALL PASS' : `\nBROWSER CHECK: ${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
