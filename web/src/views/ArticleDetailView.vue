<script setup>
import { ref, onMounted, watch, computed } from 'vue'
import { useRoute } from 'vue-router'
import { api, isLoggedIn } from '../lib/api.js'
import { renderMarkdown } from '../lib/markdown.js'

const route = useRoute()
const item = ref(null)
const related = ref([])
const loading = ref(true)
const error = ref('')
const favorited = ref(false)
const progress = ref(0)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const d = await api.get(`/articles/${route.params.slug}`)
    item.value = d.item
    related.value = d.related
    if (isLoggedIn()) {
      const favs = await api.get('/favorites').catch(() => [])
      favorited.value = favs.some((f) => f.item_type === 'article' && f.item_id === d.item.id)
    }
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function toggleFav() {
  if (!isLoggedIn()) return
  const r = await api.post('/favorites', { itemType: 'article', itemId: item.value.id })
  favorited.value = r.favorited
}

const html = computed(() => (item.value ? renderMarkdown(item.value.body) : ''))

// 阅读进度
function onScroll() {
  const h = document.documentElement
  const total = h.scrollHeight - h.clientHeight
  progress.value = total > 0 ? Math.min(100, (h.scrollTop / total) * 100) : 0
}

onMounted(() => {
  load()
  window.addEventListener('scroll', onScroll, { passive: true })
})
watch(() => route.params.slug, load)

// 目录提取
const toc = computed(() => {
  if (!item.value) return []
  return String(item.value.body)
    .split('\n')
    .filter((l) => /^##\s+/.test(l))
    .map((l) => l.replace(/^##\s+/, '').trim())
})
</script>

<template>
  <div>
    <div class="progress-bar" :style="{ width: progress + '%' }"></div>

    <div class="wrap detail-wrap">
      <div v-if="loading" class="loading-state">
        <div class="sk-line w30"></div>
        <div class="sk-line w70 tall"></div>
        <div class="sk-line w90"></div>
      </div>

      <div v-else-if="error" class="error-state">
        <span class="mono">404</span>
        <h2>未找到该文章</h2>
        <p>{{ error }}</p>
        <RouterLink to="/knowledge" class="btn ghost small">返回知识库</RouterLink>
      </div>

      <template v-else>
        <nav class="crumbs">
          <RouterLink to="/knowledge">知识库</RouterLink>
          <span>/</span>
          <span>{{ item.category }}</span>
        </nav>

        <header class="art-head">
          <div class="ah-meta">
            <span class="tag pine">{{ item.category }}</span>
            <span class="mono ah-read">{{ item.read_minutes }} 分钟阅读</span>
          </div>
          <h1 class="ah-title">{{ item.title }}</h1>
          <p class="ah-summary">{{ item.summary }}</p>
          <div class="ah-line">
            <span>{{ item.source_name }}</span>
            <span class="ah-tags">
              <span v-for="t in item.tags" :key="t" class="tag">{{ t }}</span>
            </span>
          </div>
        </header>

        <!-- 移动端正文目录（窄屏显示，桌面端由右侧栏承担） -->
        <div v-if="toc.length" class="mobile-toc">
          <details class="mtoc-box">
            <summary class="mtoc-title">本文目录（{{ toc.length }} 节）</summary>
            <ol class="toc">
              <li v-for="(t, i) in toc" :key="i">{{ t }}</li>
            </ol>
          </details>
        </div>

        <div class="art-grid">
          <article class="prose art-body" v-html="html"></article>

          <aside class="art-side">
            <div class="side-sticky">
              <div v-if="toc.length" class="side-block">
                <div class="sb-title">本文目录</div>
                <ol class="toc">
                  <li v-for="(t, i) in toc" :key="i">{{ t }}</li>
                </ol>
              </div>

              <button class="btn ghost small full" :disabled="!isLoggedIn()" @click="toggleFav">
                {{ !isLoggedIn() ? '登录后可收藏' : favorited ? '已收藏' : '收藏文章' }}
              </button>

              <div class="side-block">
                <div class="sb-title">相关阅读</div>
                <RouterLink v-for="r in related" :key="r.slug" :to="`/knowledge/${r.slug}`" class="rel-item">
                  <span class="rel-cat mono">{{ r.category }}</span>
                  <span class="rel-title">{{ r.title }}</span>
                </RouterLink>
                <p v-if="!related.length" class="rel-empty">暂无相关文章</p>
              </div>

              <div class="side-block">
                <div class="sb-title">把它用起来</div>
                <p class="cta-desc">读完概念，用工具算出你自己的数字。</p>
                <RouterLink to="/tools" class="btn small full">打开测算中心</RouterLink>
              </div>
            </div>
          </aside>
        </div>

        <div class="art-foot">
          <span class="mono">END</span>
          <p>本文由医讯通编辑整理。政策与数据以官方发布为准，涉及个人决策请咨询持牌专业人士。</p>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.progress-bar {
  position: fixed;
  top: var(--nav-h);
  left: 0;
  height: 2px;
  background: var(--cinnabar);
  z-index: 60;
  transition: width 0.1s linear;
}

.detail-wrap {
  padding-top: 34px;
}

.crumbs {
  display: flex;
  gap: 8px;
  font-size: 12px;
  color: var(--ink-3);
  margin-bottom: 26px;
  font-family: var(--mono);
}

.crumbs a:hover {
  color: var(--pine);
  border-bottom: 1px solid var(--pine);
}

.art-head {
  padding-bottom: 30px;
  border-bottom: 1px solid var(--line-strong);
  max-width: 78ch;
}

.ah-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.ah-read {
  font-size: 11px;
  color: var(--ink-3);
}

.ah-title {
  font-size: clamp(27px, 3.6vw, 42px);
  line-height: 1.28;
  letter-spacing: -0.025em;
  color: var(--ink);
  max-width: 22ch;
}

.ah-summary {
  margin-top: 18px;
  font-size: 15.5px;
  line-height: 1.85;
  color: var(--ink-2);
  max-width: 64ch;
  padding-left: 18px;
  border-left: 2px solid var(--cinnabar);
}

.ah-line {
  margin-top: 22px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  font-size: 11.5px;
  color: var(--ink-4);
}

.ah-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.art-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 250px;
  gap: 60px;
  align-items: start;
  margin-top: 40px;
}

.art-body {
  max-width: 70ch;
}

.side-sticky {
  position: sticky;
  top: calc(var(--nav-h) + 20px);
  display: flex;
  flex-direction: column;
  gap: 24px;
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

.toc {
  margin: 0;
  padding-left: 16px;
  font-size: 12.5px;
  line-height: 1.75;
  color: var(--ink-3);
}

.toc li {
  margin-bottom: 7px;
}

.rel-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 9px 0;
  border-bottom: 1px solid var(--line);
}

.rel-item:last-child {
  border-bottom: 0;
}

.rel-cat {
  font-size: 10px;
  color: var(--ink-4);
}

.rel-title {
  font-size: 13px;
  line-height: 1.6;
  color: var(--ink-2);
  transition: color 0.15s ease;
}

.rel-item:hover .rel-title {
  color: var(--pine);
}

.rel-empty {
  font-size: 12.5px;
  color: var(--ink-4);
}

.cta-desc {
  font-size: 12.5px;
  line-height: 1.75;
  color: var(--ink-3);
  margin-bottom: 12px;
}

.full {
  width: 100%;
}

.art-foot {
  margin-top: 56px;
  padding-top: 22px;
  border-top: 1px solid var(--line);
  display: flex;
  gap: 18px;
  align-items: flex-start;
  max-width: 70ch;
}

.art-foot .mono {
  font-size: 10px;
  letter-spacing: 0.2em;
  color: var(--ink-4);
  padding-top: 4px;
}

.art-foot p {
  font-size: 12px;
  line-height: 1.8;
  color: var(--ink-4);
}

.loading-state {
  padding: 40px 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sk-line {
  height: 12px;
  background: linear-gradient(90deg, var(--paper-3) 25%, var(--paper-2) 50%, var(--paper-3) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.3s infinite;
}

.sk-line.tall {
  height: 34px;
}

.w30 {
  width: 30%;
}
.w70 {
  width: 70%;
}
.w90 {
  width: 90%;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.error-state {
  padding: 90px 0;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.error-state .mono {
  font-size: 12px;
  letter-spacing: 0.2em;
  color: var(--cinnabar);
}

.error-state h2 {
  font-size: 22px;
}

.error-state p {
  font-size: 13px;
  color: var(--ink-3);
}

@media (max-width: 980px) {
  .art-grid {
    grid-template-columns: 1fr;
    gap: 40px;
  }
  .art-side {
    order: -1;
  }
  .side-sticky {
    position: static;
  }
  .ah-title {
    max-width: none;
  }
  .toc {
    display: none;
  }
  /* 移动端：侧栏隐藏，改用正文内目录卡 */
  .mobile-toc {
    display: block;
    margin: 0 0 30px;
  }
  .mtoc-box {
    border: 1px solid var(--line);
    border-left: 3px solid var(--pine-2);
    border-radius: var(--radius);
    background: var(--white);
    padding: 12px 16px;
  }
  .mtoc-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--pine);
    cursor: pointer;
  }
  .mtoc-box[open] .mtoc-title {
    margin-bottom: 8px;
  }
  .mtoc-box .toc {
    display: block;
    margin: 0;
  }
}
</style>
