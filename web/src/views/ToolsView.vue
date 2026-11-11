<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { api, money, wan, isLoggedIn } from '../lib/api.js'
import PageHeader from '../components/PageHeader.vue'
import Chart from '../components/Chart.vue'
import {
  retirementAge,
  estimateBasicPension,
  calcGap,
  calcTaxSaving,
  payoutMonths,
  minimumContributionYears,
} from '../../../shared/calc.js'

const route = useRoute()
const tab = ref('retirement')
const tabs = [
  { key: 'retirement', label: '退休年龄', no: '01' },
  { key: 'pension', label: '养老金估算', no: '02' },
  { key: 'gap', label: '缺口测算', no: '03' },
  { key: 'tax', label: '税优测算', no: '04' },
  { key: 'compound', label: '复利定投', no: '05' },
]

onMounted(() => {
  const h = route.hash.replace('#', '')
  if (tabs.some((t) => t.key === h)) tab.value = h
})

watch(
  () => route.hash,
  (h) => {
    const key = String(h || '').replace('#', '')
    if (tabs.some((t) => t.key === key)) tab.value = key
  },
)

watch(tab, (v) => {
  history.replaceState(null, '', `#${v}`)
})

/* ================= 01 退休年龄 ================= */
const rYear = ref(1972)
const rMonth = ref(6)
const rCat = ref('male')

const rResult = computed(() => retirementAge(Number(rYear.value), Number(rMonth.value), rCat.value))

const catOptions = [
  { value: 'male', label: '男职工（原60周岁）' },
  { value: 'female55', label: '女职工（原55周岁）' },
  { value: 'female50', label: '女职工（原50周岁）' },
]

// 同类别不同出生年份的对照
const cohortRows = computed(() => {
  const rows = []
  const base = Number(rYear.value)
  for (let y = base - 4; y <= base + 6; y += 2) {
    if (y < 1955 || y > 1995) continue
    const r = retirementAge(y, 6, rCat.value)
    rows.push({
      year: y,
      delay: r.delayMonths,
      age: r.legalAgeYears,
      date: r.legalText,
      minYears: r.minContributionYears,
      current: y === base,
    })
  }
  return rows
})

/* ================= 02 养老金估算 ================= */
const pWage = ref(8000)
const pYears = ref(30)
const pIndex = ref(0.9)
const pAccount = ref(180000)
const pAge = ref(60)
const pTrans = ref(0)

const pResult = computed(() =>
  estimateBasicPension({
    avgWage: Number(pWage.value),
    years: Number(pYears.value),
    index: Number(pIndex.value),
    accountBalance: Number(pAccount.value),
    age: Number(pAge.value),
    transitionYears: Number(pTrans.value),
  }),
)

const pensionChart = computed(() => ({
  tooltip: {
    trigger: 'item',
    backgroundColor: '#fdfcf9',
    borderColor: '#d3d0c6',
    textStyle: { color: '#1c2622', fontSize: 12 },
    formatter: (p) => `${p.name}：${money(p.value)} 元/月（${p.percent}%）`,
  },
  series: [
    {
      type: 'pie',
      radius: ['58%', '82%'],
      center: ['50%', '50%'],
      avoidLabelOverlap: true,
      itemStyle: { borderColor: '#fdfcf9', borderWidth: 2 },
      label: { show: false },
      data: pResult.value.parts
        .filter((x) => x.value > 0)
        .map((x, i) => ({
          name: x.label,
          value: x.value,
          percent: Math.round((x.value / pResult.value.total) * 1000) / 10,
          itemStyle: { color: ['#14453a', '#b23a2b', '#8a6a2f'][i % 3] },
        })),
    },
  ],
}))

/* ================= 03 缺口测算 ================= */
const gAge = ref(40)
const gRetire = ref(60)
const gLife = ref(85)
const gExpense = ref(12000)
const gRatio = ref(75)
const gInfl = ref(2.5)
const gPension = ref(4200)
const gSavings = ref(300000)
const gMonthly = ref(2000)
const gReturn = ref(3.5)
const gCare = ref(300000)

const gResult = computed(() =>
  calcGap({
    currentAge: Number(gAge.value),
    retireAge: Number(gRetire.value),
    lifeExpectancy: Number(gLife.value),
    currentMonthlyExpense: Number(gExpense.value),
    expenseRatio: Number(gRatio.value) / 100,
    inflation: Number(gInfl.value) / 100,
    pensionMonthly: Number(gPension.value),
    currentSavings: Number(gSavings.value),
    monthlySaving: Number(gMonthly.value),
    returnRate: Number(gReturn.value) / 100,
    extraCareReserve: Number(gCare.value),
  }),
)

const gapChart = computed(() => {
  const d = gResult.value.timeline
  return {
    grid: { left: 52, right: 20, top: 24, bottom: 34 },
    xAxis: {
      type: 'category',
      data: d.map((x) => x.age),
      axisLabel: { color: '#96a09b', fontSize: 10, fontFamily: 'monospace' },
      axisLine: { lineStyle: { color: '#b8b4a8' } },
      axisTick: { show: false },
      name: '年龄',
      nameTextStyle: { color: '#96a09b', fontSize: 10 },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: '#96a09b',
        fontSize: 10,
        fontFamily: 'monospace',
        formatter: (v) => (v >= 10000 ? v / 10000 + '万' : v),
      },
      splitLine: { lineStyle: { color: '#e2dfd6' } },
      axisLine: { show: false },
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#fdfcf9',
      borderColor: '#d3d0c6',
      textStyle: { color: '#1c2622', fontSize: 12 },
      formatter: (p) => {
        const x = d[p[0].dataIndex]
        return `${x.age}岁 · ${x.phase === 'accumulate' ? '积累期' : '提取期'}<br/>资产余额：${money(x.balance)} 元`
      },
    },
    series: [
      {
        type: 'line',
        data: d.map((x) => x.balance),
        step: 'end',
        symbol: 'none',
        lineStyle: { color: '#14453a', width: 1.8 },
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
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#b23a2b', type: 'dashed', width: 1 },
          label: { formatter: '退休', color: '#b23a2b', fontSize: 10, position: 'insideEndTop', rotate: 0 },
          data: [{ xAxis: String(Math.round(Number(gRetire.value))) }],
        },
      },
    ],
  }
})

const sensitivityChart = computed(() => ({
  grid: { left: 56, right: 20, top: 20, bottom: 30 },
  xAxis: {
    type: 'category',
    data: gResult.value.sensitivity.map((s) => s.rate + '%'),
    axisLabel: { color: '#96a09b', fontSize: 10, fontFamily: 'monospace' },
    axisLine: { lineStyle: { color: '#b8b4a8' } },
    axisTick: { show: false },
  },
  yAxis: {
    type: 'value',
    axisLabel: {
      color: '#96a09b',
      fontSize: 10,
      fontFamily: 'monospace',
      formatter: (v) => (Math.abs(v) >= 10000 ? (v / 10000).toFixed(0) + '万' : v),
    },
    splitLine: { lineStyle: { color: '#e2dfd6' } },
  },
  tooltip: {
    trigger: 'axis',
    backgroundColor: '#fdfcf9',
    borderColor: '#d3d0c6',
    textStyle: { color: '#1c2622', fontSize: 12 },
    formatter: (p) => `年化 ${p[0].axisValue}<br/>缺口：${money(p[0].value)} 元`,
  },
  series: [
    {
      type: 'bar',
      data: gResult.value.sensitivity.map((s) => ({
        value: s.gap,
        itemStyle: { color: s.gap > 0 ? '#b23a2b' : '#14453a' },
      })),
      barWidth: '46%',
      label: {
        show: true,
        position: 'top',
        fontSize: 10,
        fontFamily: 'monospace',
        color: '#6b7772',
        formatter: (p) => (Math.abs(p.value) >= 10000 ? (p.value / 10000).toFixed(0) + '万' : p.value),
      },
    },
  ],
}))

const saveState = ref('')
async function saveGap() {
  if (!isLoggedIn()) {
    saveState.value = '请先登录后再保存'
    return
  }
  saveState.value = '保存中…'
  try {
    await api.post('/calc/gap', {
      currentAge: Number(gAge.value),
      retireAge: Number(gRetire.value),
      lifeExpectancy: Number(gLife.value),
      currentMonthlyExpense: Number(gExpense.value),
      expenseRatio: Number(gRatio.value) / 100,
      inflation: Number(gInfl.value) / 100,
      pensionMonthly: Number(gPension.value),
      currentSavings: Number(gSavings.value),
      monthlySaving: Number(gMonthly.value),
      returnRate: Number(gReturn.value) / 100,
      extraCareReserve: Number(gCare.value),
    })
    saveState.value = '已保存到账户'
    setTimeout(() => (saveState.value = ''), 2600)
  } catch (e) {
    saveState.value = e.message
  }
}

/* ================= 04 税优 ================= */
const tAmount = ref(12000)
const tRate = ref(20)
const tResult = computed(() => calcTaxSaving(Number(tAmount.value), Number(tRate.value)))
const brackets = [3, 10, 20, 25, 30, 35, 45]

const taxRows = computed(() =>
  brackets.map((r) => ({ rate: r, ...calcTaxSaving(Number(tAmount.value), r) })),
)

const taxChart = computed(() => ({
  grid: { left: 48, right: 16, top: 20, bottom: 28 },
  xAxis: {
    type: 'category',
    data: brackets.map((b) => b + '%'),
    axisLabel: { color: '#96a09b', fontSize: 10, fontFamily: 'monospace' },
    axisLine: { lineStyle: { color: '#b8b4a8' } },
    axisTick: { show: false },
  },
  yAxis: {
    type: 'value',
    axisLabel: { color: '#96a09b', fontSize: 10, fontFamily: 'monospace' },
    splitLine: { lineStyle: { color: '#e2dfd6' } },
  },
  tooltip: {
    trigger: 'axis',
    backgroundColor: '#fdfcf9',
    borderColor: '#d3d0c6',
    textStyle: { color: '#1c2622', fontSize: 12 },
    formatter: (p) => `边际税率 ${p[0].axisValue}<br/>年净节税：${money(p[0].value)} 元`,
  },
  series: [
    {
      type: 'bar',
      data: taxRows.value.map((r) => ({
        value: r.netSaving,
        itemStyle: { color: r.rate === Number(tRate.value) ? '#b23a2b' : '#14453a', opacity: r.rate === Number(tRate.value) ? 1 : 0.75 },
      })),
      barWidth: '52%',
    },
  ],
}))

/* ================= 05 复利 ================= */
const cPrincipal = ref(100000)
const cMonthly = ref(2000)
const cYears = ref(20)
const cRate = ref(4)

const cResult = computed(() => {
  const n = Number(cYears.value) * 12
  const r = Math.pow(1 + Number(cRate.value) / 100, 1 / 12) - 1
  const fvP = Number(cPrincipal.value) * Math.pow(1 + r, n)
  const fvM = Math.abs(r) < 1e-9 ? Number(cMonthly.value) * n : Number(cMonthly.value) * ((Math.pow(1 + r, n) - 1) / r)
  return {
    total: Math.round(fvP + fvM),
    fromPrincipal: Math.round(fvP),
    fromMonthly: Math.round(fvM),
    contributed: Math.round(Number(cPrincipal.value) + Number(cMonthly.value) * n),
    growth: Math.round(fvP + fvM - Number(cPrincipal.value) - Number(cMonthly.value) * n),
  }
})

const compoundChart = computed(() => {
  const years = Number(cYears.value)
  const labels = []
  const principalLine = []
  const totalLine = []
  const r = Math.pow(1 + Number(cRate.value) / 100, 1 / 12) - 1
  for (let y = 0; y <= years; y++) {
    const n = y * 12
    labels.push(y + '年')
    principalLine.push(Math.round(Number(cPrincipal.value) + Number(cMonthly.value) * n))
    const fvP = Number(cPrincipal.value) * Math.pow(1 + r, n)
    const fvM = Math.abs(r) < 1e-9 ? Number(cMonthly.value) * n : Number(cMonthly.value) * ((Math.pow(1 + r, n) - 1) / r)
    totalLine.push(Math.round(fvP + fvM))
  }
  return {
    grid: { left: 52, right: 20, top: 28, bottom: 30 },
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: { color: '#96a09b', fontSize: 10, fontFamily: 'monospace', interval: Math.max(0, Math.floor(years / 8)) },
      axisLine: { lineStyle: { color: '#b8b4a8' } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: '#96a09b',
        fontSize: 10,
        fontFamily: 'monospace',
        formatter: (v) => (v >= 10000 ? (v / 10000).toFixed(0) + '万' : v),
      },
      splitLine: { lineStyle: { color: '#e2dfd6' } },
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#fdfcf9',
      borderColor: '#d3d0c6',
      textStyle: { color: '#1c2622', fontSize: 12 },
      valueFormatter: (v) => money(v) + ' 元',
    },
    legend: { bottom: -2, itemWidth: 10, itemHeight: 2, textStyle: { color: '#6b7772', fontSize: 11 } },
    series: [
      {
        name: '累计投入',
        type: 'line',
        data: principalLine,
        symbol: 'none',
        lineStyle: { color: '#96a09b', width: 1.4, type: 'dashed' },
      },
      {
        name: '账户价值',
        type: 'line',
        data: totalLine,
        symbol: 'none',
        lineStyle: { color: '#14453a', width: 2 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(20,69,58,0.18)' },
              { offset: 1, color: 'rgba(20,69,58,0.01)' },
            ],
          },
        },
      },
    ],
  }
})

const payoutRef = computed(() => payoutMonths(Number(pAge.value)))
const minYearsHint = computed(() => minimumContributionYears(Number(rResult.value.legalDate.year)))
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Calculators"
      title="测算中心"
      desc="五个工具，覆盖退休时点、第一支柱待遇、总缺口、税优价值与复利效应。所有计算在浏览器本地完成，参数实时生效，结果可保存至账户。"
    />

    <div class="wrap">
      <div class="tab-bar">
        <button
          v-for="t in tabs"
          :key="t.key"
          class="tab"
          :class="{ on: tab === t.key }"
          @click="tab = t.key"
        >
          <span class="tab-no mono">{{ t.no }}</span>
          <span class="tab-label">{{ t.label }}</span>
        </button>
      </div>

      <!-- ============ 01 退休年龄 ============ -->
      <section v-if="tab === 'retirement'" class="panel-grid">
        <div class="inputs">
          <div class="panel-head">
            <h2>输入</h2>
            <p>依据 2024 年 9 月全国人大常委会决定，自 2025 年 1 月 1 日起实施。</p>
          </div>

          <div class="field">
            <label>人员类别</label>
            <select v-model="rCat" class="select">
              <option v-for="c in catOptions" :key="c.value" :value="c.value">{{ c.label }}</option>
            </select>
          </div>

          <div class="field">
            <label>出生年份</label>
            <div class="num-row">
              <input v-model.number="rYear" type="range" min="1955" max="1995" step="1" />
              <input v-model.number="rYear" type="number" class="input num" min="1955" max="1995" />
            </div>
            <span class="hint">1955 至 1995 年，覆盖过渡期主要人群</span>
          </div>

          <div class="field">
            <label>出生月份</label>
            <div class="month-grid">
              <button
                v-for="m in 12"
                :key="m"
                class="mbtn"
                :class="{ on: rMonth === m }"
                @click="rMonth = m"
              >
                {{ m }}
              </button>
            </div>
          </div>

          <div class="formula-note">
            <span class="mono">RULE</span>
            <p>
              男职工与原 55 周岁女职工：每 4 个月延迟 1 个月，最多 36 个月。原 50 周岁女职工：每 2 个月延迟 1 个月，最多 60 个月。
            </p>
          </div>
        </div>

        <div class="outputs">
          <div class="result-hero">
            <div class="rh-label">法定退休时点</div>
            <div class="rh-value">
              <span class="mono">{{ rResult.legalDate.year }}</span>
              <span class="rh-unit">年</span>
              <span class="mono">{{ String(rResult.legalDate.month).padStart(2, '0') }}</span>
              <span class="rh-unit">月</span>
            </div>
            <div class="rh-sub">
              法定退休年龄 <b class="mono">{{ rResult.legalAgeYears }}</b> 岁 ·
              较原 {{ rResult.originalAge }} 岁延迟 <b class="mono">{{ rResult.delayMonths }}</b> 个月
            </div>
          </div>

          <div class="metric-row">
            <div class="metric">
              <span class="m-label">弹性提前（最早）</span>
              <span class="m-val mono">{{ rResult.earliestText }}</span>
              <span class="m-hint">最长提前 3 年，且不低于原法定年龄</span>
            </div>
            <div class="metric">
              <span class="m-label">弹性延迟（最晚）</span>
              <span class="m-val mono">{{ rResult.latestText }}</span>
              <span class="m-hint">需与用人单位协商一致</span>
            </div>
            <div class="metric">
              <span class="m-label">最低缴费年限</span>
              <span class="m-val mono">{{ rResult.minContributionText }}</span>
              <span class="m-hint">2030 年起每年提高 6 个月，2039 年起 20 年</span>
            </div>
          </div>

          <div class="cohort">
            <div class="cohort-head">
              <h3>同类别人群对照</h3>
              <span class="mono">按出生年份</span>
            </div>
            <table class="table">
              <thead>
                <tr>
                  <th>出生年</th>
                  <th>延迟月数</th>
                  <th>退休年龄</th>
                  <th>退休时点</th>
                  <th>最低缴费</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in cohortRows" :key="r.year" :class="{ hl: r.current }">
                  <td class="mono">{{ r.year }}</td>
                  <td class="mono">{{ r.delay }} 月</td>
                  <td class="mono">{{ r.age }} 岁</td>
                  <td class="mono">{{ r.date }}</td>
                  <td class="mono">{{ r.minYears }} 年</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="caveat">
            <span class="mono">!</span>
            <p>
              本工具按全国统一规则推算，未考虑特殊工种提前退休、病退、军转干部等特殊情形。精确结果以参保地社保经办机构核定为准。
            </p>
          </div>
        </div>
      </section>

      <!-- ============ 02 养老金 ============ -->
      <section v-else-if="tab === 'pension'" class="panel-grid">
        <div class="inputs">
          <div class="panel-head">
            <h2>输入</h2>
            <p>城镇职工基本养老保险待遇估算，参数可按自己的参保情况调整。</p>
          </div>

          <div class="field">
            <label>退休时上年度全省月平均工资（元）</label>
            <input v-model.number="pWage" type="number" class="input" step="500" />
            <span class="hint">可查当地人社局公布的全口径城镇单位就业人员平均工资</span>
          </div>

          <div class="field">
            <label>累计缴费年限（年）</label>
            <div class="num-row">
              <input v-model.number="pYears" type="range" min="15" max="45" step="1" />
              <input v-model.number="pYears" type="number" class="input num" min="15" max="45" />
            </div>
          </div>

          <div class="field">
            <label>本人平均缴费工资指数</label>
            <div class="num-row">
              <input v-model.number="pIndex" type="range" min="0.6" max="3" step="0.1" />
              <input v-model.number="pIndex" type="number" class="input num" min="0.6" max="3" step="0.1" />
            </div>
            <span class="hint">0.6 为下限（社平工资 60%），1.0 为按社平工资缴费，3.0 为上限</span>
          </div>

          <div class="field">
            <label>个人账户储存额（元）</label>
            <input v-model.number="pAccount" type="number" class="input" step="10000" />
            <span class="hint">可在电子社保卡或当地社保 App 查询「个人账户累计储存额」</span>
          </div>

          <div class="field">
            <label>退休年龄（岁）</label>
            <div class="num-row">
              <input v-model.number="pAge" type="range" min="50" max="70" step="0.25" />
              <input v-model.number="pAge" type="number" class="input num" min="50" max="70" step="0.25" />
            </div>
            <span class="hint">对应计发月数 <b class="mono">{{ payoutRef }}</b> 个月</span>
          </div>

          <div class="field">
            <label>视同缴费年限（年，仅「中人」填写）</label>
            <input v-model.number="pTrans" type="number" class="input" min="0" max="20" step="1" />
            <span class="hint">1997 年统一制度前的连续工龄，无则填 0</span>
          </div>
        </div>

        <div class="outputs">
          <div class="result-hero">
            <div class="rh-label">预计月基本养老金</div>
            <div class="rh-value">
              <span class="mono">{{ money(pResult.total) }}</span>
              <span class="rh-unit">元 / 月</span>
            </div>
            <div class="rh-sub">
              替代率 <b class="mono">{{ pResult.replacementRate }}%</b> ·
              计发月数 <b class="mono">{{ pResult.payoutMonths }}</b> 个月
            </div>
          </div>

          <div class="split-view">
            <div class="sv-chart">
              <Chart :option="pensionChart" height="220px" />
            </div>
            <div class="sv-legend">
              <div v-for="(part, i) in pResult.parts" :key="part.key" class="lg-item">
                <span class="lg-dot" :style="{ background: ['#14453a', '#b23a2b', '#8a6a2f'][i] }"></span>
                <span class="lg-name">{{ part.label }}</span>
                <span class="lg-val mono">{{ money(part.value) }}</span>
                <span class="lg-pct mono">{{ pResult.total ? ((part.value / pResult.total) * 100).toFixed(1) : 0 }}%</span>
              </div>
            </div>
          </div>

          <div class="formula-box">
            <div class="fb-title mono">计算过程</div>
            <div class="fb-line">
              <span>基础养老金</span>
              <span class="mono">
                ({{ money(pResult.avgWage) }} + {{ money(pResult.indexedWage) }}) ÷ 2 × {{ pYears }} × 1% =
                <b>{{ money(pResult.base) }}</b>
              </span>
            </div>
            <div class="fb-line">
              <span>个人账户养老金</span>
              <span class="mono">{{ money(pAccount) }} ÷ {{ pResult.payoutMonths }} = <b>{{ money(pResult.personal) }}</b></span>
            </div>
            <div class="fb-line">
              <span>过渡性养老金</span>
              <span class="mono">
                {{ money(pResult.avgWage) }} × {{ pIndex }} × {{ pTrans }} × 1.3% = <b>{{ money(pResult.transition) }}</b>
              </span>
            </div>
          </div>

          <div class="insight">
            <div class="ins-head">
              <span class="mono">INSIGHT</span>
              <span>三个可主动改变的量</span>
            </div>
            <div class="ins-grid">
              <div>
                <span class="ins-n mono">年限</span>
                <p>每多缴 1 年，基础养老金增加约 {{ money(Math.round(((pResult.avgWage + pResult.indexedWage) / 2) * 0.01)) }} 元/月。</p>
              </div>
              <div>
                <span class="ins-n mono">指数</span>
                <p>指数从 {{ pIndex }} 提高到 {{ Math.min(3, Number(pIndex) + 0.2).toFixed(1) }}，月待遇约增加 {{ money(Math.round(((pResult.avgWage * 0.2) / 2) * pYears * 0.01)) }} 元。</p>
              </div>
              <div>
                <span class="ins-n mono">退休年龄</span>
                <p>延迟 1 年，计发月数由 {{ payoutRef }} 降至约 {{ payoutMonths(Number(pAge) + 1) }}，个人账户养老金相应提高。</p>
              </div>
            </div>
          </div>

          <div class="caveat">
            <span class="mono">!</span>
            <p>
              本结果为估算。实际计算使用退休当年社平工资，且各省过渡性养老金办法、地方性补贴差异较大。请以社保经办机构核定为准。
            </p>
          </div>
        </div>
      </section>

      <!-- ============ 03 缺口 ============ -->
      <section v-else-if="tab === 'gap'" class="gap-layout">
        <div class="inputs gap-inputs">
          <div class="panel-head">
            <h2>输入</h2>
            <p>金额均按「今天的购买力」填写，工具会自动折算到退休当年。</p>
          </div>

          <div class="input-group">
            <div class="ig-title">时间</div>
            <div class="field">
              <label>当前年龄 <b class="mono">{{ gAge }}</b> 岁</label>
              <input v-model.number="gAge" type="range" min="25" max="65" step="1" />
            </div>
            <div class="field">
              <label>计划退休年龄 <b class="mono">{{ gRetire }}</b> 岁</label>
              <input v-model.number="gRetire" type="range" min="50" max="70" step="1" />
            </div>
            <div class="field">
              <label>预期寿命 <b class="mono">{{ gLife }}</b> 岁</label>
              <input v-model.number="gLife" type="range" min="75" max="100" step="1" />
              <span class="hint">建议按「平均余命 + 5 至 8 年」设定</span>
            </div>
          </div>

          <div class="input-group">
            <div class="ig-title">支出</div>
            <div class="field">
              <label>当前家庭月支出（元）</label>
              <input v-model.number="gExpense" type="number" class="input" step="500" />
            </div>
            <div class="field">
              <label>退休后支出占当前比例 <b class="mono">{{ gRatio }}%</b></label>
              <input v-model.number="gRatio" type="range" min="40" max="110" step="5" />
            </div>
            <div class="field">
              <label>年通胀率 <b class="mono">{{ gInfl }}%</b></label>
              <input v-model.number="gInfl" type="range" min="0" max="6" step="0.1" />
            </div>
            <div class="field">
              <label>护理专项储备（元，现值）</label>
              <input v-model.number="gCare" type="number" class="input" step="50000" />
              <span class="hint">建议按本地护理报价 3 至 5 年总额设定</span>
            </div>
          </div>

          <div class="input-group">
            <div class="ig-title">收入与资产</div>
            <div class="field">
              <label>预计退休首月养老金（元，现值）</label>
              <input v-model.number="gPension" type="number" class="input" step="100" />
              <span class="hint">可用「养老金估算」工具算出后填入</span>
            </div>
            <div class="field">
              <label>当前可动用养老资产（元）</label>
              <input v-model.number="gSavings" type="number" class="input" step="10000" />
            </div>
            <div class="field">
              <label>每月计划储蓄（元）</label>
              <input v-model.number="gMonthly" type="number" class="input" step="100" />
            </div>
            <div class="field">
              <label>长期年化回报假设 <b class="mono">{{ gReturn }}%</b></label>
              <input v-model.number="gReturn" type="range" min="1" max="8" step="0.5" />
              <span class="hint">保守 2% 至 3%，稳健 3% 至 4%，进取 5% 以上</span>
            </div>
          </div>

          <button class="btn" @click="saveGap">保存这次测算</button>
          <p v-if="saveState" class="save-state">{{ saveState }}</p>
        </div>

        <div class="outputs">
          <div class="gap-hero" :class="{ danger: gResult.gap > 0, ok: gResult.gap <= 0 }">
            <div class="gh-label">{{ gResult.gap > 0 ? '资金缺口' : '资金盈余' }}</div>
            <div class="gh-value">
              <span class="mono">{{ wan(Math.abs(gResult.gap)) }}</span>
              <span class="gh-unit">元</span>
            </div>
            <div class="gh-sub">
              覆盖率 <b class="mono">{{ gResult.coverage }}%</b> ·
              距退休 <b class="mono">{{ gResult.yearsToRetire }}</b> 年 ·
              退休后 <b class="mono">{{ gResult.retirementYears }}</b> 年
            </div>
            <div v-if="gResult.gap > 0" class="gh-cta">
              需将月储蓄提高到 <b class="mono">{{ money(gResult.requiredMonthlySaving) }}</b> 元，或调整目标
            </div>
            <div v-else class="gh-cta">按当前假设，储备可覆盖退休支出，可考虑提高目标或降低风险敞口</div>
          </div>

          <div class="metric-row four">
            <div class="metric">
              <span class="m-label">退休时月支出</span>
              <span class="m-val mono">{{ money(gResult.expenseAtRetire) }}</span>
              <span class="m-hint">含通胀折算</span>
            </div>
            <div class="metric">
              <span class="m-label">退休时月养老金</span>
              <span class="m-val mono">{{ money(gResult.pensionAtRetire) }}</span>
              <span class="m-hint">假设随通胀调整</span>
            </div>
            <div class="metric">
              <span class="m-label">月缺口</span>
              <span class="m-val mono">{{ money(gResult.monthlyGapAtRetire) }}</span>
              <span class="m-hint">退休首月</span>
            </div>
            <div class="metric">
              <span class="m-label">所需总储备</span>
              <span class="m-val mono">{{ wan(gResult.totalNeeded) }}</span>
              <span class="m-hint">含护理专项</span>
            </div>
          </div>

          <div class="chart-card">
            <div class="cc-head">
              <h3>资产余额轨迹</h3>
              <span class="mono">名义值 · 逐年</span>
            </div>
            <Chart :option="gapChart" height="260px" />
          </div>

          <div class="chart-card">
            <div class="cc-head">
              <h3>回报率敏感性</h3>
              <span class="mono">其他参数不变</span>
            </div>
            <Chart :option="sensitivityChart" height="200px" />
            <p class="cc-note">
              回报率每提高 1 个百分点，长期缺口变化显著。但更高的回报假设同时意味着更大的波动与亏损概率，不应只看单一情景。
            </p>
          </div>

          <div class="caveat">
            <span class="mono">!</span>
            <p>
              缺口测算对假设高度敏感。通胀率、预期寿命、回报率三个参数各变动一点，结果可能相差数十万元。建议做三档情景（悲观/中性/乐观）分别测算，而非只信一个数字。
            </p>
          </div>
        </div>
      </section>

      <!-- ============ 04 税优 ============ -->
      <section v-else-if="tab === 'tax'" class="panel-grid">
        <div class="inputs">
          <div class="panel-head">
            <h2>输入</h2>
            <p>个人养老金采用 EET 模式：缴费扣除、投资免税、领取时按 3% 单独计税。</p>
          </div>

          <div class="field">
            <label>年度缴费金额（元）</label>
            <div class="num-row">
              <input v-model.number="tAmount" type="range" min="0" max="12000" step="500" />
              <input v-model.number="tAmount" type="number" class="input num" min="0" max="12000" step="500" />
            </div>
            <span class="hint">现行上限 12000 元/年，超出部分不享受税前扣除</span>
          </div>

          <div class="field">
            <label>适用边际税率</label>
            <div class="rate-grid">
              <button
                v-for="b in brackets"
                :key="b"
                class="rbtn"
                :class="{ on: tRate === b }"
                @click="tRate = b"
              >
                {{ b }}%
              </button>
            </div>
            <span class="hint">边际税率指「最后一元收入」的税率，不是平均税率</span>
          </div>

          <div class="formula-note">
            <span class="mono">FORMULA</span>
            <p>净节税 = 缴费额 × 边际税率 − 缴费额 × 3%</p>
          </div>

          <div class="tier-table">
            <div class="tt-title">边际税率对应的年应纳税所得额（综合所得）</div>
            <table class="table">
              <tbody>
                <tr><td class="mono">3%</td><td>不超过 36,000 元</td></tr>
                <tr><td class="mono">10%</td><td>36,000 至 144,000 元</td></tr>
                <tr><td class="mono">20%</td><td>144,000 至 300,000 元</td></tr>
                <tr><td class="mono">25%</td><td>300,000 至 420,000 元</td></tr>
                <tr><td class="mono">30%</td><td>420,000 至 660,000 元</td></tr>
                <tr><td class="mono">35%</td><td>660,000 至 960,000 元</td></tr>
                <tr><td class="mono">45%</td><td>超过 960,000 元</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="outputs">
          <div class="result-hero">
            <div class="rh-label">年度净节税</div>
            <div class="rh-value">
              <span class="mono">{{ money(tResult.netSaving) }}</span>
              <span class="rh-unit">元 / 年</span>
            </div>
            <div class="rh-sub">
              缴费节税 <b class="mono">{{ money(tResult.savingAtContribution) }}</b> −
              领取税负 <b class="mono">{{ money(tResult.taxAtWithdrawal) }}</b>
            </div>
          </div>

          <div class="tax-split">
            <div class="ts-item">
              <span class="ts-label">缴费环节少缴</span>
              <span class="ts-val mono positive">+{{ money(tResult.savingAtContribution) }}</span>
              <span class="ts-note">{{ tAmount }} × {{ tRate }}%</span>
            </div>
            <div class="ts-item">
              <span class="ts-label">领取环节补缴</span>
              <span class="ts-val mono negative">−{{ money(tResult.taxAtWithdrawal) }}</span>
              <span class="ts-note">{{ tAmount }} × 3%</span>
            </div>
            <div class="ts-item">
              <span class="ts-label">等效收益率提升</span>
              <span class="ts-val mono">{{ tResult.effectiveGain }}%</span>
              <span class="ts-note">净节税 ÷ 缴费额</span>
            </div>
          </div>

          <div class="chart-card">
            <div class="cc-head">
              <h3>各税率档位的净节税</h3>
              <span class="mono">年缴 {{ money(tAmount) }} 元</span>
            </div>
            <Chart :option="taxChart" height="220px" />
          </div>

          <div class="verdict" :class="tResult.netSaving > 0 ? 'good' : 'neutral'">
            <span class="v-mark mono">{{ tResult.netSaving > 0 ? '✓' : '!' }}</span>
            <div>
              <div class="v-title">
                {{ tResult.netSaving > 0 ? '对您而言，税优是正收益' : '对您而言，税优空间有限' }}
              </div>
              <p>
                {{
                  tResult.netSaving > 0
                    ? `边际税率 ${tRate}% 高于领取环节的 3%，每年可净省 ${money(tResult.netSaving)} 元。若连续缴纳 20 年，静态累计节税约 ${wan(tResult.netSaving * 20)} 元（未计投资收益与时间价值）。`
                    : '边际税率不高于 3%，缴费环节的节税不足以覆盖领取环节的税负。此时参加个人养老金应更关注产品费率、强制储蓄价值与便利性，而非税优。'
                }}
              </p>
            </div>
          </div>

          <div class="caveat">
            <span class="mono">!</span>
            <p>
              本测算为静态简化模型，未计入投资收益、领取时对投资收益部分的计税、以及未来政策调整。实际节税以个人所得税年度汇算结果为准。
            </p>
          </div>
        </div>
      </section>

      <!-- ============ 05 复利 ============ -->
      <section v-else class="panel-grid">
        <div class="inputs">
          <div class="panel-head">
            <h2>输入</h2>
            <p>用来看清「时间」与「回报率」哪一个对最终结果影响更大。</p>
          </div>

          <div class="field">
            <label>初始本金（元）</label>
            <input v-model.number="cPrincipal" type="number" class="input" step="10000" />
          </div>

          <div class="field">
            <label>每月追加（元）</label>
            <input v-model.number="cMonthly" type="number" class="input" step="100" />
          </div>

          <div class="field">
            <label>投资年限 <b class="mono">{{ cYears }}</b> 年</label>
            <input v-model.number="cYears" type="range" min="1" max="40" step="1" />
          </div>

          <div class="field">
            <label>年化回报率 <b class="mono">{{ cRate }}%</b></label>
            <input v-model.number="cRate" type="range" min="0" max="10" step="0.5" />
            <span class="hint">长期养老配置的合理假设区间通常为 2% 至 6%</span>
          </div>

          <div class="formula-note">
            <span class="mono">NOTE</span>
            <p>复利效果在最后几年才显著显现。年限从 10 年延长到 20 年，终值往往不是翻倍，而是数倍。</p>
          </div>
        </div>

        <div class="outputs">
          <div class="result-hero">
            <div class="rh-label">期末账户价值</div>
            <div class="rh-value">
              <span class="mono">{{ wan(cResult.total) }}</span>
              <span class="rh-unit">元</span>
            </div>
            <div class="rh-sub">
              累计投入 <b class="mono">{{ wan(cResult.contributed) }}</b> 元 ·
              增值 <b class="mono">{{ wan(cResult.growth) }}</b> 元
            </div>
          </div>

          <div class="metric-row">
            <div class="metric">
              <span class="m-label">本金增值部分</span>
              <span class="m-val mono">{{ wan(cResult.fromPrincipal) }}</span>
              <span class="m-hint">初始本金的复利结果</span>
            </div>
            <div class="metric">
              <span class="m-label">定投积累部分</span>
              <span class="m-val mono">{{ wan(cResult.fromMonthly) }}</span>
              <span class="m-hint">每月追加的复利结果</span>
            </div>
            <div class="metric">
              <span class="m-label">增值占比</span>
              <span class="m-val mono">{{ cResult.total ? ((cResult.growth / cResult.total) * 100).toFixed(1) : 0 }}%</span>
              <span class="m-hint">收益占总资产比例</span>
            </div>
          </div>

          <div class="chart-card">
            <div class="cc-head">
              <h3>累计投入与账户价值</h3>
              <span class="mono">逐年</span>
            </div>
            <Chart :option="compoundChart" height="300px" />
          </div>

          <div class="insight">
            <div class="ins-head">
              <span class="mono">INSIGHT</span>
              <span>时间与回报率的相对重要性</span>
            </div>
            <p class="ins-text">
              在本例中，累计投入 {{ wan(cResult.contributed) }} 元，最终
              {{ wan(cResult.total) }} 元，其中 {{ ((cResult.growth / Math.max(1, cResult.total)) * 100).toFixed(0) }}%
              来自投资收益。若把年限延长 5 年，终值将变为
              {{ wan(Math.round((Number(cPrincipal) * Math.pow(1 + Number(cRate) / 100, Number(cYears) + 5)) + Number(cMonthly) * ((Math.pow(1 + Number(cRate) / 100, Number(cYears) + 5) - 1) / (Number(cRate) / 100)))) }}
              元。这就是「早开始」比「高回报」更可控的原因。
            </p>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.tab-bar {
  display: flex;
  border-bottom: 1px solid var(--line-strong);
  margin-bottom: 34px;
  overflow-x: auto;
}

.tab {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 13px 20px;
  background: none;
  border: 0;
  border-bottom: 2px solid transparent;
  color: var(--ink-3);
  font-size: 14px;
  white-space: nowrap;
  transition: color 0.15s ease, border-color 0.15s ease;
  margin-bottom: -1px;
}

.tab:hover {
  color: var(--pine);
}

.tab.on {
  color: var(--pine);
  border-bottom-color: var(--cinnabar);
  font-weight: 500;
}

.tab-no {
  font-size: 10px;
  opacity: 0.6;
}

/* 布局 */
.panel-grid {
  display: grid;
  grid-template-columns: 340px minmax(0, 1fr);
  gap: 44px;
  align-items: start;
}

.gap-layout {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 44px;
  align-items: start;
}

.inputs {
  background: var(--white);
  border: 1px solid var(--line);
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  position: sticky;
  top: calc(var(--nav-h) + 20px);
}

.gap-inputs {
  max-height: calc(100dvh - var(--nav-h) - 40px);
  overflow-y: auto;
}

.panel-head h2 {
  font-size: 19px;
}

.panel-head p {
  margin-top: 7px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--ink-3);
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
}

.ig-title {
  font-size: 10.5px;
  letter-spacing: 0.14em;
  color: var(--ink-4);
  font-family: var(--mono);
  text-transform: uppercase;
}

.num-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.num-row input[type='range'] {
  flex: 1;
}

.num {
  width: 88px;
  flex-shrink: 0;
  text-align: right;
  font-family: var(--mono);
  font-size: 13px;
}

.month-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 4px;
}

.mbtn {
  height: 30px;
  border: 1px solid var(--line);
  background: transparent;
  color: var(--ink-2);
  font-size: 12px;
  font-family: var(--mono);
  border-radius: var(--radius);
  transition: all 0.13s ease;
}

.mbtn:hover {
  border-color: var(--pine);
  color: var(--pine);
}

.mbtn.on {
  background: var(--pine);
  border-color: var(--pine);
  color: var(--white);
}

.rate-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
}

.rbtn {
  height: 32px;
  border: 1px solid var(--line);
  background: transparent;
  color: var(--ink-2);
  font-size: 12.5px;
  font-family: var(--mono);
  border-radius: var(--radius);
  transition: all 0.13s ease;
}

.rbtn:hover {
  border-color: var(--pine);
  color: var(--pine);
}

.rbtn.on {
  background: var(--pine);
  border-color: var(--pine);
  color: var(--white);
}

.formula-note {
  display: flex;
  gap: 12px;
  padding: 12px 14px;
  background: var(--paper-2);
  border-left: 2px solid var(--pine);
  align-items: flex-start;
}

.formula-note .mono {
  font-size: 9.5px;
  letter-spacing: 0.14em;
  color: var(--pine);
  padding-top: 3px;
  flex-shrink: 0;
}

.formula-note p {
  font-size: 11.5px;
  line-height: 1.75;
  color: var(--ink-2);
}

.save-state {
  font-size: 12px;
  color: var(--pine);
  text-align: center;
}

/* 输出区 */
.outputs {
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-width: 0;
}

.result-hero {
  padding: 26px 28px;
  background: var(--pine);
  color: var(--paper);
  position: relative;
  overflow: hidden;
}

.result-hero::after {
  content: '';
  position: absolute;
  right: -40px;
  top: -40px;
  width: 160px;
  height: 160px;
  border: 1px solid rgba(244, 242, 236, 0.12);
  border-radius: 50%;
}

.rh-label {
  font-size: 11px;
  letter-spacing: 0.14em;
  color: rgba(244, 242, 236, 0.6);
  font-family: var(--mono);
}

.rh-value {
  margin-top: 12px;
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}

.rh-value .mono {
  font-size: clamp(34px, 4.4vw, 52px);
  line-height: 1;
  color: var(--white);
  letter-spacing: -0.03em;
}

.rh-unit {
  font-size: 13px;
  color: rgba(244, 242, 236, 0.65);
}

.rh-sub {
  margin-top: 14px;
  font-size: 12.5px;
  color: rgba(244, 242, 236, 0.75);
}

.rh-sub b {
  color: var(--white);
  font-weight: 500;
}

.metric-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border-top: 1px solid var(--line-strong);
  border-left: 1px solid var(--line);
}

.metric-row.four {
  grid-template-columns: repeat(4, 1fr);
}

.metric {
  padding: 16px 18px;
  border-right: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--white);
}

.m-label {
  font-size: 11px;
  color: var(--ink-3);
}

.m-val {
  font-size: 21px;
  color: var(--pine);
  line-height: 1.2;
}

.m-hint {
  font-size: 10px;
  color: var(--ink-4);
  line-height: 1.5;
}

/* 对照表 */
.cohort {
  border-top: 1px solid var(--line-strong);
  padding-top: 18px;
}

.cohort-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 12px;
}

.cohort-head h3 {
  font-size: 16px;
}

.cohort-head .mono {
  font-size: 10px;
  color: var(--ink-4);
}

.cohort tr.hl td {
  background: var(--pine-soft);
  color: var(--pine);
  font-weight: 500;
}

/* 饼图 */
.split-view {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 24px;
  align-items: center;
  border: 1px solid var(--line);
  background: var(--white);
  padding: 18px;
}

.sv-legend {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.lg-item {
  display: grid;
  grid-template-columns: 8px 1fr auto 48px;
  gap: 10px;
  align-items: center;
  padding: 9px 0;
  border-bottom: 1px solid var(--line);
  font-size: 13px;
}

.lg-item:last-child {
  border-bottom: 0;
}

.lg-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.lg-name {
  color: var(--ink-2);
}

.lg-val {
  color: var(--ink);
  font-size: 13px;
}

.lg-pct {
  color: var(--ink-4);
  font-size: 11px;
  text-align: right;
}

/* 公式框 */
.formula-box {
  border: 1px solid var(--line);
  background: var(--white);
  padding: 18px 20px;
}

.fb-title {
  font-size: 10.5px;
  letter-spacing: 0.14em;
  color: var(--ink-4);
  margin-bottom: 12px;
}

.fb-line {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  padding: 9px 0;
  border-bottom: 1px solid var(--line);
  font-size: 12.5px;
  color: var(--ink-2);
  flex-wrap: wrap;
}

.fb-line:last-child {
  border-bottom: 0;
}

.fb-line b {
  color: var(--pine);
  font-weight: 600;
}

/* 洞察 */
.insight {
  border: 1px solid var(--line-strong);
  background: var(--white);
  padding: 20px 22px;
}

.ins-head {
  display: flex;
  gap: 12px;
  align-items: baseline;
  font-size: 10.5px;
  letter-spacing: 0.14em;
  color: var(--ink-4);
  font-family: var(--mono);
  padding-bottom: 12px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 14px;
}

.ins-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}

.ins-grid p {
  font-size: 12.5px;
  line-height: 1.8;
  color: var(--ink-2);
  margin-top: 5px;
}

.ins-n {
  font-size: 10.5px;
  color: var(--cinnabar);
  letter-spacing: 0.08em;
}

.ins-text {
  font-size: 13.5px;
  line-height: 1.9;
  color: var(--ink-2);
}

/* 缺口 */
.gap-hero {
  padding: 28px;
  background: var(--pine);
  color: var(--paper);
}

.gap-hero.danger {
  background: var(--cinnabar);
}

.gh-label {
  font-size: 11px;
  letter-spacing: 0.14em;
  color: rgba(253, 252, 249, 0.7);
  font-family: var(--mono);
}

.gh-value {
  margin-top: 10px;
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.gh-value .mono {
  font-size: clamp(38px, 5vw, 58px);
  line-height: 1;
  color: var(--white);
  letter-spacing: -0.035em;
}

.gh-unit {
  font-size: 14px;
  color: rgba(253, 252, 249, 0.7);
}

.gh-sub {
  margin-top: 12px;
  font-size: 12.5px;
  color: rgba(253, 252, 249, 0.8);
}

.gh-sub b {
  color: var(--white);
}

.gh-cta {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid rgba(253, 252, 249, 0.2);
  font-size: 13px;
  color: rgba(253, 252, 249, 0.92);
  line-height: 1.7;
}

.gh-cta b {
  color: var(--white);
  font-size: 15px;
}

.chart-card {
  border: 1px solid var(--line);
  background: var(--white);
  padding: 18px 20px 12px;
}

.cc-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 14px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 6px;
}

.cc-head h3 {
  font-size: 15.5px;
}

.cc-head .mono {
  font-size: 10px;
  color: var(--ink-4);
}

.cc-note {
  font-size: 11.5px;
  line-height: 1.75;
  color: var(--ink-3);
  padding: 8px 0 6px;
  border-top: 1px solid var(--line);
  margin-top: 6px;
}

/* 税优 */
.tier-table {
  border-top: 1px solid var(--line);
  padding-top: 14px;
}

.tt-title {
  font-size: 11px;
  color: var(--ink-3);
  margin-bottom: 8px;
}

.tax-split {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border-top: 1px solid var(--line-strong);
  border-left: 1px solid var(--line);
}

.ts-item {
  padding: 16px 18px;
  border-right: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--white);
}

.ts-label {
  font-size: 11px;
  color: var(--ink-3);
}

.ts-val {
  font-size: 22px;
  line-height: 1.2;
}

.positive {
  color: var(--pine);
}

.negative {
  color: var(--cinnabar);
}

.ts-note {
  font-size: 10px;
  color: var(--ink-4);
  font-family: var(--mono);
}

.verdict {
  display: flex;
  gap: 16px;
  padding: 20px 22px;
  border: 1px solid var(--line-strong);
  background: var(--white);
  align-items: flex-start;
}

.verdict.good {
  border-left: 3px solid var(--pine);
}

.verdict.neutral {
  border-left: 3px solid var(--gold);
  background: var(--gold-soft);
}

.v-mark {
  font-size: 18px;
  color: var(--pine);
  line-height: 1.2;
}

.verdict.neutral .v-mark {
  color: var(--gold);
}

.v-title {
  font-family: var(--serif);
  font-size: 16px;
  color: var(--ink);
  margin-bottom: 7px;
}

.verdict p {
  font-size: 13px;
  line-height: 1.85;
  color: var(--ink-2);
}

/* 提示 */
.caveat {
  display: flex;
  gap: 14px;
  padding: 16px 18px;
  background: var(--paper-2);
  border-left: 2px solid var(--gold);
  align-items: flex-start;
}

.caveat .mono {
  font-size: 13px;
  color: var(--gold);
  line-height: 1.4;
  flex-shrink: 0;
}

.caveat p {
  font-size: 12px;
  line-height: 1.8;
  color: var(--ink-3);
}

@media (max-width: 1080px) {
  .panel-grid,
  .gap-layout {
    grid-template-columns: 1fr;
    gap: 26px;
  }
  .inputs {
    position: static;
  }
  .gap-inputs {
    max-height: none;
  }
  .metric-row,
  .metric-row.four {
    grid-template-columns: 1fr 1fr;
  }
  .ins-grid {
    grid-template-columns: 1fr;
    gap: 14px;
  }
  .split-view {
    grid-template-columns: 1fr;
  }
  .tax-split {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 620px) {
  .tab {
    padding: 11px 13px;
    font-size: 13px;
  }
  .metric-row,
  .metric-row.four {
    grid-template-columns: 1fr;
  }
  .rh-value .mono {
    font-size: 36px;
  }
  .fb-line {
    flex-direction: column;
    gap: 4px;
  }
}
</style>
