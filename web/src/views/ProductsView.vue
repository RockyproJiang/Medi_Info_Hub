<script setup>
import { ref, onMounted, computed } from 'vue'
import { api } from '../lib/api.js'
import PageHeader from '../components/PageHeader.vue'
import Chart from '../components/Chart.vue'

const items = ref([])
const categories = ref([])
const risks = ref([])
const loading = ref(true)
const category = ref('')
const risk = ref('')
const taxOnly = ref(false)
const sort = ref('category')
const selected = ref(null)

async function load() {
  loading.value = true
  try {
    const params = new URLSearchParams()
    if (category.value) params.set('category', category.value)
    if (risk.value) params.set('risk', risk.value)
    if (taxOnly.value) params.set('taxEligible', '1')
    if (sort.value) params.set('sort', sort.value)
    const d = await api.get(`/products?${params}`)
    items.value = d.items
    categories.value = d.categories
    risks.value = d.risks
    if (!selected.value && d.items.length) selected.value = d.items[0]
  } finally {
    loading.value = false
  }
}

onMounted(load)

const riskOrder = ['极低', '低', '中低', '中', '中高', '高']

const scatter = computed(() => {
  const map = {}
  items.value.forEach((p) => {
    const r = riskOrder.indexOf(p.risk_level)
    if (!map[p.category]) map[p.category] = []
    map[p.category].push({
      name: p.name,
      value: [r + 1, p.yield_high, p.yield_low, p.slug],
      risk: p.risk_level,
    })
  })
  return {
    grid: { left: 52, right: 24, top: 34, bottom: 62 },
    xAxis: {
      type: 'value',
      min: 0.5,
      max: 6.5,
      interval: 1,
      axisLabel: {
        formatter: (v) => riskOrder[v - 1] || '',
        color: '#6b7772',
        fontSize: 11,
      },
      splitLine: { lineStyle: { color: '#e2dfd6' } },
      axisLine: { lineStyle: { color: '#b8b4a8' } },
      name: '风险等级',
      nameLocation: 'middle',
      nameGap: 26,
      nameTextStyle: { color: '#96a09b', fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      name: '年化收益区间上限（%）',
      nameTextStyle: { color: '#96a09b', fontSize: 11, align: 'left' },
      axisLabel: { color: '#96a09b', fontSize: 10, fontFamily: 'monospace' },
      splitLine: { lineStyle: { color: '#e2dfd6' } },
      axisLine: { lineStyle: { color: '#b8b4a8' } },
    },
    tooltip: {
      trigger: 'item',
      backgroundColor: '#fdfcf9',
      borderColor: '#d3d0c6',
      textStyle: { color: '#1c2622', fontSize: 12 },
      formatter: (p) => {
        const [x, hi, lo] = p.value
        return `${p.name}<br/>风险：${p.risk}<br/>区间：${lo}% ~ ${hi}%`
      },
    },
    series: Object.entries(map).map(([cat, data], i) => ({
      name: cat,
      type: 'scatter',
      symbolSize: 13,
      data,
      itemStyle: {
        color: ['#14453a', '#b23a2b', '#8a6a2f', '#3d4a45', '#6b7772', '#1d5c4d'][i % 6],
        opacity: 0.82,
      },
      emphasis: { scale: 1.5 },
    })),
    legend: {
      bottom: 6,
      itemWidth: 9,
      itemHeight: 9,
      itemGap: 16,
      textStyle: { color: '#6b7772', fontSize: 11 },
    },
  }
})

const compareRows = computed(() => {
  if (!items.value.length) return []
  return [
    { label: '产品类型', key: 'category' },
    { label: '发行机构', key: 'issuer' },
    { label: '期限', key: 'term_years' },
    { label: '收益口径', key: 'yield_type' },
    { label: '收益区间', key: '__yield' },
    { label: '风险等级', key: 'risk_level' },
    { label: '起投金额', key: 'min_amount' },
    { label: '流动性', key: 'liquidity' },
    { label: '个人养老金可投', key: '__tax' },
    { label: '本金保障', key: '__guar' },
  ]
})

function cellValue(row, p) {
  if (row.key === '__yield') {
    if (!hasYield(p)) return '—'
    return `${p.yield_low}% ~ ${p.yield_high}%`
  }
  if (row.key === '__tax') return p.tax_eligible ? '是' : '否'
  if (row.key === '__guar') return p.guaranteed ? '是' : '否'
  return p[row.key] || '—'
}

function hasYield(p) {
  return !(p.yield_type || '').includes('无投资') && !(p.yield_type || '').includes('非收益率')
}
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Product Map"
      title="产品图谱"
      desc="七类可投品种的特征对照。这里不做推荐，只把期限、收益口径、风险、流动性与税优资格摆在一起，方便你自己判断哪一类适合你的约束条件。"
    />

    <div class="wrap">
      <div class="notice">
        <span class="mono">DEMO</span>
        <p>
          本页全部条目为<b>示意性示例</b>，用于演示产品比较方法，不对应任何在售产品。收益率区间取自公开信息中的常见水平，实际产品条款以发行机构公告与合同为准。本站不销售金融产品。
        </p>
      </div>

      <div class="filters">
        <div class="fgroup">
          <span class="flabel">类型</span>
          <button class="chip" :class="{ on: category === '' }" @click="category = ''; load()">全部</button>
          <button
            v-for="c in categories"
            :key="c.category"
            class="chip"
            :class="{ on: category === c.category }"
            @click="category = c.category; load()"
          >
            {{ c.category }}<span class="chip-n mono">{{ c.c }}</span>
          </button>
        </div>
        <div class="fgroup">
          <span class="flabel">风险</span>
          <button class="chip" :class="{ on: risk === '' }" @click="risk = ''; load()">全部</button>
          <button
            v-for="r in risks"
            :key="r.risk_level"
            class="chip"
            :class="{ on: risk === r.risk_level }"
            @click="risk = r.risk_level; load()"
          >
            {{ r.risk_level }}
          </button>
        </div>
        <div class="fgroup">
          <label class="switch">
            <input v-model="taxOnly" type="checkbox" @change="load" />
            <span>仅看个人养老金可投</span>
          </label>
          <select v-model="sort" class="sortsel" @change="load">
            <option value="category">按类型排序</option>
            <option value="yield">按收益上限排序</option>
            <option value="risk">按风险从低到高</option>
          </select>
        </div>
      </div>

      <div v-if="loading" class="loading">加载中…</div>

      <template v-else>
        <!-- 风险-收益散点 -->
        <section class="chart-block">
          <div class="cb-head">
            <h2 class="cb-title">风险与收益的分布</h2>
            <p class="cb-note">横轴为风险等级，纵轴为收益区间上限。注意：高收益区间往往伴随负收益年份，图中的上限不代表可预期回报。</p>
          </div>
          <Chart :option="scatter" height="340px" />
        </section>

        <!-- 卡片列表 -->
        <section class="cards">
          <button
            v-for="p in items"
            :key="p.slug"
            class="pcard"
            :class="{ active: selected?.slug === p.slug }"
            @click="selected = p"
          >
            <div class="pc-top">
              <span class="tag pine">{{ p.category }}</span>
              <span class="tag" :class="p.risk_level === '高' ? 'red' : p.risk_level === '极低' ? 'pine' : ''">
                {{ p.risk_level }}风险
              </span>
            </div>
            <h3 class="pc-name">{{ p.name }}</h3>
            <div class="pc-yield">
              <template v-if="hasYield(p)">
                <span class="pc-y-num mono">{{ p.yield_high }}</span>
                <span class="pc-y-unit">%</span>
              </template>
              <span v-else class="pc-y-none">保障型</span>
              <span class="pc-y-type">{{ p.yield_type }}</span>
            </div>
            <div class="pc-meta">
              <span>{{ p.term_years }}</span>
              <span class="dot-sep">·</span>
              <span>{{ p.min_amount }}</span>
            </div>
            <div class="pc-flags">
              <span v-if="p.tax_eligible" class="flag">税优</span>
              <span v-if="p.guaranteed" class="flag">保障</span>
            </div>
          </button>
        </section>

        <!-- 对照表 -->
        <section v-if="items.length" class="table-block">
          <div class="tb-head">
            <h2 class="tb-title">逐项对照</h2>
            <span class="mono tb-count">{{ items.length }} 类产品</span>
          </div>
          <div class="table-scroll">
            <table class="compare">
              <thead>
                <tr>
                  <th class="rowhead"></th>
                  <th v-for="p in items" :key="p.slug">{{ p.name }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in compareRows" :key="row.key">
                  <td class="rowhead">{{ row.label }}</td>
                  <td v-for="p in items" :key="p.slug" :class="{ hi: row.key === '__yield' }">
                    {{ cellValue(row, p) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- 选中详情 -->
        <section v-if="selected" class="detail-block">
          <div class="db-head">
            <div>
              <span class="tag pine">{{ selected.category }}</span>
              <h2 class="db-name">{{ selected.name }}</h2>
            </div>
            <div class="db-yield">
              <span class="mono db-num">{{ hasYield(selected) ? selected.yield_high + '%' : '保障型' }}</span>
              <span class="db-ylabel">{{ selected.yield_type }}</span>
            </div>
          </div>

          <div class="db-grid">
            <div class="db-item">
              <span class="db-label">发行机构</span>
              <span class="db-val">{{ selected.issuer }}</span>
            </div>
            <div class="db-item">
              <span class="db-label">期限</span>
              <span class="db-val">{{ selected.term_years }}</span>
            </div>
            <div class="db-item">
              <span class="db-label">起投金额</span>
              <span class="db-val">{{ selected.min_amount }}</span>
            </div>
            <div class="db-item">
              <span class="db-label">流动性</span>
              <span class="db-val">{{ selected.liquidity }}</span>
            </div>
            <div class="db-item">
              <span class="db-label">个人养老金可投</span>
              <span class="db-val">{{ selected.tax_eligible ? '是' : '否' }}</span>
            </div>
            <div class="db-item">
              <span class="db-label">本金保障</span>
              <span class="db-val">{{ selected.guaranteed ? '合同约定保障' : '不保本' }}</span>
            </div>
          </div>

          <div class="db-cols">
            <div>
              <div class="db-sub">适合人群</div>
              <p class="db-text">{{ selected.suitable_for }}</p>
            </div>
            <div>
              <div class="db-sub">关键特征</div>
              <ul class="db-list">
                <li v-for="h in selected.highlights" :key="h">{{ h }}</li>
              </ul>
            </div>
          </div>

          <div class="db-note">
            <span class="mono">NOTE</span>
            <p>{{ selected.notes }}</p>
          </div>
        </section>

        <!-- 选择框架 -->
        <section class="frame">
          <h2 class="frame-title">怎么选：三个先后顺序</h2>
          <div class="frame-grid">
            <div class="fr-item">
              <span class="fr-n mono">01</span>
              <h3>先定用途，再定产品</h3>
              <p>这笔钱是随时要用的、保命的，还是长期增值的？用途决定期限与流动性约束，产品只是满足约束的工具。</p>
            </div>
            <div class="fr-item">
              <span class="fr-n mono">02</span>
              <h3>先看风险，再看收益</h3>
              <p>收益区间上限是历史或测算结果，不是承诺。对临近退休的人，回撤容忍度比收益率更值得优先确认。</p>
            </div>
            <div class="fr-item">
              <span class="fr-n mono">03</span>
              <h3>先用税优额度，再考虑其他</h3>
              <p>个人养老金账户的12000元额度每年清零。边际税率高于3%时，优先用满额度，再考虑账户外的配置。</p>
            </div>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped>
.notice {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  padding: 16px 18px;
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
  line-height: 1.85;
  color: var(--ink-2);
}

.notice b {
  color: var(--ink);
}

.filters {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--line-strong);
}

.fgroup {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.flabel {
  font-size: 11px;
  letter-spacing: 0.1em;
  color: var(--ink-4);
  font-family: var(--mono);
  margin-right: 4px;
  min-width: 28px;
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

.switch {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 12.5px;
  color: var(--ink-2);
  cursor: pointer;
}

.switch input {
  accent-color: var(--pine);
}

.sortsel {
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--line);
  background: var(--white);
  border-radius: var(--radius);
  font-size: 12.5px;
  color: var(--ink-2);
}

.loading {
  padding: 60px 0;
  text-align: center;
  color: var(--ink-3);
  font-size: 13px;
}

/* 图表 */
.chart-block {
  margin-top: 38px;
  padding: 24px 24px 12px;
  background: var(--white);
  border: 1px solid var(--line);
}

.cb-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 24px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.cb-title {
  font-size: 18px;
}

.cb-note {
  font-size: 11.5px;
  line-height: 1.7;
  color: var(--ink-3);
  max-width: 56ch;
}

/* 卡片 */
.cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0;
  border-top: 1px solid var(--line-strong);
  border-left: 1px solid var(--line);
  margin-top: 34px;
}

.pcard {
  text-align: left;
  padding: 20px 18px;
  border-right: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  background: var(--white);
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: background 0.15s ease, box-shadow 0.15s ease;
  font-family: inherit;
}

.pcard:hover {
  background: var(--pine-soft);
}

.pcard.active {
  background: var(--paper-2);
  box-shadow: inset 2px 0 0 var(--cinnabar);
}

.pc-top {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}

.pc-name {
  font-size: 15.5px;
  line-height: 1.45;
  color: var(--ink);
}

.pc-yield {
  display: flex;
  align-items: baseline;
  gap: 3px;
  flex-wrap: wrap;
}

.pc-y-num {
  font-size: 26px;
  color: var(--pine);
  line-height: 1;
}

.pc-y-unit {
  font-size: 13px;
  color: var(--ink-3);
}

.pc-y-type {
  font-size: 10px;
  color: var(--ink-4);
  width: 100%;
  margin-top: 2px;
}

.pc-y-none {
  font-size: 17px;
  color: var(--ink-3);
  font-family: var(--serif);
}

.pc-meta {
  font-size: 11.5px;
  color: var(--ink-3);
  line-height: 1.6;
}

.dot-sep {
  margin: 0 4px;
  color: var(--line-strong);
}

.pc-flags {
  display: flex;
  gap: 5px;
  margin-top: auto;
}

.flag {
  font-size: 10px;
  padding: 1px 6px;
  background: var(--pine);
  color: var(--white);
  border-radius: var(--radius);
  letter-spacing: 0.04em;
}

/* 对照表 */
.table-block {
  margin-top: 44px;
}

.tb-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--line-strong);
}

.tb-title {
  font-size: 18px;
}

.tb-count {
  font-size: 11px;
  color: var(--ink-4);
}

.table-scroll {
  overflow-x: auto;
}

.compare {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
  min-width: 900px;
}

.compare th {
  text-align: left;
  padding: 12px 14px;
  border-bottom: 1px solid var(--line-strong);
  font-weight: 600;
  font-family: var(--serif);
  font-size: 13.5px;
  color: var(--ink);
  vertical-align: bottom;
  min-width: 150px;
}

.compare td {
  padding: 10px 14px;
  border-bottom: 1px solid var(--line);
  color: var(--ink-2);
  vertical-align: top;
  line-height: 1.65;
}

.compare .rowhead {
  color: var(--ink-4);
  font-size: 11px;
  letter-spacing: 0.06em;
  white-space: nowrap;
  width: 110px;
  font-family: var(--mono);
  background: var(--paper-2);
}

.compare td.hi {
  color: var(--pine);
  font-family: var(--mono);
  font-size: 12px;
}

.compare tbody tr:hover td {
  background: rgba(20, 69, 58, 0.035);
}

/* 详情 */
.detail-block {
  margin-top: 44px;
  padding: 26px;
  background: var(--white);
  border: 1px solid var(--line-strong);
}

.db-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--line);
  flex-wrap: wrap;
}

.db-name {
  font-size: 23px;
  margin-top: 10px;
}

.db-yield {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
}

.db-num {
  font-size: 30px;
  color: var(--pine);
  line-height: 1;
}

.db-ylabel {
  font-size: 10.5px;
  color: var(--ink-4);
}

.db-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0;
  border-bottom: 1px solid var(--line);
}

.db-item {
  padding: 14px 16px 14px 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-bottom: 1px solid var(--line);
}

.db-item:nth-child(n + 4) {
  border-bottom: 0;
}

.db-label {
  font-size: 10.5px;
  letter-spacing: 0.08em;
  color: var(--ink-4);
  font-family: var(--mono);
}

.db-val {
  font-size: 13px;
  color: var(--ink);
  line-height: 1.6;
}

.db-cols {
  display: grid;
  grid-template-columns: 1fr 1.4fr;
  gap: 40px;
  padding: 22px 0;
}

.db-sub {
  font-size: 10.5px;
  letter-spacing: 0.12em;
  color: var(--ink-4);
  font-family: var(--mono);
  margin-bottom: 9px;
}

.db-text {
  font-size: 13.5px;
  line-height: 1.85;
  color: var(--ink-2);
}

.db-list {
  margin: 0;
  padding-left: 16px;
  font-size: 13.5px;
  line-height: 1.85;
  color: var(--ink-2);
}

.db-list li {
  margin-bottom: 5px;
}

.db-note {
  display: flex;
  gap: 14px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
  align-items: flex-start;
}

.db-note .mono {
  font-size: 10px;
  letter-spacing: 0.14em;
  color: var(--cinnabar);
  padding-top: 3px;
  flex-shrink: 0;
}

.db-note p {
  font-size: 12px;
  line-height: 1.8;
  color: var(--ink-3);
}

/* 框架 */
.frame {
  margin-top: 52px;
}

.frame-title {
  font-size: 22px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--line-strong);
  margin-bottom: 26px;
}

.frame-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 32px;
}

.fr-item h3 {
  font-size: 16px;
  margin: 10px 0 8px;
  color: var(--ink);
}

.fr-item p {
  font-size: 13px;
  line-height: 1.85;
  color: var(--ink-2);
}

.fr-n {
  font-size: 11px;
  color: var(--cinnabar);
  letter-spacing: 0.1em;
}

@media (max-width: 1080px) {
  .cards {
    grid-template-columns: repeat(2, 1fr);
  }
  .db-cols {
    grid-template-columns: 1fr;
    gap: 22px;
  }
  .frame-grid {
    grid-template-columns: 1fr;
    gap: 22px;
  }
}

@media (max-width: 720px) {
  .cards {
    grid-template-columns: 1fr;
  }
  .db-grid {
    grid-template-columns: 1fr 1fr;
  }
  .db-item:nth-child(n + 4) {
    border-bottom: 1px solid var(--line);
  }
  .db-item:nth-last-child(-n + 2) {
    border-bottom: 0;
  }
  .detail-block {
    padding: 18px;
  }
}
</style>
