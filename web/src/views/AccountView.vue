<script setup>
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, saveSession, clearSession, isLoggedIn, currentUser, money, wan, dateText } from '../lib/api.js'
import PageHeader from '../components/PageHeader.vue'

const route = useRoute()
const router = useRouter()
const user = ref(currentUser())
// localStorage 不是响应式的，必须用 ref + 事件同步，否则登录成功后界面不会切换
const logged = ref(isLoggedIn())

function syncAuth() {
  user.value = currentUser()
  logged.value = isLoggedIn()
}

onMounted(() => {
  window.addEventListener('yl-auth', syncAuth)
  window.addEventListener('storage', syncAuth)
})

onBeforeUnmount(() => {
  window.removeEventListener('yl-auth', syncAuth)
  window.removeEventListener('storage', syncAuth)
})

const mode = ref('login')
const busy = ref(false)
const err = ref('')
const okMsg = ref('')

const loginForm = ref({ username: '', password: '' })
const regForm = ref({ username: '', password: '', password2: '', displayName: '' })

const tab = ref('profile')
const profile = ref({})
const records = ref([])
const favorites = ref([])
const risk = ref(null)
const conversations = ref([])
const loadingData = ref(false)

const riskQuestions = ref([])
const riskAnswers = ref([])
const riskResult = ref(null)
const riskBusy = ref(false)

onMounted(async () => {
  if (route.query.register) mode.value = 'register'
  if (route.query.login) mode.value = 'login'
  if (logged.value) {
    await loadAll()
    await loadNotes()
  }
})

async function loadAll() {
  loadingData.value = true
  try {
    const [me, recs, favs, rk, convs] = await Promise.all([
      api.get('/auth/me'),
      api.get('/records').catch(() => []),
      api.get('/favorites').catch(() => []),
      api.get('/risk/latest').catch(() => null),
      api.get('/ai/conversations').catch(() => []),
    ])
    user.value = me.user
    profile.value = me.profile || {}
    records.value = recs
    favorites.value = favs
    risk.value = rk
    conversations.value = convs
  } catch (e) {
    err.value = e.message
  } finally {
    loadingData.value = false
  }
}

async function doLogin() {
  err.value = ''
  busy.value = true
  try {
    const d = await api.post('/auth/login', loginForm.value)
    saveSession(d.token, d.user)
    syncAuth()
    await loadAll()
  } catch (e) {
    err.value = e.message
  } finally {
    busy.value = false
  }
}

async function doRegister() {
  err.value = ''
  if (regForm.value.password !== regForm.value.password2) {
    err.value = '两次输入的密码不一致'
    return
  }
  busy.value = true
  try {
    const d = await api.post('/auth/register', {
      username: regForm.value.username,
      password: regForm.value.password,
      displayName: regForm.value.displayName || regForm.value.username,
    })
    saveSession(d.token, d.user)
    syncAuth()
    await loadAll()
  } catch (e) {
    err.value = e.message
  } finally {
    busy.value = false
  }
}

function logout() {
  clearSession()
  syncAuth()
  profile.value = {}
  records.value = []
  favorites.value = []
  notes.value = []
  risk.value = null
  conversations.value = []
  router.push('/')
}

async function saveProfile() {
  busy.value = true
  okMsg.value = ''
  try {
    await api.put('/auth/profile', {
      displayName: profile.value.display_name,
      phone: profile.value.phone,
      gender: profile.value.gender,
      birthMonth: profile.value.birth_month,
      jobType: profile.value.job_type,
      monthlyIncome: Number(profile.value.monthly_income) || null,
      monthlyExpense: Number(profile.value.monthly_expense) || null,
      expectedLife: Number(profile.value.expected_life) || null,
      riskLevel: profile.value.risk_level,
      city: profile.value.city,
    })
    okMsg.value = '已保存'
    setTimeout(() => (okMsg.value = ''), 2400)
  } catch (e) {
    err.value = e.message
  } finally {
    busy.value = false
  }
}

async function loadRisk() {
  if (!riskQuestions.value.length) {
    riskQuestions.value = await api.get('/risk/questions')
    riskAnswers.value = new Array(riskQuestions.value.length).fill(null)
  }
}

async function submitRisk() {
  if (riskAnswers.value.some((a) => a === null)) {
    err.value = '请完成全部题目'
    return
  }
  riskBusy.value = true
  try {
    const d = await api.post('/risk/submit', { answers: riskAnswers.value })
    riskResult.value = d
    risk.value = { level: d.level, score: d.score, created_at: new Date().toISOString() }
    await loadAll()
  } catch (e) {
    err.value = e.message
  } finally {
    riskBusy.value = false
  }
}

async function removeRecord(id) {
  await api.del(`/records/${id}`)
  records.value = records.value.filter((r) => r.id !== id)
}

async function removeFav(f) {
  await api.post('/favorites', { itemType: f.item_type, itemId: f.item_id })
  favorites.value = favorites.value.filter((x) => x.id !== f.id)
}

/* ===== 我的笔记（MySQL user_notes） ===== */
const notes = ref([])
const noteForm = ref({ id: null, title: '', content: '' })
const noteBusy = ref(false)
const noteMsg = ref('')

async function loadNotes() {
  try {
    notes.value = await api.get('/notes')
  } catch {
    notes.value = []
  }
}

async function saveNote() {
  if (!noteForm.value.content.trim()) {
    noteMsg.value = '笔记内容不能为空'
    return
  }
  noteBusy.value = true
  noteMsg.value = ''
  try {
    if (noteForm.value.id) {
      await api.put(`/notes/${noteForm.value.id}`, {
        title: noteForm.value.title,
        content: noteForm.value.content,
      })
    } else {
      await api.post('/notes', { title: noteForm.value.title, content: noteForm.value.content })
    }
    noteForm.value = { id: null, title: '', content: '' }
    await loadNotes()
  } catch (e) {
    noteMsg.value = e.message
  } finally {
    noteBusy.value = false
  }
}

function editNote(n) {
  noteForm.value = { id: n.id, title: n.title, content: n.content }
  noteMsg.value = ''
}

async function removeNote(id) {
  await api.del(`/notes/${id}`)
  if (noteForm.value.id === id) noteForm.value = { id: null, title: '', content: '' }
  await loadNotes()
}

const favLink = (f) =>
  f.item_type === 'policy' ? `/policies/${f.slug}` : f.item_type === 'article' ? `/knowledge/${f.slug}` : '/products'

const typeLabel = { policy: '政策', article: '文章', product: '产品' }

const tabs = [
  { key: 'profile', label: '个人档案' },
  { key: 'records', label: '测算记录' },
  { key: 'favorites', label: '我的收藏' },
  { key: 'notes', label: '我的笔记' },
  { key: 'risk', label: '风险测评' },
  { key: 'chats', label: 'AI 会话' },
]
</script>

<template>
  <div>
    <!-- 未登录 -->
    <template v-if="!logged">
      <PageHeader
        eyebrow="Account"
        title="创建账户"
        desc="账户用于保存测算记录、收藏与 AI 会话。本站不收集身份证号、银行卡号等敏感信息，密码经加盐哈希后存储。"
      />

      <div class="wrap auth-wrap">
        <div class="auth-card">
          <div class="auth-tabs">
            <button class="at" :class="{ on: mode === 'login' }" @click="mode = 'login'; err = ''">登录</button>
            <button class="at" :class="{ on: mode === 'register' }" @click="mode = 'register'; err = ''">
              注册
            </button>
          </div>

          <form v-if="mode === 'login'" class="auth-form" @submit.prevent="doLogin">
            <div class="field">
              <label>用户名</label>
              <input v-model="loginForm.username" class="input" autocomplete="username" placeholder="请输入用户名" />
            </div>
            <div class="field">
              <label>密码</label>
              <input
                v-model="loginForm.password"
                type="password"
                class="input"
                autocomplete="current-password"
                placeholder="请输入密码"
              />
            </div>
            <p v-if="err" class="err-line">{{ err }}</p>
            <button class="btn full" type="submit" :disabled="busy">{{ busy ? '登录中…' : '登录' }}</button>
            <div class="demo-hint">
              <span class="mono">DEMO</span>
              <p>演示账号：<b class="mono">demo / Demo@2025</b>　管理员：<b class="mono">admin / Admin@2025</b></p>
            </div>
          </form>

          <form v-else class="auth-form" @submit.prevent="doRegister">
            <div class="field">
              <label>用户名</label>
              <input v-model="regForm.username" class="input" autocomplete="username" placeholder="3-20 位字母、数字或中文" />
            </div>
            <div class="field">
              <label>显示名称（可选）</label>
              <input v-model="regForm.displayName" class="input" placeholder="例如：张先生" />
            </div>
            <div class="field">
              <label>密码</label>
              <input v-model="regForm.password" type="password" class="input" autocomplete="new-password" placeholder="至少 6 位" />
            </div>
            <div class="field">
              <label>确认密码</label>
              <input v-model="regForm.password2" type="password" class="input" autocomplete="new-password" placeholder="再次输入密码" />
            </div>
            <p v-if="err" class="err-line">{{ err }}</p>
            <button class="btn full" type="submit" :disabled="busy">{{ busy ? '创建中…' : '创建账户' }}</button>
          </form>
        </div>

        <aside class="auth-side">
          <div class="as-block">
            <div class="as-title">账户能做什么</div>
            <ul>
              <li>保存养老缺口测算结果，便于对比不同假设</li>
              <li>收藏政策文件与知识文章</li>
              <li>保存风险测评结果，与产品风险等级匹配</li>
              <li>保留 AI 顾问的历史会话</li>
            </ul>
          </div>
          <div class="as-block">
            <div class="as-title">隐私说明</div>
            <p>
              本站仅存储用户名、密码哈希与你在档案中主动填写的养老参数。测算数据用于回显历史记录，不做他用，不向第三方共享。
            </p>
          </div>
        </aside>
      </div>
    </template>

    <!-- 已登录 -->
    <template v-else>
      <PageHeader
        :eyebrow="user?.role === 'admin' ? 'Administrator' : 'My Account'"
        :title="`${user?.displayName || user?.username}`"
        :desc="`账户 ID ${user?.id} · 注册于 ${dateText(user?.created_at)}`"
      >
        <div class="head-actions">
          <RouterLink v-if="user?.role === 'admin'" to="/admin" class="btn ghost small">管理后台</RouterLink>
          <button class="btn ghost small" @click="logout">退出登录</button>
        </div>
      </PageHeader>

      <div class="wrap">
        <div class="acct-grid">
          <nav class="acct-nav">
            <button
              v-for="t in tabs"
              :key="t.key"
              class="an-item"
              :class="{ on: tab === t.key }"
              @click="tab = t.key; err = ''; okMsg = ''"
            >
              {{ t.label }}
            </button>
          </nav>

          <div class="acct-body">
            <p v-if="err" class="err-line">{{ err }}</p>
            <p v-if="okMsg" class="ok-line">{{ okMsg }}</p>

            <!-- 档案 -->
            <section v-if="tab === 'profile'" class="pane">
              <div class="pane-head">
                <h2>个人档案</h2>
                <p>这些参数用于测算工具的默认值与风险匹配，可随时修改。</p>
              </div>

              <div class="form-grid">
                <div class="field">
                  <label>显示名称</label>
                  <input v-model="profile.display_name" class="input" />
                </div>
                <div class="field">
                  <label>手机号（可选）</label>
                  <input v-model="profile.phone" class="input" placeholder="仅用于账户识别" />
                </div>
                <div class="field">
                  <label>性别</label>
                  <select v-model="profile.gender" class="select">
                    <option value="">未填写</option>
                    <option>男</option>
                    <option>女</option>
                  </select>
                </div>
                <div class="field">
                  <label>出生年月</label>
                  <input v-model="profile.birth_month" type="month" class="input" />
                </div>
                <div class="field">
                  <label>职业类型</label>
                  <select v-model="profile.job_type" class="select">
                    <option value="">未填写</option>
                    <option>企业职工</option>
                    <option>机关事业单位</option>
                    <option>灵活就业</option>
                    <option>城乡居民</option>
                    <option>已退休</option>
                  </select>
                </div>
                <div class="field">
                  <label>所在城市</label>
                  <input v-model="profile.city" class="input" placeholder="例如：杭州" />
                </div>
                <div class="field">
                  <label>家庭月收入（元）</label>
                  <input v-model="profile.monthly_income" type="number" class="input" />
                </div>
                <div class="field">
                  <label>家庭月支出（元）</label>
                  <input v-model="profile.monthly_expense" type="number" class="input" />
                </div>
                <div class="field">
                  <label>预期寿命（岁）</label>
                  <input v-model="profile.expected_life" type="number" class="input" />
                </div>
                <div class="field">
                  <label>风险偏好</label>
                  <select v-model="profile.risk_level" class="select">
                    <option value="">未测评</option>
                    <option>保守型</option>
                    <option>稳健型</option>
                    <option>成长型</option>
                    <option>进取型</option>
                  </select>
                </div>
              </div>

              <div class="pane-actions">
                <button class="btn" :disabled="busy" @click="saveProfile">{{ busy ? '保存中…' : '保存修改' }}</button>
              </div>
            </section>

            <!-- 记录 -->
            <section v-else-if="tab === 'records'" class="pane">
              <div class="pane-head">
                <h2>测算记录</h2>
                <p>保存过的养老缺口测算，可对比不同参数假设下的结果。</p>
              </div>

              <div v-if="loadingData" class="pane-empty">加载中…</div>
              <div v-else-if="!records.length" class="pane-empty">
                还没有测算记录。前往<RouterLink to="/tools#gap" class="inline-link">缺口测算</RouterLink>并保存一次。
              </div>
              <div v-else class="rec-list">
                <div v-for="r in records" :key="r.id" class="rec-item">
                  <div class="rec-main">
                    <div class="rec-top">
                      <span class="tag pine">{{ r.title }}</span>
                      <span class="mono rec-time">{{ dateText(r.created_at) }}</span>
                    </div>
                    <div class="rec-nums">
                      <div>
                        <span class="rn-label">缺口</span>
                        <span class="rn-val mono" :class="r.result?.gap > 0 ? 'neg' : 'pos'">
                          {{ wan(Math.abs(r.result?.gap || 0)) }}
                        </span>
                      </div>
                      <div>
                        <span class="rn-label">覆盖率</span>
                        <span class="rn-val mono">{{ r.result?.coverage ?? '—' }}%</span>
                      </div>
                      <div>
                        <span class="rn-label">所需月储蓄</span>
                        <span class="rn-val mono">{{ money(r.result?.requiredMonthlySaving) }}</span>
                      </div>
                      <div>
                        <span class="rn-label">参数</span>
                        <span class="rn-param mono">
                          {{ r.payload?.currentAge }}→{{ r.payload?.retireAge }}岁 · 通胀
                          {{ ((r.payload?.inflation || 0) * 100).toFixed(1) }}%
                        </span>
                      </div>
                    </div>
                  </div>
                  <button class="del-btn" @click="removeRecord(r.id)">删除</button>
                </div>
              </div>
            </section>

            <!-- 收藏 -->
            <section v-else-if="tab === 'favorites'" class="pane">
              <div class="pane-head">
                <h2>我的收藏</h2>
                <p>收藏的政策文件与知识文章。</p>
              </div>

              <div v-if="!favorites.length" class="pane-empty">
                还没有收藏。浏览<RouterLink to="/policies" class="inline-link">政策库</RouterLink>或<RouterLink
                  to="/knowledge"
                  class="inline-link"
                  >知识库</RouterLink
                >时点击收藏即可。
              </div>
              <div v-else class="fav-list">
                <div v-for="f in favorites" :key="f.id" class="fav-item">
                  <span class="tag">{{ typeLabel[f.item_type] }}</span>
                  <RouterLink :to="favLink(f)" class="fav-title">{{ f.title }}</RouterLink>
                  <button class="del-btn" @click="removeFav(f)">移除</button>
                </div>
              </div>
            </section>

            <!-- 我的笔记 -->
            <section v-else-if="tab === 'notes'" class="pane">
              <div class="pane-head">
                <h2>我的笔记</h2>
                <p>记录你的养老规划要点、待办与疑问，数据保存在 MySQL 用户库中。</p>
              </div>

              <div class="note-editor">
                <input v-model="noteForm.title" class="input" placeholder="标题（可选）" />
                <textarea
                  v-model="noteForm.content"
                  class="input note-content"
                  rows="5"
                  placeholder="例如：查了本地长护险试点政策，下周去街道问申请材料……"
                ></textarea>
                <div class="note-actions">
                  <button class="btn" :disabled="noteBusy" @click="saveNote">
                    {{ noteForm.id ? '保存修改' : '添加笔记' }}
                  </button>
                  <button v-if="noteForm.id" class="btn ghost small" @click="noteForm = { id: null, title: '', content: '' }">
                    取消编辑
                  </button>
                  <span v-if="noteMsg" class="err-line">{{ noteMsg }}</span>
                </div>
              </div>

              <div v-if="!notes.length" class="pane-empty">还没有笔记，写下第一条吧。</div>
              <div v-else class="note-list">
                <article v-for="n in notes" :key="n.id" class="note-card">
                  <div class="nc-head">
                    <h3 class="nc-title">{{ n.title }}</h3>
                    <span class="mono nc-time">{{ dateText(n.updated_at) }}</span>
                  </div>
                  <p class="nc-body">{{ n.content }}</p>
                  <div class="nc-ops">
                    <button class="btn ghost small" @click="editNote(n)">编辑</button>
                    <button class="btn ghost small danger" @click="removeNote(n.id)">删除</button>
                  </div>
                </article>
              </div>
            </section>

            <!-- 风险测评 -->
            <section v-else-if="tab === 'risk'" class="pane">
              <div class="pane-head">
                <h2>风险承受能力测评</h2>
                <p>8 道题，用于判断你的风险偏好档位，结果会写入个人档案。</p>
              </div>

              <div v-if="risk && !riskQuestions.length" class="risk-result">
                <div class="rr-head">
                  <span class="rr-label mono">最近结果</span>
                  <span class="mono rr-date">{{ dateText(risk.created_at) }}</span>
                </div>
                <div class="rr-body">
                  <div class="rr-score">
                    <span class="mono rr-num">{{ risk.score }}</span>
                    <span class="rr-unit">/ 100</span>
                  </div>
                  <div class="rr-level">{{ risk.level }}</div>
                </div>
                <button class="btn ghost small" @click="loadRisk">重新测评</button>
              </div>

              <div v-else-if="!riskQuestions.length" class="risk-start">
                <p>共 8 题，约需 2 分钟。请按真实情况作答，不必选择"看起来更专业"的选项。</p>
                <button class="btn" @click="loadRisk">开始测评</button>
              </div>

              <div v-else class="risk-form">
                <div v-for="(q, qi) in riskQuestions" :key="q.id" class="rq">
                  <div class="rq-title">
                    <span class="mono rq-no">{{ String(qi + 1).padStart(2, '0') }}</span>
                    <span>{{ q.text }}</span>
                  </div>
                  <div class="rq-options">
                    <button
                      v-for="(o, oi) in q.options"
                      :key="oi"
                      class="rq-opt"
                      :class="{ on: riskAnswers[qi] === oi }"
                      @click="riskAnswers[qi] = oi"
                    >
                      {{ o.label }}
                    </button>
                  </div>
                </div>
                <button class="btn" :disabled="riskBusy" @click="submitRisk">
                  {{ riskBusy ? '计算中…' : '提交测评' }}
                </button>
              </div>

              <div v-if="riskResult" class="risk-done">
                <div class="rd-level">{{ riskResult.level }}</div>
                <div class="rd-score mono">得分 {{ riskResult.score }} / 100</div>
                <p class="rd-sug">{{ riskResult.suggestion }}</p>
                <button class="btn ghost small" @click="riskQuestions = []; riskResult = null">重新测评</button>
              </div>
            </section>

            <!-- AI 会话 -->
            <section v-else class="pane">
              <div class="pane-head">
                <h2>AI 会话记录</h2>
                <p>与养老金融顾问的历史对话。</p>
              </div>
              <div v-if="!conversations.length" class="pane-empty">
                还没有会话记录。前往<RouterLink to="/advisor" class="inline-link">AI 顾问</RouterLink>开始一次对话。
              </div>
              <div v-else class="conv-list">
                <RouterLink v-for="c in conversations" :key="c.id" to="/advisor" class="conv-row">
                  <span class="cr-title">{{ c.title }}</span>
                  <span class="mono cr-time">{{ dateText(c.updated_at) }}</span>
                </RouterLink>
              </div>
            </section>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.head-actions {
  margin-top: 20px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

/* 登录 */
.auth-wrap {
  display: grid;
  grid-template-columns: 420px 1fr;
  gap: 64px;
  align-items: start;
}

.auth-card {
  background: var(--white);
  border: 1px solid var(--line-strong);
  padding: 26px;
}

.auth-tabs {
  display: flex;
  border-bottom: 1px solid var(--line);
  margin-bottom: 22px;
}

.at {
  flex: 1;
  padding: 11px 0;
  background: none;
  border: 0;
  border-bottom: 2px solid transparent;
  color: var(--ink-3);
  font-size: 14px;
  font-family: inherit;
  margin-bottom: -1px;
  transition: color 0.15s ease, border-color 0.15s ease;
}

.at.on {
  color: var(--pine);
  border-bottom-color: var(--cinnabar);
  font-weight: 500;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.full {
  width: 100%;
}

.err-line {
  font-size: 12.5px;
  color: var(--cinnabar);
  background: var(--cinnabar-soft);
  padding: 8px 11px;
  border-left: 2px solid var(--cinnabar);
  line-height: 1.6;
}

.ok-line {
  font-size: 12.5px;
  color: var(--pine);
  background: var(--pine-soft);
  padding: 8px 11px;
  border-left: 2px solid var(--pine);
  margin-bottom: 16px;
}

.demo-hint {
  display: flex;
  gap: 12px;
  padding: 10px 12px;
  background: var(--paper-2);
  align-items: flex-start;
}

.demo-hint .mono {
  font-size: 9.5px;
  letter-spacing: 0.14em;
  color: var(--ink-4);
  padding-top: 3px;
  flex-shrink: 0;
}

.demo-hint p {
  font-size: 11.5px;
  line-height: 1.7;
  color: var(--ink-3);
}

.demo-hint b {
  color: var(--ink-2);
}

.auth-side {
  display: flex;
  flex-direction: column;
  gap: 30px;
  padding-top: 6px;
}

.as-block {
  border-top: 1px solid var(--line-strong);
  padding-top: 16px;
}

.as-title {
  font-size: 11px;
  letter-spacing: 0.14em;
  color: var(--ink-4);
  font-family: var(--mono);
  text-transform: uppercase;
  margin-bottom: 12px;
}

.as-block ul {
  margin: 0;
  padding-left: 16px;
  font-size: 13px;
  line-height: 1.9;
  color: var(--ink-2);
}

.as-block p {
  font-size: 13px;
  line-height: 1.9;
  color: var(--ink-2);
  max-width: 52ch;
}

/* 账户主体 */
.acct-grid {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  gap: 44px;
  align-items: start;
}

.acct-nav {
  display: flex;
  flex-direction: column;
  gap: 1px;
  position: sticky;
  top: calc(var(--nav-h) + 20px);
  border-left: 1px solid var(--line);
}

.an-item {
  text-align: left;
  padding: 10px 14px;
  background: none;
  border: 0;
  border-left: 2px solid transparent;
  margin-left: -1px;
  font-size: 13.5px;
  color: var(--ink-3);
  font-family: inherit;
  transition: all 0.14s ease;
}

.an-item:hover {
  color: var(--pine);
  background: var(--pine-soft);
}

.an-item.on {
  color: var(--pine);
  border-left-color: var(--cinnabar);
  font-weight: 500;
  background: var(--paper-2);
}

.pane {
  animation: fadeUp 0.28s ease both;
}

.pane-head {
  padding-bottom: 16px;
  border-bottom: 1px solid var(--line-strong);
  margin-bottom: 26px;
}

.pane-head h2 {
  font-size: 22px;
}

.pane-head p {
  margin-top: 7px;
  font-size: 12.5px;
  color: var(--ink-3);
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.pane-actions {
  margin-top: 26px;
  padding-top: 20px;
  border-top: 1px solid var(--line);
}

.pane-empty {
  padding: 50px 0;
  text-align: center;
  font-size: 13px;
  color: var(--ink-3);
  line-height: 1.9;
}

.inline-link {
  color: var(--pine);
  border-bottom: 1px solid var(--pine);
  margin: 0 2px;
}

/* 记录 */
.rec-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.rec-item {
  display: flex;
  gap: 18px;
  align-items: flex-start;
  padding: 16px 0;
  border-bottom: 1px solid var(--line);
}

.rec-main {
  flex: 1;
  min-width: 0;
}

.rec-top {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 11px;
}

.rec-time {
  font-size: 10.5px;
  color: var(--ink-4);
}

.rec-nums {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}

.rn-label {
  display: block;
  font-size: 10.5px;
  color: var(--ink-4);
  margin-bottom: 3px;
}

.rn-val {
  font-size: 17px;
  color: var(--ink);
}

.rn-val.neg {
  color: var(--cinnabar);
}

.rn-val.pos {
  color: var(--pine);
}

.rn-param {
  font-size: 10.5px;
  color: var(--ink-3);
  line-height: 1.5;
}

.del-btn {
  background: none;
  border: 0;
  font-size: 11.5px;
  color: var(--ink-4);
  border-bottom: 1px solid transparent;
  padding: 0;
  font-family: inherit;
  flex-shrink: 0;
}

.del-btn:hover {
  color: var(--cinnabar);
  border-color: var(--cinnabar);
}

/* 收藏 */
.fav-list {
  border-top: 1px solid var(--line-strong);
}

.fav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px 0;
  border-bottom: 1px solid var(--line);
}

.fav-title {
  flex: 1;
  font-size: 13.5px;
  color: var(--ink-2);
  line-height: 1.6;
}

.fav-title:hover {
  color: var(--pine);
}

/* 风险 */
.risk-start {
  padding: 40px 0;
  display: flex;
  flex-direction: column;
  gap: 18px;
  align-items: flex-start;
}

.risk-start p {
  font-size: 13.5px;
  line-height: 1.85;
  color: var(--ink-2);
  max-width: 56ch;
}

.risk-form {
  display: flex;
  flex-direction: column;
  gap: 26px;
}

.rq-title {
  display: flex;
  gap: 12px;
  font-size: 14.5px;
  color: var(--ink);
  margin-bottom: 11px;
  line-height: 1.6;
}

.rq-no {
  font-size: 10.5px;
  color: var(--cinnabar);
  padding-top: 5px;
  flex-shrink: 0;
}

.rq-options {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 7px;
  padding-left: 24px;
}

.rq-opt {
  text-align: left;
  padding: 10px 13px;
  background: var(--white);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  font-size: 12.5px;
  color: var(--ink-2);
  font-family: inherit;
  transition: all 0.14s ease;
}

.rq-opt:hover {
  border-color: var(--pine);
  color: var(--pine);
}

.rq-opt.on {
  background: var(--pine);
  border-color: var(--pine);
  color: var(--white);
}

.risk-result,
.risk-done {
  border: 1px solid var(--line-strong);
  padding: 22px;
  background: var(--white);
}

.rr-head {
  display: flex;
  justify-content: space-between;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 16px;
  font-size: 10.5px;
  color: var(--ink-4);
  letter-spacing: 0.12em;
}

.rr-body {
  display: flex;
  align-items: baseline;
  gap: 20px;
  margin-bottom: 18px;
}

.rr-num {
  font-size: 42px;
  color: var(--pine);
  line-height: 1;
}

.rr-unit {
  font-size: 13px;
  color: var(--ink-4);
}

.rr-level {
  font-family: var(--serif);
  font-size: 22px;
  color: var(--ink);
}

.rd-level {
  font-family: var(--serif);
  font-size: 26px;
  color: var(--pine);
}

.rd-score {
  font-size: 12px;
  color: var(--ink-4);
  margin: 6px 0 14px;
}

.rd-sug {
  font-size: 13.5px;
  line-height: 1.9;
  color: var(--ink-2);
  padding-top: 14px;
  border-top: 1px solid var(--line);
  margin-bottom: 18px;
  max-width: 66ch;
}

/* 会话 */
.conv-list {
  border-top: 1px solid var(--line-strong);
}

.conv-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 13px 0;
  border-bottom: 1px solid var(--line);
}

.cr-title {
  font-size: 13.5px;
  color: var(--ink-2);
}

.conv-row:hover .cr-title {
  color: var(--pine);
}

.cr-time {
  font-size: 10.5px;
  color: var(--ink-4);
}

/* 我的笔记 */
.note-editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  background: var(--paper-2);
  border: 1px solid var(--line-strong);
  margin-bottom: 18px;
}

.note-content {
  resize: vertical;
  font-family: inherit;
  line-height: 1.7;
}

.note-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.note-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.note-card {
  border: 1px solid var(--line);
  background: var(--white);
  padding: 14px 16px;
}

.nc-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.nc-title {
  font-family: var(--serif);
  font-size: 15px;
  color: var(--ink);
  margin: 0;
}

.nc-time {
  font-size: 10.5px;
  color: var(--ink-4);
}

.nc-body {
  font-size: 13px;
  color: var(--ink-2);
  line-height: 1.8;
  white-space: pre-wrap;
  margin: 8px 0 10px;
}

.nc-ops {
  display: flex;
  gap: 8px;
}

.btn.ghost.small.danger {
  color: var(--cinnabar, #b23a2b);
}

@media (max-width: 980px) {
  .auth-wrap {
    grid-template-columns: 1fr;
    gap: 34px;
  }
  .acct-grid {
    grid-template-columns: 1fr;
    gap: 22px;
  }
  .acct-nav {
    position: static;
    flex-direction: row;
    border-left: 0;
    border-bottom: 1px solid var(--line);
    overflow-x: auto;
  }
  .an-item {
    border-left: 0;
    border-bottom: 2px solid transparent;
    margin-left: 0;
    margin-bottom: -1px;
    white-space: nowrap;
  }
  .an-item.on {
    border-left: 0;
    border-bottom-color: var(--cinnabar);
  }
  .form-grid {
    grid-template-columns: 1fr;
  }
  .rec-nums {
    grid-template-columns: 1fr 1fr;
  }
  .rq-options {
    grid-template-columns: 1fr;
  }
}
</style>
