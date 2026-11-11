<script setup>
/**
 * 量化实验室 —— 三套养老金融量化分析模型的展示与交互视图
 *
 * 数据来源：GET /api/analytics（由 analytics/run_all.py 离线计算生成，
 * 见 analytics/README.md）。前端只做展示与交互重算，不承担建模逻辑，
 * 权重调节/个体测算器使用的公式与离线模型完全一致。
 *
 * 交互能力：
 *  - 模型一：年份滑块联动雷达图、指标维度筛选、发展指数趋势、CV 演变、Theil 分解
 *  - 模型二：15 项风险指标权重滑杆实时重算机构风险得分与四级评级
 *  - 模型三：个体受害概率测算器（逻辑回归系数前端推理）+ ROC + 风险因子排名
 */
import { ref, computed, onMounted, watchEffect } from 'vue'
import { api } from '../lib/api.js'
import PageHeader from '../components/PageHeader.vue'
import Chart from '../components/Chart.vue'

const payload = ref(null)
const loading = ref(true)
const missing = ref(false)
const tab = ref('m1')

onMounted(async () => {
  try {
    payload.value = await api.get('/analytics')
    missing.value = !payload.value
  } catch {
    missing.value = true
  } finally {
    loading.value = false
  }
})

/* ---------- 通用 ---------- */
const MONO_AX = { color: '#96a09b', fontSize: 10, fontFamily: 'monospace' }
const TIP_STYLE = {
  backgroundColor: '#fdfcf9',
  borderColor: '#d3d0c6',
  textStyle: { color: '#1c2622', fontSize: 12 },
}
const SERIES_COLOR = { 城市: '#14453a', 县城: '#8a6a2f', 农村: '#b23a2b' }

/* =========================================================
 * 模型一：城乡养老金融发展差异测度
 * ========================================================= */
const m1 = computed(() => payload.value?.model1 || null)
const yearIdx = ref(10)
const m1Dim = ref('全部')

const yearLabel = computed(() => {
  if (!m1.value) return ''
  return m1.value.years[Math.min(yearIdx.value, m1.value.years.length - 1)]
})

// 发展指数趋势（三区域，图例可点击显隐）
const trendChart = computed(() => {
  if (!m1.value) return null
  return {
    color: Object.values(SERIES_COLOR),
    grid: { left: 52, right: 24, top: 34, bottom: 30 },
    legend: { top: 0, textStyle: { color: '#3d4a45' } },
    tooltip: { trigger: 'axis', ...TIP_STYLE },
    xAxis: { type: 'category', data: m1.value.years, axisLabel: MONO_AX, axisLine: { lineStyle: { color: '#b8b4a8' } } },
    yAxis: { type: 'value', max: 100, axisLabel: MONO_AX, splitLine: { lineStyle: { color: '#e2dfd6' } } },
    series: m1.value.regions.map((r) => ({
      name: r, type: 'line', smooth: true, symbolSize: 5,
      lineStyle: { width: 2.2 },
      data: m1.value.index.filter((x) => x.region === r).map((x) => x.development_index),
    })),
  }
})

// 雷达图（随年份滑块与维度筛选联动）
const radarChart = computed(() => {
  if (!m1.value) return null
  const dim = m1Dim.value
  const inds = m1.value.indicators.filter((i) => dim === '全部' || i.dim === dim)
  const keyMap = { 城市: 'C', 县城: 'X', 农村: 'R' }
  return {
    color: Object.values(SERIES_COLOR),
    tooltip: {},
    legend: { top: 0, textStyle: { color: '#3d4a45' } },
    radar: {
      indicator: inds.map((i) => ({ name: i.name, max: 100 })),
      radius: '58%', center: ['50%', '54%'],
      axisName: { fontSize: 9.5, color: '#6b7772' },
      splitLine: { lineStyle: { color: '#e2dfd6' } },
    },
    series: [{
      type: 'radar', symbolSize: 3,
      data: m1.value.regions.map((r) => ({
        name: r,
        value: inds.map((i) => m1.value.radar[keyMap[r]].values[i.code][Math.min(yearIdx.value, m1.value.years.length - 1)]),
        areaStyle: { opacity: 0.08 },
        lineStyle: { width: 1.8 },
      })),
    }],
  }
})

// 变异系数演变（σ 收敛）
const cvChart = computed(() => {
  if (!m1.value) return null
  return {
    grid: { left: 56, right: 24, top: 26, bottom: 30 },
    tooltip: { trigger: 'axis', ...TIP_STYLE },
    xAxis: { type: 'category', data: m1.value.cv.map((x) => x.year), axisLabel: MONO_AX, axisLine: { lineStyle: { color: '#b8b4a8' } } },
    yAxis: { type: 'value', axisLabel: MONO_AX, splitLine: { lineStyle: { color: '#e2dfd6' } } },
    series: [{
      type: 'bar', barWidth: '52%',
      itemStyle: { color: '#8a6a2f', opacity: 0.85 },
      data: m1.value.cv.map((x) => x.cv),
      markLine: {
        symbol: 'none', silent: true,
        lineStyle: { type: 'dashed', color: '#b23a2b' },
        label: { formatter: 'σ 收敛', position: 'insideEndTop', color: '#b23a2b', fontSize: 10 },
        data: [{ type: 'average' }],
      },
    }],
  }
})

// Theil 分解 + 熵权 Top8 双图
const theilChart = computed(() => {
  if (!m1.value) return null
  const t = m1.value.theil[0]
  const topW = Object.entries(m1.value.weights).sort((a, b) => b[1] - a[1]).slice(0, 8)
  const nameOf = (code) => m1.value.indicators.find((i) => i.code === code)?.name || code
  return {
    tooltip: { trigger: 'item', ...TIP_STYLE },
    legend: { bottom: 0, data: ['组间贡献', '组内贡献'], textStyle: { color: '#3d4a45' } },
    grid: [{ left: '54%', right: 24, top: 20, bottom: 44 }],
    xAxis: [{ type: 'value', gridIndex: 0, max: 0.16, axisLabel: MONO_AX, splitLine: { lineStyle: { color: '#e2dfd6' } } }],
    yAxis: [{
      type: 'category', gridIndex: 0,
      data: topW.map((e) => nameOf(e[0])).reverse(),
      axisLabel: { fontSize: 9.5, color: '#6b7772' },
    }],
    series: [
      {
        type: 'pie', radius: [0, '32%'], center: ['24%', '44%'],
        label: { formatter: '{b}\n{c}%', fontSize: 10.5, color: '#3d4a45' },
        data: [
          { name: '组间贡献', value: +(t.between_share * 100).toFixed(1), itemStyle: { color: '#14453a' } },
          { name: '组内贡献', value: +(t.within_share * 100).toFixed(1), itemStyle: { color: '#8a6a2f' } },
        ],
      },
      {
        type: 'bar', xAxisIndex: 0, yAxisIndex: 0, barWidth: '58%',
        itemStyle: { color: '#14453a', opacity: 0.85 },
        label: { show: true, position: 'right', fontSize: 9.5, fontFamily: 'monospace', color: '#6b7772', formatter: (p) => p.value.toFixed(3) },
        data: topW.map((e) => e[1]).reverse(),
      },
    ],
  }
})

const m1Kpi = computed(() => {
  if (!m1.value) return null
  const idx25 = m1.value.index.filter((r) => r.year === m1.value.years[m1.value.years.length - 1])
  const city = idx25.find((r) => r.region === '城市')?.development_index || 1
  const rural = idx25.find((r) => r.region === '农村')?.development_index || 1
  const cv = m1.value.cv
  return {
    gap: (city / rural).toFixed(1) + '×',
    between: (m1.value.theil[0].between_share * 100).toFixed(0) + '%',
    cvFirst: cv[0]?.cv.toFixed(3),
    cvLast: cv[cv.length - 1]?.cv.toFixed(3),
    conv: m1.value.theil[0],
  }
})

/* =========================================================
 * 模型二：医养融合金融风险评估（权重实时重算）
 * ========================================================= */
const m2 = computed(() => payload.value?.model2 || null)
const weights = ref({}) // 用户可调的指标权重（键 = 指标代码）
const m2Inited = ref(false)

// 数据到达后以熵权初始化滑杆（watchEffect 立即求值并跟踪 m2 变化）
watchEffect(() => {
  if (m2.value && !m2Inited.value) {
    weights.value = { ...m2.value.weights }
    m2Inited.value = true
  }
})

const m2ByDim = computed(() => {
  if (!m2.value) return {}
  const g = {}
  for (const i of m2.value.indicators) (g[i.dim] = g[i.dim] || []).push(i)
  return g
})

function resetWeights() {
  if (m2.value) weights.value = { ...m2.value.weights }
}

// —— 与离线模型一致的得分公式（数据驱动锚点，方向统一为"越大越危险"）——
const m2Meta = computed(() => {
  if (!m2.value) return null
  const codes = m2.value.indicators.map((i) => i.code)
  const stat = {}
  codes.forEach((c) => {
    const v = m2.value.raw[c]
    stat[c] = { min: Math.min(...v), max: Math.max(...v) }
  })
  let dmin = Infinity, dmax = -Infinity
  for (let i = 0; i < m2.value.ids.length; i++) {
    for (const c of codes) {
      const d = Math.abs(m2.value.raw[c][i] - stat[c].max)
      if (d < dmin) dmin = d
      if (d > dmax) dmax = d
    }
  }
  return { codes, stat, dmin, dmax }
})

function riskScore(vals, w) {
  const M = m2Meta.value
  let dPlus = 0, dMinus = 0, g = 0
  M.codes.forEach((c, j) => {
    const x = vals[j], s = M.stat[c]
    dPlus += Math.pow(w[c] * (x - s.max), 2)
    dMinus += Math.pow(w[c] * (x - s.min), 2)
    const delta = Math.abs(x - s.max)
    g += (w[c] * (M.dmin + 0.5 * M.dmax)) / (delta + 0.5 * M.dmax)
  })
  const C = Math.sqrt(dMinus) / (Math.sqrt(dPlus) + Math.sqrt(dMinus) + 1e-12)
  return 0.5 * C * 100 + 0.5 * g * 100
}

function bandOf(s) {
  return s < 40 ? '低风险' : s < 51 ? '中风险' : s < 68 ? '高风险' : '极高风险'
}
const BAND_COLOR = { 低风险: '#5b7a52', 中风险: '#8a6a2f', 高风险: '#b26a2b', 极高风险: '#b23a2b' }

const m2Scores = computed(() => {
  if (!m2.value || !m2Meta.value) return []
  const w = weights.value
  return m2.value.ids.map((id, i) => {
    const vals = m2Meta.value.codes.map((c) => m2.value.raw[c][i])
    const s = riskScore(vals, w)
    return { id, score: s, level: bandOf(s), inst: m2.value.institutions[i] }
  })
})

const m2Kpi = computed(() => {
  if (!m2Scores.value.length) return null
  const avg = m2Scores.value.reduce((a, b) => a + b.score, 0) / m2Scores.value.length
  const dist = { 低风险: 0, 中风险: 0, 高风险: 0, 极高风险: 0 }
  m2Scores.value.forEach((x) => dist[x.level]++)
  return {
    avg: avg.toFixed(1),
    highPct: (((dist['高风险'] + dist['极高风险']) / m2Scores.value.length) * 100).toFixed(1) + '%',
    n: m2Scores.value.length,
    dist,
  }
})

const m2Pie = computed(() => {
  if (!m2Kpi.value) return null
  return {
    tooltip: { trigger: 'item', ...TIP_STYLE },
    series: [{
      type: 'pie', radius: ['42%', '70%'], center: ['50%', '50%'],
      itemStyle: { borderColor: '#fdfcf9', borderWidth: 2 },
      label: { formatter: '{b}\n{c} 家', fontSize: 11, color: '#3d4a45' },
      data: Object.entries(m2Kpi.value.dist).map(([k, v]) => ({
        name: k, value: v, itemStyle: { color: BAND_COLOR[k] },
      })),
    }],
  }
})

const m2Top = computed(() =>
  [...m2Scores.value].sort((a, b) => b.score - a.score).slice(0, 20),
)

const m2Region = computed(() => m2.value?.regionSummary || [])

/* =========================================================
 * 模型三：老年金融诈骗预警（个体测算器）
 * ========================================================= */
const m3 = computed(() => payload.value?.model3 || null)
const CC = computed(() => m3.value?.coefForClient || null)

// 个体特征输入（与问卷口径一致）
const person = ref({
  age: 72, female: 1, edu_years: 8, live_alone: 0, monthly_income: 3,
  fin_literacy: 50, health_score: 66, use_smartphone: 1, num_apps: 1,
  social_freq: 4, family_contact: 6, promo_exposure: 3, trust_high: 0,
})
const FIELD_DEF = [
  { k: 'age', label: '年龄', min: 60, max: 95, unit: '岁' },
  { k: 'female', label: '性别（1=女 0=男）', min: 0, max: 1 },
  { k: 'edu_years', label: '受教育年限', min: 0, max: 19, unit: '年' },
  { k: 'live_alone', label: '是否独居', min: 0, max: 1 },
  { k: 'monthly_income', label: '月收入', min: 0.2, max: 15, unit: '千元', step: 0.1 },
  { k: 'fin_literacy', label: '金融素养得分', min: 0, max: 100 },
  { k: 'health_score', label: '自评健康得分', min: 5, max: 100 },
  { k: 'use_smartphone', label: '会使用智能手机', min: 0, max: 1 },
  { k: 'num_apps', label: '常用金融类App数', min: 0, max: 8 },
  { k: 'social_freq', label: '月社交活动次数', min: 0, max: 25 },
  { k: 'family_contact', label: '每周与子女联系次数', min: 0, max: 30 },
  { k: 'promo_exposure', label: '月均理财推销接触', min: 0, max: 25 },
  { k: 'trust_high', label: '对陌生推荐信任度高', min: 0, max: 1 },
]

// 与离线逻辑回归一致的标准化 + 线性组合 + sigmoid
const fraudProb = computed(() => {
  if (!CC.value) return 0
  let z = CC.value.intercept
  CC.value.features.forEach((f, j) => {
    z += CC.value.coef[j] * ((person.value[f] - CC.value.means[j]) / CC.value.scales[j])
  })
  return 1 / (1 + Math.exp(-z))
})

function bandOfProb(p) {
  if (p < 0.2) return { label: '绿色 · 低关注', color: '#5b7a52', advice: '风险较低，保持日常金融知识学习即可。' }
  if (p < 0.4) return { label: '黄色 · 一般关注', color: '#8a6a2f', advice: '存在一定暴露，建议家属关注其理财动向。' }
  if (p < 0.6) return { label: '橙色 · 重点关注', color: '#b26a2b', advice: '风险偏高，建议银行/社区介入开展反诈宣传。' }
  return { label: '红色 · 高警戒', color: '#b23a2b', advice: '高风险人群，建议纳入重点预警名单并核实近期大额交易。' }
}
const probBand = computed(() => bandOfProb(fraudProb.value))

const gaugeOption = computed(() => ({
  series: [{
    type: 'gauge', min: 0, max: 100, startAngle: 210, endAngle: -30,
    radius: '95%', center: ['50%', '58%'],
    axisLine: { lineStyle: { width: 12, color: [[20, '#5b7a52'], [40, '#8a6a2f'], [60, '#b26a2b'], [1, '#b23a2b']] } },
    pointer: { width: 3.5, itemStyle: { color: '#1c2622' } },
    axisTick: { distance: -12, length: 3, lineStyle: { color: '#fdfcf9' } },
    splitLine: { distance: -12, length: 12, lineStyle: { color: '#fdfcf9', width: 2 } },
    axisLabel: { distance: -22, color: '#96a09b', fontSize: 9, fontFamily: 'monospace' },
    detail: { formatter: (v) => v.toFixed(1) + '%', fontSize: 21, fontFamily: 'monospace', color: '#1c2622', offsetCenter: [0, '64%'] },
    title: { offsetCenter: [0, '92%'], fontSize: 11, color: '#6b7772' },
    data: [{ value: +(fraudProb.value * 100).toFixed(1), name: '预测受害概率' }],
  }],
}))

// ROC 曲线（离线模型测试集）
const rocChart = computed(() => {
  if (!m3.value?.roc) return null
  const { fpr, tpr } = m3.value.roc
  const pts = fpr.map((f, i) => [f, tpr[i]])
  return {
    grid: { left: 44, right: 20, top: 16, bottom: 38 },
    tooltip: { trigger: 'item', ...TIP_STYLE },
    xAxis: { type: 'value', max: 1, name: '假阳性率', nameStyle: MONO_AX, axisLabel: MONO_AX, splitLine: { lineStyle: { color: '#e2dfd6' } } },
    yAxis: { type: 'value', max: 1, name: '真阳性率', axisLabel: MONO_AX, splitLine: { lineStyle: { color: '#e2dfd6' } } },
    series: [
      { type: 'line', data: [[0, 0], [1, 1]], lineStyle: { type: 'dashed', color: '#b8b4a8' }, showSymbol: false, silent: true },
      {
        type: 'line', data: pts, smooth: true, showSymbol: false,
        lineStyle: { width: 2.4, color: '#14453a' },
        areaStyle: { color: 'rgba(20,69,58,0.07)' },
      },
    ],
  }
})

// 风险因子排名（标准化系数，红=风险因子 绿=保护因子）
const coefChart = computed(() => {
  if (!m3.value) return null
  const coefs = [...m3.value.coefficients].slice(0, 12).reverse()
  return {
    tooltip: {
      ...TIP_STYLE,
      formatter: (p) => `${p.name}<br/>系数 ${p.value.toFixed(3)} · OR ${m3.value.coefficients.find((c) => c['含义'] === p.name)?.OR ?? '—'}`,
    },
    grid: { left: 150, right: 36, top: 10, bottom: 26 },
    xAxis: { type: 'value', axisLabel: MONO_AX, splitLine: { lineStyle: { color: '#e2dfd6' } } },
    yAxis: { type: 'category', data: coefs.map((c) => c['含义']), axisLabel: { fontSize: 10.5, color: '#3d4a45' } },
    series: [{
      type: 'bar', barWidth: '56%',
      data: coefs.map((c) => ({
        value: c.coef,
        itemStyle: { color: c.coef > 0 ? '#b23a2b' : '#5b7a52' },
      })),
    }],
  }
})

// 预警人群构成
const bandChart = computed(() => {
  if (!m3.value) return null
  const order = ['绿色(低关注)', '黄色(一般关注)', '橙色(重点关注)', '红色(高警戒)']
  const colorMap = { '绿色(低关注)': '#5b7a52', '黄色(一般关注)': '#8a6a2f', '橙色(重点关注)': '#b26a2b', '红色(高警戒)': '#b23a2b' }
  return {
    grid: { left: 44, right: 20, bottom: 60, top: 30 },
    tooltip: { trigger: 'item', ...TIP_STYLE },
    xAxis: { type: 'category', data: order, axisLabel: { fontSize: 10, interval: 0, color: '#6b7772' }, axisLine: { lineStyle: { color: '#b8b4a8' } } },
    yAxis: { type: 'value', name: '人数', axisLabel: MONO_AX, splitLine: { lineStyle: { color: '#e2dfd6' } } },
    series: [{
      type: 'bar', barWidth: '50%',
      label: { show: true, position: 'top', fontFamily: 'monospace', fontSize: 11, color: '#3d4a45' },
      data: order.map((k) => ({ value: m3.value.bands[k] || 0, itemStyle: { color: colorMap[k] } })),
    }],
  }
})
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Quantitative Lab"
      title="量化实验室"
      desc="三套可复现的养老金融量化分析模型：城乡发展差异测度、医养融合金融风险评估、老年金融诈骗预警。数据由 Python 分析流水线离线计算（随机种子固定，全流程可复现），本页提供交互式结果探索。"
    />

    <div class="wrap">
      <div v-if="loading" class="loading">加载中…</div>

      <div v-else-if="missing" class="missing">
        <h2>分析数据尚未生成</h2>
        <p>
          量化实验室依赖离线分析产物 <code>analytics_export.json</code>。
          请在项目根目录的 <code>analytics/</code> 下运行 <code>python run_all.py</code>，
          生成后刷新本页即可。
        </p>
      </div>

      <template v-else>
        <!-- 模型切换 -->
        <nav class="lab-tabs">
          <button :class="{ on: tab === 'm1' }" @click="tab = 'm1'">模型一 · 城乡差异测度</button>
          <button :class="{ on: tab === 'm2' }" @click="tab = 'm2'">模型二 · 医养金融风险</button>
          <button :class="{ on: tab === 'm3' }" @click="tab = 'm3'">模型三 · 诈骗预警</button>
        </nav>
        <p class="lab-note">
          数据来源：{{ payload.meta.source }}（seed={{ payload.meta.seed }}）· 生成时间 {{ payload.meta.updated }}
        </p>

        <!-- ================= 模型一 ================= -->
        <section v-if="tab === 'm1' && m1" class="lab-section">
          <div class="kpi-row">
            <div class="kpi"><div class="v mono">{{ m1Kpi.gap }}</div><div class="l">{{ m1.years.at(-1) }} 城乡发展指数差距</div></div>
            <div class="kpi"><div class="v mono">{{ m1Kpi.between }}</div><div class="l">Theil 组间贡献占比</div></div>
            <div class="kpi"><div class="v mono">{{ m1Kpi.cvFirst }} → {{ m1Kpi.cvLast }}</div><div class="l">变异系数演变（σ收敛）</div></div>
            <div class="kpi"><div class="v mono">{{ m1.years[0] }}–{{ m1.years.at(-1) }}</div><div class="l">面板区间 · 12 项指标</div></div>
          </div>

          <div class="ctrl-row">
            <label>年份
              <input v-model.number="yearIdx" type="range" :max="m1.years.length - 1" class="slider" />
              <b class="mono">{{ yearLabel }}</b>
            </label>
            <label>雷达维度
              <select v-model="m1Dim" class="sel">
                <option value="全部">全部指标</option>
                <option v-for="d in [...new Set(m1.indicators.map((i) => i.dim))]" :key="d" :value="d">{{ d }}</option>
              </select>
            </label>
          </div>

          <div class="grid-2">
            <div class="card"><h3>发展指数趋势（熵权-TOPSIS）</h3><Chart :option="trendChart" height="300px" /></div>
            <div class="card"><h3>{{ yearLabel }} 年指标雷达（{{ m1Dim }}）</h3><Chart :option="radarChart" height="300px" /></div>
          </div>
          <div class="grid-2">
            <div class="card"><h3>变异系数与 σ 收敛检验</h3><Chart :option="cvChart" height="260px" /></div>
            <div class="card"><h3>Theil 分解与指标权重</h3><Chart :option="theilChart" height="260px" /></div>
          </div>
        </section>

        <!-- ================= 模型二 ================= -->
        <section v-if="tab === 'm2' && m2" class="lab-section">
          <div class="kpi-row">
            <div class="kpi"><div class="v mono">{{ m2Kpi.avg }}</div><div class="l">平均风险得分（实时）</div></div>
            <div class="kpi"><div class="v mono">{{ m2Kpi.highPct }}</div><div class="l">高风险 + 极高占比</div></div>
            <div class="kpi"><div class="v mono">{{ m2Kpi.n }}</div><div class="l">医养融合机构</div></div>
            <div class="kpi"><div class="v mono">5 维 15 项</div><div class="l">风险指标体系（熵权赋值）</div></div>
          </div>

          <p class="tab-note">
            拖动右侧权重滑杆，机构风险得分与评级将<b>实时重算</b>（与离线模型同公式：TOPSIS + 灰色关联等权融合）。
          </p>

          <div class="m2-layout">
            <div>
              <div class="card"><h3>风险等级分布（实时）</h3><Chart :option="m2Pie" height="280px" /></div>
              <div class="card" style="margin-top: 16px">
                <h3>机构风险榜 Top 20（实时排序）</h3>
                <table class="table">
                  <thead><tr><th>#</th><th>机构</th><th>区域</th><th>类型</th><th>得分</th><th>评级</th></tr></thead>
                  <tbody>
                    <tr v-for="(r, i) in m2Top" :key="r.id">
                      <td class="mono">{{ i + 1 }}</td>
                      <td class="mono">{{ r.id }}</td>
                      <td>{{ r.inst.region_name }}</td>
                      <td class="dim-text">{{ r.inst.org_type }}</td>
                      <td class="mono" :style="{ color: BAND_COLOR[r.level] }">{{ r.score.toFixed(1) }}</td>
                      <td><span class="band-tag" :style="{ background: BAND_COLOR[r.level] }">{{ r.level }}</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div class="card" style="margin-top: 16px">
                <h3>分区域风险概况（离线基准）</h3>
                <table class="table">
                  <thead><tr><th>区域</th><th>机构数</th><th>平均风险分</th><th>高风险占比</th><th>极高风险占比</th></tr></thead>
                  <tbody>
                    <tr v-for="r in m2Region" :key="r.region_name">
                      <td>{{ r.region_name }}</td>
                      <td class="mono">{{ r['机构数'] }}</td>
                      <td class="mono">{{ r['平均风险分'] }}</td>
                      <td class="mono">{{ r['高风险占比']?.toFixed(1) }}%</td>
                      <td class="mono">{{ r['极高风险占比']?.toFixed(1) }}%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div class="card weight-panel">
              <div class="wp-head">
                <h3>指标权重调节</h3>
                <button class="mini-btn" @click="resetWeights">↺ 重置为熵权</button>
              </div>
              <div class="wp-body">
                <template v-for="(list, dim) in m2ByDim" :key="dim">
                  <div class="dim-head">{{ dim }}</div>
                  <div v-for="i in list" :key="i.code" class="w-row">
                    <span class="w-label" :title="i.code">{{ i.name }}</span>
                    <input
                      v-model.number="weights[i.code]"
                      type="range" min="0" max="0.3" step="0.002" class="slider grow"
                    />
                    <span class="w-val mono">{{ ((weights[i.code] || 0) * 100).toFixed(1) }}%</span>
                  </div>
                </template>
              </div>
            </div>
          </div>
        </section>

        <!-- ================= 模型三 ================= -->
        <section v-if="tab === 'm3' && m3" class="lab-section">
          <div class="kpi-row">
            <div class="kpi"><div class="v mono">{{ m3.report.test_auc }}</div><div class="l">测试集 AUC</div></div>
            <div class="kpi"><div class="v mono">{{ (m3.report.test_accuracy * 100).toFixed(0) }}%</div><div class="l">准确率（约登阈值）</div></div>
            <div class="kpi"><div class="v mono">{{ (m3.report.test_recall * 100).toFixed(0) }}%</div><div class="l">召回率</div></div>
            <div class="kpi"><div class="v mono">{{ (m3.report.victim_rate * 100).toFixed(1) }}%</div><div class="l">问卷受害率（n=1500）</div></div>
          </div>

          <div class="m3-layout">
            <div>
              <div class="grid-2">
                <div class="card"><h3>ROC 曲线（测试集）</h3><Chart :option="rocChart" height="260px" /></div>
                <div class="card"><h3>预警人群构成</h3><Chart :option="bandChart" height="260px" /></div>
              </div>
              <div class="card" style="margin-top: 16px">
                <h3>风险因子排名（红=风险因子 绿=保护因子）</h3>
                <Chart :option="coefChart" height="320px" />
              </div>
            </div>

            <div class="card calc-panel">
              <h3>个体风险测算器</h3>
              <p class="tab-note">拖动滑杆模拟个体特征，前端以逻辑回归系数实时推理。</p>
              <div class="gauge-box"><Chart :option="gaugeOption" height="210px" /></div>
              <div class="band-line" :style="{ color: probBand.color }">{{ probBand.label }}</div>
              <p class="advice">{{ probBand.advice }}</p>
              <div class="calc-fields">
                <div v-for="f in FIELD_DEF" :key="f.k" class="w-row">
                  <span class="w-label">{{ f.label }}</span>
                  <input
                    v-model.number="person[f.k]"
                    type="range" :min="f.min" :max="f.max" :step="f.step || 1" class="slider grow"
                  />
                  <span class="w-val mono">{{ person[f.k] }}</span>
                </div>
              </div>
            </div>
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

.missing {
  background: var(--white);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 48px 40px;
  max-width: 640px;
}
.missing h2 {
  font-family: var(--serif);
  color: var(--pine);
  font-size: 20px;
}
.missing p {
  margin-top: 12px;
  color: var(--ink-2);
  line-height: 1.9;
}
.missing code {
  font-family: var(--mono);
  font-size: 12.5px;
  background: var(--paper-2);
  padding: 1px 6px;
  border-radius: var(--radius);
}

/* ---------- 模型切换 ---------- */
.lab-tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--line);
}
.lab-tabs button {
  background: none;
  border: 0;
  padding: 12px 20px;
  font-size: 14.5px;
  color: var(--ink-3);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  font-family: inherit;
  transition: color 0.15s ease, border-color 0.15s ease;
}
.lab-tabs button:hover { color: var(--pine); }
.lab-tabs button.on {
  color: var(--pine);
  font-weight: 500;
  border-bottom-color: var(--cinnabar);
}

.lab-note {
  margin-top: 12px;
  font-size: 12px;
  color: var(--ink-4);
  font-family: var(--mono);
}

.lab-section { margin-top: 22px; }

.tab-note {
  margin: 14px 0;
  font-size: 13px;
  color: var(--ink-2);
  background: var(--gold-soft);
  border-left: 3px solid var(--gold);
  padding: 9px 14px;
  border-radius: var(--radius);
}

/* ---------- KPI ---------- */
.kpi-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}
.kpi {
  background: var(--white);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 16px 18px;
}
.kpi .v {
  font-size: 22px;
  font-weight: 600;
  color: var(--pine);
}
.kpi .l {
  font-size: 11.5px;
  color: var(--ink-3);
  margin-top: 4px;
}

/* ---------- 控件 ---------- */
.ctrl-row {
  display: flex;
  gap: 28px;
  align-items: center;
  margin: 18px 0;
  flex-wrap: wrap;
}
.ctrl-row label {
  font-size: 13px;
  color: var(--ink-2);
  display: flex;
  align-items: center;
  gap: 10px;
}
.ctrl-row b { color: var(--cinnabar); }

.slider { accent-color: var(--pine); }
.slider.grow { flex: 1; }

.sel {
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  padding: 5px 10px;
  font-size: 13px;
  background: var(--white);
  color: var(--ink);
  font-family: inherit;
}

/* ---------- 卡片 ---------- */
.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 16px;
}
.card {
  background: var(--white);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 16px 18px;
}
.card h3 {
  font-family: var(--serif);
  font-size: 14.5px;
  color: var(--ink-2);
  margin-bottom: 10px;
  letter-spacing: 0.02em;
}

/* ---------- 表格 ---------- */
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}
.table th {
  text-align: left;
  background: var(--paper-2);
  color: var(--ink-2);
  font-weight: 500;
  padding: 7px 10px;
  border-bottom: 1px solid var(--line);
}
.table td {
  padding: 6.5px 10px;
  border-bottom: 1px solid var(--paper-3);
  color: var(--ink-2);
}
.dim-text {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.band-tag {
  display: inline-block;
  color: var(--white);
  font-size: 11px;
  padding: 1px 8px;
  border-radius: var(--radius);
}

/* ---------- 模型二布局 ---------- */
.m2-layout {
  display: grid;
  grid-template-columns: 1.7fr 1fr;
  gap: 16px;
  align-items: start;
}
.weight-panel { position: sticky; top: calc(var(--nav-h) + 16px); }
.wp-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.mini-btn {
  background: none;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  font-size: 12px;
  padding: 4px 10px;
  color: var(--ink-2);
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s ease;
}
.mini-btn:hover {
  color: var(--pine);
  border-color: var(--pine);
}
.wp-body {
  max-height: 560px;
  overflow: auto;
  margin-top: 10px;
  padding-right: 4px;
}
.dim-head {
  font-size: 11px;
  letter-spacing: 0.14em;
  color: var(--ink-4);
  font-family: var(--mono);
  margin: 12px 0 6px;
}
.w-row {
  display: grid;
  grid-template-columns: 140px 1fr 52px;
  gap: 10px;
  align-items: center;
  margin: 6px 0;
  font-size: 12.5px;
}
.w-label {
  color: var(--ink-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.w-val {
  text-align: right;
  color: var(--pine);
  font-size: 11.5px;
}

/* ---------- 模型三布局 ---------- */
.m3-layout {
  display: grid;
  grid-template-columns: 1.7fr 1fr;
  gap: 16px;
  align-items: start;
}
.calc-panel { position: sticky; top: calc(var(--nav-h) + 16px); }
.gauge-box { margin: 4px 0 0; }
.band-line {
  font-family: var(--serif);
  font-size: 17px;
  font-weight: 600;
  text-align: center;
}
.advice {
  font-size: 12.5px;
  color: var(--ink-3);
  text-align: center;
  margin: 6px 0 12px;
  line-height: 1.8;
}
.calc-fields {
  border-top: 1px solid var(--line);
  padding-top: 10px;
  max-height: 360px;
  overflow: auto;
}

@media (max-width: 1000px) {
  .kpi-row { grid-template-columns: 1fr 1fr; }
  .grid-2, .m2-layout, .m3-layout { grid-template-columns: 1fr; }
  .weight-panel, .calc-panel { position: static; }
}
</style>
