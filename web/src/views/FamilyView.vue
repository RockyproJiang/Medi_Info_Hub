<script setup>
import { ref, computed, onMounted } from 'vue'
import { api, money, wan, isLoggedIn } from '../lib/api.js'
import { calcGap } from '../../../shared/calc.js'
import PageHeader from '../components/PageHeader.vue'
import Chart from '../components/Chart.vue'

const inflation = ref(2.5)
const returnRate = ref(3.5)
const members = ref([defaultMember('成员一'), defaultMember('成员二')])
const saving = ref('')
const busy = ref(false)

function defaultMember(name) {
  return {
    name,
    currentAge: 58,
    retireAge: 60,
    lifeExpectancy: 85,
    currentMonthlyExpense: 6000,
    pensionMonthly: 3500,
    currentSavings: 200000,
    monthlySaving: 1000,
    extraCareReserve: 200000,
  }
}

function addMember() {
  if (members.value.length >= 4) return
  members.value.push(defaultMember(`成员${members.value.length + 1}`))
}

function removeMember(i) {
  if (members.value.length <= 1) return
  members.value.splice(i, 1)
}

const memberResults = computed(() =>
  members.value.map((m) =>
    calcGap({
      currentAge: Number(m.currentAge),
      retireAge: Number(m.retireAge),
      lifeExpectancy: Number(m.lifeExpectancy),
      currentMonthlyExpense: Number(m.currentMonthlyExpense),
      expenseRatio: 0.75,
      inflation: Number(inflation.value) / 100,
      pensionMonthly: Number(m.pensionMonthly),
      currentSavings: Number(m.currentSavings),
      monthlySaving: Number(m.monthlySaving),
      returnRate: Number(returnRate.value) / 100,
      extraCareReserve: Number(m.extraCareReserve),
    }),
  ),
)

// 家庭合并口径：共享通胀与回报假设，支出按 85% 折算（共同居住节约）
const household = computed(() => {
  const ms = members.value.map((m, i) => ({ ...m, ...memberResults.value[i] }))
  const totalSavings = ms.reduce((s, m) => s + (Number(m.currentSavings) || 0), 0)
  const totalMonthlySaving = ms.reduce((s, m) => s + (Number(m.monthlySaving) || 0), 0)
  return calcGap({
    currentAge: Math.min(...ms.map((m) => Number(m.currentAge))),
    retireAge: Math.max(...ms.map((m) => Number(m.retireAge))),
    lifeExpectancy: Math.max(...ms.map((m) => Number(m.lifeExpectancy))),
    currentMonthlyExpense: ms.reduce((s, m) => s + Number(m.currentMonthlyExpense || 0), 0) * 0.85,
    expenseRatio: 0.75,
    inflation: Number(inflation.value) / 100,
    pensionMonthly: ms.reduce((s, m) => s + Number(m.pensionMonthly || 0), 0) * 0.85,
    currentSavings: totalSavings,
    monthlySaving: totalMonthlySaving,
    returnRate: Number(returnRate.value) / 100,
    extraCareReserve: ms.reduce((s, m) => s + Number(m.extraCareReserve || 0), 0) * 0.7,
  })
})

const householdChart = computed(() => {
  const d = household.value.timeline
  return {
    grid: { left: 56, right: 20, top: 24, bottom: 32 },
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
        formatter: (v) => (Math.abs(v) >= 10000 ? (v / 10000).toFixed(0) + '万' : v),
      },
      splitLine: { lineStyle: { color: '#e2dfd6' } },
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#fdfcf9',
      borderColor: '#d3d0c6',
      textStyle: { color: '#1c2622', fontSize: 12 },
      formatter: (p) => {
        const x = d[p[0].dataIndex]
        return `${x.age}岁 · ${x.phase === 'accumulate' ? '积累期' : x.phase === 'depleted' ? '耗尽' : '提取期'}<br/>家庭资产：${money(x.balance)} 元`
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
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(20,69,58,0.2)' },
              { offset: 1, color: 'rgba(20,69,58,0.01)' },
            ],
          },
        },
      },
    ],
  }
})

async function savePlan() {
  if (!isLoggedIn()) {
    saving.value = '请先登录后再保存'
    return
  }
  busy.value = true
  saving.value = '保存中…'
  try {
    await api.post('/calc/household', {
      inflation: Number(inflation.value) / 100,
      returnRate: Number(returnRate.value) / 100,
      members: members.value,
    })
    saving.value = '已保存到账户'
    setTimeout(() => (saving.value = ''), 2600)
  } catch (e) {
    saving.value = e.message
  } finally {
    busy.value = false
  }
}

onMounted(() => {
  if (!isLoggedIn()) saving.value = ''
})
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Household Planning"
      title="家庭养老规划"
      desc="把夫妻或两代人的养老安排放进同一张表：共享通胀与回报假设，考虑共同居住的支出节约与照护接力，输出家庭合并口径的缺口与轨迹。"
    />

    <div class="wrap">
      <div class="fam-layout">
        <!-- 成员输入 -->
        <section class="fam-inputs">
          <div class="shared-row">
            <div class="field">
              <label>年通胀率 <b class="mono">{{ inflation }}%</b></label>
              <input v-model.number="inflation" type="range" min="0" max="6" step="0.1" />
            </div>
            <div class="field">
              <label>长期年化回报 <b class="mono">{{ returnRate }}%</b></label>
              <input v-model.number="returnRate" type="range" min="1" max="8" step="0.5" />
            </div>
          </div>

          <div v-for="(m, i) in members" :key="i" class="member-card">
            <div class="mc-head">
              <input v-model="m.name" class="mc-name input" placeholder="称谓，如：父亲" />
              <button v-if="members.length > 1" class="mc-remove" @click="removeMember(i)">移除</button>
            </div>
            <div class="mc-grid">
              <div class="field">
                <label>当前年龄</label>
                <input v-model.number="m.currentAge" type="number" class="input" min="25" max="90" />
              </div>
              <div class="field">
                <label>退休年龄</label>
                <input v-model.number="m.retireAge" type="number" class="input" min="50" max="70" />
              </div>
              <div class="field">
                <label>预期寿命</label>
                <input v-model.number="m.lifeExpectancy" type="number" class="input" min="75" max="100" />
              </div>
              <div class="field">
                <label>月支出（元）</label>
                <input v-model.number="m.currentMonthlyExpense" type="number" class="input" step="500" />
              </div>
              <div class="field">
                <label>预计月养老金</label>
                <input v-model.number="m.pensionMonthly" type="number" class="input" step="100" />
              </div>
              <div class="field">
                <label>现有养老资产</label>
                <input v-model.number="m.currentSavings" type="number" class="input" step="10000" />
              </div>
              <div class="field">
                <label>月储蓄</label>
                <input v-model.number="m.monthlySaving" type="number" class="input" step="100" />
              </div>
              <div class="field">
                <label>护理储备（现值）</label>
                <input v-model.number="m.extraCareReserve" type="number" class="input" step="50000" />
              </div>
            </div>

            <div class="mc-result">
              <span class="mr-label">个人缺口</span>
              <span class="mr-val mono" :class="memberResults[i].gap > 0 ? 'neg' : 'pos'">
                {{ wan(Math.abs(memberResults[i].gap)) }}
              </span>
              <span class="mr-unit">元</span>
            </div>
          </div>

          <button class="btn ghost" :disabled="members.length >= 4" @click="addMember">
            + 添加家庭成员（最多 4 人）
          </button>

          <button class="btn" :disabled="busy" @click="savePlan">保存家庭规划</button>
          <p v-if="saving" class="save-state">{{ saving }}</p>
        </section>

        <!-- 家庭汇总 -->
        <section class="fam-output">
          <div class="fam-hero" :class="{ danger: household.gap > 0, ok: household.gap <= 0 }">
            <div class="fh-label">{{ household.gap > 0 ? '家庭合并缺口' : '家庭合并盈余' }}</div>
            <div class="fh-value">
              <span class="mono">{{ wan(Math.abs(household.gap)) }}</span>
              <span class="fh-unit">元</span>
            </div>
            <div class="fh-sub">
              覆盖率 <b class="mono">{{ household.coverage }}%</b> ·
              家庭共同居住按支出 85% 折算 · 护理储备按 70% 共享
            </div>
            <div v-if="household.gap > 0" class="fh-cta">
              建议家庭月储蓄提高到 <b class="mono">{{ money(household.requiredMonthlySaving) }}</b> 元
            </div>
            <div v-else class="fh-cta">按当前假设，家庭储备可覆盖全部成员的退休支出</div>
          </div>

          <div class="metric-row">
            <div class="metric">
              <span class="m-label">合并所需总储备</span>
              <span class="m-val mono">{{ wan(household.totalNeeded) }}</span>
            </div>
            <div class="metric">
              <span class="m-label">家庭资产终值</span>
              <span class="m-val mono">{{ wan(household.savingsFutureValue) }}</span>
            </div>
            <div class="metric">
              <span class="m-label">退休时月缺口</span>
              <span class="m-val mono">{{ money(household.monthlyGapAtRetire) }}</span>
            </div>
          </div>

          <div class="chart-card">
            <div class="cc-head">
              <h3>家庭资产合并轨迹</h3>
              <span class="mono">名义值 · 从最年轻成员视角</span>
            </div>
            <Chart :option="householdChart" height="280px" />
          </div>

          <div class="members-table">
            <div class="mt-title">成员对照</div>
            <table class="table">
              <thead>
                <tr>
                  <th>成员</th>
                  <th>退休时点距今年数</th>
                  <th>月缺口（退休时）</th>
                  <th>个人缺口</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(r, i) in memberResults" :key="i">
                  <td>{{ members[i].name }}</td>
                  <td class="mono">{{ r.yearsToRetire }} 年</td>
                  <td class="mono">{{ money(r.monthlyGapAtRetire) }}</td>
                  <td class="mono" :class="r.gap > 0 ? 'neg-text' : 'pos-text'">{{ wan(Math.abs(r.gap)) }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="caveat">
            <span class="mono">!</span>
            <p>
              家庭合并测算采用简化假设：共同居住的支出节约按 85% 折算、护理储备按 70% 共享（两位老人先后进入照护阶段的现实约束）。
              实际规划请结合家庭具体情形，必要时做保守情景（100% 支出、独立储备）复核。
            </p>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fam-layout {
  display: grid;
  grid-template-columns: 380px minmax(0, 1fr);
  gap: 44px;
  align-items: start;
}

.fam-inputs {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.shared-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  padding: 16px;
  background: var(--white);
  border: 1px solid var(--line);
}

.member-card {
  background: var(--white);
  border: 1px solid var(--line);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.mc-head {
  display: flex;
  gap: 10px;
  align-items: center;
}

.mc-name {
  font-weight: 500;
}

.mc-remove {
  background: none;
  border: 0;
  font-size: 11.5px;
  color: var(--cinnabar);
  border-bottom: 1px solid var(--cinnabar);
  padding: 0;
  font-family: inherit;
  white-space: nowrap;
}

.mc-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.mc-result {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}

.mr-label {
  font-size: 11px;
  color: var(--ink-3);
}

.mr-val {
  font-size: 20px;
}

.mr-val.neg {
  color: var(--cinnabar);
}

.mr-val.pos {
  color: var(--pine);
}

.mr-unit {
  font-size: 11px;
  color: var(--ink-3);
}

.save-state {
  font-size: 12px;
  color: var(--pine);
  text-align: center;
}

.fam-output {
  display: flex;
  flex-direction: column;
  gap: 22px;
  min-width: 0;
}

.fam-hero {
  padding: 26px 28px;
  background: var(--pine);
  color: var(--paper);
}

.fam-hero.danger {
  background: var(--cinnabar);
}

.fh-label {
  font-size: 11px;
  letter-spacing: 0.14em;
  color: rgba(253, 252, 249, 0.7);
  font-family: var(--mono);
}

.fh-value {
  margin-top: 10px;
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.fh-value .mono {
  font-size: clamp(36px, 4.6vw, 54px);
  line-height: 1;
  color: var(--white);
  letter-spacing: -0.035em;
}

.fh-unit {
  font-size: 14px;
  color: rgba(253, 252, 249, 0.7);
}

.fh-sub {
  margin-top: 12px;
  font-size: 12px;
  color: rgba(253, 252, 249, 0.8);
}

.fh-sub b {
  color: var(--white);
}

.fh-cta {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid rgba(253, 252, 249, 0.2);
  font-size: 13px;
  color: rgba(253, 252, 249, 0.92);
}

.fh-cta b {
  color: var(--white);
  font-size: 15px;
}

.metric-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border-top: 1px solid var(--line-strong);
  border-left: 1px solid var(--line);
}

.metric {
  padding: 14px 16px;
  border-right: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  background: var(--white);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.m-label {
  font-size: 11px;
  color: var(--ink-3);
}

.m-val {
  font-size: 19px;
  color: var(--pine);
}

.chart-card {
  border: 1px solid var(--line);
  background: var(--white);
  padding: 18px 20px 10px;
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

.members-table {
  background: var(--white);
  border: 1px solid var(--line);
  padding: 18px 20px;
}

.mt-title {
  font-size: 15.5px;
  font-family: var(--serif);
  padding-bottom: 10px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 4px;
}

.neg-text {
  color: var(--cinnabar);
}

.pos-text {
  color: var(--pine);
}

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
  flex-shrink: 0;
}

.caveat p {
  font-size: 12px;
  line-height: 1.8;
  color: var(--ink-3);
}

@media (max-width: 1080px) {
  .fam-layout {
    grid-template-columns: 1fr;
  }
  .metric-row {
    grid-template-columns: 1fr;
  }
}
</style>
