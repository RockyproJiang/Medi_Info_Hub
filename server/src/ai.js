import { db, parseJSON } from './db.js'

const API_BASE = process.env.AI_BASE_URL || 'https://api.deepseek.com'
const API_KEY = process.env.AI_API_KEY || ''
const MODEL = process.env.AI_MODEL || 'deepseek-chat'

const STOP_WORDS = '的 了 是 在 我 有 和 就 不 人 都 一 一个 上 也 很 到 说 要 去 你 会 着 没有 看 好 自己 这 那 什么 怎么 如何 可以 吗 呢 吧 啊 请问 一下 帮我 我想 现在 应该 需要 多少 哪些'
const STOP = new Set(STOP_WORDS.split(' ').filter(Boolean))

function tokenize(text) {
  const out = new Set()
  const cleaned = String(text || '').toLowerCase()
  const latin = cleaned.match(/[a-z0-9]{2,}/g) || []
  latin.forEach((w) => out.add(w))
  const cjk = cleaned.replace(/[^\u4e00-\u9fa5]/g, ' ')
  for (const chunk of cjk.split(/\s+/)) {
    if (!chunk) continue
    for (let i = 0; i < chunk.length - 1; i++) {
      const bi = chunk.slice(i, i + 2)
      if (!STOP.has(bi)) out.add(bi)
    }
    for (let i = 0; i < chunk.length - 2; i++) {
      out.add(chunk.slice(i, i + 3))
    }
  }
  return out
}

function score(queryTokens, text) {
  if (!queryTokens.size) return 0
  const docTokens = tokenize(text)
  let hit = 0
  for (const t of queryTokens) {
    if (docTokens.has(t)) hit += t.length >= 3 ? 2 : 1
  }
  return hit
}

/** 简易检索：在常见问题、术语、文章、政策中按关键词重合度召回 */
export function retrieve(question, limit = 5) {
  const qTokens = tokenize(question)
  const pool = []

  const faqs = db.prepare('SELECT id,question,answer,category FROM faqs').all()
  for (const f of faqs) {
    const s = score(qTokens, `${f.question} ${f.answer} ${f.category}`) + 3
    if (s > 3) pool.push({ type: 'faq', id: f.id, title: f.question, text: f.answer, score: s })
  }

  const articles = db.prepare('SELECT id,slug,title,summary,body,category FROM articles').all()
  for (const a of articles) {
    const s = score(qTokens, `${a.title} ${a.summary} ${a.category} ${a.body.slice(0, 4000)}`)
    if (s > 2) pool.push({ type: 'article', id: a.id, slug: a.slug, title: a.title, text: a.summary, score: s * 0.8 })
  }

  const policies = db.prepare('SELECT id,slug,title,summary,highlights,issuer,publish_date FROM policies').all()
  for (const p of policies) {
    const hl = parseJSON(p.highlights, []).join(' ')
    const s = score(qTokens, `${p.title} ${p.summary} ${hl} ${p.issuer}`)
    if (s > 2) pool.push({ type: 'policy', id: p.id, slug: p.slug, title: p.title, text: p.summary, score: s * 0.9 })
  }

  const glossary = db.prepare('SELECT term,alias,definition FROM glossary').all()
  for (const g of glossary) {
    const s = score(qTokens, `${g.term} ${g.alias} ${g.definition}`)
    if (s > 3) pool.push({ type: 'glossary', title: g.term, text: g.definition, score: s * 0.7 })
  }

  pool.sort((a, b) => b.score - a.score)
  const seen = new Set()
  const out = []
  for (const item of pool) {
    const key = item.title
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
    if (out.length >= limit) break
  }
  return out
}

const SYSTEM_PROMPT = `你是"医讯通"平台的养老金融顾问，服务对象是中国大陆的中老年用户及其子女。

回答要求：
1. 用简体中文，语气稳重、克制、专业，像一位耐心且诚实的银行理财顾问，不要过度热情。
2. 结构清晰：先给结论，再给依据，必要时分点。单次回答控制在 400 字以内，除非用户明确要求详细展开。
3. 涉及金额、比例、年限时，必须说明是估算值还是政策规定值，并注明口径。
4. 严格区分三类内容：(a) 现行政策规定；(b) 行业惯例与经验数据；(c) 你的分析判断。不要把 (c) 说成 (a)。
5. 不承诺收益，不使用"保本高收益""稳赚""必涨"等表述。涉及具体产品时必须提示风险与适当性。
6. 不推荐具体机构的在售产品，只讲产品类型的特征与适用人群。
7. 不提供具体的医疗诊断、用药建议、法律意见；遇到此类问题，建议咨询相应专业人士。
8. 如果用户的问题超出养老金融范围（如疾病治疗、诉讼），明确说明你的能力边界。
9. 如果参考资料与问题无关，忽略它，不要生硬引用。
10. 不要编造政策文号、发布日期、统计数据。不确定时直接说"这一条我无法确认，建议以官方发布为准"。

格式：使用 Markdown，可用小标题与列表，不要使用表格（终端渲染不佳）。`

function buildMessages(question, history, refs) {
  const context = refs.length
    ? refs
        .map(
          (r, i) =>
            `[资料${i + 1}]（${r.type === 'faq' ? '常见问题' : r.type === 'article' ? '知识文章' : r.type === 'policy' ? '政策文件' : '术语'}）${r.title}\n${String(r.text).slice(0, 900)}`,
        )
        .join('\n\n')
    : '（无匹配资料）'

  const messages = [{ role: 'system', content: SYSTEM_PROMPT }]
  for (const m of history.slice(-6)) {
    messages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })
  }
  messages.push({
    role: 'user',
    content: `参考资料：\n${context}\n\n用户问题：${question}`,
  })
  return messages
}

export async function streamChat({ question, history = [], onDelta, signal }) {
  const refs = retrieve(question, 5)
  const messages = buildMessages(question, history, refs)

  const resp = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.4,
      max_tokens: 1200,
      stream: true,
    }),
    signal,
  })

  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`AI 服务返回 ${resp.status}: ${text.slice(0, 200)}`)
  }

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (payload === '[DONE]') continue
      try {
        const json = JSON.parse(payload)
        const delta = json.choices?.[0]?.delta?.content || ''
        if (delta) {
          full += delta
          onDelta(delta)
        }
      } catch {
        /* 忽略无法解析的心跳片段 */
      }
    }
  }

  return { content: full, refs }
}

export async function checkAI() {
  try {
    const resp = await fetch(`${API_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 4,
      }),
    })
    return { ok: resp.ok, status: resp.status }
  } catch (e) {
    return { ok: false, status: 0, error: String(e.message) }
  }
}
