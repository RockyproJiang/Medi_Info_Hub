import express from 'express'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

// 极简 .env 加载器：读取 server/.env，不覆盖已存在的环境变量
try {
  const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../.env')
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim()
    }
  }
} catch {
  /* 环境变量加载失败时使用默认值 */
}

import { db, parseJSON, rowToPolicy, rowToArticle, rowToProduct, rowToCareService, count } from './db.js'
import { query, queryOne, initMySQL, MYSQL_CONF } from './mysql.js'
import { hashPassword, verifyPassword, signToken, authMiddleware, requireUser, requireAdmin } from './auth.js'
import { seedAll } from './seed/run.js'
import { retrieve, streamChat, checkAI } from './ai.js'
import { registerResearchRoutes } from './research.js'
import {
  retirementAge,
  estimateBasicPension,
  calcGap,
  calcTaxSaving,
  futureValue,
  payoutMonths,
  TAX_BRACKETS,
  CATEGORY_OPTIONS,
  minimumContributionYears,
} from '../../shared/calc.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = Number(process.env.PORT || 8787)
const now = () => new Date().toISOString()

app.use(express.json({ limit: '2mb' }))
app.use(authMiddleware)

const ok = (res, data) => res.json({ ok: true, data })
const fail = (res, code, msg) => res.status(code).json({ ok: false, error: msg })

async function audit(userId, action, target, detail) {
  try {
    await query('INSERT INTO audit_logs (user_id,action,detail) VALUES (?,?,?)', [
      userId || null,
      action,
      detail ? JSON.stringify(detail) : '',
    ])
  } catch {
    /* 审计失败不影响主流程 */
  }
}

/* ================= 养老金融研究数据库（只读） ================= */
// 18 张调研表 + 分页浏览 + 只读 SQL 查询台，见 Web 端「调研数据库」页
registerResearchRoutes(app, ok, fail)

/* ================= 量化实验室 ================= */
// 数据由 analytics/run_all.py 生成（三套量化模型的离线结果），见 analytics/README.md。
// 文件缺失时返回 null，前端展示引导信息。
const ANALYTICS_FILE = path.join(__dirname, '../data/analytics_export.json')
let analyticsCache = null
app.get('/api/analytics', (req, res) => {
  try {
    if (!analyticsCache) analyticsCache = JSON.parse(fs.readFileSync(ANALYTICS_FILE, 'utf8'))
    ok(res, analyticsCache)
  } catch {
    ok(res, null)
  }
})

/* ================= 元信息 ================= */

app.get('/api/meta', (req, res) => {
  ok(res, {
    name: '医讯通',
    subtitle: '养老金融公共信息服务平台',
    version: '1.0.0',
    stats: {
      policies: count('policies'),
      articles: count('articles'),
      products: count('products'),
      glossary: count('glossary'),
      faqs: count('faqs'),
      careServices: count('care_services'),
    },
    categories: CATEGORY_OPTIONS,
    taxBrackets: TAX_BRACKETS,
  })
})

app.get('/api/health', async (req, res) => {
  const ai = req.query.ai === '1' ? await checkAI() : undefined
  ok(res, { status: 'up', time: now(), ai })
})

/* ================= 认证（MySQL） ================= */

app.post('/api/auth/register', async (req, res) => {
  const { username, password, displayName } = req.body || {}
  if (!username || !/^[a-zA-Z0-9_\u4e00-\u9fa5]{3,20}$/.test(username))
    return fail(res, 400, '用户名需为 3-20 位字母、数字、下划线或中文')
  if (!password || password.length < 6) return fail(res, 400, '密码至少 6 位')
  const exists = await queryOne('SELECT id FROM users WHERE username=?', [username])
  if (exists) return fail(res, 409, '该用户名已被注册')
  const info = await query('INSERT INTO users (username,password_hash,role,display_name) VALUES (?,?,?,?)', [
    username,
    hashPassword(password),
    'user',
    displayName || username,
  ])
  const uid = Number(info.insertId)
  await query('INSERT INTO profiles (user_id) VALUES (?)', [uid])
  const token = signToken({ uid, username, role: 'user' })
  audit(uid, 'register', username)
  ok(res, { token, user: { id: uid, username, role: 'user', displayName: displayName || username } })
})

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {}
  const u = await queryOne('SELECT * FROM users WHERE username=?', [username || ''])
  if (!u || !verifyPassword(password || '', u.password_hash)) return fail(res, 401, '用户名或密码不正确')
  await query('UPDATE users SET last_login_at=NOW() WHERE id=?', [u.id])
  const token = signToken({ uid: u.id, username: u.username, role: u.role })
  audit(u.id, 'login', u.username)
  ok(res, {
    token,
    user: { id: u.id, username: u.username, role: u.role, displayName: u.display_name },
  })
})

app.get('/api/auth/me', requireUser, async (req, res) => {
  const u = await queryOne('SELECT id,username,role,display_name,phone,created_at,last_login_at FROM users WHERE id=?', [
    req.user.id,
  ])
  if (!u) return fail(res, 404, '用户不存在')
  const profile = await queryOne('SELECT * FROM profiles WHERE user_id=?', [req.user.id])
  ok(res, { user: u, profile: profile || null })
})

app.put('/api/auth/profile', requireUser, async (req, res) => {
  const { displayName, phone, gender, birthMonth, jobType, monthlyIncome, monthlyExpense, expectedLife, riskLevel, city } =
    req.body || {}
  await query('UPDATE users SET display_name=?, phone=? WHERE id=?', [displayName || null, phone || null, req.user.id])
  const existing = await queryOne('SELECT user_id FROM profiles WHERE user_id=?', [req.user.id])
  if (existing) {
    await query(
      `UPDATE profiles SET gender=?,birth_month=?,job_type=?,monthly_income=?,monthly_expense=?,expected_life=?,risk_level=?,city=? WHERE user_id=?`,
      [gender, birthMonth, jobType, monthlyIncome, monthlyExpense, expectedLife, riskLevel, city, req.user.id],
    )
  } else {
    await query(
      `INSERT INTO profiles (user_id,gender,birth_month,job_type,monthly_income,monthly_expense,expected_life,risk_level,city) VALUES (?,?,?,?,?,?,?,?,?)`,
      [req.user.id, gender, birthMonth, jobType, monthlyIncome, monthlyExpense, expectedLife, riskLevel, city],
    )
  }
  audit(req.user.id, 'update_profile', 'self')
  ok(res, { updated: true })
})

app.post('/api/auth/password', requireUser, async (req, res) => {
  const { oldPassword, newPassword } = req.body || {}
  if (!newPassword || newPassword.length < 6) return fail(res, 400, '新密码至少 6 位')
  const u = await queryOne('SELECT password_hash FROM users WHERE id=?', [req.user.id])
  if (!verifyPassword(oldPassword || '', u.password_hash)) return fail(res, 400, '原密码不正确')
  await query('UPDATE users SET password_hash=? WHERE id=?', [hashPassword(newPassword), req.user.id])
  audit(req.user.id, 'change_password', 'self')
  ok(res, { updated: true })
})

/* ================= 政策 ================= */

app.get('/api/policies', (req, res) => {
  const { level, category, q, featured, limit = 50, offset = 0 } = req.query
  const where = []
  const params = []
  if (level) {
    where.push('level=?')
    params.push(level)
  }
  if (category) {
    where.push('category=?')
    params.push(category)
  }
  if (featured === '1') where.push('featured=1')
  if (q) {
    where.push('(title LIKE ? OR summary LIKE ? OR body LIKE ?)')
    const like = `%${q}%`
    params.push(like, like, like)
  }
  const sql = `SELECT * FROM policies ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY featured DESC, publish_date DESC LIMIT ? OFFSET ?`
  const rows = db.prepare(sql).all(...params, Number(limit), Number(offset))
  const total = db
    .prepare(`SELECT COUNT(*) c FROM policies ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`)
    .get(...params).c
  const levels = db.prepare('SELECT level, COUNT(*) c FROM policies GROUP BY level ORDER BY c DESC').all()
  const categories = db.prepare('SELECT category, COUNT(*) c FROM policies GROUP BY category ORDER BY c DESC').all()
  ok(res, { items: rows.map(rowToPolicy), total, levels, categories })
})

app.get('/api/policies/:slug', (req, res) => {
  const row = db.prepare('SELECT * FROM policies WHERE slug=?').get(req.params.slug)
  if (!row) return fail(res, 404, '政策不存在')
  const related = db
    .prepare('SELECT slug,title,summary,publish_date FROM policies WHERE category=? AND slug<>? LIMIT 3')
    .all(row.category, row.slug)
  ok(res, { item: rowToPolicy(row), related })
})

/* ================= 知识文章 ================= */

app.get('/api/articles', (req, res) => {
  const { category, q, featured, limit = 50, offset = 0 } = req.query
  const where = []
  const params = []
  if (category) {
    where.push('category=?')
    params.push(category)
  }
  if (featured === '1') where.push('featured=1')
  if (q) {
    where.push('(title LIKE ? OR summary LIKE ? OR body LIKE ?)')
    const like = `%${q}%`
    params.push(like, like, like)
  }
  const sql = `SELECT id,slug,title,category,summary,read_minutes,tags,source_name,featured FROM articles ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY featured DESC, id ASC LIMIT ? OFFSET ?`
  const rows = db.prepare(sql).all(...params, Number(limit), Number(offset))
  const total = db
    .prepare(`SELECT COUNT(*) c FROM articles ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`)
    .get(...params).c
  const categories = db.prepare('SELECT category, COUNT(*) c FROM articles GROUP BY category ORDER BY c DESC').all()
  ok(res, { items: rows.map(rowToArticle), total, categories })
})

app.get('/api/articles/:slug', (req, res) => {
  const row = db.prepare('SELECT * FROM articles WHERE slug=?').get(req.params.slug)
  if (!row) return fail(res, 404, '文章不存在')
  const related = db
    .prepare('SELECT slug,title,summary,category,read_minutes FROM articles WHERE category=? AND slug<>? LIMIT 3')
    .all(row.category, row.slug)
  ok(res, { item: rowToArticle(row), related })
})

/* ================= 产品 ================= */

app.get('/api/products', (req, res) => {
  const { category, risk, taxEligible, q, sort } = req.query
  const where = []
  const params = []
  if (category) {
    where.push('category=?')
    params.push(category)
  }
  if (risk) {
    where.push('risk_level=?')
    params.push(risk)
  }
  if (taxEligible === '1') where.push('tax_eligible=1')
  if (q) {
    where.push('(name LIKE ? OR issuer LIKE ? OR suitable_for LIKE ?)')
    const like = `%${q}%`
    params.push(like, like, like)
  }
  let order = 'category ASC, yield_high DESC'
  if (sort === 'yield') order = 'yield_high DESC'
  if (sort === 'risk') order = "CASE risk_level WHEN '极低' THEN 1 WHEN '低' THEN 2 WHEN '中低' THEN 3 WHEN '中' THEN 4 WHEN '中高' THEN 5 WHEN '高' THEN 6 ELSE 7 END"
  const rows = db
    .prepare(`SELECT * FROM products ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${order}`)
    .all(...params)
  const categories = db.prepare('SELECT category, COUNT(*) c FROM products GROUP BY category').all()
  const risks = db.prepare('SELECT risk_level, COUNT(*) c FROM products GROUP BY risk_level').all()
  ok(res, { items: rows.map(rowToProduct), total: rows.length, categories, risks })
})

app.get('/api/products/:slug', (req, res) => {
  const row = db.prepare('SELECT * FROM products WHERE slug=?').get(req.params.slug)
  if (!row) return fail(res, 404, '产品不存在')
  ok(res, { item: rowToProduct(row) })
})

/* ================= 医养服务参考 ================= */

app.get('/api/care-services', (req, res) => {
  const { serviceType, careLevel, cityTier, q } = req.query
  const where = []
  const params = []
  if (serviceType) {
    where.push('service_type=?')
    params.push(serviceType)
  }
  if (careLevel) {
    where.push('care_level LIKE ?')
    params.push(`%${careLevel}%`)
  }
  if (cityTier) {
    where.push('city_tier=?')
    params.push(cityTier)
  }
  if (q) {
    where.push('(name LIKE ? OR coverage LIKE ? OR notes LIKE ?)')
    const like = `%${q}%`
    params.push(like, like, like)
  }
  const rows = db
    .prepare(`SELECT * FROM care_services ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY monthly_cost_low ASC`)
    .all(...params)
  const types = db.prepare('SELECT service_type, COUNT(*) c FROM care_services GROUP BY service_type').all()
  ok(res, { items: rows.map(rowToCareService), types, total: rows.length })
})

/* ================= 家庭养老规划 ================= */

app.post('/api/calc/household', requireUser, async (req, res) => {
  const b = req.body || {}
  const members = Array.isArray(b.members) ? b.members.slice(0, 4) : []
  if (!members.length) return fail(res, 400, '请至少添加一位家庭成员')

  let totalGap = 0
  const results = members.map((m, idx) => {
    const r = calcGap({
      currentAge: Number(m.currentAge) || 40,
      retireAge: Number(m.retireAge) || 60,
      lifeExpectancy: Number(m.lifeExpectancy) || 85,
      currentMonthlyExpense: Number(m.currentMonthlyExpense) || 6000,
      expenseRatio: Number(m.expenseRatio) || 0.75,
      inflation: Number(b.inflation) || 0.025,
      pensionMonthly: Number(m.pensionMonthly) || 3000,
      currentSavings: Number(m.currentSavings) || 0,
      monthlySaving: Number(m.monthlySaving) || 0,
      returnRate: Number(b.returnRate) || 0.035,
      extraCareReserve: Number(m.extraCareReserve) || 200000,
    })
    totalGap += Math.max(0, r.gap)
    return { name: m.name || `成员${idx + 1}`, ...r }
  })

  // 家庭维度汇总：资产合并、支出按比例合并后重算
  const totalSavings = members.reduce((s, m) => s + (Number(m.currentSavings) || 0), 0)
  const totalMonthlySaving = members.reduce((s, m) => s + (Number(m.monthlySaving) || 0), 0)
  const household = calcGap({
    currentAge: Math.min(...members.map((m) => Number(m.currentAge) || 40)),
    retireAge: Math.max(...members.map((m) => Number(m.retireAge) || 60)),
    lifeExpectancy: Math.max(...members.map((m) => Number(m.lifeExpectancy) || 85)),
    currentMonthlyExpense: members.reduce((s, m) => s + (Number(m.currentMonthlyExpense) || 6000), 0) * 0.85,
    expenseRatio: 0.75,
    inflation: Number(b.inflation) || 0.025,
    pensionMonthly: members.reduce((s, m) => s + (Number(m.pensionMonthly) || 3000), 0) * 0.85,
    currentSavings: totalSavings,
    monthlySaving: totalMonthlySaving,
    returnRate: Number(b.returnRate) || 0.035,
    extraCareReserve: members.reduce((s, m) => s + (Number(m.extraCareReserve) || 200000), 0) * 0.7,
  })

  await query('INSERT INTO calc_records (user_id,calc_type,title,payload,result) VALUES (?,?,?,?,?)', [
    req.user.id,
    'household',
    '家庭养老规划',
    JSON.stringify({ members: members.length, inflation: b.inflation, returnRate: b.returnRate }),
    JSON.stringify({ totalGap, household }),
  ])
  audit(req.user.id, 'calc_household', `${members.length}人`)
  ok(res, { members: results, household, totalGap })
})

/* ================= 统计 / 术语 / 问答 ================= */

app.get('/api/stats', (req, res) => {
  const rows = db.prepare('SELECT * FROM stats').all()
  ok(res, rows.map((r) => ({ ...r, payload: parseJSON(r.payload, []) })))
})

app.get('/api/glossary', (req, res) => {
  const { q, category } = req.query
  const where = []
  const params = []
  if (q) {
    where.push('(term LIKE ? OR alias LIKE ? OR definition LIKE ?)')
    const like = `%${q}%`
    params.push(like, like, like)
  }
  if (category) {
    where.push('category=?')
    params.push(category)
  }
  const rows = db
    .prepare(`SELECT * FROM glossary ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY category, term`)
    .all(...params)
  const categories = db.prepare('SELECT category, COUNT(*) c FROM glossary GROUP BY category').all()
  ok(res, { items: rows, categories })
})

app.get('/api/faqs', (req, res) => {
  const { category, q } = req.query
  const where = []
  const params = []
  if (q) {
    where.push('(question LIKE ? OR answer LIKE ?)')
    const like = `%${q}%`
    params.push(like, like)
  }
  if (category) {
    where.push('category=?')
    params.push(category)
  }
  const rows = db
    .prepare(`SELECT * FROM faqs ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY sort ASC`)
    .all(...params)
  const categories = db.prepare('SELECT category, COUNT(*) c FROM faqs GROUP BY category ORDER BY c DESC').all()
  ok(res, { items: rows, categories })
})

/* ================= 计算 ================= */

app.get('/api/calc/meta', (req, res) => {
  ok(res, { categories: CATEGORY_OPTIONS, taxBrackets: TAX_BRACKETS })
})

app.post('/api/calc/retirement', (req, res) => {
  const { birthYear, birthMonth, category } = req.body || {}
  if (!birthYear || !birthMonth) return fail(res, 400, '请提供出生年月')
  ok(res, retirementAge(Number(birthYear), Number(birthMonth), category))
})

app.post('/api/calc/pension', (req, res) => {
  const b = req.body || {}
  const result = estimateBasicPension({
    avgWage: Number(b.avgWage) || 8000,
    years: Number(b.years) || 30,
    index: Number(b.index) || 0.8,
    accountBalance: Number(b.accountBalance) || 120000,
    age: Number(b.age) || 60,
    transitionYears: Number(b.transitionYears) || 0,
    transitionFactor: Number(b.transitionFactor) || 1.3,
  })
  ok(res, result)
})

app.post('/api/calc/gap', requireUser, async (req, res) => {
  const b = req.body || {}
  const result = calcGap({
    currentAge: Number(b.currentAge) || 40,
    retireAge: Number(b.retireAge) || 60,
    lifeExpectancy: Number(b.lifeExpectancy) || 85,
    currentMonthlyExpense: Number(b.currentMonthlyExpense) || 12000,
    expenseRatio: Number(b.expenseRatio) || 0.75,
    inflation: Number(b.inflation) || 0.025,
    pensionMonthly: Number(b.pensionMonthly) || 4000,
    currentSavings: Number(b.currentSavings) || 0,
    monthlySaving: Number(b.monthlySaving) || 0,
    returnRate: Number(b.returnRate) || 0.035,
    extraCareReserve: Number(b.extraCareReserve) || 300000,
  })
  await query('INSERT INTO calc_records (user_id,calc_type,title,payload,result) VALUES (?,?,?,?,?)', [
    req.user.id,
    'gap',
    '养老缺口测算',
    JSON.stringify(b),
    JSON.stringify(result),
  ])
  ok(res, result)
})

app.post('/api/calc/tax', (req, res) => {
  const { annualContribution, marginalRate } = req.body || {}
  ok(res, calcTaxSaving(Number(annualContribution) || 12000, Number(marginalRate) || 10))
})

app.post('/api/calc/future-value', (req, res) => {
  const b = req.body || {}
  ok(
    res,
    futureValue({
      principal: Number(b.principal) || 0,
      monthly: Number(b.monthly) || 0,
      years: Number(b.years) || 20,
      rate: Number(b.rate) || 0.04,
    }),
  )
})

/* ================= 收藏（MySQL） ================= */

app.get('/api/favorites', requireUser, async (req, res) => {
  const rows = await query('SELECT * FROM favorites WHERE user_id=? ORDER BY created_at DESC', [req.user.id])
  const enriched = rows.map((r) => {
    let title = ''
    let slug = ''
    if (r.item_type === 'policy') {
      const x = db.prepare('SELECT title,slug FROM policies WHERE id=?').get(r.item_id)
      title = x?.title || ''
      slug = x?.slug || ''
    } else if (r.item_type === 'article') {
      const x = db.prepare('SELECT title,slug FROM articles WHERE id=?').get(r.item_id)
      title = x?.title || ''
      slug = x?.slug || ''
    } else if (r.item_type === 'product') {
      const x = db.prepare('SELECT name,slug FROM products WHERE id=?').get(r.item_id)
      title = x?.name || ''
      slug = x?.slug || ''
    }
    return { ...r, title, slug }
  })
  ok(res, enriched)
})

app.post('/api/favorites', requireUser, async (req, res) => {
  const { itemType, itemId } = req.body || {}
  if (!['policy', 'article', 'product'].includes(itemType)) return fail(res, 400, '收藏类型不正确')
  const existing = await queryOne('SELECT id FROM favorites WHERE user_id=? AND item_type=? AND item_id=?', [
    req.user.id,
    itemType,
    Number(itemId),
  ])
  if (existing) {
    await query('DELETE FROM favorites WHERE id=?', [existing.id])
    return ok(res, { favorited: false })
  }
  await query('INSERT INTO favorites (user_id,item_type,item_id) VALUES (?,?,?)', [
    req.user.id,
    itemType,
    Number(itemId),
  ])
  ok(res, { favorited: true })
})

/* ================= 测算历史（MySQL） ================= */

app.get('/api/records', requireUser, async (req, res) => {
  const rows = await query('SELECT * FROM calc_records WHERE user_id=? ORDER BY created_at DESC LIMIT 30', [req.user.id])
  ok(res, rows.map((r) => ({ ...r, payload: parseJSON(r.payload, {}), result: parseJSON(r.result, {}) })))
})

app.delete('/api/records/:id', requireUser, async (req, res) => {
  await query('DELETE FROM calc_records WHERE id=? AND user_id=?', [Number(req.params.id), req.user.id])
  ok(res, { deleted: true })
})

/* ================= 风险测评 ================= */

const RISK_QUESTIONS = [
  {
    id: 'q1',
    text: '您的年龄区间是？',
    options: [
      { label: '55岁以下', score: 10 },
      { label: '55至65岁', score: 6 },
      { label: '65至75岁', score: 3 },
      { label: '75岁以上', score: 1 },
    ],
  },
  {
    id: 'q2',
    text: '您计划在多少年后开始动用这笔养老资金？',
    options: [
      { label: '5年以内', score: 1 },
      { label: '5至10年', score: 4 },
      { label: '10至20年', score: 8 },
      { label: '20年以上', score: 10 },
    ],
  },
  {
    id: 'q3',
    text: '这笔资金占您全部可动用资产的比例？',
    options: [
      { label: '30%以下', score: 10 },
      { label: '30%至50%', score: 7 },
      { label: '50%至70%', score: 4 },
      { label: '70%以上', score: 1 },
    ],
  },
  {
    id: 'q4',
    text: '如果投入的10万元在一年内变成8万元，您会？',
    options: [
      { label: '立即全部赎回', score: 1 },
      { label: '赎回一部分', score: 4 },
      { label: '继续持有观察', score: 7 },
      { label: '追加投入', score: 10 },
    ],
  },
  {
    id: 'q5',
    text: '您家庭每月的稳定结余（收入减支出）约为？',
    options: [
      { label: '几乎没有结余', score: 1 },
      { label: '2000元以内', score: 4 },
      { label: '2000至6000元', score: 7 },
      { label: '6000元以上', score: 10 },
    ],
  },
  {
    id: 'q6',
    text: '您的养老资金是否有其他稳定来源（如房租、子女给付）？',
    options: [
      { label: '没有，全靠这笔钱', score: 1 },
      { label: '有少量补充', score: 5 },
      { label: '有稳定且充足的补充', score: 9 },
    ],
  },
  {
    id: 'q7',
    text: '您对净值波动型产品（可能短期亏损）的接受程度？',
    options: [
      { label: '完全不能接受', score: 1 },
      { label: '可接受5%以内的浮亏', score: 4 },
      { label: '可接受10%至20%的浮亏', score: 7 },
      { label: '可接受20%以上的浮亏', score: 10 },
    ],
  },
  {
    id: 'q8',
    text: '您的投资经验更接近以下哪种？',
    options: [
      { label: '只存定期或买国债', score: 1 },
      { label: '买过银行理财或货币基金', score: 4 },
      { label: '买过债券基金或混合基金', score: 7 },
      { label: '有股票或权益基金投资经验', score: 10 },
    ],
  },
]

app.get('/api/risk/questions', (req, res) => ok(res, RISK_QUESTIONS))

app.post('/api/risk/submit', requireUser, async (req, res) => {
  const { answers } = req.body || {}
  if (!Array.isArray(answers) || answers.length !== RISK_QUESTIONS.length)
    return fail(res, 400, '请完成全部题目')
  let score = 0
  answers.forEach((idx, i) => {
    const opt = RISK_QUESTIONS[i].options[Number(idx)]
    if (opt) score += opt.score
  })
  const max = RISK_QUESTIONS.length * 10
  const pct = Math.round((score / max) * 100)
  let level = '保守型'
  let suggestion = ''
  if (pct >= 78) {
    level = '进取型'
    suggestion = '可承受较大波动，权益类资产比例可适当提高，但仍需保留至少2年支出的流动性储备。'
  } else if (pct >= 58) {
    level = '成长型'
    suggestion = '可配置中等比例权益类资产，建议以养老目标基金等一站式产品为主，避免频繁操作。'
  } else if (pct >= 38) {
    level = '稳健型'
    suggestion = '以固定收益类资产为主，权益类比例建议控制在30%以内，优先考虑国债、养老理财与年金险。'
  } else {
    level = '保守型'
    suggestion = '以本金安全为首要目标，优先配置存款、国债、特定养老储蓄与专属商业养老保险，避免净值波动型产品。'
  }
  await query('INSERT INTO risk_assessments (user_id,score,level,answers) VALUES (?,?,?,?)', [
    req.user.id,
    pct,
    level,
    JSON.stringify(answers),
  ])
  await query('UPDATE profiles SET risk_level=? WHERE user_id=?', [level, req.user.id])
  ok(res, { score: pct, level, suggestion })
})

app.get('/api/risk/latest', requireUser, async (req, res) => {
  const row = await queryOne('SELECT * FROM risk_assessments WHERE user_id=? ORDER BY created_at DESC LIMIT 1', [
    req.user.id,
  ])
  ok(res, row ? { ...row, answers: parseJSON(row.answers, []) } : null)
})

/* ================= AI 顾问 ================= */

app.post('/api/ai/chat', async (req, res) => {
  const { question, history = [], conversationId } = req.body || {}
  if (!question || !String(question).trim()) return fail(res, 400, '请输入问题')

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  const controller = new AbortController()
  res.on('close', () => {
    if (!res.writableEnded) controller.abort()
  })

  let convId = Number(conversationId) || 0
  const uid = req.user?.id || null
  if (uid) {
    if (!convId) {
      const info = await query('INSERT INTO ai_conversations (user_id,title) VALUES (?,?)', [
        uid,
        String(question).slice(0, 40),
      ])
      convId = Number(info.insertId)
    }
    await query('INSERT INTO ai_messages (conversation_id,role,content) VALUES (?,?,?)', [
      convId,
      'user',
      String(question),
    ])
  }

  try {
    const refs = retrieve(question, 5)
    send('meta', { conversationId: convId || null, refs })
    let acc = ''
    const result = await streamChat({
      question,
      history,
      signal: controller.signal,
      onDelta: (d) => {
        acc += d
        send('delta', { text: d })
      },
    })
    if (uid && convId) {
      await query('INSERT INTO ai_messages (conversation_id,role,content,refs) VALUES (?,?,?,?)', [
        convId,
        'assistant',
        result.content || acc,
        JSON.stringify(result.refs),
      ])
      await query('UPDATE ai_conversations SET updated_at=NOW() WHERE id=?', [convId])
    }
    send('done', { conversationId: convId || null, length: (result.content || acc).length })
  } catch (e) {
    if (!controller.signal.aborted) {
      send('error', { message: String(e.message || 'AI 服务暂时不可用') })
    }
  } finally {
    res.end()
  }
})

app.get('/api/ai/conversations', requireUser, async (req, res) => {
  const rows = await query(
    'SELECT id,title,created_at,updated_at FROM ai_conversations WHERE user_id=? ORDER BY updated_at DESC LIMIT 30',
    [req.user.id],
  )
  ok(res, rows)
})

app.get('/api/ai/conversations/:id', requireUser, async (req, res) => {
  const conv = await queryOne('SELECT * FROM ai_conversations WHERE id=? AND user_id=?', [
    Number(req.params.id),
    req.user.id,
  ])
  if (!conv) return fail(res, 404, '会话不存在')
  const messages = (await query('SELECT * FROM ai_messages WHERE conversation_id=? ORDER BY id ASC', [conv.id])).map(
    (m) => ({ ...m, refs: parseJSON(m.refs, []) }),
  )
  ok(res, { conversation: conv, messages })
})

app.delete('/api/ai/conversations/:id', requireUser, async (req, res) => {
  await query('DELETE FROM ai_conversations WHERE id=? AND user_id=?', [Number(req.params.id), req.user.id])
  ok(res, { deleted: true })
})

/* ================= 管理员（用户数据走 MySQL） ================= */

app.get('/api/admin/overview', requireAdmin, async (req, res) => {
  const cnt = async (sql) => (await queryOne(sql)).c
  const users = await cnt('SELECT COUNT(*) c FROM users')
  const convs = await cnt('SELECT COUNT(*) c FROM ai_conversations')
  const msgs = await cnt('SELECT COUNT(*) c FROM ai_messages')
  const calcs = await cnt('SELECT COUNT(*) c FROM calc_records')
  const favs = await cnt('SELECT COUNT(*) c FROM favorites')
  const recentUsers = await query(
    'SELECT id,username,display_name,role,created_at,last_login_at FROM users ORDER BY id DESC LIMIT 8',
  )
  const recentLogs = await query('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 15')
  const calcByType = await query('SELECT calc_type, COUNT(*) c FROM calc_records GROUP BY calc_type')
  ok(res, {
    counts: {
      users,
      conversations: convs,
      messages: msgs,
      calcs,
      favorites: favs,
      policies: count('policies'),
      articles: count('articles'),
      products: count('products'),
    },
    recentUsers,
    recentLogs,
    calcByType,
  })
})

app.get('/api/admin/users', requireAdmin, async (req, res) => {
  const rows = await query(
    `SELECT u.id,u.username,u.role,u.display_name,u.phone,u.created_at,u.last_login_at,
     p.city,p.risk_level,p.monthly_income
     FROM users u LEFT JOIN profiles p ON p.user_id=u.id ORDER BY u.id ASC`,
  )
  ok(res, rows)
})

app.put('/api/admin/users/:id', requireAdmin, async (req, res) => {
  const { displayName, role, phone } = req.body || {}
  const id = Number(req.params.id)
  if (role && !['user', 'admin'].includes(role)) return fail(res, 400, '角色不正确')
  await query('UPDATE users SET display_name=?, role=?, phone=? WHERE id=?', [displayName || null, role || 'user', phone || null, id])
  audit(req.user.id, 'admin_update_user', String(id))
  ok(res, { updated: true })
})

app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id)
  if (id === req.user.id) return fail(res, 400, '不能删除当前登录的管理员账号')
  await query('DELETE FROM users WHERE id=?', [id])
  audit(req.user.id, 'admin_delete_user', String(id))
  ok(res, { deleted: true })
})

app.get('/api/admin/policies', requireAdmin, (req, res) => {
  ok(res, db.prepare('SELECT * FROM policies ORDER BY id DESC').all().map(rowToPolicy))
})

app.put('/api/admin/policies/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id)
  const { title, summary, body, category, level, issuer, publish_date, source_url, featured } = req.body || {}
  db.prepare(
    'UPDATE policies SET title=?,summary=?,body=?,category=?,level=?,issuer=?,publish_date=?,source_url=?,featured=? WHERE id=?',
  ).run(title, summary, body, category, level, issuer, publish_date, source_url, featured ? 1 : 0, id)
  audit(req.user.id, 'admin_update_policy', String(id))
  ok(res, { updated: true })
})

app.get('/api/admin/articles', requireAdmin, (req, res) => {
  ok(res, db.prepare('SELECT * FROM articles ORDER BY id DESC').all().map(rowToArticle))
})

app.put('/api/admin/articles/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id)
  const { title, summary, body, category, read_minutes, featured } = req.body || {}
  db.prepare('UPDATE articles SET title=?,summary=?,body=?,category=?,read_minutes=?,featured=? WHERE id=?').run(
    title,
    summary,
    body,
    category,
    Number(read_minutes) || 6,
    featured ? 1 : 0,
    id,
  )
  audit(req.user.id, 'admin_update_article', String(id))
  ok(res, { updated: true })
})

app.get('/api/admin/products', requireAdmin, (req, res) => {
  ok(res, db.prepare('SELECT * FROM products ORDER BY id DESC').all().map(rowToProduct))
})

app.put('/api/admin/products/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id)
  const { name, category, issuer, yield_low, yield_high, risk_level, notes, tax_eligible } = req.body || {}
  db.prepare(
    'UPDATE products SET name=?,category=?,issuer=?,yield_low=?,yield_high=?,risk_level=?,notes=?,tax_eligible=? WHERE id=?',
  ).run(name, category, issuer, Number(yield_low), Number(yield_high), risk_level, notes, tax_eligible ? 1 : 0, id)
  audit(req.user.id, 'admin_update_product', String(id))
  ok(res, { updated: true })
})

app.post('/api/admin/reseed', requireAdmin, (req, res) => {
  const r = seedAll({ force: true })
  audit(req.user.id, 'admin_reseed', 'all')
  ok(res, r)
})

/* ================= 静态资源 ================= */

const distDir = path.resolve(__dirname, '../../web/dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(distDir, 'index.html')))
}

app.use((err, req, res, next) => {
  console.error('[error]', err)
  if (res.headersSent) return next(err)
  fail(res, 500, '服务器内部错误')
})

/* ================= 用户笔记（MySQL，用户自由填写的内容） ================= */

app.get('/api/notes', requireUser, async (req, res) => {
  const rows = await query('SELECT * FROM user_notes WHERE user_id=? ORDER BY updated_at DESC LIMIT 50', [req.user.id])
  ok(res, rows)
})

app.post('/api/notes', requireUser, async (req, res) => {
  const { title, content } = req.body || {}
  if (!content || !String(content).trim()) return fail(res, 400, '笔记内容不能为空')
  const info = await query('INSERT INTO user_notes (user_id,title,content) VALUES (?,?,?)', [
    req.user.id,
    String(title || '').slice(0, 120) || '未命名笔记',
    String(content),
  ])
  const row = await queryOne('SELECT * FROM user_notes WHERE id=?', [Number(info.insertId)])
  audit(req.user.id, 'create_note', String(info.insertId))
  ok(res, row)
})

app.put('/api/notes/:id', requireUser, async (req, res) => {
  const { title, content } = req.body || {}
  if (!content || !String(content).trim()) return fail(res, 400, '笔记内容不能为空')
  const r = await query(
    'UPDATE user_notes SET title=?, content=? WHERE id=? AND user_id=?',
    [String(title || '').slice(0, 120) || '未命名笔记', String(content), Number(req.params.id), req.user.id],
  )
  if (!r.affectedRows) return fail(res, 404, '笔记不存在')
  const row = await queryOne('SELECT * FROM user_notes WHERE id=?', [Number(req.params.id)])
  audit(req.user.id, 'update_note', String(req.params.id))
  ok(res, row)
})

app.delete('/api/notes/:id', requireUser, async (req, res) => {
  const r = await query('DELETE FROM user_notes WHERE id=? AND user_id=?', [Number(req.params.id), req.user.id])
  if (!r.affectedRows) return fail(res, 404, '笔记不存在')
  ok(res, { deleted: true })
})

/* ================= 启动 ================= */

async function ensureMySQLUsers() {
  // 管理员与演示账号写入 MySQL
  const admin = await queryOne("SELECT id FROM users WHERE role='admin' LIMIT 1")
  if (!admin) {
    await query('INSERT INTO users (username,password_hash,role,display_name) VALUES (?,?,?,?)', [
      'admin',
      hashPassword('Admin@2025'),
      'admin',
      '系统管理员',
    ])
  }
  const demo = await queryOne("SELECT id FROM users WHERE username='demo' LIMIT 1")
  if (!demo) {
    const info = await query('INSERT INTO users (username,password_hash,role,display_name) VALUES (?,?,?,?)', [
      'demo',
      hashPassword('Demo@2025'),
      'user',
      '演示用户',
    ])
    const uid = Number(info.insertId)
    await query(
      `INSERT INTO profiles (user_id,gender,birth_month,job_type,monthly_income,monthly_expense,expected_life,risk_level,city)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [uid, '男', '1968-06', '企业职工', 12000, 8000, 86, '稳健型', '杭州'],
    )
  }
}

async function start() {
  // 分阶段打日志：部署时排障全靠这几行，能一眼看出卡在哪一步
  const t0 = Date.now()
  const step = (msg) => console.log(`[启动] ${msg}（+${((Date.now() - t0) / 1000).toFixed(1)}s）`)

  step('加载 SQLite 内容库种子…')
  const seeded = seedAll()
  step(
    `内容库就绪：政策 ${seeded?.policies ?? '-'} / 文章 ${seeded?.articles ?? '-'} / 产品 ${seeded?.products ?? '-'}`,
  )

  step(`连接 MySQL ${MYSQL_CONF.host}:${MYSQL_CONF.port}/${MYSQL_CONF.database} …`)
  // MySQL 就绪性检查：失败不拖垮 API（内容库 SQLite 照常工作），
  // 先快速重试，仍失败则转入后台自动重连 —— 避免"MySQL 未就绪 → 后端进程崩溃 → 前端连不上"的问题
  let mysqlReady = false
  for (let attempt = 1; attempt <= 3 && !mysqlReady; attempt++) {
    try {
      await initMySQL()
      mysqlReady = true
    } catch (e) {
      console.warn(`[警告] MySQL 第 ${attempt} 次连接失败：${e?.message || e}`)
      if (attempt < 3) await new Promise((r) => setTimeout(r, 1500))
    }
  }
  if (mysqlReady) {
    step('MySQL 连接与建表完成')
    step('准备演示账号…')
    await ensureMySQLUsers()
    step('演示账号就绪')
  } else {
    console.warn(
      '[警告] MySQL 暂不可用：内容功能（政策/文章/测算）照常，账户/收藏/AI 等用户功能暂不可用。每 30 秒自动重试连接。',
    )
    const retry = setInterval(async () => {
      try {
        await initMySQL()
        await ensureMySQLUsers()
        mysqlReady = true
        console.log('[恢复] MySQL 已连接，用户功能可用')
        clearInterval(retry)
      } catch {
        /* 继续等待下一次重试 */
      }
    }, 30000)
    retry.unref?.()
  }

  app.listen(PORT, () => {
    console.log(`医讯通 API 已启动： http://127.0.0.1:${PORT}`)
    console.log(`静态目录： ${distDir}${fs.existsSync(distDir) ? '' : '（尚未构建，请运行 npm run build）'}`)
    console.log(
      `用户数据库： MySQL ${MYSQL_CONF.host}:${MYSQL_CONF.port}/${MYSQL_CONF.database}${mysqlReady ? '' : '（未就绪，后台重连中）'}（内容库： SQLite）`,
    )
    console.log(`启动总耗时： ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  })
}

start().catch((e) => {
  console.error('[fatal] 启动失败：', e?.message || e)
  if (e?.stack) console.error(e.stack)
  process.exit(1)
})
