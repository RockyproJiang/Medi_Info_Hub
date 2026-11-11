<script setup>
/**
 * 调研数据库 —— 养老金融研究数据库（research.db，18 张表）在线浏览视图
 *
 * 能力：
 *  - 总览：18 张表规模 KPI + 四组关键聚合图表（区域分布/诈骗类型/产品类别/医养费用）
 *  - 表浏览：任意表分页浏览 + 全列模糊搜索（中文表名直接可查）
 *  - SQL 查询台：只读 SELECT/WITH，供科研教学自助取数
 *  - 原独立版浏览面板（research-panel.html）入口保留
 */
import { ref, computed, onMounted, watch } from 'vue'
import { api } from '../lib/api.js'
import PageHeader from '../components/PageHeader.vue'
import Chart from '../components/Chart.vue'

const data = ref(null)
const loading = ref(true)
const missing = ref(false)
const tab = ref('overview')

onMounted(async () => {
  try {
    data.value = await api.get('/research/overview')
    missing.value = !data.value
  } catch {
    missing.value = true
  } finally {
    loading.value = false
  }
})

/* ---------- 总览图表 ---------- */
const MONO_AX = { color: '#96a09b', fontSize: 10, fontFamily: 'monospace' }
const TIP = { backgroundColor: '#fdfcf9', borderColor: '#d3d0c6', textStyle: { color: '#1c2622', fontSize: 12 } }
const PINE = '#14453a'
const GOLD = '#8a6a2f'
const CINNABAR = '#b23a2b'

const kpis = computed(() => {
  if (!data.value) return null
  const find = (n) => data.value.tables.find((t) => t.name === n)?.rows ?? 0
  return [
    { v: data.value.tableCount + ' 张', l: '数据表' },
    { v: data.value.totalRows, l: '记录总数' },
    { v: find('受访者'), l: '问卷受访者' },
    { v: find('银行') + ' / ' + find('银行网点'), l: '银行 / 网点' },
    { v: find('养老产品'), l: '养老产品' },
    { v: find('医养机构'), l: '医养机构' },
    { v: find('诈骗案件'), l: '诈骗案件样本' },
    { v: find('区域'), l: '调研区域（城市/县城/农村）' },
  ]
})

function axisChart(rows, { nameKey = 'name', valKey = 'n', color = PINE, vertical = true, unit = '' } = {}) {
  if (!rows?.length) return null
  const names = rows.map((r) => r[nameKey])
  const vals = rows.map((r) => r[valKey])
  if (vertical) {
    return {
      grid: { left: 46, right: 20, top: 26, bottom: 30 },
      tooltip: { trigger: 'item', ...TIP },
      xAxis: { type: 'category', data: names, axisLabel: MONO_AX, axisLine: { lineStyle: { color: '#b8b4a8' } } },
      yAxis: { type: 'value', axisLabel: MONO_AX, splitLine: { lineStyle: { color: '#e2dfd6' } } },
      series: [{ type: 'bar', barWidth: '50%', itemStyle: { color, opacity: 0.88 }, label: { show: true, position: 'top', fontFamily: 'monospace', fontSize: 10, color: '#3d4a45', formatter: (p) => p.value + unit }, data: vals }],
    }
  }
  return {
    grid: { left: 110, right: 40, top: 16, bottom: 24 },
    tooltip: { trigger: 'item', ...TIP },
    xAxis: { type: 'value', axisLabel: MONO_AX, splitLine: { lineStyle: { color: '#e2dfd6' } } },
    yAxis: { type: 'category', data: names.reverse(), axisLabel: { fontSize: 11, color: '#3d4a45' } },
    series: [{ type: 'bar', barWidth: '55%', itemStyle: { color, opacity: 0.88 }, label: { show: true, position: 'right', fontFamily: 'monospace', fontSize: 10, color: '#3d4a45', formatter: (p) => p.value + unit }, data: vals.reverse() }],
  }
}

const chartRespondents = computed(() => axisChart(data.value?.charts.respondentsByRegion))
const chartFraud = computed(() =>
  axisChart(data.value?.charts.fraudByType, { color: CINNABAR, vertical: false }))
const chartProducts = computed(() => axisChart(data.value?.charts.productByCategory, { color: GOLD }))
const chartCare = computed(() =>
  axisChart(data.value?.charts.careByRegion, { valKey: 'avgMonthlyFee', color: '#5b7a52', unit: ' 元' }))
const chartAge = computed(() => axisChart(data.value?.charts.surveyByAge, { color: '#8a6a2f' }))

/* ---------- 表浏览 ---------- */
const activeTable = ref('')
const tbl = ref(null)
const tblLoading = ref(false)
const tblPage = ref(1)
const tblSize = 20
const tblKeyword = ref('')

const tableSummaries = computed(() => data.value?.tables || [])

async function loadTable(name, page = 1) {
  activeTable.value = name
  tblLoading.value = true
  tblPage.value = page
  try {
    tbl.value = await api.get(
      `/research/table/${encodeURIComponent(name)}?page=${page}&size=${tblSize}` +
      (tblKeyword.value ? `&q=${encodeURIComponent(tblKeyword.value)}` : ''),
    )
  } finally {
    tblLoading.value = false
  }
}

function searchTable() {
  if (activeTable.value) loadTable(activeTable.value, 1)
}

watch(activeTable, () => {
  tblKeyword.value = ''
})

const totalPages = computed(() => (tbl.value ? Math.max(1, Math.ceil(tbl.value.total / tbl.value.size)) : 1))

/* ---------- SQL 查询台 ---------- */
const sqlText = ref(`SELECT r.[区域类型] AS 区域类型, COUNT(*) AS 受访者数,\n       ROUND(AVG(s.[金融素养得分]), 1) AS 平均金融素养\nFROM [问卷回答] s\nJOIN [受访者] t USING([受访者编号])\nJOIN [区域] r USING([区域编号])\nGROUP BY r.[区域类型]`)
const sqlResult = ref(null)
const sqlError = ref('')
const sqlRunning = ref(false)

const SQL_EXAMPLES = [
  { label: '各区域受访者构成', sql: `SELECT r.[区域类型] AS 区域类型, COUNT(*) AS 受访者数\nFROM [受访者] t JOIN [区域] r USING([区域编号])\nGROUP BY r.[区域类型]` },
  { label: '诈骗类型与拦截率', sql: `SELECT [诈骗类型], COUNT(*) AS 案件数,\n       ROUND(AVG(CASE WHEN [是否银行拦截]=1 THEN 100.0 ELSE 0 END),1) AS 银行拦截率\nFROM [诈骗案件] GROUP BY [诈骗类型] ORDER BY 案件数 DESC` },
  { label: '各银行产品平均收益', sql: `SELECT b.[银行名称], COUNT(*) AS 产品数,\n       ROUND(AVG(p.[业绩基准收益率]),3) AS 平均基准收益率\nFROM [养老产品] p JOIN [银行] b USING([银行编号])\nGROUP BY b.[银行名称] ORDER BY 产品数 DESC` },
  { label: '问卷持有产品比例', sql: `SELECT [持有养老产品], COUNT(*) AS 人数,\n       ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM [问卷回答]),1) AS 占比\nFROM [问卷回答] GROUP BY [持有养老产品]` },
]

async function runSql() {
  sqlRunning.value = true
  sqlError.value = ''
  sqlResult.value = null
  try {
    sqlResult.value = await api.post('/research/query', { sql: sqlText.value })
  } catch (e) {
    sqlError.value = e.message
  } finally {
    sqlRunning.value = false
  }
}

function useExample(ex) {
  sqlText.value = ex.sql
}
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Research Database"
      title="调研数据库"
      desc="养老金融研究数据库：覆盖城市/县城/农村三类区域的商业银行、养老产品、医养机构运营数据与老年群体问卷。支持在线浏览、检索与只读 SQL 查询，数据可追溯（每条记录带编号）。"
    >
      <div class="ph-actions">
        <a class="ph-link" href="/research-panel.html" target="_blank">独立版浏览面板 ↗</a>
        <a class="ph-link" href="/lab">量化实验室 →</a>
      </div>
    </PageHeader>

    <div class="wrap">
      <div v-if="loading" class="loading">加载中…</div>

      <div v-else-if="missing" class="missing">
        <h2>研究数据库未就绪</h2>
        <p>未找到 <code>server/data/research.db</code>。请将《养老金融研究数据库.db》放入该目录后重启服务。</p>
      </div>

      <template v-else>
        <nav class="lab-tabs">
          <button :class="{ on: tab === 'overview' }" @click="tab = 'overview'">总览</button>
          <button :class="{ on: tab === 'browse' }" @click="tab = 'browse'">表浏览</button>
          <button :class="{ on: tab === 'sql' }" @click="tab = 'sql'">SQL 查询台</button>
        </nav>

        <!-- ============ 总览 ============ -->
        <section v-if="tab === 'overview'" class="lab-section">
          <div class="kpi-row">
            <div v-for="k in kpis" :key="k.l" class="kpi"><div class="v mono">{{ k.v }}</div><div class="l">{{ k.l }}</div></div>
          </div>

          <div class="grid-2">
            <div class="card"><h3>受访者区域分布</h3><Chart v-if="chartRespondents" :option="chartRespondents" height="240px" /></div>
            <div class="card"><h3>受访者年龄段分布</h3><Chart v-if="chartAge" :option="chartAge" height="240px" /></div>
          </div>
          <div class="grid-2">
            <div class="card"><h3>诈骗案件类型分布（红）与涉案金额</h3><Chart v-if="chartFraud" :option="chartFraud" height="280px" /></div>
            <div class="card"><h3>养老产品类别分布</h3><Chart v-if="chartProducts" :option="chartProducts" height="280px" /></div>
          </div>
          <div class="grid-2">
            <div class="card"><h3>医养机构月均费用（分区域）</h3><Chart v-if="chartCare" :option="chartCare" height="240px" /></div>
            <div class="card">
              <h3>全部数据表（{{ tableSummaries.length }} 张）</h3>
              <div class="table-list">
                <button v-for="t in tableSummaries" :key="t.name" class="tl-item" @click="activeTable = t.name; tab = 'browse'; loadTable(t.name)">
                  <span>{{ t.name }}</span><span class="mono tl-n">{{ t.rows }} 行</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- ============ 表浏览 ============ -->
        <section v-if="tab === 'browse'" class="lab-section">
          <div class="browse-layout">
            <aside class="card table-list-aside">
              <h3>数据表</h3>
              <button
                v-for="t in tableSummaries" :key="t.name"
                class="tl-item" :class="{ on: activeTable === t.name }"
                @click="loadTable(t.name)"
              >
                <span>{{ t.name }}</span><span class="mono tl-n">{{ t.rows }}</span>
              </button>
            </aside>

            <div class="card browse-main">
              <div v-if="!activeTable" class="empty-hint">← 在左侧选择一张数据表开始浏览</div>
              <template v-else>
                <div class="browse-head">
                  <h3>{{ tbl?.name || activeTable }} <span class="mono dim">{{ tbl?.total }} 行</span></h3>
                  <div class="search-box">
                    <input
                      v-model="tblKeyword" class="input" placeholder="全列搜索…" @keyup.enter="searchTable"
                    />
                    <button class="mini-btn" @click="searchTable">搜索</button>
                  </div>
                </div>

                <div v-if="tblLoading" class="loading">加载中…</div>
                <div v-else-if="tbl" class="scroll-box">
                  <table class="table">
                    <thead><tr><th v-for="c in tbl.columns" :key="c.name">{{ c.name }}</th></tr></thead>
                    <tbody>
                      <tr v-for="(r, i) in tbl.rows" :key="i">
                        <td v-for="c in tbl.columns" :key="c.name" class="mono cell">{{ r[c.name] }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div v-if="tbl" class="pager">
                  <button class="mini-btn" :disabled="tblPage <= 1" @click="loadTable(activeTable, tblPage - 1)">← 上一页</button>
                  <span class="mono pager-info">第 {{ tblPage }} / {{ totalPages }} 页 · 每页 {{ tblSize }} 条</span>
                  <button class="mini-btn" :disabled="tblPage >= totalPages" @click="loadTable(activeTable, tblPage + 1)">下一页 →</button>
                </div>
              </template>
            </div>
          </div>
        </section>

        <!-- ============ SQL 查询台 ============ -->
        <section v-if="tab === 'sql'" class="lab-section">
          <p class="tab-note">
            只读查询：仅允许单条 SELECT / WITH 语句，写操作会被拒绝。表名请用 <code>[中文名]</code> 方括号引用。
          </p>

          <div class="sql-layout">
            <div>
              <textarea v-model="sqlText" class="sql-input" rows="9" spellcheck="false"></textarea>
              <div class="sql-actions">
                <button class="btn small" :disabled="sqlRunning" @click="runSql">{{ sqlRunning ? '执行中…' : '▶ 执行查询' }}</button>
                <span v-for="ex in SQL_EXAMPLES" :key="ex.label">
                  <button class="mini-btn" @click="useExample(ex)">{{ ex.label }}</button>
                </span>
              </div>

              <div v-if="sqlError" class="sql-error">{{ sqlError }}</div>

              <div v-if="sqlResult" class="card" style="margin-top: 14px">
                <h3>
                  查询结果 <span class="mono dim">{{ sqlResult.total }} 行</span>
                  <span v-if="sqlResult.truncated" class="mono dim">（已截断至前 500 行）</span>
                </h3>
                <div class="scroll-box">
                  <table class="table">
                    <thead><tr><th v-for="c in sqlResult.columns" :key="c">{{ c }}</th></tr></thead>
                    <tbody>
                      <tr v-for="(r, i) in sqlResult.rows" :key="i">
                        <td v-for="c in sqlResult.columns" :key="c" class="mono cell">{{ r[c] }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <aside class="card schema-aside">
              <h3>表结构速查</h3>
              <details v-for="t in tableSummaries" :key="t.name" class="schema-item">
                <summary>{{ t.name }} <span class="mono dim">{{ t.rows }}</span></summary>
                <div class="schema-cols mono">
                  <span v-for="c in t.columns" :key="c.name">{{ c.name }}</span>
                </div>
              </details>
            </aside>
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

.ph-actions {
  margin-top: 16px;
  display: flex;
  gap: 18px;
}
.ph-link {
  font-size: 13.5px;
  color: var(--pine);
  border-bottom: 1px solid var(--pine);
  padding-bottom: 1px;
}

.missing {
  background: var(--white);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 48px 40px;
  max-width: 620px;
}
.missing h2 { font-family: var(--serif); color: var(--pine); font-size: 20px; }
.missing p { margin-top: 12px; color: var(--ink-2); line-height: 1.9; }
.missing code, .tab-note code {
  font-family: var(--mono);
  font-size: 12.5px;
  background: var(--paper-2);
  padding: 1px 6px;
  border-radius: var(--radius);
}

.lab-tabs { display: flex; border-bottom: 1px solid var(--line); }
.lab-tabs button {
  background: none; border: 0; padding: 12px 20px;
  font-size: 14.5px; color: var(--ink-3); cursor: pointer;
  border-bottom: 2px solid transparent; font-family: inherit;
  transition: color 0.15s ease, border-color 0.15s ease;
}
.lab-tabs button:hover { color: var(--pine); }
.lab-tabs button.on { color: var(--pine); font-weight: 500; border-bottom-color: var(--cinnabar); }

.lab-section { margin-top: 22px; }

.tab-note {
  margin: 0 0 14px;
  font-size: 13px;
  color: var(--ink-2);
  background: var(--gold-soft);
  border-left: 3px solid var(--gold);
  padding: 9px 14px;
  border-radius: var(--radius);
}

.kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 16px; }
.kpi { background: var(--white); border: 1px solid var(--line); border-radius: var(--radius); padding: 14px 16px; }
.kpi .v { font-size: 20px; font-weight: 600; color: var(--pine); }
.kpi .l { font-size: 11.5px; color: var(--ink-3); margin-top: 3px; }

.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
.card { background: var(--white); border: 1px solid var(--line); border-radius: var(--radius); padding: 16px 18px; }
.card h3 { font-family: var(--serif); font-size: 14.5px; color: var(--ink-2); margin-bottom: 10px; }

.dim { color: var(--ink-4); font-size: 12px; font-weight: 400; }

/* 表清单 */
.table-list { display: flex; flex-direction: column; gap: 6px; max-height: 260px; overflow: auto; }
.tl-item {
  display: flex; justify-content: space-between; align-items: center;
  background: none; border: 1px solid var(--line); border-radius: var(--radius);
  padding: 7px 12px; font-size: 13px; color: var(--ink-2); cursor: pointer;
  font-family: inherit; text-align: left; transition: all 0.15s ease;
}
.tl-item:hover { border-color: var(--pine); color: var(--pine); }
.tl-item.on { background: var(--pine-soft); border-color: var(--pine); color: var(--pine); }
.tl-n { color: var(--ink-4); font-size: 11.5px; }

/* 表浏览 */
.browse-layout { display: grid; grid-template-columns: 240px 1fr; gap: 16px; align-items: start; }
.table-list-aside { position: sticky; top: calc(var(--nav-h) + 16px); }
.table-list-aside .table-list { max-height: 560px; }
.browse-head { display: flex; justify-content: space-between; align-items: center; gap: 14px; margin-bottom: 12px; flex-wrap: wrap; }
.search-box { display: flex; gap: 8px; }
.input {
  border: 1px solid var(--line-strong); border-radius: var(--radius);
  padding: 6px 10px; font-size: 13px; background: var(--white); color: var(--ink);
  width: 200px; font-family: inherit;
}
.mini-btn {
  background: none; border: 1px solid var(--line-strong); border-radius: var(--radius);
  font-size: 12px; padding: 4px 10px; color: var(--ink-2); cursor: pointer;
  font-family: inherit; transition: all 0.15s ease; white-space: nowrap;
}
.mini-btn:hover { color: var(--pine); border-color: var(--pine); }
.mini-btn:disabled { opacity: 0.4; cursor: default; }

.scroll-box { overflow: auto; max-height: 480px; border: 1px solid var(--paper-3); }
.table { width: 100%; border-collapse: collapse; font-size: 12px; }
.table th {
  text-align: left; background: var(--paper-2); color: var(--ink-2); font-weight: 500;
  padding: 6px 10px; border-bottom: 1px solid var(--line);
  position: sticky; top: 0; white-space: nowrap;
}
.table td { padding: 5px 10px; border-bottom: 1px solid var(--paper-3); color: var(--ink-2); white-space: nowrap; max-width: 260px; overflow: hidden; text-overflow: ellipsis; }
.cell { font-size: 11.5px; }

.pager { display: flex; align-items: center; gap: 14px; margin-top: 12px; }
.pager-info { font-size: 12px; color: var(--ink-3); }
.empty-hint { padding: 60px 0; text-align: center; color: var(--ink-4); font-size: 13.5px; }

/* SQL */
.sql-layout { display: grid; grid-template-columns: 1.8fr 1fr; gap: 16px; align-items: start; }
.sql-input {
  width: 100%; font-family: var(--mono); font-size: 13px; line-height: 1.7;
  border: 1px solid var(--line-strong); border-radius: var(--radius);
  background: var(--white); color: var(--ink); padding: 12px 14px; resize: vertical;
}
.sql-actions { display: flex; gap: 10px; margin-top: 10px; flex-wrap: wrap; align-items: center; }
.sql-actions .btn { font-family: inherit; }
.sql-error {
  margin-top: 12px; font-size: 13px; color: var(--cinnabar);
  background: var(--cinnabar-soft); border-left: 3px solid var(--cinnabar);
  padding: 9px 14px; border-radius: var(--radius);
}
.schema-aside { position: sticky; top: calc(var(--nav-h) + 16px); max-height: 640px; overflow: auto; }
.schema-item { border-bottom: 1px solid var(--paper-3); }
.schema-item summary {
  padding: 7px 0; font-size: 13px; color: var(--ink-2); cursor: pointer;
}
.schema-cols { display: flex; flex-wrap: wrap; gap: 6px; padding: 4px 0 10px; }
.schema-cols span {
  font-size: 10.5px; background: var(--paper-2); color: var(--ink-3);
  padding: 1px 7px; border-radius: var(--radius);
}

@media (max-width: 1000px) {
  .kpi-row { grid-template-columns: 1fr 1fr; }
  .grid-2, .browse-layout, .sql-layout { grid-template-columns: 1fr; }
  .table-list-aside, .schema-aside { position: static; }
}
</style>
