# 城乡养老金融量化分析工具包（医讯通 · analytics 模块）

> 依托 **Python + SQLite(SQL) + Excel** 搭建的三套可运行、可复现的量化分析模型，
> 配套标准化数据处理流程、多维度调研数据库与交互式可视化看板，
> 兼具**科研**（方法体系完整、结果可复现）与**教学**（逐行中文注释、方法原理内嵌文档）价值。

---

## 一、三套模型一览

| # | 模型 | 回答的问题 | 方法体系 | 核心输出 |
|---|------|-----------|---------|---------|
| 一 | **城乡养老金融发展差异测度模型** | 城乡差距有多大？来自哪里？如何演变？ | 熵权-TOPSIS 综合指数、变异系数、Theil 指数组间/组内分解、σ收敛检验 | 三区域 2015—2025 发展指数、差异分解 |
| 二 | **医养融合金融风险评估模型** | 哪家医养机构风险高？高在哪个维度？ | 5 维 15 项指标体系、熵权法、TOPSIS、灰色关联分析（GRA）、四级风险分级、权重扰动敏感性分析 | 机构级风险得分与评级、区域风险概况 |
| 三 | **老年金融诈骗预警模型** | 哪些老人是高风险人群？如何事前预警？ | 逻辑回归、5 折交叉验证、ROC/约登最优阈值、OR 值风险因子排名、0-100 预警评分卡、四级预警人群 | 个体受害概率、评分卡、预警名单 |

## 二、目录结构

```
analytics/
├── config.py                  # 全局配置：路径/随机种子/指标体系/绘图风格
├── run_all.py                 # ★ 一键运行全流程
├── requirements.txt           # Python 依赖
├── src/
│   ├── data_generator.py      # 多维调研数据库·预设数据生成（seed=42 可复现）
│   ├── data_pipeline.py       # 标准化数据处理流程（清洗→标准化→熵权法）
│   ├── database.py            # SQLite 调研数据库建库与导入
│   ├── model1_gap.py          # 模型一：城乡差异测度
│   ├── model2_risk.py         # 模型二：医养融合金融风险评估
│   ├── model3_fraud.py        # 模型三：老年金融诈骗预警
│   ├── figures.py             # matplotlib 科研级静态图表（12 张）
│   ├── excel_report.py        # Excel 多工作表分析报表
│   └── dashboard_export.py    # 交互看板数据导出
├── data/
│   ├── raw/                   # 原始预设数据（5 张 CSV）
│   └── processed/             # 清洗与标准化后数据
├── database/
│   └── pension_finance_survey.db   # SQLite 多维度调研数据库
├── output/
│   ├── figures/               # 12 张 PNG 图表
│   ├── excel/                 # 养老金融量化分析工具包.xlsx（10 表）
│   └── results/               # 模型结果 CSV/JSON
└── dashboard/
    ├── index.html             # ★ 交互式可视化看板（双击打开）
    ├── data.js                # 看板数据（python 自动生成）
    └── echarts.min.js         # 本地 ECharts（离线可用）
```

## 三、快速开始

```bash
# 1. 安装依赖（Python ≥ 3.10）
pip install -r analytics/requirements.txt

# 2. 一键运行全流程（数据生成 → 处理 → 建库 → 三模型 → 图表 → Excel → 看板数据）
cd analytics
python run_all.py

# 3. 打开交互看板：双击 dashboard/index.html（无需联网、无需服务器）
```

单步运行（教学演示推荐）：

```bash
python src/data_generator.py   # 只看数据怎么生成
python src/data_pipeline.py    # 只看清洗与标准化
python src/model1_gap.py       # 只跑模型一
python src/database.py         # 建库并演示 SQL 查询
```

## 四、多维度调研数据库

覆盖 **城市 / 县城 / 农村** 三类区域的四类主体 + 个体问卷：

| 数据表 | 规模 | 内容要点 |
|--------|------|---------|
| `fact_gap_panel` | 3 区域 × 11 年 × 12 指标 | 养老金融可得性/使用度/覆盖/质量面板 |
| `fact_banks` | 99 家商业银行网点 | 老年客户占比、适老化评分、养老产品数、涉诈事件 |
| `fact_medical` | 78 家医疗机构 | 老年患者占比、医养签约数、绿色通道 |
| `fact_care_risk` | 120 家医养融合机构 | 模型二全部 15 项风险指标 |
| `fact_survey` | 1500 份问卷 | 人口学、金融素养、诈骗暴露与受害、养老金融需求 |

> **数据状态说明**：真实调研数据库尚在建设期，当前为**预设数据**（模拟调研）。
> 生成逻辑内置了符合经验规律的区域梯度与时间趋势，数值量级参考公开统计口径标定；
> 每条记录带 `record_id` 与 `data_source` 字段，保证可追溯。
> 字段口径见 `data/数据字典.md`。

## 五、数据替换指南（真实数据到位后）

1. 用真实调研数据替换 `data/raw/` 下 5 张同名 CSV（**列名保持一致**即可）；
2. 删除 `data/processed/` 缓存，重新 `python run_all.py`；
3. 模型二风险阈值可按新样本分位数重新校准（`config.py → RISK_THRESHOLDS`）；
4. 交互看板数据随 `run_all.py` 自动刷新，无需手工改动。

## 六、交互看板功能

- **总览**：KPI 卡片 + 发展趋势 + 预警人群构成
- **模型一**：年份滑块联动雷达图、区域图例显隐、维度筛选下拉
- **模型二**：15 项指标**权重滑杆实时重算**机构风险得分与评级（与离线模型同公式）、风险榜实时排序
- **模型三**：13 项特征**个体风险测算器**（前端逻辑回归实时推理）、ROC、风险因子排名

### 与医讯通 Web 端的整合

`run_all.py` 每次运行会同步把模型结果导出到 `server/data/analytics_export.json`，
服务端提供 `GET /api/analytics` 端点读取；Web 端导航中的
**「量化实验室」**（`/lab`，`web/src/views/LabView.vue`）即基于该端点构建，
与站点设计系统（松墨绿 / 朱砂 / 年鉴风）完全一致。

数据更新流程：修改或替换数据 → `python run_all.py` → 重启 API 服务（或清缓存）→ 前端自动展示新结果。

独立的 `dashboard/index.html` 仍保留，作为无需部署的离线版看板。

## 七、教学建议

- `config.py`：先讲指标体系设计（维度划分、方向设定）；
- `data_pipeline.py`：演示缺失值处理、IQR 异常值裁剪、MinMax/Z-score 的适用场景、熵权法原理；
- `model1_gap.py`：综合评价类模型的完整范式（赋权→TOPSIS→差异分解→收敛检验）；
- `model2_risk.py`：风险量化如何服务金融决策（分级、敏感性分析）；
- `model3_fraud.py`：分类模型全流程（标准化→交叉验证→阈值选择→可解释性→评分卡转换）。
