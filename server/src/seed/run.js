import { policies } from './policies.js'
import { articles } from './articles.js'
import { products, stats } from './products.js'
import { careServices } from './care.js'
import { glossary, faqs } from './policies.js'
import { db, count } from '../db.js'
import { hashPassword } from '../auth.js'

const now = () => new Date().toISOString()

function insertPolicy(p) {
  db.prepare(
    `INSERT OR REPLACE INTO policies
     (slug,title,issuer,doc_no,publish_date,effective_date,level,region,category,summary,highlights,body,source_url,source_name,tags,featured)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    p.slug,
    p.title,
    p.issuer,
    p.doc_no || '',
    p.publish_date,
    p.effective_date || '',
    p.level,
    p.region,
    p.category,
    p.summary,
    JSON.stringify(p.highlights || []),
    p.body,
    p.source_url || '',
    p.source_name || '',
    JSON.stringify(p.tags || []),
    p.featured ? 1 : 0,
  )
}

function insertArticle(a) {
  db.prepare(
    `INSERT OR REPLACE INTO articles
     (slug,title,category,summary,body,read_minutes,tags,source_name,source_url,featured)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    a.slug,
    a.title,
    a.category,
    a.summary,
    a.body,
    a.read_minutes || 6,
    JSON.stringify(a.tags || []),
    a.source_name || '',
    a.source_url || '',
    a.featured ? 1 : 0,
  )
}

function insertProduct(p) {
  db.prepare(
    `INSERT OR REPLACE INTO products
     (slug,name,category,issuer,term_years,yield_low,yield_high,yield_type,risk_level,min_amount,liquidity,tax_eligible,guaranteed,suitable_for,highlights,notes,is_demo)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    p.slug,
    p.name,
    p.category,
    p.issuer,
    p.term_years,
    p.yield_low,
    p.yield_high,
    p.yield_type,
    p.risk_level,
    p.min_amount,
    p.liquidity,
    p.tax_eligible ? 1 : 0,
    p.guaranteed ? 1 : 0,
    p.suitable_for,
    JSON.stringify(p.highlights || []),
    p.notes || '',
    p.is_demo === false ? 0 : 1,
  )
}

export function seedAll({ force = false } = {}) {
  const already =
    count('policies') > 0 && count('articles') > 0 && count('products') > 0 && count('glossary') > 0 && count('care_services') > 0

  // 增量补缺：内容库已有数据时，只插入缺失的 slug，不覆盖运行期编辑
  // （否则 seed 文件新增内容永远不会进入已有库）
  if (already && !force) {
    const exists = (table, slug) =>
      db.prepare(`SELECT 1 FROM [${table}] WHERE slug = ? LIMIT 1`).get(slug)
    db.exec('BEGIN')
    try {
      let added = 0
      policies.forEach((p) => { if (!exists('policies', p.slug)) { insertPolicy(p); added++ } })
      articles.forEach((a) => { if (!exists('articles', a.slug)) { insertArticle(a); added++ } })
      products.forEach((p) => { if (!exists('products', p.slug)) { insertProduct(p); added++ } })
      careServices.forEach((c) => { if (!exists('care_services', c.slug)) {
        db.prepare(
          'INSERT OR REPLACE INTO care_services (slug,name,service_type,care_level,city_tier,monthly_cost_low,monthly_cost_high,coverage,highlights,notes) VALUES (?,?,?,?,?,?,?,?,?,?)',
        ).run(
          c.slug,
          c.name,
          c.service_type,
          c.care_level,
          c.city_tier,
          c.monthly_cost_low,
          c.monthly_cost_high,
          c.coverage,
          JSON.stringify(c.highlights || []),
          c.notes || '',
        )
        added++
      } })
      db.exec('COMMIT')
      if (added > 0) {
        console.log(`[种子] 增量补充 ${added} 条新内容（现有数据不受影响）`)
      }
      return {
        skipped: false,
        incremental: true,
        added,
        policies: count('policies'),
        articles: count('articles'),
        products: count('products'),
      }
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
  }

  db.exec('BEGIN')
  try {
    policies.forEach(insertPolicy)
    articles.forEach(insertArticle)
    products.forEach(insertProduct)

    db.prepare('DELETE FROM stats').run()
    for (const s of stats) {
      db.prepare('INSERT INTO stats (key,label,unit,period,source,payload) VALUES (?,?,?,?,?,?)').run(
        s.key,
        s.label,
        s.unit,
        s.period,
        s.source,
        JSON.stringify(s.payload),
      )
    }

    db.prepare('DELETE FROM glossary').run()
    for (const [term, alias, definition, category] of glossary) {
      db.prepare('INSERT INTO glossary (term,alias,definition,category) VALUES (?,?,?,?)').run(
        term,
        alias || '',
        definition,
        category,
      )
    }

    db.prepare('DELETE FROM faqs').run()
    faqs.forEach(([q, a, c], i) => {
      db.prepare('INSERT INTO faqs (question,answer,category,sort) VALUES (?,?,?,?)').run(q, a, c, i)
    })

    db.prepare('DELETE FROM care_services').run()
    for (const c of careServices) {
      db.prepare(
        'INSERT OR REPLACE INTO care_services (slug,name,service_type,care_level,city_tier,monthly_cost_low,monthly_cost_high,coverage,highlights,notes) VALUES (?,?,?,?,?,?,?,?,?,?)',
      ).run(
        c.slug,
        c.name,
        c.service_type,
        c.care_level,
        c.city_tier,
        c.monthly_cost_low,
        c.monthly_cost_high,
        c.coverage,
        JSON.stringify(c.highlights || []),
        c.notes || '',
      )
    }

    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }

  return {
    skipped: false,
    policies: count('policies'),
    articles: count('articles'),
    products: count('products'),
    glossary: count('glossary'),
    faqs: count('faqs'),
    stats: count('stats'),
    careServices: count('care_services'),
  }
}

export function ensureAdmin() {
  const existing = db.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").get()
  if (existing) return existing.id
  const info = db
    .prepare(
      'INSERT INTO users (username,password_hash,role,display_name,created_at) VALUES (?,?,?,?,?)',
    )
    .run('admin', hashPassword('Admin@2025'), 'admin', '系统管理员', now())
  return Number(info.lastInsertRowid)
}

export function ensureDemoUser() {
  const existing = db.prepare("SELECT id FROM users WHERE username='demo' LIMIT 1").get()
  if (existing) return existing.id
  const info = db
    .prepare('INSERT INTO users (username,password_hash,role,display_name,created_at) VALUES (?,?,?,?,?)')
    .run('demo', hashPassword('Demo@2025'), 'user', '演示用户', now())
  const uid = Number(info.lastInsertRowid)
  db.prepare(
    `INSERT INTO profiles (user_id,gender,birth_month,job_type,monthly_income,monthly_expense,expected_life,risk_level,city,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  ).run(uid, '男', '1968-06', '企业职工', 12000, 8000, 86, '稳健型', '杭州', now())
  return uid
}
