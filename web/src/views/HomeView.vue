<script setup>
import { ref, onMounted, computed } from 'vue'
import { api, money, dateText } from '../lib/api.js'
import Chart from '../components/Chart.vue'

const meta = ref(null)
const policies = ref([])
const articles = ref([])
const products = ref([])
const stats = ref([])
const loading = ref(true)

onMounted(async () => {
  try {
    const [m, p, a, pr, s] = await Promise.all([
      api.get('/meta'),
      api.get('/policies?featured=1&limit=4'),
      api.get('/articles?featured=1&limit=3'),
      api.get('/products'),
      api.get('/stats'),
    ])
    meta.value = m
    policies.value = p.items
    articles.value = a.items
    products.value = pr.items
    stats.value = s
  } finally {
    loading.value = false
  }
})

const popStat = computed(() => stats.value.find((x) => x.key === 'population-65'))
const lifeStat = computed(() => stats.value.find((x) => x.key === 'life-expectancy'))
const replStat = computed(() => stats.value.find((x) => x.key === 'replacement-rate'))
const acctStat = computed(() => stats.value.find((x) => x.key === 'personal-pension-accounts'))

const last = (s) => (s?.payload?.length ? s.payload[s.payload.length - 1] : null)

const heroChart = computed(() => {
  if (!popStat.value) return null
  const d = popStat.value.payload
  return {
    grid: { left: 34, right: 12, top: 16, bottom: 22 },
    xAxis: {
      type: 'category',
      data: d.map((x) => x.year),
      axisLine: { lineStyle: { color: '#b8b4a8' } },
      axisTick: { show: false },
      axisLabel: { color: '#6b7772', fontSize: 10, fontFamily: 'monospace' },
    },
    yAxis: {
      type: 'value',
      min: 6,
      max: 18,
      splitLine: { lineStyle: { color: '#e2dfd6' } },
      axisLabel: { color: '#96a09b', fontSize: 10, fontFamily: 'monospace', formatter: '{value}%' },
    },
    series: [
      {
        type: 'line',
        data: d.map((x) => x.value),
        smooth: false,
        symbol: 'circle',
        symbolSize: 4,
        lineStyle: { color: '#14453a', width: 1.6 },
        itemStyle: { color: '#14453a' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(20,69,58,0.16)' },
              { offset: 1, color: 'rgba(20,69,58,0.01)' },
            ],
          },
        },
        markPoint: {
          symbol: 'circle',
          symbolSize: 7,
          data: [{ coord: [String(d[d.length - 1].year), d[d.length - 1].value] }],
          itemStyle: { color: '#b23a2b' },
          label: { show: false },
        },
      },
    ],
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#fdfcf9',
      borderColor: '#d3d0c6',
      textStyle: { color: '#1c2622', fontSize: 12 },
      formatter: (p) => `${p[0].axisValue}年　${p[0].value}%`,
    },
  }
})

const toolCards = [
  {
    to: '/tools#retirement',
    no: '01',
    name: '退休年龄测算',
    desc: '输入出生年月与人员类别，得出渐进式延迟后的法定退休时点、弹性区间与最低缴费年限。',
    tag: '政策规则',
  },
  {
    to: '/tools#pension',
    no: '02',
    name: '基本养老金估算',
    desc: '按基础养老金、个人账户养老金、过渡性养老金三部分拆解，输出替代率与各部分占比。',
    tag: '第一支柱',
  },
  {
    to: '/tools#gap',
    no: '03',
    name: '养老缺口测算',
    desc: '把通胀、支出曲线、长寿风险分开处理，反解你每月需要为养老存下多少钱。',
    tag: '核心工具',
  },
  {
    to: '/tools#tax',
    no: '04',
    name: '个人养老金税优',
    desc: '按边际税率计算缴费环节节税、领取环节税负与净节税，判断参加是否划算。',
    tag: '第三支柱',
  },
]

const catCount = computed(() => {
  const m = {}
  products.value.forEach((p) => {
    m[p.category] = (m[p.category] || 0) + 1
  })
  return Object.entries(m)
})
</script>

<template>
  <div>
    <!-- ================= HERO ================= -->
    <section class="hero">
      <div class="wrap hero-grid">
        <div class="hero-copy">
          <div class="hero-eyebrow">
            <span class="dot"></span>
            <span>2025 · 中国养老金融观察</span>
          </div>
          <h1 class="hero-title">
            把养老这笔账<br />
            算<span class="accent">清楚</span>
          </h1>
          <p class="hero-sub">
            政策原文、待遇测算、产品特征与 AI 顾问，一处查齐。不卖产品，只给依据。
          </p>
          <div class="hero-cta">
            <RouterLink to="/tools" class="btn">开始测算</RouterLink>
            <RouterLink to="/policies" class="btn ghost">查阅政策</RouterLink>
          </div>
          <dl class="hero-facts">
            <div>
              <dt>政策文件</dt>
              <dd class="mono">{{ meta?.stats?.policies ?? '—' }}</dd>
            </div>
            <div>
              <dt>知识长文</dt>
              <dd class="mono">{{ meta?.stats?.articles ?? '—' }}</dd>
            </div>
            <div>
              <dt>术语条目</dt>
              <dd class="mono">{{ meta?.stats?.glossary ?? '—' }}</dd>
            </div>
            <div>
              <dt>产品类型</dt>
              <dd class="mono">{{ meta?.stats?.products ?? '—' }}</dd>
            </div>
          </dl>
        </div>

        <aside class="hero-plate">
          <div class="plate-head">
            <span class="plate-label mono">FIG. 01</span>
            <span class="plate-title">65岁及以上人口占比</span>
          </div>
          <div class="plate-value">
            <span class="num mono">{{ last(popStat)?.value ?? '—' }}</span>
            <span class="unit">%</span>
            <span class="trend mono">2010年 8.9% → {{ last(popStat)?.year }}年 {{ last(popStat)?.value }}%</span>
          </div>
          <Chart v-if="heroChart" :option="heroChart" height="168px" />
          <div class="plate-foot">
            <span>数据来源：国家统计局年度统计公报</span>
          </div>

          <div class="plate-strip">
            <div class="ps-item">
              <span class="ps-label">人均预期寿命</span>
              <span class="ps-num mono">{{ last(lifeStat)?.value ?? '—' }} <em>岁</em></span>
            </div>
            <div class="ps-item">
              <span class="ps-label">养老金替代率（估算）</span>
              <span class="ps-num mono">{{ last(replStat)?.value ?? '—' }} <em>%</em></span>
            </div>
          </div>
        </aside>
      </div>
    </section>

    <!-- ================= 政策速览 ================= -->
    <section class="band">
      <div class="wrap">
        <div class="band-head">
          <div>
            <div class="eyebrow">Policy Digest</div>
            <h2 class="section-title">正在生效的规则</h2>
          </div>
          <RouterLink to="/policies" class="link-arrow">全部政策 →</RouterLink>
        </div>

        <div class="policy-list">
          <RouterLink
            v-for="(p, i) in policies"
            :key="p.slug"
            :to="`/policies/${p.slug}`"
            class="policy-row"
          >
            <div class="pr-no mono">{{ String(i + 1).padStart(2, '0') }}</div>
            <div class="pr-main">
              <div class="pr-meta">
                <span class="tag pine">{{ p.category }}</span>
                <span class="mono pr-date">{{ p.publish_date }}</span>
                <span class="pr-issuer">{{ p.issuer }}</span>
              </div>
              <h3 class="pr-title">{{ p.title }}</h3>
              <p class="pr-summary">{{ p.summary }}</p>
            </div>
            <div class="pr-side">
              <span v-if="p.doc_no" class="mono pr-doc">{{ p.doc_no }}</span>
              <span class="pr-arrow">→</span>
            </div>
          </RouterLink>
        </div>
      </div>
    </section>

    <!-- ================= 测算工具 ================= -->
    <section class="band alt">
      <div class="wrap">
        <div class="band-head">
          <div>
            <div class="eyebrow">Calculators</div>
            <h2 class="section-title">四个工具，回答四个问题</h2>
          </div>
          <p class="band-note">全部计算在本地完成，参数可调，结果可保存至账户。</p>
        </div>

        <div class="tool-grid">
          <RouterLink v-for="t in toolCards" :key="t.no" :to="t.to" class="tool-card">
            <div class="tc-top">
              <span class="tc-no mono">{{ t.no }}</span>
              <span class="tag">{{ t.tag }}</span>
            </div>
            <h3 class="tc-name">{{ t.name }}</h3>
            <p class="tc-desc">{{ t.desc }}</p>
            <span class="tc-go">打开工具 →</span>
          </RouterLink>
        </div>
      </div>
    </section>

    <!-- ================= 数据 + 产品 双栏 ================= -->
    <section class="band">
      <div class="wrap dual">
        <div class="dual-main">
          <div class="band-head tight">
            <div>
              <div class="eyebrow">Data</div>
              <h2 class="section-title">结构性变化</h2>
            </div>
            <RouterLink to="/data" class="link-arrow">数据洞察 →</RouterLink>
          </div>

          <div class="stat-rows">
            <div v-for="s in stats.slice(0, 4)" :key="s.key" class="stat-row">
              <div class="sr-left">
                <span class="sr-label">{{ s.label }}</span>
                <span class="sr-source">{{ s.source }}</span>
              </div>
              <div class="sr-right">
                <span class="sr-value mono">{{ last(s)?.value }}</span>
                <span class="sr-unit">{{ s.unit }}</span>
                <span class="sr-period mono">{{ last(s)?.year }}</span>
              </div>
            </div>
          </div>
        </div>

        <aside class="dual-side">
          <div class="side-card">
            <div class="sc-title">七类可投产品</div>
            <p class="sc-desc">2024年12月起，个人养老金可投品种由四类扩至七类。</p>
            <ul class="cat-list">
              <li v-for="[c, n] in catCount" :key="c">
                <span>{{ c }}</span>
                <span class="mono">{{ n }}</span>
              </li>
            </ul>
            <RouterLink to="/products" class="btn ghost small full">查看产品图谱</RouterLink>
          </div>
        </aside>
      </div>
    </section>

    <!-- ================= 知识库 ================= -->
    <section class="band alt">
      <div class="wrap">
        <div class="band-head">
          <div>
            <div class="eyebrow">Library</div>
            <h2 class="section-title">值得读完的长文</h2>
          </div>
          <RouterLink to="/knowledge" class="link-arrow">全部文章 →</RouterLink>
        </div>

        <div class="article-grid">
          <RouterLink
            v-for="(a, i) in articles"
            :key="a.slug"
            :to="`/knowledge/${a.slug}`"
            class="article-card"
            :class="{ lead: i === 0 }"
          >
            <div class="ac-cat">{{ a.category }}</div>
            <h3 class="ac-title">{{ a.title }}</h3>
            <p class="ac-summary">{{ a.summary }}</p>
            <div class="ac-foot">
              <span class="mono">{{ a.read_minutes }} 分钟</span>
              <span class="ac-tags">
                <span v-for="t in a.tags.slice(0, 2)" :key="t" class="tag">{{ t }}</span>
              </span>
            </div>
          </RouterLink>
        </div>
      </div>
    </section>

    <!-- ================= AI 顾问 ================= -->
    <section class="band advisor-band">
      <div class="wrap advisor-inner">
        <div class="adv-copy">
          <div class="eyebrow">Advisor</div>
          <h2 class="section-title">不确定的，问它</h2>
          <p class="lead">
            AI 顾问基于本站政策库与知识库检索作答，会明确区分「政策规定」与「分析判断」，不承诺收益，不推荐具体在售产品。
          </p>
          <div class="adv-points">
            <div class="ap"><span class="mono">01</span> 检索增强，答案附资料来源</div>
            <div class="ap"><span class="mono">02</span> 涉及金额必标注口径与假设</div>
            <div class="ap"><span class="mono">03</span> 超出养老金融范围会明确拒绝</div>
          </div>
          <RouterLink to="/advisor" class="btn">进入对话</RouterLink>
        </div>

        <div class="adv-demo">
          <div class="demo-head">
            <span class="mono">SAMPLE DIALOGUE</span>
            <span class="demo-status">检索 5 条资料</span>
          </div>
          <div class="bubble user">我月薪 1 万，个人养老金一年交 12000，能省多少税？</div>
          <div class="bubble bot">
            <p>
              <strong>结论：</strong>按现行规则，年缴 12000 元、适用 10% 边际税率时，年净节税约
              <span class="mono">840</span> 元。
            </p>
            <p class="bubble-note">
              依据：缴费按限额税前扣除，领取时按 3% 单独计税。节税 ≈ 12000 ×（边际税率 − 3%）。
            </p>
            <div class="bubble-refs">
              <span class="tag">政策依据</span>
              <span class="tag">常见问题</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ================= 免责 ================= -->
    <section class="disclaimer">
      <div class="wrap disc-inner">
        <span class="disc-mark mono">NOTICE</span>
        <p>
          本站为公共信息整理与测算演示平台，不销售任何金融产品，不构成投资建议、法律意见或税务意见。政策执行口径以人力资源社会保障部、财政部、金融监管总局等官方发布为准。
        </p>
        <RouterLink to="/about" class="link-arrow">阅读完整声明 →</RouterLink>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* ================= HERO ================= */

.hero {
  padding: 62px 0 58px;
  border-bottom: 1px solid var(--line);
  position: relative;
  overflow: hidden;
}

.hero-grid {
  display: grid;
  grid-template-columns: 1.15fr 0.85fr;
  gap: 56px;
  align-items: start;
}

.hero-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  letter-spacing: 0.14em;
  color: var(--ink-3);
  font-family: var(--mono);
}

.dot {
  width: 5px;
  height: 5px;
  background: var(--cinnabar);
  border-radius: 50%;
}

.hero-title {
  margin-top: 20px;
  font-size: clamp(38px, 5.4vw, 68px);
  line-height: 1.08;
  letter-spacing: -0.035em;
  color: var(--ink);
  font-weight: 600;
}

.accent {
  position: relative;
  color: var(--cinnabar);
  font-style: italic;
  padding-bottom: 0.06em;
}

.hero-sub {
  margin-top: 22px;
  font-size: 16px;
  line-height: 1.85;
  color: var(--ink-2);
  max-width: 34ch;
}

.hero-cta {
  margin-top: 30px;
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.hero-facts {
  margin: 40px 0 0;
  padding-top: 22px;
  border-top: 1px solid var(--line);
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 18px;
  max-width: 520px;
}

.hero-facts dt {
  font-size: 11.5px;
  color: var(--ink-3);
  letter-spacing: 0.06em;
}

.hero-facts dd {
  margin: 5px 0 0;
  font-size: 26px;
  color: var(--pine);
  line-height: 1;
}

/* 右侧数据板 */
.hero-plate {
  background: var(--white);
  border: 1px solid var(--line-strong);
  padding: 22px 22px 0;
  position: relative;
  box-shadow: var(--shadow-2);
}

.hero-plate::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--pine);
}

.plate-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.plate-label {
  font-size: 10.5px;
  letter-spacing: 0.16em;
  color: var(--cinnabar);
}

.plate-title {
  font-size: 12.5px;
  color: var(--ink-2);
}

.plate-value {
  margin-top: 14px;
  display: flex;
  align-items: baseline;
  gap: 5px;
  flex-wrap: wrap;
}

.plate-value .num {
  font-size: 46px;
  line-height: 1;
  color: var(--pine);
  letter-spacing: -0.03em;
}

.plate-value .unit {
  font-size: 17px;
  color: var(--ink-3);
}

.plate-value .trend {
  margin-left: auto;
  font-size: 10.5px;
  color: var(--ink-3);
  letter-spacing: 0.02em;
}

.plate-foot {
  border-top: 1px solid var(--line);
  padding: 9px 0 14px;
  font-size: 10.5px;
  color: var(--ink-4);
  margin-top: 4px;
}

.plate-strip {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border-top: 1px solid var(--line);
  margin: 0 -22px;
}

.ps-item {
  padding: 14px 22px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ps-item + .ps-item {
  border-left: 1px solid var(--line);
}

.ps-label {
  font-size: 11px;
  color: var(--ink-3);
}

.ps-num {
  font-size: 20px;
  color: var(--ink);
  line-height: 1.2;
}

.ps-num em {
  font-style: normal;
  font-size: 11px;
  color: var(--ink-3);
  margin-left: 2px;
}

/* ================= 通用 band ================= */

.band {
  padding: 66px 0;
}

.band.alt {
  background: var(--paper-2);
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}

.band-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 34px;
  flex-wrap: wrap;
}

.band-head.tight {
  margin-bottom: 22px;
}

.band-note {
  font-size: 13px;
  color: var(--ink-3);
  max-width: 34ch;
  line-height: 1.7;
}

/* ================= 政策列表 ================= */

.policy-list {
  border-top: 1px solid var(--line-strong);
}

.policy-row {
  display: grid;
  grid-template-columns: 48px 1fr 150px;
  gap: 24px;
  padding: 26px 0;
  border-bottom: 1px solid var(--line);
  align-items: start;
  transition: background 0.16s ease, padding-left 0.16s ease;
}

.policy-row:hover {
  background: rgba(20, 69, 58, 0.035);
  padding-left: 10px;
}

.pr-no {
  font-size: 12px;
  color: var(--ink-4);
  padding-top: 4px;
}

.pr-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 9px;
}

.pr-date {
  font-size: 11px;
  color: var(--ink-3);
}

.pr-issuer {
  font-size: 11.5px;
  color: var(--ink-3);
}

.pr-title {
  font-size: 19px;
  line-height: 1.45;
  color: var(--ink);
  transition: color 0.16s ease;
}

.policy-row:hover .pr-title {
  color: var(--pine);
}

.pr-summary {
  margin-top: 9px;
  font-size: 13.5px;
  line-height: 1.8;
  color: var(--ink-2);
  max-width: 76ch;
}

.pr-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 14px;
}

.pr-doc {
  font-size: 10.5px;
  color: var(--ink-3);
  text-align: right;
  line-height: 1.6;
  word-break: break-all;
}

.pr-arrow {
  color: var(--ink-4);
  font-size: 16px;
  transition: transform 0.16s ease, color 0.16s ease;
}

.policy-row:hover .pr-arrow {
  color: var(--cinnabar);
  transform: translateX(3px);
}

/* ================= 工具卡 ================= */

.tool-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0;
  border-top: 1px solid var(--line-strong);
  border-left: 1px solid var(--line);
}

.tool-card {
  padding: 24px 22px 22px;
  border-right: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  background: var(--white);
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 230px;
  transition: background 0.16s ease;
  position: relative;
}

.tool-card::after {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  width: 0;
  height: 2px;
  background: var(--cinnabar);
  transition: width 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}

.tool-card:hover {
  background: var(--pine-soft);
}

.tool-card:hover::after {
  width: 100%;
}

.tc-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tc-no {
  font-size: 11px;
  color: var(--ink-4);
  letter-spacing: 0.1em;
}

.tc-name {
  font-size: 18px;
  margin-top: 6px;
  color: var(--ink);
}

.tc-desc {
  font-size: 13px;
  line-height: 1.75;
  color: var(--ink-2);
  flex: 1;
}

.tc-go {
  font-size: 12.5px;
  color: var(--pine);
  font-weight: 500;
}

/* ================= 双栏 ================= */

.dual {
  display: grid;
  grid-template-columns: 1.55fr 0.85fr;
  gap: 48px;
  align-items: start;
}

.stat-rows {
  border-top: 1px solid var(--line-strong);
}

.stat-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 16px 0;
  border-bottom: 1px solid var(--line);
}

.sr-left {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.sr-label {
  font-size: 14px;
  color: var(--ink);
}

.sr-source {
  font-size: 10.5px;
  color: var(--ink-4);
  line-height: 1.5;
  max-width: 52ch;
}

.sr-right {
  display: flex;
  align-items: baseline;
  gap: 4px;
  flex-shrink: 0;
}

.sr-value {
  font-size: 24px;
  color: var(--pine);
  line-height: 1;
}

.sr-unit {
  font-size: 11px;
  color: var(--ink-3);
}

.sr-period {
  font-size: 10px;
  color: var(--ink-4);
  margin-left: 6px;
}

.side-card {
  background: var(--white);
  border: 1px solid var(--line-strong);
  padding: 22px;
}

.sc-title {
  font-family: var(--serif);
  font-size: 17px;
  color: var(--ink);
}

.sc-desc {
  margin-top: 8px;
  font-size: 12.5px;
  line-height: 1.75;
  color: var(--ink-2);
}

.cat-list {
  list-style: none;
  margin: 16px 0 18px;
  padding: 0;
  border-top: 1px solid var(--line);
}

.cat-list li {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid var(--line);
  font-size: 13px;
  color: var(--ink-2);
}

.cat-list li .mono {
  color: var(--ink-4);
  font-size: 12px;
}

.full {
  width: 100%;
}

/* ================= 文章 ================= */

.article-grid {
  display: grid;
  grid-template-columns: 1.25fr 1fr 1fr;
  gap: 0;
  border-top: 1px solid var(--line-strong);
  border-left: 1px solid var(--line);
}

.article-card {
  padding: 26px 24px;
  border-right: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  background: var(--white);
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition: background 0.16s ease;
}

.article-card:hover {
  background: rgba(20, 69, 58, 0.04);
}

.article-card.lead {
  background: var(--pine);
  color: var(--paper);
}

.article-card.lead:hover {
  background: var(--pine-2);
}

.ac-cat {
  font-size: 11px;
  letter-spacing: 0.1em;
  color: var(--ink-3);
  font-family: var(--mono);
}

.article-card.lead .ac-cat {
  color: rgba(244, 242, 236, 0.7);
}

.ac-title {
  font-size: 20px;
  line-height: 1.42;
  color: var(--ink);
  flex: 0;
}

.article-card.lead .ac-title {
  font-size: 25px;
  color: var(--white);
}

.ac-summary {
  font-size: 13px;
  line-height: 1.8;
  color: var(--ink-2);
  flex: 1;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.article-card.lead .ac-summary {
  color: rgba(244, 242, 236, 0.82);
  -webkit-line-clamp: 5;
}

.ac-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
  font-size: 11px;
  color: var(--ink-3);
}

.article-card.lead .ac-foot {
  border-color: rgba(244, 242, 236, 0.22);
  color: rgba(244, 242, 236, 0.7);
}

.ac-tags {
  display: flex;
  gap: 5px;
}

.article-card.lead .tag {
  border-color: rgba(244, 242, 236, 0.3);
  color: rgba(244, 242, 236, 0.85);
}

/* ================= AI ================= */

.advisor-band {
  background: var(--pine);
  color: var(--paper);
  border: 0;
}

.advisor-band .eyebrow {
  color: rgba(244, 242, 236, 0.55);
}

.advisor-band .section-title {
  color: var(--white);
}

.advisor-band .lead {
  color: rgba(244, 242, 236, 0.78);
  margin-top: 14px;
}

.advisor-band .btn {
  background: var(--paper);
  border-color: var(--paper);
  color: var(--pine);
}

.advisor-band .btn:hover {
  background: var(--white);
  border-color: var(--white);
}

.advisor-inner {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 60px;
  align-items: center;
}

.adv-points {
  margin: 26px 0 28px;
  display: flex;
  flex-direction: column;
  gap: 11px;
}

.ap {
  display: flex;
  gap: 12px;
  font-size: 13.5px;
  color: rgba(244, 242, 236, 0.8);
}

.ap .mono {
  color: var(--cinnabar);
  font-size: 11px;
  padding-top: 3px;
}

.adv-demo {
  background: rgba(253, 252, 249, 0.06);
  border: 1px solid rgba(244, 242, 236, 0.18);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.demo-head {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  letter-spacing: 0.14em;
  color: rgba(244, 242, 236, 0.5);
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(244, 242, 236, 0.14);
}

.demo-status {
  font-family: var(--sans);
  letter-spacing: 0.02em;
}

.bubble {
  padding: 12px 14px;
  font-size: 13px;
  line-height: 1.75;
  border-radius: var(--radius);
}

.bubble.user {
  background: rgba(244, 242, 236, 0.12);
  color: var(--paper);
  align-self: flex-end;
  max-width: 88%;
}

.bubble.bot {
  background: var(--paper);
  color: var(--ink);
}

.bubble.bot p {
  margin: 0 0 8px;
}

.bubble-note {
  font-size: 11.5px;
  color: var(--ink-3);
  line-height: 1.7;
  padding-top: 8px;
  border-top: 1px solid var(--line);
}

.bubble-refs {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}

/* ================= 免责 ================= */

.disclaimer {
  padding: 34px 0;
  background: var(--paper-2);
  border-top: 1px solid var(--line);
}

.disc-inner {
  display: flex;
  align-items: center;
  gap: 22px;
  flex-wrap: wrap;
}

.disc-mark {
  font-size: 10px;
  letter-spacing: 0.2em;
  color: var(--cinnabar);
  border: 1px solid var(--cinnabar);
  padding: 2px 7px;
  flex-shrink: 0;
}

.disc-inner p {
  font-size: 12.5px;
  line-height: 1.8;
  color: var(--ink-3);
  flex: 1;
  min-width: 280px;
  max-width: 88ch;
}

/* ================= 响应式 ================= */

@media (max-width: 1080px) {
  .hero-grid {
    grid-template-columns: 1fr;
    gap: 38px;
  }
  .hero-plate {
    max-width: 520px;
  }
  .tool-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .article-grid {
    grid-template-columns: 1fr 1fr;
  }
  .article-card.lead {
    grid-column: 1 / -1;
  }
  .dual {
    grid-template-columns: 1fr;
    gap: 34px;
  }
  .advisor-inner {
    grid-template-columns: 1fr;
    gap: 36px;
  }
}

@media (max-width: 720px) {
  .hero {
    padding: 34px 0 38px;
  }
  .hero-facts {
    grid-template-columns: repeat(2, 1fr);
    gap: 14px;
  }
  .hero-title {
    font-size: clamp(34px, 9vw, 44px);
  }
  .band {
    padding: 42px 0;
  }
  .policy-row {
    grid-template-columns: 1fr;
    gap: 10px;
    padding: 20px 0;
  }
  .pr-no {
    display: none;
  }
  .pr-side {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
  .pr-doc {
    text-align: left;
  }
  .tool-grid {
    grid-template-columns: 1fr;
  }
  .tool-card {
    min-height: auto;
  }
  .article-grid {
    grid-template-columns: 1fr;
  }
  .article-card.lead .ac-title {
    font-size: 21px;
  }
  .plate-value .trend {
    display: none;
  }
}
</style>
