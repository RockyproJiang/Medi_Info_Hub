<script setup>
import { ref, onMounted, computed } from 'vue'
import { api, money } from '../lib/api.js'
import PageHeader from '../components/PageHeader.vue'
import Chart from '../components/Chart.vue'

const stats = ref([])
const glossary = ref([])
const faqs = ref([])
const loading = ref(true)
const active = ref('population-65')
const gq = ref('')
const fq = ref('')
const openFaq = ref(null)

onMounted(async () => {
  try {
    const [s, g, f] = await Promise.all([api.get('/stats'), api.get('/glossary'), api.get('/faqs')])
    stats.value = s
    glossary.value = g.items
    faqs.value = f.items
  } finally {
    loading.value = false
  }
})

const current = computed(() => stats.value.find((s) => s.key === active.value) || stats.value[0])

const mainChart = computed(() => {
  const s = current.value
  if (!s) return null
  const isPct = s.unit === '%'
  const isWan = s.unit === '万人'
  return {
    grid: { left: 58, right: 28, top: 34, bottom: 34 },
    xAxis: {
      type: 'category',
      data: s.payload.map((x) => x.year),
      axisLabel: { color: '#6b7772', fontSize: 11, fontFamily: 'monospace' },
      axisLine: { lineStyle: { color: '#b8b4a8' } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      scale: true,
      axisLabel: {
        color: '#96a09b',
        fontSize: 10,
        fontFamily: 'monospace',
        formatter: (v) => {
          if (isPct) return v + '%'
          if (isWan) return v >= 10000 ? (v / 10000).toFixed(1) + '亿' : v
          return v
        },
      },
      splitLine: { lineStyle: { color: '#e2dfd6' } },
      axisLine: { show: false },
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#fdfcf9',
      borderColor: '#d3d0c6',
      textStyle: { color: '#1c2622', fontSize: 12 },
      formatter: (p) => `${p[0].axisValue}年<br/>${s.label}：<b>${p[0].value}</b> ${s.unit}`,
    },
    series: [
      {
        type: 'line',
        data: s.payload.map((x) => x.value),
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#14453a', width: 2 },
        itemStyle: { color: '#14453a' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(20,69,58,0.2)' },
              { offset: 1, color: 'rgba(20,69,58,0.01)' },
            ],
          },
        },
        label: {
          show: true,
          position: 'top',
          fontSize: 10,
          fontFamily: 'monospace',
          color: '#6b7772',
          formatter: (p) => (p.dataIndex === s.payload.length - 1 ? p.value : ''),
        },
      },
    ],
  }
})

const barChart = computed(() => {
  const s = current.value
  if (!s) return null
  return {
    grid: { left: 56, right: 20, top: 24, bottom: 30 },
    xAxis: {
      type: 'category',
      data: s.payload.map((x) => x.year),
      axisLabel: { color: '#6b7772', fontSize: 10, fontFamily: 'monospace' },
      axisLine: { lineStyle: { color: '#b8b4a8' } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      scale: true,
      axisLabel: { color: '#96a09b', fontSize: 10, fontFamily: 'monospace' },
      splitLine: { lineStyle: { color: '#e2dfd6' } },
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#fdfcf9',
      borderColor: '#d3d0c6',
      textStyle: { color: '#1c2622', fontSize: 12 },
    },
    series: [
      {
        type: 'bar',
        data: s.payload.map((x, i) => ({
          value: x.value,
          itemStyle: {
            color: i === s.payload.length - 1 ? '#b23a2b' : '#14453a',
            opacity: i === s.payload.length - 1 ? 1 : 0.72,
          },
        })),
        barWidth: '48%',
      },
    ],
  }
})

const change = computed(() => {
  const p = current.value?.payload || []
  if (p.length < 2) return null
  const first = p[0]
  const last = p[p.length - 1]
  const diff = last.value - first.value
  const years = last.year - first.year
  return {
    diff: Math.round(diff * 10) / 10,
    years,
    annual: years ? Math.round((diff / years) * 100) / 100 : 0,
    first,
    last,
  }
})

const filteredGlossary = computed(() => {
  if (!gq.value) return glossary.value
  const q = gq.value.toLowerCase()
  return glossary.value.filter(
    (g) => g.term.toLowerCase().includes(q) || (g.alias || '').toLowerCase().includes(q) || g.definition.includes(gq.value),
  )
})

const filteredFaqs = computed(() => {
  if (!fq.value) return faqs.value
  return faqs.value.filter((f) => f.question.includes(fq.value) || f.answer.includes(fq.value))
})

const gCats = computed(() => [...new Set(glossary.value.map((g) => g.category))])
const fCats = computed(() => [...new Set(faqs.value.map((f) => f.category))])
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Data & Reference"
      title="数据洞察"
      desc="七个关键指标的时间序列、术语释义与高频问答。每个数据点标注来源机构与口径，便于核对与引用。"
    />

    <div class="wrap">
      <div v-if="loading" class="loading">加载中…</div>

      <template v-else>
        <!-- 指标选择 -->
        <section class="metric-nav">
          <button
            v-for="s in stats"
            :key="s.key"
            class="mn-item"
            :class="{ on: active === s.key }"
            @click="active = s.key"
          >
            <span class="mn-label">{{ s.label }}</span>
            <span class="mn-val mono">
              {{ s.payload[s.payload.length - 1].value }}<em>{{ s.unit }}</em>
            </span>
          </button>
        </section>

        <!-- 主图 -->
        <section class="main-block">
          <div class="mb-head">
            <div>
              <h2 class="mb-title">{{ current.label }}</h2>
              <p class="mb-source">来源：{{ current.source }} · 统计区间 {{ current.period }}</p>
            </div>
            <div v-if="change" class="mb-change">
              <span class="mc-label">{{ change.first.year }} → {{ change.last.year }}</span>
              <span class="mc-val mono" :class="change.diff >= 0 ? 'up' : 'down'">
                {{ change.diff >= 0 ? '+' : '' }}{{ change.diff }}{{ current.unit }}
              </span>
              <span class="mc-annual mono">年均 {{ change.annual >= 0 ? '+' : '' }}{{ change.annual }}{{ current.unit }}</span>
            </div>
          </div>

          <div class="chart-pair">
            <div class="cp-main">
              <Chart :option="mainChart" height="300px" />
            </div>
            <div class="cp-side">
              <Chart :option="barChart" height="300px" />
            </div>
          </div>

          <div class="data-table">
            <table class="table">
              <thead>
                <tr>
                  <th>年份</th>
                  <th v-for="p in current.payload" :key="p.year">{{ p.year }}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="mono">{{ current.label }}</td>
                  <td v-for="p in current.payload" :key="p.year" class="mono">{{ p.value }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- 解读 -->
        <section class="reading">
          <h2 class="rd-title">怎么读这组数据</h2>
          <div class="rd-grid">
            <div class="rd-item">
              <span class="rd-n mono">A</span>
              <h3>趋势比单点更重要</h3>
              <p>
                单一年份的数值容易受统计口径调整影响。看五年以上的连续变化，才能判断是结构性趋势还是短期波动。
              </p>
            </div>
            <div class="rd-item">
              <span class="rd-n mono">B</span>
              <h3>关注抚养比的分母</h3>
              <p>
                老年抚养比 = 65岁以上人口 ÷ 15至64岁人口。它上升既可能因为老年人变多，也可能因为劳动年龄人口变少，两者含义不同。
              </p>
            </div>
            <div class="rd-item">
              <span class="rd-n mono">C</span>
              <h3>替代率是估算值</h3>
              <p>
                本站替代率由基本养老金平均水平与城镇单位平均工资测算，属估算口径，与官方公布的国际可比口径可能存在差异。
              </p>
            </div>
          </div>
        </section>

        <!-- 术语 -->
        <section class="glossary">
          <div class="gl-head">
            <div>
              <h2 class="gl-title">术语表</h2>
              <p class="gl-sub">{{ glossary.length }} 条 · 按类别归档</p>
            </div>
            <input v-model="gq" class="input gl-search" placeholder="搜索术语，如「计发月数」" />
          </div>

          <div class="gl-body">
            <div v-for="cat in gCats" :key="cat" class="gl-group">
              <div class="gl-cat mono">{{ cat }}</div>
              <dl class="gl-list">
                <div v-for="g in filteredGlossary.filter((x) => x.category === cat)" :key="g.term" class="gl-item">
                  <dt>
                    {{ g.term }}
                    <span v-if="g.alias" class="gl-alias">{{ g.alias }}</span>
                  </dt>
                  <dd>{{ g.definition }}</dd>
                </div>
              </dl>
            </div>
            <p v-if="!filteredGlossary.length" class="gl-empty">没有匹配的术语</p>
          </div>
        </section>

        <!-- 问答 -->
        <section class="faq">
          <div class="gl-head">
            <div>
              <h2 class="gl-title">高频问答</h2>
              <p class="gl-sub">{{ faqs.length }} 条 · 按主题归档</p>
            </div>
            <input v-model="fq" class="input gl-search" placeholder="搜索问题" />
          </div>

          <div class="faq-list">
            <div
              v-for="(f, i) in filteredFaqs"
              :key="i"
              class="faq-item"
              :class="{ open: openFaq === i }"
            >
              <button class="faq-q" @click="openFaq = openFaq === i ? null : i">
                <span class="fq-mark mono">{{ String(i + 1).padStart(2, '0') }}</span>
                <span class="fq-text">{{ f.question }}</span>
                <span class="fq-cat">{{ f.category }}</span>
                <span class="fq-toggle">{{ openFaq === i ? '−' : '+' }}</span>
              </button>
              <div v-if="openFaq === i" class="faq-a">
                <p>{{ f.answer }}</p>
              </div>
            </div>
            <p v-if="!filteredFaqs.length" class="gl-empty">没有匹配的问题</p>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped>
.loading {
  padding: 60px 0;
  text-align: center;
  color: var(--ink-3);
}

/* 指标导航 */
.metric-nav {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border-top: 1px solid var(--line-strong);
  border-left: 1px solid var(--line);
  margin-bottom: 34px;
}

.mn-item {
  text-align: left;
  padding: 16px 16px 14px;
  border-right: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  background: var(--white);
  display: flex;
  flex-direction: column;
  gap: 7px;
  transition: background 0.15s ease;
  font-family: inherit;
}

.mn-item:hover {
  background: var(--pine-soft);
}

.mn-item.on {
  background: var(--pine);
}

.mn-label {
  font-size: 11.5px;
  color: var(--ink-3);
  line-height: 1.5;
}

.mn-item.on .mn-label {
  color: rgba(244, 242, 236, 0.72);
}

.mn-val {
  font-size: 24px;
  color: var(--pine);
  line-height: 1;
}

.mn-item.on .mn-val {
  color: var(--white);
}

.mn-val em {
  font-style: normal;
  font-size: 10px;
  color: var(--ink-4);
  margin-left: 3px;
}

.mn-item.on .mn-val em {
  color: rgba(244, 242, 236, 0.6);
}

/* 主块 */
.main-block {
  border: 1px solid var(--line);
  background: var(--white);
  padding: 24px;
}

.mb-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--line);
  flex-wrap: wrap;
}

.mb-title {
  font-size: 20px;
}

.mb-source {
  margin-top: 6px;
  font-size: 11px;
  color: var(--ink-4);
  line-height: 1.6;
}

.mb-change {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
}

.mc-label {
  font-size: 10px;
  color: var(--ink-4);
  font-family: var(--mono);
}

.mc-val {
  font-size: 20px;
  line-height: 1.1;
}

.mc-val.up {
  color: var(--cinnabar);
}

.mc-val.down {
  color: var(--pine);
}

.mc-annual {
  font-size: 10.5px;
  color: var(--ink-3);
}

.chart-pair {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 20px;
  padding: 14px 0;
}

.cp-main,
.cp-side {
  min-width: 0;
}

.data-table {
  border-top: 1px solid var(--line);
  overflow-x: auto;
}

.data-table .table {
  min-width: 620px;
}

.data-table td:first-child {
  font-size: 11.5px;
  color: var(--ink-3);
  white-space: nowrap;
}

/* 解读 */
.reading {
  margin-top: 44px;
}

.rd-title {
  font-size: 22px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--line-strong);
  margin-bottom: 24px;
}

.rd-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 30px;
}

.rd-item h3 {
  font-size: 15.5px;
  margin: 8px 0 8px;
}

.rd-item p {
  font-size: 12.5px;
  line-height: 1.85;
  color: var(--ink-2);
}

.rd-n {
  font-size: 11px;
  color: var(--cinnabar);
  letter-spacing: 0.1em;
}

/* 术语 */
.glossary,
.faq {
  margin-top: 54px;
}

.gl-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--line-strong);
  margin-bottom: 24px;
  flex-wrap: wrap;
}

.gl-title {
  font-size: 22px;
}

.gl-sub {
  margin-top: 5px;
  font-size: 11.5px;
  color: var(--ink-4);
}

.gl-search {
  max-width: 280px;
}

.gl-body {
  display: flex;
  flex-direction: column;
  gap: 30px;
}

.gl-cat {
  font-size: 10.5px;
  letter-spacing: 0.14em;
  color: var(--cinnabar);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 12px;
}

.gl-list {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0 40px;
}

.gl-item {
  padding: 11px 0;
  border-bottom: 1px solid var(--line);
}

.gl-item dt {
  font-size: 14px;
  color: var(--ink);
  font-weight: 500;
  margin-bottom: 4px;
}

.gl-alias {
  font-size: 11px;
  color: var(--ink-4);
  font-weight: 400;
  margin-left: 6px;
}

.gl-item dd {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.8;
  color: var(--ink-2);
}

.gl-empty {
  padding: 30px 0;
  text-align: center;
  color: var(--ink-4);
  font-size: 13px;
}

/* 问答 */
.faq-list {
  border-top: 1px solid var(--line-strong);
}

.faq-item {
  border-bottom: 1px solid var(--line);
  transition: background 0.15s ease;
}

.faq-item.open {
  background: var(--white);
}

.faq-q {
  width: 100%;
  display: grid;
  grid-template-columns: 40px 1fr auto 24px;
  gap: 14px;
  align-items: center;
  padding: 16px 8px;
  background: none;
  border: 0;
  text-align: left;
  font-family: inherit;
}

.fq-mark {
  font-size: 10.5px;
  color: var(--ink-4);
}

.fq-text {
  font-size: 14.5px;
  color: var(--ink);
  line-height: 1.6;
}

.faq-item.open .fq-text {
  color: var(--pine);
  font-weight: 500;
}

.fq-cat {
  font-size: 10.5px;
  color: var(--ink-4);
  border: 1px solid var(--line);
  padding: 1px 7px;
  border-radius: var(--radius);
  white-space: nowrap;
}

.fq-toggle {
  font-size: 17px;
  color: var(--ink-3);
  text-align: center;
  line-height: 1;
}

.faq-a {
  padding: 0 8px 18px 54px;
  animation: fadeUp 0.28s ease both;
}

.faq-a p {
  font-size: 13.5px;
  line-height: 1.9;
  color: var(--ink-2);
  max-width: 88ch;
}

@media (max-width: 1080px) {
  .metric-nav {
    grid-template-columns: repeat(2, 1fr);
  }
  .chart-pair {
    grid-template-columns: 1fr;
  }
  .rd-grid {
    grid-template-columns: 1fr;
    gap: 20px;
  }
  .gl-list {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .metric-nav {
    grid-template-columns: 1fr;
  }
  .faq-q {
    grid-template-columns: 1fr 24px;
    gap: 8px;
  }
  .fq-mark,
  .fq-cat {
    display: none;
  }
  .faq-a {
    padding-left: 8px;
  }
  .gl-search {
    max-width: none;
    width: 100%;
  }
}
</style>
