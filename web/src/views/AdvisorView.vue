<script setup>
import { ref, nextTick, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { api, isLoggedIn, currentUser } from '../lib/api.js'
import { renderMarkdown } from '../lib/markdown.js'
import PageHeader from '../components/PageHeader.vue'

const route = useRoute()
const messages = ref([])
const input = ref('')
const busy = ref(false)
const errMsg = ref('')
const conversationId = ref(null)
const listEl = ref(null)
const refs = ref([])
const conversations = ref([])
const user = computed(() => currentUser())

const presets = [
  '个人养老金每年交 12000 元，对我划算吗？',
  '我 1975 年出生，女工人，什么时候能退休？',
  '退休后每月要花多少钱才够？怎么估算？',
  '年金险和增额终身寿，哪个更适合养老？',
  '父母被推荐了年化 8% 的养老项目，怎么判断风险？',
  '灵活就业人员怎么交社保才不亏？',
]

const greeting = {
  role: 'assistant',
  content:
    '您好，我是医讯通的养老金融顾问。\n\n我可以帮你把这几类问题理清楚：\n\n- **政策口径**：个人养老金、延迟退休、缴费年限、待遇调整\n- **待遇测算**：基本养老金构成、替代率、缺口估算方法\n- **产品特征**：七类可投品种的期限、风险、流动性差异\n- **风险识别**：如何判断以养老为名的非法集资\n\n我会区分「政策规定」与「我的分析」，涉及金额时说明假设。具体产品的合同条款与个人待遇核定，仍需以持牌机构和社保经办机构为准。',
  refs: [],
}

onMounted(async () => {
  messages.value = [{ ...greeting }]
  if (isLoggedIn()) {
    conversations.value = await api.get('/ai/conversations').catch(() => [])
  }
  if (route.query.q) {
    input.value = String(route.query.q)
    nextTick(() => send())
  }
})

async function scrollBottom() {
  await nextTick()
  if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight
}

async function send() {
  const q = input.value.trim()
  if (!q || busy.value) return
  input.value = ''
  errMsg.value = ''
  refs.value = []
  busy.value = true

  messages.value.push({ role: 'user', content: q })
  const bot = { role: 'assistant', content: '', refs: [], streaming: true }
  messages.value.push(bot)
  scrollBottom()

  const history = messages.value
    .slice(0, -2)
    .filter((m) => !m.streaming)
    .map((m) => ({ role: m.role, content: m.content }))

  try {
    const resp = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(localStorage.getItem('yl_token')
          ? { Authorization: `Bearer ${localStorage.getItem('yl_token')}` }
          : {}),
      },
      body: JSON.stringify({ question: q, history, conversationId: conversationId.value }),
    })

    if (!resp.ok || !resp.body) throw new Error(`服务返回 ${resp.status}`)

    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let event = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const raw of lines) {
        const line = raw.trim()
        if (line.startsWith('event:')) {
          event = line.slice(6).trim()
        } else if (line.startsWith('data:')) {
          const payload = line.slice(5).trim()
          if (!payload) continue
          try {
            const data = JSON.parse(payload)
            if (event === 'meta') {
              if (data.refs) refs.value = data.refs
              if (data.conversationId) conversationId.value = data.conversationId
            } else if (event === 'delta') {
              bot.content += data.text
              scrollBottom()
            } else if (event === 'error') {
              errMsg.value = data.message || 'AI 服务暂时不可用'
            }
          } catch {
            /* 忽略解析失败的片段 */
          }
        }
      }
    }

    bot.refs = refs.value
    bot.streaming = false
    if (!bot.content && !errMsg.value) errMsg.value = '没有收到有效回复，请稍后重试'
    if (isLoggedIn()) {
      conversations.value = await api.get('/ai/conversations').catch(() => [])
    }
  } catch (e) {
    bot.streaming = false
    errMsg.value = e.message || '网络异常，请检查连接后重试'
  } finally {
    busy.value = false
    scrollBottom()
  }
}

function usePreset(p) {
  input.value = p
  send()
}

function onKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}

async function loadConversation(id) {
  try {
    const d = await api.get(`/ai/conversations/${id}`)
    conversationId.value = id
    messages.value = d.messages.map((m) => ({
      role: m.role,
      content: m.content,
      refs: m.refs || [],
    }))
    scrollBottom()
  } catch (e) {
    errMsg.value = e.message
  }
}

function newChat() {
  conversationId.value = null
  messages.value = [{ ...greeting }]
  refs.value = []
  errMsg.value = ''
}

function clearChat() {
  newChat()
}

const refLabel = (t) =>
  ({ faq: '常见问题', article: '知识文章', policy: '政策文件', glossary: '术语' })[t] || '资料'

function refLink(r) {
  if (r.type === 'policy' && r.slug) return `/policies/${r.slug}`
  if (r.type === 'article' && r.slug) return `/knowledge/${r.slug}`
  return '/data'
}
</script>

<template>
  <div>
    <PageHeader
      eyebrow="AI Advisor"
      title="养老金融顾问"
      desc="基于本站政策库与知识库检索作答，答案附资料来源。会区分政策规定与分析判断，不承诺收益，不推荐具体在售产品。"
    />

    <div class="wrap">
      <div class="advisor-layout">
        <!-- 侧栏 -->
        <aside class="side">
          <div class="side-block">
            <div class="sb-title">说明</div>
            <ul class="notice-list">
              <li>回答由 AI 生成，可能出错，重要决策请核对原文</li>
              <li>不提供医疗诊断、法律意见、具体产品推荐</li>
              <li>超出养老金融范围的问题会被明确拒绝</li>
            </ul>
          </div>

          <div v-if="isLoggedIn()" class="side-block">
            <div class="sb-title-row">
              <span class="sb-title">历史会话</span>
              <button class="mini-btn" @click="newChat">新建</button>
            </div>
            <div v-if="!conversations.length" class="sb-empty">暂无历史会话</div>
            <button
              v-for="c in conversations"
              :key="c.id"
              class="conv-item"
              :class="{ on: conversationId === c.id }"
              @click="loadConversation(c.id)"
            >
              <span class="ci-title">{{ c.title }}</span>
              <span class="ci-time mono">{{ c.updated_at?.slice(0, 10) }}</span>
            </button>
          </div>

          <div v-else class="side-block">
            <div class="sb-title">登录后可保存</div>
            <p class="sb-note">登录后会话将自动保存，可在「我的账户」中查看历史记录。</p>
            <RouterLink to="/account?login=1" class="btn ghost small full">登录</RouterLink>
          </div>
        </aside>

        <!-- 对话区 -->
        <section class="chat">
          <div ref="listEl" class="chat-list">
            <div v-for="(m, i) in messages" :key="i" class="msg" :class="m.role">
              <div class="msg-avatar">
                {{ m.role === 'user' ? (user?.displayName || '我').slice(0, 1) : '舟' }}
              </div>
              <div class="msg-body">
                <div class="msg-meta">
                  <span class="msg-who">{{ m.role === 'user' ? '你' : '银龄顾问' }}</span>
                  <span v-if="m.streaming" class="msg-typing mono">生成中…</span>
                </div>
                <div class="msg-content" v-html="renderMarkdown(m.content)"></div>
                <span v-if="m.streaming" class="caret"></span>

                <div v-if="m.refs && m.refs.length" class="msg-refs">
                  <span class="mr-label mono">参考</span>
                  <RouterLink
                    v-for="(r, ri) in m.refs.slice(0, 4)"
                    :key="ri"
                    :to="refLink(r)"
                    class="ref-chip"
                  >
                    <span class="rc-type">{{ refLabel(r.type) }}</span>
                    <span class="rc-title">{{ r.title }}</span>
                  </RouterLink>
                </div>
              </div>
            </div>

            <div v-if="errMsg" class="err-box">
              <span class="mono">!</span>
              <p>{{ errMsg }}</p>
            </div>
          </div>

          <div v-if="messages.length <= 1" class="presets">
            <div class="preset-label mono">试试这些问题</div>
            <div class="preset-grid">
              <button v-for="p in presets" :key="p" class="preset" @click="usePreset(p)">
                {{ p }}
              </button>
            </div>
          </div>

          <div class="composer">
            <textarea
              v-model="input"
              class="composer-input"
              rows="2"
              placeholder="描述你的情况或提问，例如：我 40 岁，月收入 1.5 万，应该为养老准备多少？"
              @keydown="onKeydown"
            ></textarea>
            <div class="composer-bar">
              <span class="cb-hint">Enter 发送 · Shift + Enter 换行</span>
              <div class="cb-actions">
                <button v-if="messages.length > 1" class="mini-btn" @click="clearChat">清空</button>
                <button class="btn small" :disabled="busy || !input.trim()" @click="send">
                  {{ busy ? '生成中' : '发送' }}
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.advisor-layout {
  display: grid;
  grid-template-columns: 250px minmax(0, 1fr);
  gap: 34px;
  align-items: start;
}

/* 侧栏 */
.side {
  display: flex;
  flex-direction: column;
  gap: 26px;
  position: sticky;
  top: calc(var(--nav-h) + 20px);
}

.side-block {
  border-top: 1px solid var(--line-strong);
  padding-top: 14px;
}

.sb-title {
  font-size: 10.5px;
  letter-spacing: 0.14em;
  color: var(--ink-4);
  font-family: var(--mono);
  text-transform: uppercase;
  margin-bottom: 11px;
}

.sb-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 11px;
}

.sb-title-row .sb-title {
  margin-bottom: 0;
}

.notice-list {
  margin: 0;
  padding-left: 15px;
  font-size: 12px;
  line-height: 1.8;
  color: var(--ink-3);
}

.notice-list li {
  margin-bottom: 7px;
}

.sb-empty,
.sb-note {
  font-size: 12px;
  color: var(--ink-4);
  line-height: 1.7;
  margin-bottom: 12px;
}

.conv-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  text-align: left;
  padding: 9px 10px;
  background: none;
  border: 0;
  border-left: 2px solid transparent;
  font-family: inherit;
  transition: background 0.14s ease, border-color 0.14s ease;
}

.conv-item:hover {
  background: var(--pine-soft);
}

.conv-item.on {
  border-left-color: var(--cinnabar);
  background: var(--paper-2);
}

.ci-title {
  font-size: 12.5px;
  color: var(--ink-2);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.ci-time {
  font-size: 10px;
  color: var(--ink-4);
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

.full {
  width: 100%;
}

/* 对话 */
.chat {
  border: 1px solid var(--line);
  background: var(--white);
  display: flex;
  flex-direction: column;
  height: clamp(560px, calc(100dvh - 220px), 780px);
}

.chat-list {
  flex: 1;
  padding: 24px 26px 10px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 26px;
  scroll-behavior: smooth;
}

.msg {
  display: flex;
  gap: 13px;
  animation: fadeUp 0.3s ease both;
}

.msg.user {
  flex-direction: row-reverse;
}

.msg-avatar {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  font-size: 12px;
  font-family: var(--serif);
  border-radius: var(--radius);
  background: var(--pine);
  color: var(--white);
}

.msg.user .msg-avatar {
  background: var(--paper-3);
  color: var(--ink-2);
}

.msg-body {
  max-width: 78%;
  min-width: 0;
}

.msg.user .msg-body {
  text-align: right;
}

.msg-meta {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 6px;
}

.msg.user .msg-meta {
  justify-content: flex-end;
}

.msg-who {
  font-size: 10.5px;
  letter-spacing: 0.1em;
  color: var(--ink-4);
  font-family: var(--mono);
}

.msg-typing {
  font-size: 10px;
  color: var(--cinnabar);
  animation: blink 1.1s infinite;
}

.msg-content {
  font-size: 14px;
  line-height: 1.9;
  color: var(--ink-2);
  text-align: left;
}

.msg.user .msg-content {
  background: var(--pine-soft);
  padding: 11px 14px;
  border-radius: var(--radius);
  display: inline-block;
  text-align: left;
  color: var(--ink);
}

.msg-content :deep(p) {
  margin: 0 0 0.85em;
}

.msg-content :deep(p:last-child) {
  margin-bottom: 0;
}

.msg-content :deep(strong) {
  color: var(--ink);
  font-weight: 600;
}

.msg-content :deep(ul),
.msg-content :deep(ol) {
  margin: 0 0 0.9em;
  padding-left: 1.3em;
}

.msg-content :deep(li) {
  margin-bottom: 0.35em;
}

.msg-content :deep(h2),
.msg-content :deep(h3) {
  font-size: 15px;
  margin: 1em 0 0.5em;
  color: var(--ink);
}

.msg-content :deep(code) {
  font-family: var(--mono);
  font-size: 0.9em;
  background: var(--paper-2);
  padding: 1px 5px;
}

.caret {
  display: inline-block;
  width: 6px;
  height: 14px;
  background: var(--cinnabar);
  animation: blink 1s infinite;
  vertical-align: text-bottom;
}

.msg-refs {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--line);
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.mr-label {
  font-size: 9.5px;
  letter-spacing: 0.12em;
  color: var(--ink-4);
  margin-right: 2px;
}

.ref-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  padding: 3px 8px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  font-size: 11px;
  transition: border-color 0.14s ease, background 0.14s ease;
}

.ref-chip:hover {
  border-color: var(--pine);
  background: var(--pine-soft);
}

.rc-type {
  color: var(--cinnabar);
  flex-shrink: 0;
}

.rc-title {
  color: var(--ink-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 190px;
}

.err-box {
  display: flex;
  gap: 10px;
  padding: 12px 14px;
  background: var(--cinnabar-soft);
  border-left: 2px solid var(--cinnabar);
  align-items: flex-start;
}

.err-box .mono {
  color: var(--cinnabar);
  font-size: 12px;
  padding-top: 2px;
}

.err-box p {
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--ink-2);
}

/* 预设 */
.presets {
  padding: 0 26px 20px;
}

.preset-label {
  font-size: 9.5px;
  letter-spacing: 0.14em;
  color: var(--ink-4);
  margin-bottom: 10px;
}

.preset-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.preset {
  text-align: left;
  padding: 10px 12px;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--ink-2);
  font-family: inherit;
  transition: all 0.14s ease;
}

.preset:hover {
  border-color: var(--pine);
  background: var(--pine-soft);
  color: var(--pine);
}

/* 输入 */
.composer {
  border-top: 1px solid var(--line);
  padding: 14px 20px 12px;
  background: var(--paper);
}

.composer-input {
  width: 100%;
  border: 1px solid var(--line-strong);
  background: var(--white);
  border-radius: var(--radius);
  padding: 10px 12px;
  font-size: 14px;
  line-height: 1.7;
  resize: none;
  outline: none;
  font-family: inherit;
  transition: border-color 0.16s ease;
}

.composer-input:focus {
  border-color: var(--pine);
}

.composer-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-top: 9px;
}

.cb-hint {
  font-size: 10.5px;
  color: var(--ink-4);
}

.cb-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

@media (max-width: 980px) {
  .advisor-layout {
    grid-template-columns: 1fr;
    gap: 22px;
  }
  .side {
    position: static;
    order: 2;
  }
  .msg-body {
    max-width: 88%;
  }
  .preset-grid {
    grid-template-columns: 1fr;
  }
  .chat-list {
    max-height: none;
  }
}
</style>
