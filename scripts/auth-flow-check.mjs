// 验证：注册流程、未登录访问家庭规划、退出后再登录
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const BASE = process.env.BASE || 'http://127.0.0.1:8787'
const PORT = 9335
const userDir = mkdtempSync(join(tmpdir(), 'reg-'))
const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${userDir}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1440,950', 'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getWs() {
  for (let i = 0; i < 40; i++) {
    try { const j = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl } catch {}
    await sleep(250)
  }
  throw new Error('chrome not ready')
}
const ws = new WebSocket(await getWs())
await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
let id = 0; const pending = new Map()
ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result) } })
const send = (method, params = {}, sid) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params, sessionId: sid })); setTimeout(() => { if (pending.has(i)) { pending.delete(i); reject(new Error('timeout ' + method)) } }, 20000) })

const { targetInfos } = await send('Target.getTargets')
const page = targetInfos.find((t) => t.type === 'page')
const { sessionId } = await send('Target.attachToTarget', { targetId: page.targetId, flatten: true })
await send('Page.enable', {}, sessionId)
await send('Runtime.enable', {}, sessionId)

const errs = []
// 监听异常
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data)
  if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text)
})

const out = []
let failed = 0
const check = (n, c, e = '') => { if (c) out.push(`PASS ${n}${e ? ' :: ' + e : ''}`); else { failed++; out.push(`FAIL ${n}${e ? ' :: ' + e : ''}`) } }

async function goto(p, wait = 2000) { await send('Page.navigate', { url: BASE + p }, sessionId); await sleep(wait) }
async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: `(() => { ${expr} })()`, returnByValue: true, awaitPromise: true }, sessionId)
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text)
  return r.result.value
}

try {
  // 1. 未登录访问家庭规划：应能看到页面（不再被重定向死循环）
  await goto('/family', 2600)
  check('未登录访问 /family 不重定向', String(await ev('return location.pathname')) === '/family')
  const famText = String(await ev('return document.body.innerText'))
  check('未登录也能看到家庭规划内容', famText.includes('家庭养老规划'), `${famText.length}字`)

  // 2. 注册新用户（真实 UI 操作）
  const uname = 'ui_' + Date.now().toString().slice(-7)
  await goto('/account?register=1', 2200)
  check('注册标签页默认激活', String(await ev('return document.body.innerText')).includes('创建账户'))

  const filled = await ev(`
    const set = (el, v) => { const d = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value'); d.set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }
    const i = document.querySelectorAll('form.auth-form input')
    if (i.length < 4) return -1
    set(i[0], '${uname}'); set(i[1], '测试用户'); set(i[2], 'Test@1234'); set(i[3], 'Test@1234')
    return i.length
  `)
  check('注册表单有 4 个输入框', filled === 4, String(filled))

  await ev(`document.querySelector('form.auth-form button[type=submit]').click(); return 1`)
  await sleep(3000)

  const body = String(await ev('return document.body.innerText'))
  const token = String(await ev('return localStorage.getItem("yl_token") || ""'))
  check('注册成功并写入 localStorage', token.length > 20, `token=${token.slice(0, 12)}…`)
  check('注册后界面切换到账户面板', body.includes('个人档案') || body.includes('测算记录'), body.slice(0, 60).replace(/\n/g, ' '))

  // 3. 登录后家庭规划可保存
  await goto('/family', 2600)
  const famLogged = String(await ev('return document.body.innerText'))
  check('登录后家庭规划正常', famLogged.includes('家庭养老规划'))
  const saveBtn = Number(await ev(`return [...document.querySelectorAll('button')].filter(b => b.innerText.includes('保存')).length`))
  check('家庭规划有保存按钮', saveBtn >= 1, String(saveBtn))

  // 4. 退出登录
  await goto('/account', 2000)
  await ev(`[...document.querySelectorAll('button, a')].filter(e => e.innerText.trim() === '退出').forEach(e => e.click()); return 1`)
  await sleep(1800)
  check('退出后 token 已清除', String(await ev('return localStorage.getItem("yl_token") || ""')) === '')
  check('退出后回到登录页', String(await ev('return location.pathname')) === '/')

  check('全程无未捕获异常', errs.length === 0, errs.slice(0, 2).join(' | '))
} catch (e) {
  failed++
  out.push('FATAL ' + e.message)
} finally {
  try { ws.close() } catch {}
  try { proc.kill() } catch {}
  await sleep(400)
  try { rmSync(userDir, { recursive: true, force: true }) } catch {}
}
console.log(out.join('\n'))
console.log(failed === 0 ? '\nAUTH FLOW: ALL PASS' : `\nAUTH FLOW: ${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
