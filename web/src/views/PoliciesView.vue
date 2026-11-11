<script setup>
import { ref, onMounted, watch, computed } from 'vue'
import { api } from '../lib/api.js'
import PageHeader from '../components/PageHeader.vue'

const items = ref([])
const total = ref(0)
const levels = ref([])
const categories = ref([])
const loading = ref(true)
const q = ref('')
const level = ref('')
const category = ref('')
let timer = null

async function load() {
  loading.value = true
  try {
    const params = new URLSearchParams()
    if (q.value) params.set('q', q.value)
    if (level.value) params.set('level', level.value)
    if (category.value) params.set('category', category.value)
    params.set('limit', '60')
    const d = await api.get(`/policies?${params}`)
    items.value = d.items
    total.value = d.total
    levels.value = d.levels
    categories.value = d.categories
  } finally {
    loading.value = false
  }
}

watch([level, category], load)
watch(q, () => {
  clearTimeout(timer)
  timer = setTimeout(load, 280)
})

onMounted(load)

function reset() {
  q.value = ''
  level.value = ''
  category.value = ''
  load()
}

const hasFilter = computed(() => !!(q.value || level.value || category.value))
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Policy Library"
      title="政策库"
      desc="按效力层级与主题归档的养老金融政策文件。每条均标注发布机关、文号、生效日期与来源，正文为要点归纳，原文请循来源链接核对。"
    />

    <div class="wrap">
      <div class="filter-bar">
        <div class="search">
          <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
            <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.4" />
            <path d="M12.8 12.8 L17 17" stroke="currentColor" stroke-width="1.4" />
          </svg>
          <input v-model="q" type="search" placeholder="搜索标题、摘要或正文，如「个人养老金」「延迟退休」" />
        </div>
        <div class="count mono">{{ total }} 份文件</div>
      </div>

      <div class="filter-row">
        <div class="chip-group">
          <span class="chip-label">层级</span>
          <button class="chip" :class="{ on: level === '' }" @click="level = ''">全部</button>
          <button
            v-for="l in levels"
            :key="l.level"
            class="chip"
            :class="{ on: level === l.level }"
            @click="level = l.level"
          >
            {{ l.level }}<span class="chip-n mono">{{ l.c }}</span>
          </button>
        </div>
        <div class="chip-group">
          <span class="chip-label">主题</span>
          <button class="chip" :class="{ on: category === '' }" @click="category = ''">全部</button>
          <button
            v-for="c in categories"
            :key="c.category"
            class="chip"
            :class="{ on: category === c.category }"
            @click="category = c.category"
          >
            {{ c.category }}<span class="chip-n mono">{{ c.c }}</span>
          </button>
        </div>
        <button v-if="hasFilter" class="reset" @click="reset">清除筛选</button>
      </div>

      <div v-if="loading" class="skeleton-list">
        <div v-for="i in 4" :key="i" class="sk-row">
          <div class="sk-line w40"></div>
          <div class="sk-line w80"></div>
          <div class="sk-line w60"></div>
        </div>
      </div>

      <div v-else-if="!items.length" class="empty">
        <div class="empty-mark mono">∅</div>
        <h3>没有匹配的政策文件</h3>
        <p>尝试更换关键词，或清除筛选条件查看全部文件。</p>
        <button class="btn ghost small" @click="reset">清除筛选</button>
      </div>

      <div v-else class="policy-table">
        <div class="pt-head">
          <span>发布日期</span>
          <span>文件</span>
          <span>层级 / 主题</span>
          <span>效力</span>
        </div>
        <RouterLink v-for="p in items" :key="p.slug" :to="`/policies/${p.slug}`" class="pt-row">
          <div class="pt-date mono">{{ p.publish_date }}</div>
          <div class="pt-main">
            <h3 class="pt-title">{{ p.title }}</h3>
            <p class="pt-summary">{{ p.summary }}</p>
            <div class="pt-meta">
              <span v-if="p.doc_no" class="mono doc">{{ p.doc_no }}</span>
              <span>{{ p.issuer }}</span>
            </div>
          </div>
          <div class="pt-tags">
            <span class="tag pine">{{ p.level }}</span>
            <span class="tag">{{ p.category }}</span>
          </div>
          <div class="pt-status">
            <span v-if="p.featured" class="tag red">重点</span>
            <span class="mono pt-eff">{{ p.effective_date ? '生效 ' + p.effective_date : '—' }}</span>
          </div>
        </RouterLink>
      </div>

      <div class="foot-note">
        <span class="mono">NOTE</span>
        <p>
          本站政策条目为公开信息的结构化整理，正文为要点归纳而非原文照录。政策执行中的具体口径（如缴费基数上下限、过渡系数、地方补贴标准）存在地区差异，请以参保地社保经办机构与官方发布为准。
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.filter-bar {
  display: flex;
  align-items: center;
  gap: 20px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 18px;
}

.search {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 44px;
  padding: 0 14px;
  background: var(--white);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  color: var(--ink-3);
  transition: border-color 0.16s ease;
}

.search:focus-within {
  border-color: var(--pine);
}

.search input {
  flex: 1;
  border: 0;
  outline: none;
  background: transparent;
  font-size: 14px;
}

.search input::placeholder {
  color: var(--ink-4);
}

.count {
  font-size: 12px;
  color: var(--ink-3);
  white-space: nowrap;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 26px;
  flex-wrap: wrap;
  padding-bottom: 26px;
  border-bottom: 1px solid var(--line-strong);
}

.chip-group {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.chip-label {
  font-size: 11px;
  letter-spacing: 0.1em;
  color: var(--ink-4);
  font-family: var(--mono);
  margin-right: 4px;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--line);
  background: transparent;
  color: var(--ink-2);
  font-size: 12.5px;
  border-radius: var(--radius);
  transition: all 0.14s ease;
}

.chip:hover {
  border-color: var(--pine);
  color: var(--pine);
}

.chip.on {
  background: var(--pine);
  border-color: var(--pine);
  color: var(--white);
}

.chip-n {
  font-size: 10px;
  opacity: 0.65;
}

.reset {
  margin-left: auto;
  background: none;
  border: 0;
  font-size: 12.5px;
  color: var(--cinnabar);
  border-bottom: 1px solid var(--cinnabar);
  padding: 0;
}

.policy-table {
  margin-top: 0;
}

.pt-head {
  display: grid;
  grid-template-columns: 96px 1fr 168px 130px;
  gap: 22px;
  padding: 12px 0;
  border-bottom: 1px solid var(--line-strong);
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-4);
}

.pt-row {
  display: grid;
  grid-template-columns: 96px 1fr 168px 130px;
  gap: 22px;
  padding: 22px 0;
  border-bottom: 1px solid var(--line);
  align-items: start;
  transition: background 0.15s ease, padding-left 0.15s ease;
}

.pt-row:hover {
  background: rgba(20, 69, 58, 0.035);
  padding-left: 8px;
}

.pt-date {
  font-size: 11.5px;
  color: var(--ink-3);
  padding-top: 5px;
}

.pt-title {
  font-size: 17px;
  line-height: 1.5;
  color: var(--ink);
  transition: color 0.15s ease;
}

.pt-row:hover .pt-title {
  color: var(--pine);
}

.pt-summary {
  margin-top: 7px;
  font-size: 13px;
  line-height: 1.8;
  color: var(--ink-2);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.pt-meta {
  margin-top: 9px;
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 11px;
  color: var(--ink-4);
}

.doc {
  color: var(--ink-3);
}

.pt-tags {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-start;
  padding-top: 3px;
}

.pt-status {
  display: flex;
  flex-direction: column;
  gap: 7px;
  align-items: flex-start;
  padding-top: 3px;
}

.pt-eff {
  font-size: 10.5px;
  color: var(--ink-4);
}

.skeleton-list {
  padding-top: 10px;
}

.sk-row {
  padding: 22px 0;
  border-bottom: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.sk-line {
  height: 11px;
  background: linear-gradient(90deg, var(--paper-3) 25%, var(--paper-2) 50%, var(--paper-3) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.3s infinite;
  border-radius: 1px;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.w40 {
  width: 40%;
}
.w60 {
  width: 60%;
}
.w80 {
  width: 80%;
}

.empty {
  padding: 80px 0;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.empty-mark {
  font-size: 34px;
  color: var(--line-strong);
}

.empty h3 {
  font-size: 19px;
  color: var(--ink);
}

.empty p {
  font-size: 13.5px;
  color: var(--ink-3);
  max-width: 40ch;
}

.foot-note {
  margin-top: 44px;
  padding: 20px 22px;
  background: var(--paper-2);
  border-left: 2px solid var(--cinnabar);
  display: flex;
  gap: 18px;
  align-items: flex-start;
}

.foot-note .mono {
  font-size: 10px;
  letter-spacing: 0.16em;
  color: var(--cinnabar);
  padding-top: 3px;
  flex-shrink: 0;
}

.foot-note p {
  font-size: 12.5px;
  line-height: 1.85;
  color: var(--ink-3);
  max-width: 92ch;
}

@media (max-width: 980px) {
  .pt-head {
    display: none;
  }
  .pt-row {
    grid-template-columns: 1fr;
    gap: 10px;
  }
  .pt-date {
    padding-top: 0;
  }
  .pt-tags {
    flex-direction: row;
  }
  .pt-status {
    flex-direction: row;
    align-items: center;
  }
  .filter-row {
    gap: 14px;
  }
}

@media (max-width: 620px) {
  .filter-bar {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }
  .count {
    text-align: right;
  }
}
</style>
