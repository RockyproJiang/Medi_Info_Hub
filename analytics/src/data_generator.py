# -*- coding: utf-8 -*-
"""
多维度调研数据库 —— 预设数据生成器
==================================

【重要说明】真实调研数据库尚在建设期，本模块按「数据真实可追溯」的工程
规范预先生成一套结构完整、口径统一的**模拟调研数据**（预设数据）：

* 数值量级参考公开统计口径（如城镇职工月均养老金约 3600 元、城乡居民
  基础养老金约 200 元、城市养老机构床位利用率约 75% 等）进行标定；
* 城市 > 县城 > 农村的梯度关系、2015—2025 年的改善趋势均符合经验规律；
* 每条记录带 record_id 与 sample_year，可追溯到"样本批次"；
* 正式调研数据到位后，只需将 data/raw/ 下同名 CSV 替换为真实数据，
  下游清洗、建模、可视化全流程无需改动一行代码。

生成 5 张原始表（CSV, UTF-8-SIG 方便 Excel 直接打开）：

1. gap_panel.csv               区域养老金融发展面板（3 区域 × 11 年 × 12 指标）
2. banks.csv                   商业银行运营数据（99 家网点）
3. medical.csv                 医疗机构运营数据（78 家）
4. care_risk.csv               医养融合机构运营与风险数据（120 家）
5. survey.csv                  老年群体需求问卷（1500 份）

用法（独立运行）::

    python src/data_generator.py
"""

import numpy as np
import pandas as pd

import sys
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[1]))
from config import (DATA_RAW, GAP_INDICATORS, GAP_YEARS, N_SURVEY, REGIONS,
                    SEED, RISK_INDICATORS)

rng = np.random.default_rng(SEED)   # 可复现随机源

REGION_IDS = [r["region_id"] for r in REGIONS]


# ---------------------------------------------------------------------------
# 工具函数
# ---------------------------------------------------------------------------
def _clip(x, lo, hi):
    """将数组裁剪到 [lo, hi] 区间，保证指标不出现越界值。"""
    return np.clip(x, lo, hi)


def _region_gradient(base, grad_city_county_rural, region_id):
    """按城市/县城/农村给基准值施加梯度系数。

    grad_city_county_rural: 长度 3 的系数表 [城市, 县城, 农村]。
    """
    factor = dict(zip(["C", "X", "R"], grad_city_county_rural))
    return base * factor[region_id]


# ---------------------------------------------------------------------------
# 表 1：区域养老金融发展面板（模型一数据）
# ---------------------------------------------------------------------------
def gen_gap_panel() -> pd.DataFrame:
    """生成 2015—2025 三区域养老金融发展面板数据。

    设计逻辑：
    * 每项指标给一个「城市基准 + 年改善率」；
    * 农村起点低但改善率高（政策倾斜），县城居中 —— 符合真实经验；
    * 叠加噪声后裁剪到合理区间。
    """
    rows = []
    n_years = len(GAP_YEARS)
    # 指标: (城市基准, 年均改善率%, 区域梯度[城市,县城,农村], 下限, 上限)
    spec = {
        "acc_branch":       (1.8,  2.5, [1.00, 0.55, 0.30], 0.05, None),
        "acc_atm":          (4.5,  1.0, [1.00, 0.60, 0.35], 0.10, None),
        "acc_mobile":       (28.0, 12.0, [1.00, 0.62, 0.34], 1.0, 95.0),
        "use_deposit":      (12.0, 7.0, [1.00, 0.48, 0.26], 0.3, None),
        "use_insurance":    (9.0,  6.5, [1.00, 0.50, 0.22], 0.5, 80.0),
        "use_fund":         (6.0,  9.0, [1.00, 0.42, 0.15], 0.2, 60.0),
        "use_credit":       (5.5,  5.0, [1.00, 0.45, 0.18], 0.2, 50.0),
        "cov_pension":      (92.0, 1.2, [1.00, 0.96, 0.88], 40.0, 99.5),
        "cov_annuity":      (8.5,  8.0, [1.00, 0.38, 0.12], 0.1, 45.0),
        "cov_medical":      (6.0,  14.0, [1.00, 0.45, 0.10], 0.0, 60.0),
        "qua_complaint":    (3.2,  -4.0, [1.00, 1.25, 1.55], 0.2, 20.0),
        "qua_satisfaction": (74.0, 1.6, [1.00, 0.93, 0.84], 30.0, 98.0),
    }
    for rid in REGION_IDS:
        for yi, year in enumerate(GAP_YEARS):
            row = {"region_id": rid, "year": year}
            for code, name, _dim, _dir, unit in GAP_INDICATORS:
                b0, g, grad, lo, hi = spec[code]
                val = _region_gradient(b0, grad, rid) * (1 + g / 100.0) ** yi
                val *= rng.normal(1.0, 0.03)            # 3% 随机波动
                if hi is not None:
                    val = _clip(val, lo, hi)
                else:
                    val = _clip(val, lo, val * 1.5)
                row[code] = round(float(val), 3)
            rows.append(row)
    df = pd.DataFrame(rows)
    df["record_id"] = [f"GP{i:04d}" for i in range(1, len(df) + 1)]
    df["data_source"] = "预设数据（模拟调研，待真实数据替换）"
    return df


# ---------------------------------------------------------------------------
# 表 2：商业银行运营数据
# ---------------------------------------------------------------------------
def gen_banks() -> pd.DataFrame:
    """生成三类区域商业银行网点运营数据（含养老金融业务维度）。"""
    cfg = {"C": (45, "商业银行", 1.0), "X": (30, "农商行/城商行", 0.6), "R": (24, "农信社/农商行", 0.35)}
    rows = []
    i = 0
    for rid, (n, typ, g) in cfg.items():
        for _ in range(n):
            i += 1
            staff = int(_clip(rng.normal(28 * g + 6, 6), 4, 90))
            elder_ratio = float(_clip(rng.normal(38 * g + 12, 6), 8, 85))
            rows.append({
                "record_id": f"BK{i:04d}",
                "region_id": rid,
                "institution_type": typ,
                "sample_year": int(rng.choice([2023, 2024, 2025], p=[0.25, 0.35, 0.40])),
                "staff_count": staff,
                "elder_customer_ratio": round(elder_ratio, 1),                      # 老年客户占比 %
                "agefriendly_score": round(float(_clip(rng.normal(72 * g + 22, 8), 30, 100)), 1),  # 适老化改造评分
                "pension_products": int(_clip(rng.normal(9 * g + 2, 3), 1, 30)),    # 养老金融产品数
                "pension_deposit_wan": round(float(_clip(rng.normal(4200 * g + 300, 900 * g + 150), 50, None)), 1),  # 养老储蓄余额(万元)
                "annual_elder_visits_wan": round(float(_clip(rng.normal(11 * g + 1.5, 3), 0.4, None)), 2),  # 年老年客流(万人次)
                "mobile_bank_open_ratio": round(float(_clip(rng.normal(46 * g + 8, 8), 3, 92)), 1),  # 老年手机银行开通率 %
                "complaints_per_100": round(float(_clip(rng.normal(2.6 / g * 0.5 + 1.2, 0.8), 0.1, 15)), 2),  # 百名老年客户投诉量
                "fraud_cases_reported": int(rng.poisson(3.2 * (1.6 - g))),          # 年上报涉诈骗事件数
                "data_source": "预设数据（模拟调研，待真实数据替换）",
            })
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# 表 3：医疗机构运营数据
# ---------------------------------------------------------------------------
def gen_medical() -> pd.DataFrame:
    """生成三类区域医疗机构数据（侧重医养结合服务能力维度）。"""
    cfg = {"C": (36, 1.0), "X": (24, 0.55), "R": (18, 0.3)}
    levels = {"C": ["三级医院", "二级医院", "社区卫生服务中心"],
              "X": ["二级医院", "县医院", "乡镇卫生院"],
              "R": ["乡镇卫生院", "村卫生室", "诊所"]}
    probs = {"C": [0.3, 0.35, 0.35], "X": [0.3, 0.4, 0.3], "R": [0.35, 0.4, 0.25]}
    rows = []
    i = 0
    for rid, (n, g) in cfg.items():
        for _ in range(n):
            i += 1
            beds = int(_clip(rng.normal(420 * g + 20, 180 * g + 40), 8, 2200))
            rows.append({
                "record_id": f"MD{i:04d}",
                "region_id": rid,
                "level": str(rng.choice(levels[rid], p=probs[rid])),
                "sample_year": int(rng.choice([2023, 2024, 2025], p=[0.25, 0.35, 0.40])),
                "bed_count": beds,
                "elder_patient_ratio": round(float(_clip(rng.normal(44 * g + 14, 7), 10, 90)), 1),   # 老年患者占比 %
                "geriatric_dept": int(rng.random() < (0.85 * g + 0.05)),             # 是否设老年科
                "rehab_beds": int(_clip(rng.normal(60 * g + 4, 25 * g + 8), 0, None)),  # 康复床位数
                "avg_los_elder": round(float(_clip(rng.normal(11.5 - 2 * (g - 1), 2.2), 3, 30)), 1),  # 老年患者平均住院日
                "medical_insurance_ratio": round(float(_clip(rng.normal(62 * g + 18, 7), 15, 95)), 1),  # 医保结算占比 %
                "partners_care_home": int(rng.poisson(2.5 * g + 0.3)),               # 签约养老机构数
                "green_channel": int(rng.random() < (0.75 * g + 0.1)),               # 老年就医绿色通道
                "data_source": "预设数据（模拟调研，待真实数据替换）",
            })
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# 表 4：医养融合机构风险数据（模型二数据）
# ---------------------------------------------------------------------------
def gen_care_risk() -> pd.DataFrame:
    """生成医养融合机构运营与风险指标数据（120 家）。

    每家机构一次性生成模型二所需的全部 15 项风险指标，
    并给一个潜在「综合风险倾向」用于驱动指标间相关性 ——
    使高风险机构各项指标同向恶化，数据呈现真实的相关结构。
    """
    cfg = {"C": (48, 0.0), "X": (40, 0.35), "R": (32, 0.7)}   # g: 风险抬升系数
    rows = []
    i = 0
    for rid, (n, g) in cfg.items():
        for _ in range(n):
            i += 1
            # 潜在风险倾向 latent ~ N(0,1)：越大越危险
            latent = rng.normal(0, 1) + g
            def lv(good_base, bad_base, slope_good, slope_bad, sd):
                """按 latent 生成指标：风险高 -> 偏向坏的一端。"""
                w = 1 / (1 + np.exp(-(latent * 1.4)))          # sigmoid 映射
                base = good_base * (1 - w) + bad_base * w
                return base * rng.normal(1, sd)
            row = {
                "record_id": f"CR{i:04d}",
                "region_id": rid,
                "org_type": str(rng.choice(["医养结合型养老机构", "养老机构内设医务室", "医疗机构延伸服务点"], p=[0.5, 0.3, 0.2])),
                "sample_year": int(rng.choice([2023, 2024, 2025], p=[0.25, 0.35, 0.40])),
                "bed_count": int(_clip(rng.normal(180 * (1 - g * 0.4) + 30, 90), 20, 800)),
            }
            # 15 项风险指标（r_* 命名与 config.RISK_INDICATORS 对齐）
            row.update({
                "r_debt":       round(float(_clip(lv(38, 72, 0, 0, 0.12), 10, 95)), 1),
                "r_current":    round(float(_clip(lv(1.9, 0.8, 0, 0, 0.15), 0.3, 4.5)), 2),
                "r_interest":   round(float(_clip(lv(6.5, 1.4, 0, 0, 0.2), 0.2, 12)), 2),
                "r_bed":        round(float(_clip(100 - lv(80, 52, 0, 0, 0.1), 2, 70)), 1),
                "r_occupancy":  round(float(_clip(lv(80, 52, 0, 0, 0.1), 25, 98)), 1),
                "r_payback":    round(float(_clip(lv(8, 15, 0, 0, 0.15), 3, 25)), 1),
                "r_receivable": round(float(_clip(lv(55, 130, 0, 0, 0.18), 20, 240)), 0),
                "r_cashflow":   round(float(_clip(lv(1.6, 0.7, 0, 0, 0.16), 0.2, 3.5)), 2),
                "r_advance":    round(float(_clip(lv(9, 26, 0, 0, 0.2), 1, 45)), 1),
                "r_policy":     round(float(_clip(lv(12, 34, 0, 0, 0.18), 0, 60)), 1),
                "r_license":    round(float(_clip(lv(98, 82, 0, 0, 0.06), 55, 100)), 1),
                "r_insurance":  round(float(_clip(lv(88, 55, 0, 0, 0.12), 10, 100)), 1),
                "r_staff":      round(float(_clip(lv(82, 58, 0, 0, 0.1), 25, 100)), 1),
                "r_turnover":   round(float(_clip(lv(12, 32, 0, 0, 0.2), 2, 50)), 1),
                "r_incident":   round(float(_clip(lv(0.6, 2.8, 0, 0, 0.25), 0.0, 8)), 2),
            })
            rows.append(row)
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# 表 5：老年群体需求问卷（模型三数据）
# ---------------------------------------------------------------------------
def gen_survey() -> pd.DataFrame:
    """生成老年群体需求与金融诈骗暴露问卷数据（1500 份）。

    生成逻辑（教学要点：先造"真值"，再造"观测"）：
    1. 先抽取人口学特征（年龄、教育、独居……）；
    2. 用 Logistic 函数把特征线性组合成受害真概率 p；
    3. 按 p 抽取 0/1 是否受害 —— 这样后续逻辑回归可以"还原"出我们
       埋入的系数，模型演示效果真实可信。
    """
    n = N_SURVEY
    region = rng.choice(REGION_IDS, size=n, p=[0.34, 0.31, 0.35])
    age = _clip(rng.normal(72.5, 6.8, n), 60, 95)
    female = (rng.random(n) < 0.53).astype(int)
    # 教育年限：城市高、农村低
    edu_mean = np.where(region == "C", 10.5, np.where(region == "X", 8.2, 5.2))
    edu_years = _clip(rng.normal(edu_mean, 3.2), 0, 19)
    # 独居概率：农村略低（合住多）、城市略高，随年龄上升
    p_alone = 0.16 + 0.012 * (age - 70) + np.where(region == "R", -0.03, 0.02)
    live_alone = (rng.random(n) < p_alone).astype(int)
    # 月收入（千元）
    inc_base = np.where(region == "C", 4.6, np.where(region == "X", 2.9, 1.7))
    monthly_income = _clip(rng.normal(inc_base, 1.1), 0.2, 15) + 0.03 * (edu_years - 6)
    # 金融素养：受教育年限驱动 + 噪声，城市更高
    fin_literacy = _clip(28 + 3.1 * edu_years + np.where(region == "C", 6, np.where(region == "X", 2, 0))
                         + rng.normal(0, 9, n), 0, 100)
    health_score = _clip(rng.normal(66, 14, n) - 0.5 * (age - 72), 5, 100)
    use_smartphone = (rng.random(n) < _clip(0.18 + 0.035 * edu_years + np.where(region == "C", 0.18, 0.05), 0.05, 0.95)).astype(int)
    num_apps = _clip(use_smartphone * rng.poisson(1.6, n) + rng.binomial(1, 0.08), 0, 8)
    social_freq = _clip(rng.poisson(np.where(region == "C", 5.2, 4.2)), 0, 25)
    family_contact = _clip(rng.poisson(np.where(live_alone == 1, 3.5, 8.5)), 0, 30)
    promo_exposure = _clip(rng.poisson(2.2 + 0.8 * (monthly_income > 3) + np.where(region == "R", 0.9, 0.3)), 0, 25)
    trust_high = (rng.random(n) < _clip(0.34 - 0.016 * edu_years + 0.01 * (age - 72), 0.05, 0.85)).astype(int)

    # ---- 真值概率（教学用：埋入的"真实系数"）----
    # 截距校准：使总体受害率落在 15%~20%（接近基层涉老诈骗报案/回溯调查量级）
    z = (1.2
         + 0.055 * (age - 72)          # 年龄越大风险越高
         + 0.30 * female               # 女性略高（经验规律）
         - 0.085 * edu_years           # 教育保护
         + 0.55 * live_alone           # 独居高风险
         - 0.12 * monthly_income       # 收入保护
         - 0.038 * fin_literacy        # 金融素养强保护
         - 0.012 * health_score
         + 0.35 * use_smartphone       # 用手机 → 暴露面更大
         + 0.14 * num_apps
         - 0.05 * social_freq          # 社交保护
         - 0.045 * family_contact      # 子女联系保护
         + 0.22 * promo_exposure       # 推销暴露
         + 0.85 * trust_high)          # 信任陌生人是强风险因子
    p_true = 1 / (1 + np.exp(-z))
    fraud_victim = (rng.random(n) < p_true).astype(int)

    # 遭遇渠道与损失（受害者的补充信息）
    channels = ["电话推销", "微信群/短视频", "熟人介绍", "街头摊位", "银行门口搭讪", "直播带货"]
    channel = np.where(fraud_victim == 1, rng.choice(channels, n, p=[0.32, 0.22, 0.18, 0.13, 0.09, 0.06]), "无")
    loss_amount = np.where(fraud_victim == 1,
                           _clip(np.exp(rng.normal(2.4, 1.1, n)) * 0.1, 0.05, 60).round(2), 0.0)
    report_rate = np.where(fraud_victim == 1, (rng.random(n) < 0.31).astype(int), 0)

    df = pd.DataFrame({
        "record_id": [f"SV{i:05d}" for i in range(1, n + 1)],
        "region_id": region,
        "age": age.round(0).astype(int),
        "female": female,
        "edu_years": edu_years.round(0).astype(int),
        "live_alone": live_alone,
        "monthly_income": monthly_income.round(2),
        "fin_literacy": fin_literacy.round(1),
        "health_score": health_score.round(1),
        "use_smartphone": use_smartphone,
        "num_apps": num_apps,
        "social_freq": social_freq,
        "family_contact": family_contact,
        "promo_exposure": promo_exposure,
        "trust_high": trust_high,
        "fraud_victim": fraud_victim,               # 目标变量：是否受害
        "fraud_channel": channel,
        "loss_amount_wan": loss_amount,             # 损失金额（万元）
        "reported": report_rate,                    # 是否报案
        # 需求侧问题（养老金融需求调研）
        "demand_pension_product": (rng.random(n) < 0.42).astype(int),   # 有养老金融产品需求
        "demand_medical_finance": (rng.random(n) < 0.57).astype(int),   # 有医养费用规划需求
        "data_source": "预设数据（模拟调研，待真实数据替换）",
    })
    return df


# ---------------------------------------------------------------------------
# 主入口
# ---------------------------------------------------------------------------
def generate_all():
    """生成全部 5 张原始表并写入 data/raw/。返回表名->DataFrame 字典。"""
    tables = {
        "gap_panel": gen_gap_panel(),
        "banks": gen_banks(),
        "medical": gen_medical(),
        "care_risk": gen_care_risk(),
        "survey": gen_survey(),
    }
    for name, df in tables.items():
        path = DATA_RAW / f"{name}.csv"
        # utf-8-sig：带 BOM，Excel 双击打开不乱码
        df.to_csv(path, index=False, encoding="utf-8-sig")
        print(f"[生成] {path.name:<22} {df.shape[0]:>5} 行 × {df.shape[1]:>2} 列")
    return tables


if __name__ == "__main__":
    print("=" * 60)
    print("多维度调研数据库 —— 预设数据生成（随机种子=42，可复现）")
    print("=" * 60)
    generate_all()
    print("\n完成。原始数据已写入 data/raw/，下游流程可直接使用。")
