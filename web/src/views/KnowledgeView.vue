<script setup>
import { ref, onMounted, watch } from 'vue'
import { api } from '../lib/api.js'
import PageHeader from '../components/PageHeader.vue'

const items = ref([])
const categories = ref([])
const loading = ref(true)
const q = ref('')
const category = ref('')
let timer = null

async function load() {
  loading.value = true
  try {
    const params = new URLSearchParams()
    if (q.value) params.set('q', q.value)
    if (category.value) params.set('category', category.value)
    params.set('limit', '60')
    const d = await api.get(`/articles?${params}`)
    items.value = d.items
    categories.value = d.categories
  } finally {
    loading.value = false
  }
}

watch(category, load)
watch(q, () => {
  clearTimeout(timer)
  timer = setTimeout(load, 280)
})
onMounted(load)

function reset() {
  q.value = ''
  category.value = ''
  load()
}

const featured = () => items.value.find((x) => x.featured)
const rest = () => items.value.filter((x) => x !== featured())
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Knowledge Library"
      title="知识库"
      desc="不是产品说明书，是判断依据。每篇长文把制度、公式、成本与风险拆开讲清楚，标注数据口径，区分政策规定与经验判断。"
    />

    <div class="wrap">
      <div class="kb-bar">
        <div class="kb-search">
          <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
            <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.4" />
            <path d="M12.8 12.8 L17 17" stroke="currentColor" stroke-width="1.4" />
          </svg>
          <input v-model="q" type="search" placeholder="搜索文章标题或内容" />
        </div>
        <div class="kb-cats">
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
      </div>

      <div v-if="loading" class="sk-grid">
        <div v-for="i in 6" :key="i" class="sk-card"></div>
      </div>

      <div v-else-if="!items.length" class="empty">
        <div class="empty-mark mono">∅</div>
        <h3>没有匹配的文章</h3>
        <p>换一个关键词，或清除筛选。</p>
        <button class="btn ghost small" @click="reset">清除筛选</button>
      </div>

      <template v-else>
        <RouterLink
          v-if="featured()"
          :to="`/knowledge/${featured().slug}`"
          class="feat"
        >
          <div class="feat-left">
            <div class="feat-cat mono">{{ featured().category }} · 主编推荐</div>
            <h2 class="feat-title">{{ featured().title }}</h2>
            <p class="feat-summary">{{ featured().summary }}</p>
            <div class="feat-meta">
              <span class="mono">{{ featured().read_minutes }} 分钟阅读</span>
              <span class="feat-tags">
                <span v-for="t in featured().tags.slice(0, 3)" :key="t" class="tag">{{ t }}</span>
              </span>
            </div>
          </div>
          <div class="feat-right">
            <div class="fr-mark mono">READ</div>
            <div class="fr-num mono">{{ String(items.length).padStart(2, '0') }}</div>
            <div class="fr-note">篇长文<br />持续更新</div>
          </div>
        </RouterLink>

        <div class="kb-grid">
          <RouterLink v-for="a in rest()" :key="a.slug" :to="`/knowledge/${a.slug}`" class="kb-card">
            <div class="kc-cat mono">{{ a.category }}</div>
            <h3 class="kc-title">{{ a.title }}</h3>
            <p class="kc-summary">{{ a.summary }}</p>
            <div class="kc-foot">
              <span class="mono">{{ a.read_minutes }} 分钟</span>
              <span class="kc-arrow">→</span>
            </div>
          </RouterLink>
        </div>
      </template>

      <div class="foot-note">
        <span class="mono">NOTE</span>
        <p>
          知识库文章由本站编辑整理，数据引用均标注年份与来源机构，分析部分为编者判断，不代表官方立场。涉及个人具体情况时，请以社保经办机构核定与持牌机构合同条款为准。
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.kb-bar {
  display: flex;
  align-items: center;
  gap: 22px;
  padding-bottom: 22px;
  border-bottom: 1px solid var(--line-strong);
  margin-bottom: 34px;
  flex-wrap: wrap;
}

.kb-search {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 42px;
  padding: 0 14px;
  background: var(--white);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  color: var(--ink-3);
  min-width: 300px;
  flex: 0 1 380px;
}

.kb-search:focus-within {
  border-color: var(--pine);
}

.kb-search input {
  flex: 1;
  border: 0;
  outline: none;
  background: transparent;
  font-size: 14px;
}

.kb-cats {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
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

/* 头条 */
.feat {
  display: grid;
  grid-template-columns: 1fr 220px;
  background: var(--pine);
  color: var(--paper);
  margin-bottom: 34px;
  transition: background 0.2s ease;
}

.feat:hover {
  background: var(--pine-2);
}

.feat-left {
  padding: 38px 38px 34px;
}

.feat-cat {
  font-size: 10.5px;
  letter-spacing: 0.16em;
  color: rgba(244, 242, 236, 0.6);
}

.feat-title {
  margin-top: 14px;
  font-size: clamp(24px, 3vw, 34px);
  line-height: 1.35;
  color: var(--white);
  max-width: 24ch;
}

.feat-summary {
  margin-top: 14px;
  font-size: 14px;
  line-height: 1.85;
  color: rgba(244, 242, 236, 0.8);
  max-width: 62ch;
}

.feat-meta {
  margin-top: 24px;
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  font-size: 11px;
  color: rgba(244, 242, 236, 0.65);
}

.feat-tags {
  display: flex;
  gap: 6px;
}

.feat .tag {
  border-color: rgba(244, 242, 236, 0.3);
  color: rgba(244, 242, 236, 0.85);
}

.feat-right {
  border-left: 1px solid rgba(244, 242, 236, 0.16);
  padding: 38px 28px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.fr-mark {
  font-size: 10px;
  letter-spacing: 0.2em;
  color: rgba(244, 242, 236, 0.45);
}

.fr-num {
  font-size: 56px;
  line-height: 1;
  color: rgba(244, 242, 236, 0.9);
}

.fr-note {
  font-size: 11.5px;
  line-height: 1.7;
  color: rgba(244, 242, 236, 0.6);
}

/* 网格 */
.kb-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border-top: 1px solid var(--line-strong);
  border-left: 1px solid var(--line);
}

.kb-card {
  padding: 24px 22px;
  border-right: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  background: var(--white);
  display: flex;
  flex-direction: column;
  gap: 11px;
  min-height: 220px;
  transition: background 0.16s ease;
}

.kb-card:hover {
  background: var(--pine-soft);
}

.kc-cat {
  font-size: 10.5px;
  letter-spacing: 0.1em;
  color: var(--ink-4);
}

.kc-title {
  font-size: 17.5px;
  line-height: 1.45;
  color: var(--ink);
}

.kc-summary {
  font-size: 12.5px;
  line-height: 1.8;
  color: var(--ink-2);
  flex: 1;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.kc-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 11px;
  border-top: 1px solid var(--line);
  font-size: 10.5px;
  color: var(--ink-4);
}

.kc-arrow {
  transition: transform 0.16s ease, color 0.16s ease;
}

.kb-card:hover .kc-arrow {
  transform: translateX(3px);
  color: var(--cinnabar);
}

/* 骨架 */
.sk-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0;
  border-top: 1px solid var(--line);
  border-left: 1px solid var(--line);
}

.sk-card {
  height: 220px;
  border-right: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  background: linear-gradient(90deg, var(--paper-2) 25%, var(--white) 50%, var(--paper-2) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.3s infinite;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
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
}

.empty p {
  font-size: 13.5px;
  color: var(--ink-3);
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
  .kb-grid,
  .sk-grid {
    grid-template-columns: 1fr 1fr;
  }
  .feat {
    grid-template-columns: 1fr;
  }
  .feat-right {
    border-left: 0;
    border-top: 1px solid rgba(244, 242, 236, 0.16);
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    padding: 20px 28px;
  }
  .fr-num {
    font-size: 34px;
  }
}

@media (max-width: 640px) {
  .kb-grid,
  .sk-grid {
    grid-template-columns: 1fr;
  }
  .kb-search {
    min-width: 0;
    flex: 1 1 100%;
  }
  .feat-left {
    padding: 26px 22px;
  }
}
</style>
