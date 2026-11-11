# -*- coding: utf-8 -*-
"""
模型一：城乡养老金融发展差异测度模型
====================================

目标：测度并分解 城市——县城——农村 三类区域养老金融发展水平的差异，
回答「差距有多大、差距从哪来、随时间如何演变」三个问题。

方法体系（四种方法互为印证，教学中可逐一讲解）：

1. 熵权-TOPSIS 综合指数
   - 熵权法客观赋权（信息量越大权重越高）；
   - TOPSIS 计算各区域各年份与"理想发展水平"的贴近度，得 0-100 发展指数；
2. 变异系数（CV）
   - CV = 标准差 / 均值，衡量当年三区域间相对差异；
3. Theil 指数及分解
   - T = Σ (y_i/Σy) * ln( (y_i/Σy) / (1/n) )，
     按「区域组间 + 组内」分解（此处以三大区域为组），
     定位差异主要来自区域之间还是区域内部；
4. 收敛性检验（σ收敛）
   - 对 CV 与时间做相关性检验，判断差异是否随时间收敛。

输出：
    output/results/m1_topsis_index.csv     三区域发展指数
    output/results/m1_theil.csv            Theil 指数及分解
    output/results/m1_weights.csv          熵权法权重
    output/figures/m1_*.png                四张静态图
    dashboard/data.js 更新（由 run_all 统一导出）
"""

from pathlib import Path

import numpy as np
import pandas as pd

import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from config import FIG_DIR, GAP_INDICATORS, GAP_YEARS, REGION_NAMES, RESULT_DIR
from src.data_pipeline import entropy_weights

GAP_COLS = [c for c, *_ in GAP_INDICATORS]
# 熵权/TOPSIS 输入使用 run_pipeline 正向化后的 0-100 列（*_norm），统一量纲
GAP_NORM_COLS = [c + "_norm" for c in GAP_COLS]


# ---------------------------------------------------------------------------
# 1. 熵权-TOPSIS
# ---------------------------------------------------------------------------
def topsis_index(panel_norm: pd.DataFrame, weights: pd.Series) -> pd.DataFrame:
    """基于已 MinMax 正向化(0-100)的指标计算 TOPSIS 贴近度指数。

    步骤：
        a) 加权矩阵 v_ij = w_j * x_ij
        b) 正/负理想解：v+ = max_i(v_ij), v- = min_i(v_ij)
        c) 距离 D+ = sqrt(Σ(v_ij - v+)²)，D- 同理
        d) 贴近度 C_i = D- / (D+ + D-) ∈ [0,1]，×100 得发展指数
    """
    X = panel_norm[GAP_NORM_COLS].astype(float).values
    W = weights[GAP_COLS].values
    V = X * W                                   # 加权决策矩阵
    v_plus, v_minus = V.max(axis=0), V.min(axis=0)
    d_plus = np.sqrt(((V - v_plus) ** 2).sum(axis=1))
    d_minus = np.sqrt(((V - v_minus) ** 2).sum(axis=1))
    closeness = d_minus / (d_plus + d_minus + 1e-12)
    out = panel_norm[["region_id", "year"]].copy()
    out["development_index"] = (closeness * 100).round(2)
    out["region_name"] = out["region_id"].map(REGION_NAMES)
    return out


# ---------------------------------------------------------------------------
# 2. 变异系数
# ---------------------------------------------------------------------------
def coefficient_variation(index_df: pd.DataFrame) -> pd.DataFrame:
    """逐年计算三区域发展指数的变异系数 CV = std/mean。"""
    rows = []
    for year, g in index_df.groupby("year"):
        vals = g["development_index"].values
        rows.append({"year": year,
                     "cv": round(float(np.std(vals, ddof=0) / np.mean(vals)), 4),
                     "city_index": float(g.loc[g.region_id == "C", "development_index"].iloc[0]),
                     "county_index": float(g.loc[g.region_id == "X", "development_index"].iloc[0]),
                     "rural_index": float(g.loc[g.region_id == "R", "development_index"].iloc[0])})
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# 3. Theil 指数及组间/组内分解
# ---------------------------------------------------------------------------
def theil_decomposition(index_df: pd.DataFrame) -> pd.DataFrame:
    """按三大区域分组分解 Theil 指数（以发展指数为收入变量）。

        T_total = T_between + T_within
        T_between = Σ_g (Y_g/Y) ln( (Y_g/Y) / (n_g/n) )     组间
        T_within_g = Σ_i∈g (y_i/Y_g) ln( (y_i/Y_g) / (1/n_g) )   组内

    每组（每区域）每年只有 1 个观测值，因此"组内"由组内年份内部差异构成：
    对每一年，把三区域当作 3 个组，每组内样本是该区域该年的 1 个观测 ——
    组内为 0。为了让分解有教学意义，这里改为【按年份维度分解区域差异】：
    即把各区域历年指数拼接成总体，组 = 区域。这样 T_within 衡量的是
    各区域自身的时间波动，T_between 衡量区域间水平差 —— 恰好回答
    "差异来自区域之间还是区域内部波动"。
    """
    y = index_df["development_index"].values.astype(float)
    groups = index_df["region_id"].values
    n = len(y)
    Y = y.sum()
    shares = y / Y
    t_total = float(np.sum(shares * np.log(shares * n)))

    parts = []
    for g in np.unique(groups):
        mask = groups == g
        yg, ng = y[mask].sum(), mask.sum()
        t_b = (yg / Y) * np.log((yg / Y) / (ng / n))
        ygi = y[mask]
        if len(ygi) > 1 and ygi.mean() > 0:
            sh = ygi / ygi.sum()
            t_g = float(np.sum(sh * np.log(sh * len(ygi))))
        else:
            t_g = 0.0
        # 标准分解公式中组内项需乘以该组收入（此处为指数）占比：T = Σ_b + Σ (Y_g/Y)·T_g
        parts.append({"region_id": g, "t_between": t_b, "t_within": (yg / Y) * t_g,
                      "share_index": yg / Y})
    df = pd.DataFrame(parts)
    total_b = df["t_between"].sum()
    total_w = df["t_within"].sum()
    df["t_between"] = (df["t_between"] / t_total).round(4)   # 贡献占比
    df["t_within"] = (df["t_within"] / t_total).round(4)
    summary = pd.DataFrame([{
        "theil_total": round(t_total, 4),
        "between_share": round(total_b / t_total, 4),
        "within_share": round(total_w / t_total, 4),
    }])
    df.to_csv(RESULT_DIR / "m1_theil_by_region.csv", index=False, encoding="utf-8-sig")
    summary.to_csv(RESULT_DIR / "m1_theil.csv", index=False, encoding="utf-8-sig")
    return summary


# ---------------------------------------------------------------------------
# 4. σ 收敛检验
# ---------------------------------------------------------------------------
def sigma_convergence(cv_df: pd.DataFrame) -> dict:
    """对 CV 序列与时间做 Pearson 相关（σ 收敛 = CV 随时间下降）。"""
    r = np.corrcoef(cv_df["year"], cv_df["cv"])[0, 1]
    return {"pearson_r": round(float(r), 4),
            "conclusion": "σ收敛（差异缩小）" if r < -0.5 else
                          ("弱收敛趋势" if r < 0 else "未收敛（差异未缩小或扩大）")}


# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------
def run_model1(processed: dict):
    panel = processed["gap_panel"]
    # 熵权法基于全部年份全样本计算一次权重（也可分年计算，教学可对比）
    weights = entropy_weights(panel, GAP_NORM_COLS)
    weights.index = GAP_COLS  # 权重对齐原始指标代码
    weights.round(4).to_csv(RESULT_DIR / "m1_weights.csv", encoding="utf-8-sig")

    index_df = topsis_index(panel, weights)
    index_df.to_csv(RESULT_DIR / "m1_topsis_index.csv", index=False, encoding="utf-8-sig")

    cv_df = coefficient_variation(index_df)
    cv_df.to_csv(RESULT_DIR / "m1_cv.csv", index=False, encoding="utf-8-sig")

    theil = theil_decomposition(index_df)
    conv = sigma_convergence(cv_df)

    print("\n========== 模型一：城乡养老金融发展差异测度 ==========")
    print("熵权法权重（Top5）：")
    print(weights.sort_values(ascending=False).head(5).round(4).to_string())
    print("\n2025 年三区域发展指数：")
    latest = index_df[index_df.year == max(GAP_YEARS)]
    print(latest[["region_name", "development_index"]].to_string(index=False))
    print(f"\nTheil 总指数 = {theil['theil_total'].iloc[0]}；"
          f"组间贡献 {theil['between_share'].iloc[0]*100:.0f}%，"
          f"组内贡献 {theil['within_share'].iloc[0]*100:.0f}%")
    print(f"σ收敛检验：r = {conv['pearson_r']} -> {conv['conclusion']}")

    return {"index": index_df, "cv": cv_df, "theil": theil, "weights": weights,
            "convergence": conv}


if __name__ == "__main__":
    from src.data_pipeline import run_pipeline
    run_model1(run_pipeline())
