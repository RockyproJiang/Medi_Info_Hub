// E2E：验证用户数据层全链路走 MySQL（yinling_ark 库）
const B = 'http://127.0.0.1:8787'
let pass = 0
let failn = 0
function check(name, cond, extra = '') {
  if (cond) {
    pass++
    console.log(`PASS ${name}`)
  } else {
    failn++
    console.log(`FAIL ${name} ${extra}`)
  }
}
async function req(method, path, { token, body } = {}) {
  const r = await fetch(B + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  let data = null
  try {
    data = await r.json()
  } catch {}
  return { status: r.status, data }
}

// 取一个真实存在的政策 id 做收藏测试
const polRes = await fetch(B + '/api/policies?limit=1')
const polJson = await polRes.json()
const PID = polJson?.data?.items?.[0]?.id

const uname = 'mysql_user_' + Date.now().toString(36)
const pwd = 'Test@2026'

// 1 注册
const reg = await req('POST', '/api/auth/register', { body: { username: uname, password: pwd, displayName: 'MySQL测试用户' } })
check('register 200', reg.status === 200 && reg.data?.ok, JSON.stringify(reg.data))
const token = reg.data?.data?.token
const uid = reg.data?.data?.user?.id
check('register returns token+id', !!token && uid > 0)

// 2 重复注册被拒
const dup = await req('POST', '/api/auth/register', { body: { username: uname, password: pwd } })
check('dup register 409', dup.status === 409)

// 3 登录
const login = await req('POST', '/api/auth/login', { body: { username: uname, password: pwd } })
check('login 200', login.status === 200 && login.data?.data?.token)

// 4 错误密码 401
const bad = await req('POST', '/api/auth/login', { body: { username: uname, password: 'wrong!' } })
check('bad password 401', bad.status === 401)

// 5 me
const me = await req('GET', '/api/auth/me', { token })
check('me 200 + profile', me.status === 200 && me.data?.data?.user?.username === uname && !!me.data?.data?.profile)

// 6 更新档案
const prof = await req('PUT', '/api/auth/profile', {
  token,
  body: { displayName: '老张', phone: '13800000000', gender: '男', birthMonth: '1970-03', city: '杭州', monthlyIncome: 15000, monthlyExpense: 9000 },
})
check('profile update 200', prof.status === 200)
const me2 = await req('GET', '/api/auth/me', { token })
check('profile persisted (MySQL)', me2.data?.data?.user?.display_name === '老张' && me2.data?.data?.profile?.city === '杭州')

// 7 缺口测算写记录
const gap = await req('POST', '/api/calc/gap', { token, body: { currentAge: 45, retireAge: 62, monthlySaving: 3000 } })
check('calc/gap 200', gap.status === 200 && typeof gap.data?.data?.gap === 'number')

// 8 家庭测算写记录
const hh = await req('POST', '/api/calc/household', {
  token,
  body: {
    members: [
      { name: '父亲', currentAge: 55, currentMonthlyExpense: 6000 },
      { name: '母亲', currentAge: 52, currentMonthlyExpense: 5000 },
    ],
    inflation: 0.025,
    returnRate: 0.035,
  },
})
check('calc/household 200', hh.status === 200 && typeof hh.data?.data?.household?.gap === 'number')

// 9 records 两条
const recs = await req('GET', '/api/records', { token })
check('records has gap+household', recs.status === 200 && recs.data?.data?.length >= 2)

// 10 收藏真实政策
const fav = await req('POST', '/api/favorites', { token, body: { itemType: 'policy', itemId: PID } })
check('favorite toggle on', fav.status === 200 && fav.data?.data?.favorited === true)
const favs = await req('GET', '/api/favorites', { token })
check('favorites enriched title', favs.data?.data?.length === 1 && !!favs.data?.data?.[0]?.title, JSON.stringify(favs.data?.data))
const unfav = await req('POST', '/api/favorites', { token, body: { itemType: 'policy', itemId: PID } })
check('favorite toggle off', unfav.data?.data?.favorited === false)

// 11 风险测评
const risk = await req('POST', '/api/risk/submit', { token, body: { answers: [0, 2, 1, 1, 2, 2, 1, 1] } })
check('risk submit 200 + level', risk.status === 200 && !!risk.data?.data?.level)
const riskLatest = await req('GET', '/api/risk/latest', { token })
check('risk latest persists', riskLatest.status === 200 && riskLatest.data?.data?.level === risk.data?.data?.level)

// 12 笔记 CRUD
const note = await req('POST', '/api/notes', { token, body: { title: '养老笔记', content: '每月定投 2000 元，坚持 20 年。' } })
check('note create 200', note.status === 200 && note.data?.data?.id > 0)
const nid = note.data?.data?.id
const noteUp = await req('PUT', `/api/notes/${nid}`, { token, body: { title: '养老笔记（改）', content: '改：每月定投 2500 元。' } })
check('note update 200', noteUp.status === 200 && noteUp.data?.data?.content.includes('2500'))
const notes = await req('GET', '/api/notes', { token })
check('notes list 1', notes.data?.data?.length === 1)

// 13 AI 会话（SSE）——只断言 meta/done 事件
const sse = await fetch(B + '/api/ai/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ question: '个人养老金账户每年最多缴多少？' }),
})
const sseText = await sse.text()
check('ai chat SSE has meta+done', sseText.includes('event: meta') && sseText.includes('event: done'))
const convs = await req('GET', '/api/ai/conversations', { token })
check('ai conversation persisted', convs.data?.data?.length >= 1)
const cid = convs.data?.data?.[0]?.id
const convDetail = await req('GET', `/api/ai/conversations/${cid}`, { token })
check('ai messages persisted (user+assistant)', convDetail.data?.data?.messages?.length >= 2)

// 14 admin overview（MySQL 计数）
const adminLogin = await req('POST', '/api/auth/login', { body: { username: 'admin', password: 'Admin@2025' } })
check('admin login 200', adminLogin.status === 200)
const overview = await req('GET', '/api/admin/overview', { token: adminLogin.data?.data?.token })
check('admin overview counts users>=3', overview.status === 200 && overview.data?.data?.counts?.users >= 3, JSON.stringify(overview.data?.data?.counts))

// 15 清理：删除测试用户（级联删除 MySQL 数据）
const del = await req('DELETE', `/api/admin/users/${uid}`, { token: adminLogin.data?.data?.token })
check('admin delete test user', del.status === 200)

console.log(`\n== ${pass} PASS, ${failn} FAIL ==`)
process.exit(failn ? 1 : 0)
