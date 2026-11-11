<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { api, money } from '../lib/api.js'
import PageHeader from '../components/PageHeader.vue'

const items = ref([])
const types = ref([])
const loading = ref(true)
const type = ref('')
const q = ref('')
const selected = ref(null)
let timer = null

async function load() {
  loading.value = true
  try {
    const params = new URLSearchParams()
    if (type.value) params.set('serviceType', type.value)
    if (q.value) params.set('q', q.value)
    const d = await api.get(`/care-services?${params}`)
    items.value = d.items
    types.value = d.types
    if (!selected.value && d.items.length) selected.value = d.items[0]
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(q, () => {
  clearTimeout(timer)
  timer = setTimeout(load, 280)
})

function pickType(t) {
  type.value = type.value === t ? '' : t
  load()
}

const costLabel = (i) => `${money(i.monthly_cost_low)} ~ ${money(i.monthly_cost_high)} 元/月`

const barWidth = computed(() => {
  const max = Math.max(...items.value.map((x) => x.monthly_cost_high || 0), 1)
  return (x) => `${Math.max(6, ((x.monthly_cost_high || 0) / max) * 100)}%`
})
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Care Services"
      title="医养服务参考"
      desc="从居家上门到失能专护，按照护强度与费用区间整理的医养服务类型库。全部为类型化参考数据，帮助你在需求出现前知道市场长什么样、钱大概花在哪。"
    />

    <div class="wrap">
      <div class="care-bar">
        <div class="cs-search">
          <input v-model="q" type="search" placeholder="搜索服务名称或内容" />
        </div>
        <div class="cs-types">
          <button class="chip" :class="{ on: type === '' }" @click="type = ''; load()">全部</button>
          <button
            v-for="t in types"
            :key="t.service_type"
            class="chip"
            :class="{ on: type === t.service_type }"
            @click="pickType(t.service_type)"
          >
            {{ t.service_type }}<span class="chip-n mono">{{ t.c }}</span>
          </button>
        </div>
      </div>

      <div class="notice">
        <span class="mono">NOTE</span>
        <p>
          费用区间取自公开信息的常见水平，不对应任何具体机构。实际价格受城市、房型、护理等级与机构资质影响极大，签约前请实地核验资质并索取报价明细。
        </p>
      </div>

      <div v-if="loading" class="loading">加载中…</div>

      <div v-else class="care-grid">
        <section class="care-list">
          <button
            v-for="c in items"
            :key="c.slug"
            class="care-card"
            :class="{ active: selected?.slug === c.slug }"
            @click="selected = c"
          >
            <div class="cc-top">
              <span class="tag pine">{{ c.service_type }}</span>
              <span class="cc-level">{{ c.care_level }}</span>
            </div>
            <h3 class="cc-name">{{ c.name }}</h3>
            <div class="cc-cost-row">
              <span class="cc-cost mono">{{ costLabel(c) }}</span>
              <div class="cc-bar-track">
                <div class="cc-bar" :style="{ width: barWidth(c) }"></div>
              </div>
            </div>
            <p class="cc-coverage">{{ c.coverage }}</p>
          </button>
        </section>

        <aside v-if="selected" class="care-detail">
          <div class="cd-sticky">
            <div class="cd-head">
              <span class="tag pine">{{ selected.service_type }}</span>
              <h2 class="cd-name">{{ selected.name }}</h2>
              <div class="cd-city mono">{{ selected.city_tier }} · {{ selected.care_level }}</div>
            </div>

            <div class="cd-cost">
              <span class="cd-cost-label">月费用参考区间</span>
              <span class="cd-cost-val mono">{{ costLabel(selected) }}</span>
            </div>

            <div class="cd-block">
              <div class="cd-sub">服务内容</div>
              <p class="cd-text">{{ selected.coverage }}</p>
            </div>

            <div class="cd-block">
              <div class="cd-sub">关键要点</div>
              <ul class="cd-list">
                <li v-for="h in selected.highlights" :key="h">{{ h }}</li>
              </ul>
            </div>

            <div class="cd-block">
              <div class="cd-sub">说明</div>
              <p class="cd-note">{{ selected.notes }}</p>
            </div>

            <div class="cd-links">
              <RouterLink to="/tools#gap" class="btn small">测算护理储备</RouterLink>
              <RouterLink to="/knowledge/elderly-care-institutions-guide" class="btn ghost small">阅读选型指南</RouterLink>
            </div>
          </div>
        </aside>
      </div>
    </div>
  </div>
</template>

<style scoped>
.care-bar {
  display: flex;
  align-items: center;
  gap: 20px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--line-strong);
  margin-bottom: 24px;
  flex-wrap: wrap;
}

.cs-search input {
  height: 40px;
  padding: 0 14px;
  background: var(--white);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  font-size: 14px;
  min-width: 240px;
  outline: none;
}

.cs-search input:focus {
  border-color: var(--pine);
}

.cs-types {
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

.notice {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  padding: 14px 18px;
  background: var(--gold-soft);
  border-left: 2px solid var(--gold);
  margin-bottom: 30px;
}

.notice .mono {
  font-size: 10px;
  letter-spacing: 0.16em;
  color: var(--gold);
  padding-top: 3px;
  flex-shrink: 0;
}

.notice p {
  font-size: 12.5px;
  line-height: 1.8;
  color: var(--ink-2);
}

.loading {
  padding: 60px 0;
  text-align: center;
  color: var(--ink-3);
}

.care-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 44px;
  align-items: start;
}

.care-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.care-card {
  text-align: left;
  padding: 18px 20px;
  background: var(--white);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  font-family: inherit;
  transition: all 0.15s ease;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.care-card:hover {
  border-color: var(--pine);
  background: var(--pine-soft);
}

.care-card.active {
  border-color: var(--pine);
  box-shadow: inset 3px 0 0 var(--cinnabar);
  background: var(--paper-2);
}

.cc-top {
  display: flex;
  align-items: center;
  gap: 10px;
}

.cc-level {
  font-size: 11px;
  color: var(--ink-3);
}

.cc-name {
  font-size: 17px;
  color: var(--ink);
}

.cc-cost-row {
  display: flex;
  align-items: center;
  gap: 14px;
}

.cc-cost {
  font-size: 14.5px;
  color: var(--pine);
  white-space: nowrap;
}

.cc-bar-track {
  flex: 1;
  height: 4px;
  background: var(--paper-3);
  border-radius: 2px;
  overflow: hidden;
}

.cc-bar {
  height: 100%;
  background: linear-gradient(90deg, var(--pine), var(--cinnabar));
}

.cc-coverage {
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--ink-2);
}

.care-detail {
  position: sticky;
  top: calc(var(--nav-h) + 20px);
}

.cd-sticky {
  background: var(--white);
  border: 1px solid var(--line-strong);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.cd-head {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--line);
}

.cd-name {
  font-size: 21px;
  color: var(--ink);
}

.cd-city {
  font-size: 11px;
  color: var(--ink-3);
}

.cd-cost {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 14px 16px;
  background: var(--pine-soft);
  border-left: 2px solid var(--pine);
}

.cd-cost-label {
  font-size: 10.5px;
  color: var(--ink-3);
}

.cd-cost-val {
  font-size: 19px;
  color: var(--pine);
}

.cd-block {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.cd-sub {
  font-size: 10.5px;
  letter-spacing: 0.12em;
  color: var(--ink-4);
  font-family: var(--mono);
  text-transform: uppercase;
}

.cd-text {
  font-size: 13px;
  line-height: 1.8;
  color: var(--ink-2);
}

.cd-list {
  margin: 0;
  padding-left: 16px;
  font-size: 13px;
  line-height: 1.85;
  color: var(--ink-2);
}

.cd-list li {
  margin-bottom: 4px;
}

.cd-note {
  font-size: 12px;
  line-height: 1.8;
  color: var(--ink-3);
}

.cd-links {
  display: flex;
  gap: 10px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
}

@media (max-width: 980px) {
  .care-grid {
    grid-template-columns: 1fr;
  }
  .care-detail {
    position: static;
    order: -1;
  }
}
</style>
