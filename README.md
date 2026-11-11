# 医讯通 · 养老金融 · 养老保险 · 医养服务平台

由「医讯通」桌面版重构而来的网页版，沿用原项目名称「医讯通」。定位：不卖产品的公共信息平台——政策原文索引、待遇测算工具、家庭养老规划、医养服务参考、产品特征图谱、数据洞察与 AI 养老金融顾问，帮助中国家庭把养老这件事算清楚。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | Vue 3 + Vite + Vue Router，ECharts 图表，自建 CSS 设计系统（无 UI 框架依赖） |
| 服务端 | Node.js + Express（ESM） |
| 数据库 | 双库架构：**MySQL**（`yinling_ark` 库，存全部用户数据：账号/档案/测算记录/收藏/风险测评/AI 会话/笔记/审计）+ **SQLite**（Node 内置 `node:sqlite`，只读内容库：政策/文章/产品/术语/问答/医养服务），SQLite 路径 `server/data/yinling.db` |
| AI | DeepSeek 兼容 OpenAI 接口（流式 SSE），前置自建中文检索增强（RA-G） |
| 认证 | HMAC 签名令牌（Bearer），密码 scrypt 加盐哈希，无第三方依赖 |

## 目录结构

```
Medi_Info_Hub/
├── package.json              # 根工作区（server / web）
├── shared/calc.js            # 共享计算引擎（前后端同一份规则）
├── scripts/e2e.mjs           # API 端到端自测（node scripts/e2e.mjs）
├── server/
│   ├── .env.example          # 环境变量模板（复制为 .env 后填写真实值）
│   └── src/
│       ├── index.js          # Express 入口与全部路由（用户数据走 MySQL）
│       ├── db.js             # SQLite 连接与建表（内容库）
│       ├── mysql.js          # MySQL 连接池 + 建库建表（用户库 yinling_ark）
│       ├── auth.js           # 令牌签发 / 校验 / 密码哈希
│       ├── ai.js             # 检索 + 流式对话
│       └── seed/             # 种子数据：政策 / 文章 / 产品 / 医养服务 / 统计 / 术语 / 问答
└── web/
    ├── vite.config.js        # 5599 端口，/api 代理到 8787
    └── src/
        ├── App.vue           # 全局导航与页脚
        ├── router.js         # 15 条路由（含权限守卫）
        ├── lib/              # api 封装 / Markdown 渲染
        ├── components/       # Chart / PageHeader
        └── views/            # 13 个页面视图
```

## 页面一览

| 路由 | 说明 |
| --- | --- |
| `/` | 首页：人口数据板、正在生效的政策、测算工具入口、知识长文、AI 顾问演示 |
| `/policies` + `/policies/:slug` | 政策库：13 份养老金融与医保文件的结构化整理（含文号、来源、核心要点） |
| `/knowledge` + `/knowledge/:slug` | 知识库：14 篇原创长文（三支柱 / 养老金公式 / 延迟退休 / 税优 / 退休医保 / 机构选型 / 护理成本 / 防骗等） |
| `/products` | 产品图谱：七类可投品种的风险-收益散点、逐项对照表、选择框架 |
| `/tools` | 测算中心：退休年龄 / 养老金估算 / 养老缺口 / 税优 / 复利定投，五个工具 |
| `/family` | 家庭养老规划：多人合并测算（登录后可保存），共同居住支出折算、护理储备共享 |
| `/care` | 医养服务参考：居家 / 机构 / 医养结合 / 长护险六类服务的费用区间与选择要点 |
| `/data` | 数据洞察：七个官方口径时间序列 + 32 条术语 + 25 条问答 |
| `/advisor` | AI 顾问：流式对话，答案附检索资料来源，登录后会话入库 |
| `/account` | 注册 / 登录 / 个人档案 / 测算记录（含家庭规划）/ 收藏 / 风险测评 / AI 会话历史 |
| `/admin` | 管理后台：总览、用户管理、政策 / 文章 / 产品编辑、种子重置、审计日志 |
| `/about` | 关于与免责声明、数据来源、技术说明 |

## 快速开始

要求：**Node.js 24 或更高**（内置 `node:sqlite` 从 Node 23.4 起默认可用，Node 22 需加 `--experimental-sqlite`，故门槛定 24），npm 10+；**MySQL 8.x** 运行在本机（连接参数见 `server/.env` 的 `MYSQL_*`，默认 `root@127.0.0.1:3306`，库名 `yinling_ark`，密码通过 `MYSQL_PASSWORD` 提供）。

```bash
# 1. 安装依赖（根目录执行）
npm install

# 2. 构建前端（可选，开发模式可跳过）
npm run build

# 3a. 开发模式：API 与前端热更新并行
npm run dev
#    API    → http://127.0.0.1:8787
#    前端   → http://127.0.0.1:5599 （/api 自动代理）

# 3b. 生产模式：单端口
npm run build
npm start
#    全部   → http://127.0.0.1:8787
```

首次启动会自动：

1. 在 `server/data/` 创建 SQLite 内容库并建表，写入种子数据（政策 13、文章 14、产品 12、医养服务 6、统计 7、术语 32、问答 25）；
2. 连接 MySQL 并自动创建 `yinling_ark` 库与 9 张用户表（users / profiles / calc_records / favorites / risk_assessments / ai_conversations / ai_messages / user_notes / audit_logs，外键级联删除）；
3. 在 MySQL 中创建管理员与演示账号（含演示档案）。

数据分工：**凡属于用户的数据都在 MySQL**（注册账户、密码哈希、个人档案、每次测算的输入与结果、收藏、风险测评、AI 对话全文、用户自由填写的笔记、审计日志）；政策/文章/产品等公共内容由 SQLite 内容库承载，管理后台编辑内容表仍走 SQLite。

已有旧数据库时，新种子（医养服务等）会在下一次启动时自动补齐；也可在管理后台或 `npm run seed`（加 `-- --force`）强制重置内容表。

## 演示账号

| 角色 | 用户名 | 密码 |
| --- | --- | --- |
| 管理员 | `admin` | `Admin@2025` |
| 演示用户 | `demo` | `Demo@2025` |

## AI 模块配置

`server/.env`：

```bash
cp server/.env.example server/.env
# 然后编辑 server/.env：
#   AUTH_SECRET=  长随机串（node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"）
#   MYSQL_PASSWORD=
#   AI_API_KEY=   到 https://platform.deepseek.com 申请自己的 Key，留空则 AI 顾问不可用
AI_BASE_URL=https://api.deepseek.com
AI_MODEL=deepseek-chat
```

- Key 只存在于服务端 `server/.env`（已被 `.gitignore` 排除），前端打包产物与仓库中均无任何密钥。
- 对话前会先在政策库、知识库、术语表、问答库内做检索增强，答案附资料来源。
- 健康检查：`curl http://127.0.0.1:8787/api/health?ai=1`，返回 ai.ok 说明连通。
- 该 Key 失效或额度耗尽时，其余功能完全不受影响。

## 数据与内容边界

- 政策条目为公开文件的结构化整理与要点归纳，非原文照录，每条标注来源与文号。
- 产品库全部为**示意性示例**（is_demo = 1），前端明确标注，不对应任何在售产品。
- 医养服务费用为公开信息中的常见区间，类型化整理，不对应任何具体机构。
- 统计数据来自国家统计局、人社部、卫健委、国家医保局年度公报，标注年份与口径。
- 平台不销售金融产品，不构成投资或医疗建议，见 `/about` 完整声明。

## 自测

```bash
# ① API 层（15 项断言：健康检查、种子计数、医养服务筛选/搜索、
#    医保政策与文章、家庭规划计算与入库、鉴权）
node scripts/e2e.mjs

# ② MySQL 用户数据层全链路（25 项断言：注册/登录/档案/测算入库/收藏/
#    风险测评/笔记 CRUD/AI 会话持久化/管理员计数/级联删除，结束后自动清理）
node scripts/e2e-mysql.mjs

# ③ 真浏览器渲染巡检（18 项断言）：用系统 Chrome headless 打开首页、登录页、
#    各功能页，真实填表登录，检查是否渲染、是否有 JS 异常。需先 npm run build
node scripts/browser-check.mjs

# ④ 认证流程专项（11 项断言）：未登录访问家庭规划、UI 注册、登录后面板切换、
#    退出登录。同样用系统 Chrome headless
node scripts/auth-flow-check.mjs
```

> ③④ 用系统已安装的 Chrome，不依赖 Playwright，不会卡住；如果 Chrome 不在默认路径，改脚本顶部的 `CHROME` 常量。
>
> 另外 `node scripts/check-manual.mjs` 会校验 `deploy/FIX-STEPS.md` 里**每一段 bash 代码块**的语法（用 WSL 的 `bash -n`），改完部署手册后跑一下，防止给用户贴出有语法错的命令。

## 生产部署提示

1. 更换 `AUTH_SECRET` 为长随机值；
2. 更换演示账号密码或删除；
3. SQLite 内容库建议定期备份 `server/data/yinling.db`；**用户数据请用 `mysqldump yinling_ark` 定期备份 MySQL**；
4. 如需对外域名，在 Express 前置 Nginx 反向代理即可（API 前缀 `/api`）。

### 部署到 Linux 服务器

服务器（Ubuntu）上的完整步骤见 **[`deploy/FIX-STEPS.md`](deploy/FIX-STEPS.md)** —— 按实测状态写的逐段复制粘贴手册，覆盖 Node 版本要求、systemd 守护、nginx `/api` 反向代理、验收与回滚。背景说明与排错对照见 [`deploy/README.md`](deploy/README.md)。

要点：

- **Node ≥ 24**（`node:sqlite` 从 23.4 起默认可用；Node 22 需额外标志，故不用 22）
- 后端只监听 `127.0.0.1:8787`，对外一律走 nginx；前端 `web/src/lib/api.js` 里 `BASE = '/api'` 是相对路径，**没有 `/api` 反向代理就会全站接口失效**（返回 index.html）
- AI 对话是 SSE 流式，反代必须带 `proxy_buffering off` + `proxy_cache off` + `X-Accel-Buffering no`（`deploy/patch-nginx.mjs` 已包含）

## 许可

[MIT](LICENSE) © 2025-2026 Rocky (RockyproJiang)

政策原文版权归各发布机构所有，本项目仅作结构化整理与要点归纳；产品与医养服务数据为示意性示例，不构成投资或医疗建议。
