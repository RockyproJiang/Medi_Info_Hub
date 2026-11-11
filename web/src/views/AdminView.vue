<script setup>
import { ref, onMounted, computed } from 'vue'
import { api, money, dateText, currentUser } from '../lib/api.js'
import PageHeader from '../components/PageHeader.vue'

const user = currentUser()
const tab = ref('overview')
const overview = ref(null)
const users = ref([])
const policies = ref([])
const articles = ref([])
const products = ref([])
const loading = ref(true)
const err = ref('')
const okMsg = ref('')

const editPolicy = ref(null)
const editArticle = ref(null)
const editProduct = ref(null)

const tabs = [
  { key: 'overview', label: '总览' },
  { key: 'users', label: '用户' },
  { key: 'policies', label: '政策' },
  { key: 'articles', label: '文章' },
  { key: 'products', label: '产品' },
]

onMounted(load)

async function load() {
  loading.value = true
  err.value = ''
  try {
    const o = await api.get('/admin/overview')
    overview.value = o
  } catch (e) {
    err.value = e.message
  } finally {
    loading.value = false
  }
}

async function loadUsers() {
  users.value = await api.get('/admin/users')
}

async function loadPolicies() {
  policies.value = await api.get('/admin/policies')
}

async function loadArticles() {
  articles.value = await api.get('/admin/articles')
}

async function loadProducts() {
  products.value = await api.get('/admin/products')
}

async function switchTab(k) {
  tab.value = k
  err.value = ''
  try {
    if (k === 'users' && !users.value.length) await loadUsers()
    if (k === 'policies' && !policies.value.length) await loadPolicies()
    if (k === 'articles' && !articles.value.length) await loadArticles()
    if (k === 'products' && !products.value.length) await loadProducts()
  } catch (e) {
    err.value = e.message
  }
}

async function saveUser(u) {
  try {
    await api.put(`/admin/users/${u.id}`, {
      displayName: u.display_name,
      role: u.role,
      phone: u.phone,
    })
    flash('用户已更新')
  } catch (e) {
    err.value = e.message
  }
}

async function removeUser(u) {
  if (!confirm(`确定删除用户「${u.username}」及其全部数据？此操作不可撤销。`)) return
  try {
    await api.del(`/admin/users/${u.id}`)
    users.value = users.value.filter((x) => x.id !== u.id)
    flash('用户已删除')
  } catch (e) {
    err.value = e.message
  }
}

async function savePolicy() {
  const p = editPolicy.value
  try {
    await api.put(`/admin/policies/${p.id}`, {
      title: p.title,
      summary: p.summary,
      body: p.body,
      category: p.category,
      level: p.level,
      issuer: p.issuer,
      publish_date: p.publish_date,
      source_url: p.source_url,
      featured: p.featured,
    })
    editPolicy.value = null
    await loadPolicies()
    flash('政策已保存')
  } catch (e) {
    err.value = e.message
  }
}

async function saveArticle() {
  const a = editArticle.value
  try {
    await api.put(`/admin/articles/${a.id}`, {
      title: a.title,
      summary: a.summary,
      body: a.body,
      category: a.category,
      read_minutes: a.read_minutes,
      featured: a.featured,
    })
    editArticle.value = null
    await loadArticles()
    flash('文章已保存')
  } catch (e) {
    err.value = e.message
  }
}

async function saveProduct() {
  const p = editProduct.value
  try {
    await api.put(`/admin/products/${p.id}`, {
      name: p.name,
      category: p.category,
      issuer: p.issuer,
      yield_low: p.yield_low,
      yield_high: p.yield_high,
      risk_level: p.risk_level,
      notes: p.notes,
      tax_eligible: p.tax_eligible,
    })
    editProduct.value = null
    await loadProducts()
    flash('产品已保存')
  } catch (e) {
    err.value = e.message
  }
}

async function reseed() {
  if (!confirm('将用内置种子数据覆盖现有政策、文章、产品、术语与问答。用户数据不受影响。确定继续？')) return
  try {
    const r = await api.post('/admin/reseed')
    policies.value = []
    articles.value = []
    products.value = []
    await load()
    flash(`已重置：政策 ${r.policies} · 文章 ${r.articles} · 产品 ${r.products}`)
  } catch (e) {
    err.value = e.message
  }
}

let flashTimer = null
function flash(msg) {
  okMsg.value = msg
  clearTimeout(flashTimer)
  flashTimer = setTimeout(() => (okMsg.value = ''), 2600)
}

const cards = computed(() => {
  const c = overview.value?.counts || {}
  return [
    { label: '注册用户', value: c.users, note: '含管理员与演示账号' },
    { label: '政策文件', value: c.policies, note: '结构化整理' },
    { label: '知识文章', value: c.articles, note: '长文' },
    { label: '产品条目', value: c.products, note: '示意数据' },
    { label: 'AI 会话', value: c.conversations, note: '累计' },
    { label: 'AI 消息', value: c.messages, note: '累计' },
    { label: '测算记录', value: c.calcs, note: '用户保存' },
    { label: '收藏', value: c.favorites, note: '累计' },
  ]
})
</script>

<template>
  <div>
    <PageHeader eyebrow="Administration" title="管理后台" :desc="`当前管理员：${user?.username} · 所有变更会写入审计日志`">
      <div class="head-actions">
        <button class="btn ghost small" @click="reseed">重置种子数据</button>
        <button class="btn ghost small" @click="load">刷新</button>
      </div>
    </PageHeader>

    <div class="wrap">
      <p v-if="err" class="err-line">{{ err }}</p>
      <p v-if="okMsg" class="ok-line">{{ okMsg }}</p>

      <div class="admin-tabs">
        <button
          v-for="t in tabs"
          :key="t.key"
          class="at"
          :class="{ on: tab === t.key }"
          @click="switchTab(t.key)"
        >
          {{ t.label }}
        </button>
      </div>

      <div v-if="loading" class="loading">加载中…</div>

      <!-- 总览 -->
      <template v-else-if="tab === 'overview'">
        <div class="stat-grid">
          <div v-for="c in cards" :key="c.label" class="stat-card">
            <span class="sc-label">{{ c.label }}</span>
            <span class="sc-value mono">{{ c.value ?? '—' }}</span>
            <span class="sc-note">{{ c.note }}</span>
          </div>
        </div>

        <div class="ov-cols">
          <section class="ov-block">
            <h2 class="ov-title">最近注册用户</h2>
            <table class="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>用户名</th>
                  <th>角色</th>
                  <th>注册时间</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="u in overview.recentUsers" :key="u.id">
                  <td class="mono">{{ u.id }}</td>
                  <td>{{ u.display_name || u.username }}</td>
                  <td>
                    <span class="tag" :class="u.role === 'admin' ? 'red' : ''">{{ u.role === 'admin' ? '管理员' : '用户' }}</span>
                  </td>
                  <td class="mono small">{{ u.created_at?.slice(0, 10) }}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section class="ov-block">
            <h2 class="ov-title">审计日志</h2>
            <div class="log-list">
              <div v-for="l in overview.recentLogs" :key="l.id" class="log-item">
                <span class="mono log-time">{{ l.created_at?.slice(5, 16).replace('T', ' ') }}</span>
                <span class="log-action">{{ l.action }}</span>
                <span class="mono log-target">{{ l.target }}</span>
              </div>
              <p v-if="!overview.recentLogs.length" class="log-empty">暂无日志</p>
            </div>
          </section>
        </div>
      </template>

      <!-- 用户 -->
      <template v-else-if="tab === 'users'">
        <table class="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>用户名</th>
              <th>显示名称</th>
              <th>角色</th>
              <th>城市</th>
              <th>风险偏好</th>
              <th>注册时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in users" :key="u.id">
              <td class="mono">{{ u.id }}</td>
              <td class="mono">{{ u.username }}</td>
              <td><input v-model="u.display_name" class="mini-input" /></td>
              <td>
                <select v-model="u.role" class="mini-input">
                  <option value="user">用户</option>
                  <option value="admin">管理员</option>
                </select>
              </td>
              <td>{{ u.city || '—' }}</td>
              <td>{{ u.risk_level || '未测评' }}</td>
              <td class="mono small">{{ u.created_at?.slice(0, 10) }}</td>
              <td class="ops">
                <button class="mini-btn" @click="saveUser(u)">保存</button>
                <button class="mini-btn danger" @click="removeUser(u)">删除</button>
              </td>
            </tr>
          </tbody>
        </table>
      </template>

      <!-- 政策 -->
      <template v-else-if="tab === 'policies'">
        <table class="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>标题</th>
              <th>层级</th>
              <th>主题</th>
              <th>发布</th>
              <th>重点</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in policies" :key="p.id">
              <td class="mono">{{ p.id }}</td>
              <td class="cell-title">{{ p.title }}</td>
              <td>{{ p.level }}</td>
              <td>{{ p.category }}</td>
              <td class="mono small">{{ p.publish_date }}</td>
              <td>{{ p.featured ? '是' : '否' }}</td>
              <td class="ops"><button class="mini-btn" @click="editPolicy = { ...p }">编辑</button></td>
            </tr>
          </tbody>
        </table>

        <div v-if="editPolicy" class="edit-panel">
          <div class="ep-head">
            <h3>编辑政策 · #{{ editPolicy.id }}</h3>
            <button class="mini-btn" @click="editPolicy = null">关闭</button>
          </div>
          <div class="ep-grid">
            <div class="field"><label>标题</label><input v-model="editPolicy.title" class="input" /></div>
            <div class="field"><label>发布机关</label><input v-model="editPolicy.issuer" class="input" /></div>
            <div class="field"><label>层级</label><input v-model="editPolicy.level" class="input" /></div>
            <div class="field"><label>主题</label><input v-model="editPolicy.category" class="input" /></div>
            <div class="field"><label>发布日期</label><input v-model="editPolicy.publish_date" class="input" /></div>
            <div class="field"><label>来源链接</label><input v-model="editPolicy.source_url" class="input" /></div>
          </div>
          <div class="field"><label>摘要</label><textarea v-model="editPolicy.summary" class="textarea" rows="2"></textarea></div>
          <div class="field"><label>正文（Markdown）</label><textarea v-model="editPolicy.body" class="textarea" rows="10"></textarea></div>
          <label class="check"><input v-model="editPolicy.featured" type="checkbox" /> 标为重点文件</label>
          <div class="ep-actions"><button class="btn" @click="savePolicy">保存</button></div>
        </div>
      </template>

      <!-- 文章 -->
      <template v-else-if="tab === 'articles'">
        <table class="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>标题</th>
              <th>分类</th>
              <th>阅读</th>
              <th>重点</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in articles" :key="a.id">
              <td class="mono">{{ a.id }}</td>
              <td class="cell-title">{{ a.title }}</td>
              <td>{{ a.category }}</td>
              <td class="mono">{{ a.read_minutes }} 分钟</td>
              <td>{{ a.featured ? '是' : '否' }}</td>
              <td class="ops"><button class="mini-btn" @click="editArticle = { ...a }">编辑</button></td>
            </tr>
          </tbody>
        </table>

        <div v-if="editArticle" class="edit-panel">
          <div class="ep-head">
            <h3>编辑文章 · #{{ editArticle.id }}</h3>
            <button class="mini-btn" @click="editArticle = null">关闭</button>
          </div>
          <div class="ep-grid">
            <div class="field"><label>标题</label><input v-model="editArticle.title" class="input" /></div>
            <div class="field"><label>分类</label><input v-model="editArticle.category" class="input" /></div>
            <div class="field"><label>阅读分钟</label><input v-model="editArticle.read_minutes" type="number" class="input" /></div>
          </div>
          <div class="field"><label>摘要</label><textarea v-model="editArticle.summary" class="textarea" rows="2"></textarea></div>
          <div class="field"><label>正文（Markdown）</label><textarea v-model="editArticle.body" class="textarea" rows="14"></textarea></div>
          <label class="check"><input v-model="editArticle.featured" type="checkbox" /> 标为重点文章</label>
          <div class="ep-actions"><button class="btn" @click="saveArticle">保存</button></div>
        </div>
      </template>

      <!-- 产品 -->
      <template v-else>
        <table class="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>名称</th>
              <th>类型</th>
              <th>收益区间</th>
              <th>风险</th>
              <th>税优</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in products" :key="p.id">
              <td class="mono">{{ p.id }}</td>
              <td class="cell-title">{{ p.name }}</td>
              <td>{{ p.category }}</td>
              <td class="mono">{{ p.yield_low }}% ~ {{ p.yield_high }}%</td>
              <td>{{ p.risk_level }}</td>
              <td>{{ p.tax_eligible ? '是' : '否' }}</td>
              <td class="ops"><button class="mini-btn" @click="editProduct = { ...p }">编辑</button></td>
            </tr>
          </tbody>
        </table>

        <div v-if="editProduct" class="edit-panel">
          <div class="ep-head">
            <h3>编辑产品 · #{{ editProduct.id }}</h3>
            <button class="mini-btn" @click="editProduct = null">关闭</button>
          </div>
          <div class="ep-grid">
            <div class="field"><label>名称</label><input v-model="editProduct.name" class="input" /></div>
            <div class="field"><label>类型</label><input v-model="editProduct.category" class="input" /></div>
            <div class="field"><label>发行机构</label><input v-model="editProduct.issuer" class="input" /></div>
            <div class="field"><label>风险等级</label><input v-model="editProduct.risk_level" class="input" /></div>
            <div class="field"><label>收益下限 %</label><input v-model="editProduct.yield_low" type="number" step="0.1" class="input" /></div>
            <div class="field"><label>收益上限 %</label><input v-model="editProduct.yield_high" type="number" step="0.1" class="input" /></div>
          </div>
          <div class="field"><label>备注</label><textarea v-model="editProduct.notes" class="textarea" rows="3"></textarea></div>
          <label class="check"><input v-model="editProduct.tax_eligible" type="checkbox" /> 个人养老金可投</label>
          <div class="ep-actions"><button class="btn" @click="saveProduct">保存</button></div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.head-actions {
  margin-top: 20px;
  display: flex;
  gap: 10px;
}

.err-line {
  font-size: 12.5px;
  color: var(--cinnabar);
  background: var(--cinnabar-soft);
  padding: 9px 12px;
  border-left: 2px solid var(--cinnabar);
  margin-bottom: 16px;
}

.ok-line {
  font-size: 12.5px;
  color: var(--pine);
  background: var(--pine-soft);
  padding: 9px 12px;
  border-left: 2px solid var(--pine);
  margin-bottom: 16px;
}

.admin-tabs {
  display: flex;
  border-bottom: 1px solid var(--line-strong);
  margin-bottom: 28px;
  overflow-x: auto;
}

.at {
  padding: 11px 18px;
  background: none;
  border: 0;
  border-bottom: 2px solid transparent;
  color: var(--ink-3);
  font-size: 13.5px;
  font-family: inherit;
  margin-bottom: -1px;
  white-space: nowrap;
  transition: all 0.14s ease;
}

.at:hover {
  color: var(--pine);
}

.at.on {
  color: var(--pine);
  border-bottom-color: var(--cinnabar);
  font-weight: 500;
}

.loading {
  padding: 60px 0;
  text-align: center;
  color: var(--ink-3);
}

/* 总览 */
.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border-top: 1px solid var(--line-strong);
  border-left: 1px solid var(--line);
  margin-bottom: 36px;
}

.stat-card {
  padding: 18px;
  border-right: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  background: var(--white);
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.sc-label {
  font-size: 11.5px;
  color: var(--ink-3);
}

.sc-value {
  font-size: 28px;
  color: var(--pine);
  line-height: 1.1;
}

.sc-note {
  font-size: 10px;
  color: var(--ink-4);
}

.ov-cols {
  display: grid;
  grid-template-columns: 1.3fr 1fr;
  gap: 40px;
}

.ov-title {
  font-size: 17px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--line-strong);
  margin-bottom: 14px;
}

.log-list {
  display: flex;
  flex-direction: column;
}

.log-item {
  display: grid;
  grid-template-columns: 92px 1fr auto;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid var(--line);
  font-size: 11.5px;
  align-items: center;
}

.log-time {
  color: var(--ink-4);
  font-size: 10.5px;
}

.log-action {
  color: var(--ink-2);
}

.log-target {
  color: var(--ink-4);
  font-size: 10.5px;
}

.log-empty {
  font-size: 12px;
  color: var(--ink-4);
  padding: 20px 0;
}

/* 表格 */
.table {
  background: var(--white);
  border: 1px solid var(--line);
}

.cell-title {
  max-width: 320px;
  font-size: 13px;
  color: var(--ink);
}

.small {
  font-size: 11px;
}

.ops {
  display: flex;
  gap: 10px;
  white-space: nowrap;
}

.mini-input {
  height: 28px;
  padding: 0 7px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  font-size: 12.5px;
  background: var(--white);
  width: 100%;
  min-width: 80px;
}

.mini-btn {
  background: none;
  border: 0;
  padding: 0;
  font-size: 11.5px;
  color: var(--pine);
  border-bottom: 1px solid var(--pine);
  font-family: inherit;
}

.mini-btn.danger {
  color: var(--cinnabar);
  border-color: var(--cinnabar);
}

/* 编辑面板 */
.edit-panel {
  margin-top: 28px;
  padding: 22px;
  background: var(--white);
  border: 1px solid var(--line-strong);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ep-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--line);
}

.ep-head h3 {
  font-size: 17px;
}

.ep-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--ink-2);
}

.check input {
  accent-color: var(--pine);
}

.ep-actions {
  padding-top: 14px;
  border-top: 1px solid var(--line);
}

@media (max-width: 980px) {
  .stat-grid {
    grid-template-columns: 1fr 1fr;
  }
  .ov-cols {
    grid-template-columns: 1fr;
    gap: 28px;
  }
  .ep-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 620px) {
  .stat-grid {
    grid-template-columns: 1fr;
  }
}
</style>
