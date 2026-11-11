/**
 * 养老金融研究数据库（research.db）只读访问模块
 * ================================================
 *
 * 数据库由调研工作积累形成，共 18 张表（区域/银行/网点/产品/医养机构/
 * 660 份问卷/诈骗案件等），见 Web 端「调研数据库」页。
 *
 * 设计原则：
 *  - 只读打开（readOnly: true），绝不写入研究数据；
 *  - 表名/列名白名单校验，SQL 查询端点只放行单条 SELECT/WITH 语句；
 *  - 所有分页查询使用参数绑定，杜绝拼接注入。
 */
import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_FILE = process.env.RESEARCH_DB || path.join(__dirname, '../data/research.db')

let researchDb = null

function getDb() {
  if (!researchDb) {
    if (!fs.existsSync(DB_FILE)) return null
    researchDb = new DatabaseSync(DB_FILE, { readOnly: true })
  }
  return researchDb
}

/** 用户可见的表清单（元数据缓存） */
let tableCache = null
function listTables() {
  if (tableCache) return tableCache
  const db = getDb()
  if (!db) return []
  const names = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((r) => r.name)
  tableCache = names.map((name) => {
    const cols = db.prepare(`PRAGMA table_info([${name}])`).all()
    const rows = db.prepare(`SELECT COUNT(*) AS n FROM [${name}]`).get().n
    return {
      name,
      rows,
      columns: cols.map((c) => ({ name: c.name, type: c.type })),
    }
  })
  return tableCache
}

const TABLE_NAMES = () => listTables().map((t) => t.name)

function quoteName(name) {
  // 白名单校验 + [ ] 引用，杜绝任意标识符
  if (!TABLE_NAMES().includes(name)) throw new Error(`数据表不存在：${name}`)
  return `[${name}]`
}

/* ---------------- 路由 ---------------- */
export function registerResearchRoutes(app, ok, fail) {
  // 总览：表清单 + 关键统计 + 看板图表数据
  app.get('/api/research/overview', (req, res) => {
    try {
      const db = getDb()
      if (!db) return ok(res, null)
      const tables = listTables()
      const totalRows = tables.reduce((s, t) => s + t.rows, 0)

      // 看板图表（均为小聚合，毫秒级）
      const q = (sql) => db.prepare(sql).all()
      // 区域类型为文本字段（城市/县城/农村），直接分组
      const charts = {
        // 受访者与医养机构按区域类型分布
        respondentsByRegion: q(`
          SELECT r.[区域类型] AS name, COUNT(*) AS n
          FROM [受访者] s JOIN [区域] r USING([区域编号])
          GROUP BY r.[区域类型] ORDER BY name`),
        fraudByType: q(`
          SELECT [诈骗类型] AS name, COUNT(*) AS n,
                 ROUND(SUM([涉案金额元]) / 10000.0, 1) AS amountWan,
                 ROUND(AVG(CASE WHEN [是否银行拦截] = 1 THEN 100.0 ELSE 0 END), 1) AS interceptRate
          FROM [诈骗案件] GROUP BY [诈骗类型] ORDER BY n DESC`),
        productByCategory: q(`
          SELECT [产品类别] AS name, COUNT(*) AS n,
                 ROUND(AVG([业绩基准收益率]), 3) AS avgReturn,
                 ROUND(AVG([管理费率]), 4) AS avgFee
          FROM [养老产品] GROUP BY [产品类别] ORDER BY n DESC`),
        careByRegion: q(`
          SELECT r.[区域类型] AS name, COUNT(*) AS n,
                 ROUND(AVG([老人月均费用元]), 0) AS avgMonthlyFee
          FROM [医养机构] c JOIN [区域] r USING([区域编号])
          GROUP BY r.[区域类型] ORDER BY name`),
        surveyByAge: q(`
          SELECT [年龄段] AS name, COUNT(*) AS n
          FROM [受访者] GROUP BY [年龄段] ORDER BY [年龄段]`),
      }

      ok(res, {
        file: path.basename(DB_FILE),
        tableCount: tables.length,
        totalRows,
        tables: tables.map((t) => ({ name: t.name, rows: t.rows, columns: t.columns })),
        charts,
      })
    } catch (e) {
      fail(res, 500, '研究数据库读取失败：' + e.message)
    }
  })

  // 表浏览：分页 + 全列模糊搜索
  app.get('/api/research/table/:name', (req, res) => {
    try {
      const db = getDb()
      const table = quoteName(String(req.params.name))
      const meta = listTables().find((t) => t.name === String(req.params.name))
      const page = Math.max(1, parseInt(req.query.page) || 1)
      const size = Math.min(100, Math.max(1, parseInt(req.query.size) || 20))
      const kw = String(req.query.q || '').trim()

      let where = ''
      const args = []
      if (kw) {
        // 仅对 TEXT 列做 LIKE 搜索（参数绑定）
        const textCols = meta.columns.filter((c) => /TEXT/i.test(c.type)).map((c) => c.name)
        if (textCols.length) {
          where = 'WHERE ' + textCols.map((c) => `[${c}] LIKE ?`).join(' OR ')
          textCols.forEach(() => args.push(`%${kw}%`))
        }
      }

      const total = db.prepare(`SELECT COUNT(*) AS n FROM ${table} ${where}`).get(...args).n
      const rows = db
        .prepare(`SELECT * FROM ${table} ${where} LIMIT ? OFFSET ?`)
        .all(...args, size, (page - 1) * size)
      ok(res, { name: meta.name, columns: meta.columns, rows, total, page, size })
    } catch (e) {
      fail(res, 400, e.message)
    }
  })

  // 只读 SQL 查询台（科研/教学用）
  app.post('/api/research/query', (req, res) => {
    try {
      const db = getDb()
      const sql = String(req.body?.sql || '').trim()
      if (!sql) return fail(res, 400, '请输入 SQL 查询语句')
      if (/;/.test(sql)) return fail(res, 400, '一次只允许执行一条语句（去掉末尾分号）')
      if (!/^(SELECT|WITH)\b/i.test(sql)) return fail(res, 400, '仅允许 SELECT / WITH 查询（本端点只读）')
      if (/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|ATTACH|DETACH|PRAGMA|VACUUM|REPLACE)\b/i.test(sql)) {
        return fail(res, 400, '检测到写操作关键字，已拒绝执行')
      }
      const rows = db.prepare(sql).all()
      // 结果集截断保护
      const truncated = rows.length > 500 ? rows.slice(0, 500) : rows
      const columns = rows.length ? Object.keys(rows[0]) : []
      ok(res, { columns, rows: truncated, total: rows.length, truncated: rows.length > 500 })
    } catch (e) {
      fail(res, 400, 'SQL 执行失败：' + e.message)
    }
  })
}
