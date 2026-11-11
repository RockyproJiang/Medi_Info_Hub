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
const favBusy = ref(false)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const d = await api.get(`/policies/${route.params.slug}`)
    item.value = d.item
    related.value = d.related
    if (isLoggedIn()) {
      const favs = await api.get('/favorites').catch(() => [])
      favorited.value = favs.some((f) => f.item_type === 'policy' && f.item_id === d.item.id)
    }
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function toggleFav() {
  if (!isLoggedIn()) return
  favBusy.value = true
  try {
    const r = await api.post('/favorites', { itemType: 'policy', itemId: item.value.id })
    favorited.value = r.favorited
  } finally {
    favBusy.value = false
  }
}

const html = computed(() => (item.value ? renderMarkdown(item.value.body) : ''))

watch(() => route.params.slug, load)
onMounted(load)
</script>

<template>
  <div class="wrap detail-wrap">
    <div v-if="loading" class="loading-state">
      <div class="sk-line w30"></div>
      <div class="sk-line w70 tall"></div>
      <div class="sk-line w90"></div>
      <div class="sk-line w80"></div>
    </div>

    <div v-else-if="error" class="error-state">
      <span class="mono">404</span>
      <h2>未找到该政策文件</h2>
      <p>{{ error }}</p>
      <RouterLink to="/policies" class="btn ghost small">返回政策库</RouterLink>
    </div>

    <template v-else>
      <nav class="crumbs">
        <RouterLink to="/policies">政策库</RouterLink>
        <span>/</span>
        <span>{{ item.category }}</span>
      </nav>

      <div class="detail-grid">
        <article class="main">
          <header class="doc-head">
            <div class="dh-meta">
              <span class="tag pine">{{ item.level }}</span>
              <span class="tag">{{ item.category }}</span>
              <span v-if="item.featured" class="tag red">重点文件</span>
            </div>
            <h1 class="dh-title">{{ item.title }}</h1>
            <div class="dh-line">
              <div class="dh-item">
                <span class="dh-label">发布机关</span>
                <span class="dh-val">{{ item.issuer }}</span>
              </div>
              <div class="dh-item">
                <span class="dh-label">发布日期</span>
                <span class="dh-val mono">{{ item.publish_date }}</span>
              </div>
              <div v-if="item.effective_date" class="dh-item">
                <span class="dh-label">施行日期</span>
                <span class="dh-val mono">{{ item.effective_date }}</span>
              </div>
              <div v-if="item.doc_no" class="dh-item">
                <span class="dh-label">文号</span>
                <span class="dh-val mono">{{ item.doc_no }}</span>
              </div>
            </div>
          </header>

          <div class="abstract">
            <span class="abs-label mono">摘要</span>
            <p>{{ item.summary }}</p>
          </div>

          <section v-if="item.highlights?.length" class="highlights">
            <h2 class="sec-h">核心要点</h2>
            <ol class="hl-list">
              <li v-for="(h, i) in item.highlights" :key="i">
                <span class="hl-n mono">{{ String(i + 1).padStart(2, '0') }}</span>
                <span>{{ h }}</span>
              </li>
            </ol>
          </section>

          <section class="body">
            <h2 class="sec-h">要点整理</h2>
            <div class="prose" v-html="html"></div>
          </section>

          <div class="src-box">
            <div class="sb-head">
              <span class="mono">SOURCE</span>
              <span>资料来源</span>
            </div>
            <p class="sb-name">{{ item.source_name }}</p>
            <a
              v-if="item.source_url"
              :href="item.source_url"
              target="_blank"
              rel="noopener noreferrer"
              class="sb-link mono"
            >
              {{ item.source_url }}
            </a>
            <p class="sb-note">
              本文为要点归纳，非原文照录。引用、转载或据此作出决策前，请核对官方发布的原文。
            </p>
          </div>

          <div v-if="item.tags?.length" class="tag-row">
            <span v-for="t in item.tags" :key="t" class="tag">{{ t }}</span>
          </div>
        </article>

        <aside class="side">
          <div class="side-sticky">
            <button class="btn ghost small full" :disabled="!isLoggedIn() || favBusy" @click="toggleFav">
              {{ !isLoggedIn() ? '登录后可收藏' : favorited ? '已收藏 · 点击取消' : '收藏此文件' }}
            </button>

            <div class="side-block">
              <div class="sb-title">相关文件</div>
              <RouterLink v-for="r in related" :key="r.slug" :to="`/policies/${r.slug}`" class="rel-item">
                <span class="rel-date mono">{{ r.publish_date }}</span>
                <span class="rel-title">{{ r.title }}</span>
              </RouterLink>
              <p v-if="!related.length" class="rel-empty">暂无同主题文件</p>
            </div>

            <div class="side-block">
              <div class="sb-title">下一步</div>
              <p class="cta-desc">想知道这份文件对你个人的影响？用测算工具按自己的参数算一遍。</p>
              <RouterLink to="/tools" class="btn small full">打开测算中心</RouterLink>
            </div>
          </div>
        </aside>
      </div>
    </template>
  </div>
</template>

<style scoped>
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

.detail-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 56px;
  align-items: start;
}

.doc-head {
  padding-bottom: 24px;
  border-bottom: 1px solid var(--line-strong);
}

.dh-meta {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.dh-title {
  font-size: clamp(25px, 3vw, 36px);
  line-height: 1.32;
  letter-spacing: -0.02em;
  color: var(--ink);
  max-width: 30ch;
}

.dh-line {
  margin-top: 22px;
  display: flex;
  flex-wrap: wrap;
  gap: 26px;
}

.dh-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.dh-label {
  font-size: 10.5px;
  letter-spacing: 0.1em;
  color: var(--ink-4);
  font-family: var(--mono);
}

.dh-val {
  font-size: 13px;
  color: var(--ink-2);
}

.abstract {
  margin-top: 26px;
  padding: 20px 22px;
  background: var(--pine-soft);
  border-left: 2px solid var(--pine);
  display: flex;
  gap: 18px;
  align-items: flex-start;
}

.abs-label {
  font-size: 10px;
  letter-spacing: 0.14em;
  color: var(--pine);
  padding-top: 4px;
  flex-shrink: 0;
}

.abstract p {
  font-size: 14.5px;
  line-height: 1.85;
  color: var(--ink);
}

.sec-h {
  font-size: 13px;
  font-family: var(--mono);
  letter-spacing: 0.14em;
  color: var(--ink-3);
  text-transform: uppercase;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 20px;
  font-weight: 400;
}

.highlights {
  margin-top: 40px;
}

.hl-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.hl-list li {
  display: flex;
  gap: 14px;
  padding: 11px 0;
  border-bottom: 1px solid var(--line);
  font-size: 14.5px;
  line-height: 1.8;
  color: var(--ink-2);
}

.hl-n {
  font-size: 11px;
  color: var(--cinnabar);
  padding-top: 5px;
  flex-shrink: 0;
}

.body {
  margin-top: 40px;
}

.src-box {
  margin-top: 44px;
  padding: 20px 22px;
  background: var(--paper-2);
  border: 1px solid var(--line);
}

.sb-head {
  display: flex;
  gap: 10px;
  align-items: baseline;
  font-size: 10.5px;
  letter-spacing: 0.14em;
  color: var(--ink-4);
  font-family: var(--mono);
  padding-bottom: 10px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 12px;
}

.sb-name {
  font-size: 14px;
  color: var(--ink);
  margin-bottom: 6px;
}

.sb-link {
  font-size: 11.5px;
  color: var(--pine);
  word-break: break-all;
  border-bottom: 1px solid transparent;
}

.sb-link:hover {
  border-color: var(--pine);
}

.sb-note {
  margin-top: 12px;
  font-size: 11.5px;
  line-height: 1.75;
  color: var(--ink-3);
}

.tag-row {
  margin-top: 26px;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.side-sticky {
  position: sticky;
  top: calc(var(--nav-h) + 20px);
  display: flex;
  flex-direction: column;
  gap: 26px;
}

.full {
  width: 100%;
}

.side-block {
  border-top: 1px solid var(--line-strong);
  padding-top: 16px;
}

.sb-title {
  font-size: 11px;
  letter-spacing: 0.14em;
  color: var(--ink-4);
  font-family: var(--mono);
  text-transform: uppercase;
  margin-bottom: 12px;
}

.rel-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 0;
  border-bottom: 1px solid var(--line);
}

.rel-item:last-child {
  border-bottom: 0;
}

.rel-date {
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
  margin-bottom: 14px;
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
.w80 {
  width: 80%;
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
  .detail-grid {
    grid-template-columns: 1fr;
    gap: 40px;
  }
  .side-sticky {
    position: static;
  }
  .dh-title {
    max-width: none;
  }
}
</style>
