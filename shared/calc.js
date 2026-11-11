// 共享计算引擎：服务端与前端共用同一套规则，避免口径不一致。
// 所有函数均为纯函数，输入输出为普通对象。

/* ---------------- 退休年龄 ---------------- */

const CATEGORY = {
  male: { originalAge: 60, startYear: 1965, step: 4, cap: 36, label: '男职工（原60周岁）' },
  female55: { originalAge: 55, startYear: 1970, step: 4, cap: 36, label: '女职工（原55周岁）' },
  female50: { originalAge: 50, startYear: 1975, step: 2, cap: 60, label: '女职工（原50周岁）' },
}

export const CATEGORY_OPTIONS = Object.entries(CATEGORY).map(([value, v]) => ({
  value,
  label: v.label,
}))

function ymIndex(year, month) {
  return year * 12 + (month - 1)
}

function fromIndex(idx) {
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 }
}

export function formatYm(o) {
  return `${o.year}年${String(o.month).padStart(2, '0')}月`
}

/** 依据出生年月与人员类别，计算渐进式延迟后的法定退休时点 */
export function retirementAge(birthYear, birthMonth, category = 'male') {
  const cfg = CATEGORY[category] || CATEGORY.male
  const bIdx = ymIndex(birthYear, birthMonth)
  const startIdx = ymIndex(cfg.startYear, 1)
  let delay = 0
  if (bIdx >= startIdx) {
    delay = Math.min(cfg.cap, Math.floor((bIdx - startIdx) / cfg.step) + 1)
  }
  const legalIdx = bIdx + cfg.originalAge * 12 + delay
  const legal = fromIndex(legalIdx)
  const legalAgeYears = cfg.originalAge + delay / 12
  const earliestIdx = Math.max(legalIdx - 36, bIdx + cfg.originalAge * 12)
  const latestIdx = legalIdx + 36

  const minYears = minimumContributionYears(legal.year)
  return {
    category,
    categoryLabel: cfg.label,
    originalAge: cfg.originalAge,
    delayMonths: delay,
    legalAgeYears: Math.round(legalAgeYears * 100) / 100,
    legalDate: legal,
    legalText: `${legal.year}年${String(legal.month).padStart(2, '0')}月`,
    earliest: fromIndex(earliestIdx),
    earliestText: formatYm(fromIndex(earliestIdx)),
    latest: fromIndex(latestIdx),
    latestText: formatYm(fromIndex(latestIdx)),
    minContributionYears: minYears,
    minContributionText:
      minYears % 1 === 0 ? `${minYears}年` : `${Math.floor(minYears)}年${(minYears % 1) * 12}个月`,
  }
}

/** 最低缴费年限：2029年前15年，2030年起每年提高6个月，2039年起20年 */
export function minimumContributionYears(retireYear) {
  if (retireYear <= 2029) return 15
  return Math.min(20, 15 + (retireYear - 2029) * 0.5)
}

/* ---------------- 计发月数 ---------------- */

const MONTH_ANCHORS = [
  [40, 233],
  [45, 216],
  [50, 195],
  [55, 170],
  [60, 139],
  [63, 117],
  [65, 101],
  [70, 56],
]

/** 按退休年龄（可为小数）线性插值取个人账户计发月数 */
export function payoutMonths(age) {
  if (age <= MONTH_ANCHORS[0][0]) return MONTH_ANCHORS[0][1]
  const last = MONTH_ANCHORS[MONTH_ANCHORS.length - 1]
  if (age >= last[0]) return last[1]
  for (let i = 0; i < MONTH_ANCHORS.length - 1; i++) {
    const [a1, v1] = MONTH_ANCHORS[i]
    const [a2, v2] = MONTH_ANCHORS[i + 1]
    if (age >= a1 && age <= a2) {
      const t = (age - a1) / (a2 - a1)
      return Math.round(v1 + (v2 - v1) * t)
    }
  }
  return 139
}

/* ---------------- 第一支柱待遇估算 ---------------- */

/**
 * 估算退休时点的月基本养老金（名义值）
 * avgWage: 退休时上年度全省全口径月平均工资
 * years: 累计缴费年限
 * index: 本人平均缴费工资指数（0.6-3）
 * accountBalance: 退休时个人账户储存额
 * age: 退休年龄（可为小数，如 60.25）
 */
export function estimateBasicPension({
  avgWage = 8000,
  years = 30,
  index = 0.8,
  accountBalance = 120000,
  age = 60,
  transitionYears = 0,
  transitionFactor = 1.3,
}) {
  const indexedWage = avgWage * index
  const base = ((avgWage + indexedWage) / 2) * years * 0.01
  const months = payoutMonths(age)
  const personal = accountBalance / months
  const transition = avgWage * index * transitionYears * (transitionFactor / 100)
  const total = base + personal + transition
  const replacement = indexedWage > 0 ? total / indexedWage : 0
  return {
    avgWage,
    indexedWage: Math.round(indexedWage),
    base: Math.round(base),
    personal: Math.round(personal),
    transition: Math.round(transition),
    total: Math.round(total),
    payoutMonths: months,
    replacementRate: Math.round(replacement * 1000) / 10,
    parts: [
      { key: 'base', label: '基础养老金', value: Math.round(base) },
      { key: 'personal', label: '个人账户养老金', value: Math.round(personal) },
      { key: 'transition', label: '过渡性养老金', value: Math.round(transition) },
    ],
  }
}

/* ---------------- 养老缺口测算 ---------------- */

/**
 * 输入全部为"今天"口径（现值），内部统一折算为退休时名义值。
 * currentAge / retireAge / lifeExpectancy 单位为年
 * currentMonthlyExpense: 当前家庭月支出（现值）
 * expenseRatio: 退休后支出占当前支出的比例
 * pensionMonthly: 预计退休时首月养老金（现值口径，假设随通胀调整）
 */
export function calcGap({
  currentAge = 40,
  retireAge = 60,
  lifeExpectancy = 85,
  currentMonthlyExpense = 12000,
  expenseRatio = 0.75,
  inflation = 0.025,
  pensionMonthly = 4000,
  currentSavings = 300000,
  monthlySaving = 2000,
  returnRate = 0.035,
  extraCareReserve = 300000,
}) {
  const yearsToRetire = Math.max(0, retireAge - currentAge)
  const retirementYears = Math.max(1, lifeExpectancy - retireAge)
  const inflFactor = Math.pow(1 + inflation, yearsToRetire)

  const expenseAtRetire = currentMonthlyExpense * expenseRatio * inflFactor
  const pensionAtRetire = pensionMonthly * inflFactor
  const monthlyGapAtRetire = Math.max(0, expenseAtRetire - pensionAtRetire)

  // 实际收益率（剔除通胀）
  const realReturn = (1 + returnRate) / (1 + inflation) - 1

  // 退休时所需本金：覆盖 retirementYears 年的月度缺口（期初年金，实际收益率贴现）
  const n = retirementYears * 12
  const r = Math.pow(1 + realReturn, 1 / 12) - 1
  let requiredCapital
  if (Math.abs(r) < 1e-9) {
    requiredCapital = monthlyGapAtRetire * n
  } else {
    requiredCapital = monthlyGapAtRetire * ((1 - Math.pow(1 + r, -n)) / r) * (1 + r)
  }
  const careReserveAtRetire = extraCareReserve * inflFactor
  const totalNeeded = requiredCapital + careReserveAtRetire

  // 现有资产与持续储蓄的未来值（按名义收益率）
  const monthlyReturn = Math.pow(1 + returnRate, 1 / 12) - 1
  const monthsToRetire = yearsToRetire * 12
  const savingsFV =
    Math.abs(monthlyReturn) < 1e-9
      ? currentSavings + monthlySaving * monthsToRetire
      : currentSavings * Math.pow(1 + monthlyReturn, monthsToRetire) +
        monthlySaving * ((Math.pow(1 + monthlyReturn, monthsToRetire) - 1) / monthlyReturn)

  const gap = totalNeeded - savingsFV
  const coverage = totalNeeded > 0 ? Math.min(1.5, savingsFV / totalNeeded) : 1

  // 所需月储蓄额（反解）
  let requiredMonthlySaving = 0
  if (gap > 0) {
    if (Math.abs(monthlyReturn) < 1e-9) {
      requiredMonthlySaving = Math.max(0, (totalNeeded - currentSavings) / Math.max(1, monthsToRetire))
    } else {
      const fvCurrent = currentSavings * Math.pow(1 + monthlyReturn, monthsToRetire)
      const annuity = (Math.pow(1 + monthlyReturn, monthsToRetire) - 1) / monthlyReturn
      requiredMonthlySaving = Math.max(0, (totalNeeded - fvCurrent) / annuity)
    }
  }

  return {
    yearsToRetire: Math.round(yearsToRetire * 10) / 10,
    retirementYears,
    inflFactor: Math.round(inflFactor * 1000) / 1000,
    expenseAtRetire: Math.round(expenseAtRetire),
    pensionAtRetire: Math.round(pensionAtRetire),
    monthlyGapAtRetire: Math.round(monthlyGapAtRetire),
    requiredCapital: Math.round(requiredCapital),
    careReserveAtRetire: Math.round(careReserveAtRetire),
    totalNeeded: Math.round(totalNeeded),
    savingsFutureValue: Math.round(savingsFV),
    gap: Math.round(gap),
    coverage: Math.round(coverage * 1000) / 10,
    requiredMonthlySaving: Math.round(requiredMonthlySaving),
    realReturn: Math.round(realReturn * 10000) / 100,
    // 敏感性：不同回报率下的缺口
    sensitivity: [0.02, 0.03, 0.04, 0.05, 0.06].map((rr) => {
      const mr = Math.pow(1 + rr, 1 / 12) - 1
      const fv =
        Math.abs(mr) < 1e-9
          ? currentSavings + monthlySaving * monthsToRetire
          : currentSavings * Math.pow(1 + mr, monthsToRetire) +
            monthlySaving * ((Math.pow(1 + mr, monthsToRetire) - 1) / mr)
      return { rate: rr * 100, gap: Math.round(totalNeeded - fv) }
    }),
    // 逐年余额曲线（名义值）
    timeline: buildTimeline({
      currentAge,
      retireAge,
      lifeExpectancy,
      currentSavings,
      monthlySaving,
      returnRate,
      inflation,
      expenseAtRetire,
      pensionAtRetire,
      totalNeeded,
    }),
  }
}

function buildTimeline({
  currentAge,
  retireAge,
  lifeExpectancy,
  currentSavings,
  monthlySaving,
  returnRate,
  inflation,
  expenseAtRetire,
  pensionAtRetire,
}) {
  const out = []
  let balance = currentSavings
  const endAge = Math.min(100, Math.ceil(lifeExpectancy) + 5)
  for (let age = Math.ceil(currentAge); age <= endAge; age++) {
    const yearsFromNow = age - currentAge
    if (age < retireAge) {
      balance = balance * (1 + returnRate) + monthlySaving * 12
      out.push({ age, phase: 'accumulate', balance: Math.round(balance), net: Math.round(monthlySaving * 12) })
    } else {
      const f = Math.pow(1 + inflation, yearsFromNow)
      const draw = Math.max(0, (expenseAtRetire - pensionAtRetire) * f) * 12
      balance = (balance - draw) * (1 + returnRate)
      out.push({
        age,
        phase: 'decumulate',
        balance: Math.round(Math.max(balance, 0)),
        net: -Math.round(draw),
      })
      if (balance < 0) {
        out.push({ age: age + 0.5, phase: 'depleted', balance: 0, net: 0 })
        break
      }
    }
  }
  return out
}

/* ---------------- 税优 ---------------- */

export const TAX_BRACKETS = [3, 10, 20, 25, 30, 35, 45]

/** 个人养老金年度节税测算 */
export function calcTaxSaving(annualContribution, marginalRate) {
  const cap = 12000
  const amount = Math.min(annualContribution, cap)
  const savingAtContribution = (amount * marginalRate) / 100
  const taxAtWithdrawal = (amount * 3) / 100
  return {
    amount,
    cap,
    marginalRate,
    savingAtContribution: Math.round(savingAtContribution),
    taxAtWithdrawal: Math.round(taxAtWithdrawal),
    netSaving: Math.round(savingAtContribution - taxAtWithdrawal),
    effectiveGain: Math.round((((savingAtContribution - taxAtWithdrawal) / amount) * 10000)) / 100,
  }
}

/* ---------------- 复利 / 定投 ---------------- */

export function futureValue({ principal = 0, monthly = 0, years = 20, rate = 0.04 }) {
  const n = years * 12
  const r = Math.pow(1 + rate, 1 / 12) - 1
  const fvPrincipal = principal * Math.pow(1 + r, n)
  const fvMonthly = Math.abs(r) < 1e-9 ? monthly * n : monthly * ((Math.pow(1 + r, n) - 1) / r)
  return {
    total: Math.round(fvPrincipal + fvMonthly),
    fromPrincipal: Math.round(fvPrincipal),
    fromMonthly: Math.round(fvMonthly),
    contributed: Math.round(principal + monthly * n),
    growth: Math.round(fvPrincipal + fvMonthly - principal - monthly * n),
  }
}
