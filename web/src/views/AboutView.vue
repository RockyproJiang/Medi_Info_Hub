<script setup>
import PageHeader from '../components/PageHeader.vue'

const sections = [
  {
    no: '01',
    title: '平台定位',
    body: '医讯通是一个养老金融领域的公共信息与测算工具平台。我们不销售金融产品，不代办理财、保险、贷款业务，不收取任何形式的销售佣金或导流费用。平台与任何金融机构无利益关联。',
  },
  {
    no: '02',
    title: '内容性质',
    body: '政策库中的条目为公开政策文件的结构化整理，正文为要点归纳，非原文照录；知识库文章为编辑原创撰写，其中引用的统计数据均标注年份与来源机构；产品图谱中的全部条目为示意性示例，不对应任何在售产品。',
  },
  {
    no: '03',
    title: '测算工具的局限',
    body: '退休年龄测算依据全国统一的渐进式延迟退休规则，未覆盖特殊工种提前退休、病退、军转干部等特殊情形。养老金估算采用全国统一的计发框架，但各省在过渡性养老金办法、地方性补贴、缴费基数上下限上存在差异。缺口测算为情景模拟，结果对通胀率、预期寿命、回报率三个假设高度敏感。所有结果均为估算，不构成对实际待遇的承诺。',
  },
  {
    no: '04',
    title: 'AI 顾问的边界',
    body: 'AI 顾问基于本站内容库进行检索增强生成，回答可能包含错误或过时信息。它不提供医疗诊断、用药建议、法律意见、税务筹划方案，不推荐具体机构的在售产品。涉及个人具体情况时，请咨询持牌理财顾问、执业律师、注册税务师或社保经办机构。',
  },
  {
    no: '05',
    title: '数据来源',
    body: '人口与寿命数据来自国家统计局年度统计公报与国家卫生健康委员会统计公报；养老保险基金数据来自人力资源和社会保障部统计公报；个人养老金开户数据来自人社部新闻发布会披露；替代率为本站依据公开数据测算的估算值，非官方发布口径。',
  },
  {
    no: '06',
    title: '隐私与数据',
    body: '平台仅存储用户名、密码哈希（scrypt 加盐）与用户在个人档案中主动填写的养老参数。不收集身份证号、银行卡号、生物特征等敏感个人信息。测算记录与 AI 会话仅用于向用户本人回显历史，不用于训练模型，不向第三方共享。用户可随时删除自己的测算记录与收藏。',
  },
  {
    no: '07',
    title: '风险提示',
    body: '任何金融产品均存在风险。存款受存款保险制度保障但有额度上限；国债以国家信用为背书但仍有利率风险；理财产品与基金不保本，净值可能下跌；保险产品的实际收益取决于合同条款与持有期限，提前退保可能损失本金。历史业绩不代表未来表现，业绩比较基准不构成收益承诺。',
  },
  {
    no: '08',
    title: '纠错与反馈',
    body: '若发现政策引用错误、数据口径不当或表述不准确，欢迎指出。平台承诺在核实后及时更正，并在条目中标注修订记录。政策执行口径的最终解释权归发布机关所有。',
  },
]

const sources = [
  { name: '中国政府网', desc: '国务院及各部委政策文件原文', url: 'https://www.gov.cn/' },
  { name: '人力资源和社会保障部', desc: '养老保险、个人养老金、待遇调整', url: 'https://www.mohrss.gov.cn/' },
  { name: '国家统计局', desc: '人口结构、寿命、平均工资数据', url: 'https://www.stats.gov.cn/' },
  { name: '国家金融监督管理总局', desc: '银行保险机构与产品监管', url: 'https://www.nfra.gov.cn/' },
  { name: '中国人大网', desc: '法律文本，含延迟退休决定', url: 'http://www.npc.gov.cn/' },
  { name: '国家医疗保障局', desc: '长期护理保险试点政策', url: 'https://www.nhsa.gov.cn/' },
]
</script>

<template>
  <div>
    <PageHeader
      eyebrow="About & Disclaimer"
      title="关于本站"
      desc="这个平台为什么存在、内容是怎么来的、哪些事情它做不到。把边界说清楚，比把功能列一遍更有用。"
    />

    <div class="wrap">
      <div class="intro">
        <div class="intro-main">
          <p class="intro-lead">
            养老这件事的信息不对称，比大多数消费决策都严重。政策文件写在部委网站上，计算公式散落在各省实施细则里，产品条款藏在几十页的合同中，而销售环节的信息往往经过筛选。
          </p>
          <p>
            医讯通试图做一件简单的事：把这些分散的、专业的信息整理成可读、可算、可核对的形式。政策给原文与要点，测算给公式与假设，产品给特征与约束。不替你决策，但让你在决策前知道该问什么问题。
          </p>
        </div>
        <div class="intro-side">
          <div class="is-item">
            <span class="is-n mono">0</span>
            <span class="is-label">在售金融产品</span>
          </div>
          <div class="is-item">
            <span class="is-n mono">0</span>
            <span class="is-label">销售佣金</span>
          </div>
          <div class="is-item">
            <span class="is-n mono">100%</span>
            <span class="is-label">公开信息整理</span>
          </div>
        </div>
      </div>

      <section class="clauses">
        <div v-for="s in sections" :key="s.no" class="clause">
          <div class="cl-head">
            <span class="cl-no mono">{{ s.no }}</span>
            <h2 class="cl-title">{{ s.title }}</h2>
          </div>
          <p class="cl-body">{{ s.body }}</p>
        </div>
      </section>

      <section class="sources">
        <h2 class="src-title">主要数据与政策来源</h2>
        <div class="src-grid">
          <a
            v-for="s in sources"
            :key="s.name"
            :href="s.url"
            target="_blank"
            rel="noopener noreferrer"
            class="src-item"
          >
            <span class="si-name">{{ s.name }}</span>
            <span class="si-desc">{{ s.desc }}</span>
            <span class="si-url mono">{{ s.url }}</span>
          </a>
        </div>
      </section>

      <section class="tech">
        <h2 class="src-title">技术说明</h2>
        <div class="tech-grid">
          <div class="tech-item">
            <span class="ti-label mono">FRONTEND</span>
            <p>Vue 3 + Vite，路由懒加载，ECharts 图表按需渲染。设计系统为自建 CSS 变量，无 UI 框架依赖。</p>
          </div>
          <div class="tech-item">
            <span class="ti-label mono">BACKEND</span>
            <p>Node.js + Express，使用 Node 内置 SQLite 持久化。认证采用 HMAC 签名令牌，密码 scrypt 加盐哈希。</p>
          </div>
          <div class="tech-item">
            <span class="ti-label mono">AI</span>
            <p>基于 DeepSeek 接口的流式对话，前置自建中文检索做检索增强，答案附资料来源与检索依据。</p>
          </div>
          <div class="tech-item">
            <span class="ti-label mono">CALC</span>
            <p>测算引擎为纯函数模块，前后端共用同一份代码，确保页面展示与保存记录口径一致。</p>
          </div>
        </div>
      </section>

      <div class="final-note">
        <span class="mono">DISCLAIMER</span>
        <p>
          本站内容仅供信息参考与教育目的，不构成投资建议、法律意见、税务意见或会计意见。任何依据本站内容作出的决策，其后果由决策者自行承担。政策执行口径以发布机关的最新文件为准。
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.intro {
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: 56px;
  padding-bottom: 40px;
  border-bottom: 1px solid var(--line-strong);
  margin-bottom: 44px;
  align-items: start;
}

.intro-lead {
  font-family: var(--serif);
  font-size: 19px;
  line-height: 1.85;
  color: var(--ink);
  margin-bottom: 18px;
}

.intro-main p:not(.intro-lead) {
  font-size: 14.5px;
  line-height: 1.95;
  color: var(--ink-2);
  max-width: 66ch;
}

.intro-side {
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--line);
}

.is-item {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 14px;
  padding: 14px 0;
  border-bottom: 1px solid var(--line);
}

.is-n {
  font-size: 26px;
  color: var(--pine);
  line-height: 1;
}

.is-label {
  font-size: 12px;
  color: var(--ink-3);
  text-align: right;
}

.clauses {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 56px;
}

.clause {
  padding: 22px 0;
  border-bottom: 1px solid var(--line);
}

.cl-head {
  display: flex;
  gap: 14px;
  align-items: baseline;
  margin-bottom: 10px;
}

.cl-no {
  font-size: 10.5px;
  color: var(--cinnabar);
  letter-spacing: 0.1em;
  flex-shrink: 0;
}

.cl-title {
  font-size: 17px;
  color: var(--ink);
}

.cl-body {
  font-size: 13.5px;
  line-height: 1.95;
  color: var(--ink-2);
  padding-left: 32px;
}

.sources,
.tech {
  margin-top: 56px;
}

.src-title {
  font-size: 21px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--line-strong);
  margin-bottom: 22px;
}

.src-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border-top: 1px solid var(--line);
  border-left: 1px solid var(--line);
}

.src-item {
  padding: 18px;
  border-right: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  background: var(--white);
  display: flex;
  flex-direction: column;
  gap: 5px;
  transition: background 0.15s ease;
}

.src-item:hover {
  background: var(--pine-soft);
}

.si-name {
  font-size: 14.5px;
  color: var(--ink);
  font-weight: 500;
}

.si-desc {
  font-size: 12px;
  color: var(--ink-3);
  line-height: 1.6;
}

.si-url {
  font-size: 10.5px;
  color: var(--ink-4);
  margin-top: 3px;
}

.tech-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 30px 56px;
}

.ti-label {
  font-size: 10px;
  letter-spacing: 0.16em;
  color: var(--cinnabar);
  display: block;
  margin-bottom: 7px;
}

.tech-item p {
  font-size: 13px;
  line-height: 1.9;
  color: var(--ink-2);
  padding-top: 9px;
  border-top: 1px solid var(--line);
}

.final-note {
  margin-top: 56px;
  padding: 24px;
  background: var(--pine);
  color: var(--paper);
  display: flex;
  gap: 20px;
  align-items: flex-start;
}

.final-note .mono {
  font-size: 10px;
  letter-spacing: 0.2em;
  color: rgba(244, 242, 236, 0.55);
  padding-top: 4px;
  flex-shrink: 0;
}

.final-note p {
  font-size: 13px;
  line-height: 1.9;
  color: rgba(244, 242, 236, 0.85);
  max-width: 96ch;
}

@media (max-width: 980px) {
  .intro {
    grid-template-columns: 1fr;
    gap: 30px;
  }
  .clauses {
    grid-template-columns: 1fr;
    gap: 0;
  }
  .src-grid {
    grid-template-columns: 1fr 1fr;
  }
  .tech-grid {
    grid-template-columns: 1fr;
    gap: 22px;
  }
  .cl-body {
    padding-left: 0;
  }
}

@media (max-width: 620px) {
  .src-grid {
    grid-template-columns: 1fr;
  }
}
</style>
