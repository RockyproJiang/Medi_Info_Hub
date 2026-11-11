# -*- coding: utf-8 -*-
"""
模型二：医养融合金融风险评估模型
====================================

目标：对医养融合机构（医养结合型养老机构 / 养老机构内设医务室 /
医疗机构延伸服务点）的金融风险进行量化评估与分级，回答
「哪家机构风险高、高在哪个维度、对金融机构放贷意味着什么」。

方法体系：

1. 熵权法客观赋权（与模型一同一实现，见 data_pipeline.entropy_weights）
2. 灰色关联分析（GRA）
   - 以"最优安全机构"为参考序列，计算每家机构的灰色关联度，
     关联度越低 = 与安全状态差距越大 = 风险越高；
3. 综合风险得分 = 0.5×(100-TOPSIS贴近度) + 0.5×(100-GRA关联度)
   —— 两种客观方法等权融合，避免单一方法偏倚（科研上可做稳健性检验）；
4. 风险四级分类（低/中/高/极高），阈值见 config.RISK_THRESHOLDS；
5. 分维度风险画像 + 区域对比 + 敏感性分析（权重扰动 ±20% 看评级是否稳定）。

输出：
    output/results/m2_institution_scores.csv  机构级风险得分与评级
    output/results/m2_region_summary.csv      分区域风险概况
    output/results/m2_weights.csv             熵权
    output/results/m2_sensitivity.csv         敏感性分析
    output/figures/m2_*.png
"""

from pathlib import Path

import numpy as np
import pandas as pd

import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from config import (FIG_DIR, REGION_NAMES, RESULT_DIR, RISK_INDICATORS,
                    RISK_THRESHOLDS)
from src.data_pipeline import entropy_weights

RISK_COLS = [c for c, *_ in RISK_INDICATORS]
# 熵权/TOPSIS/灰色关联的输入一律使用 run_pipeline 正向化后的 0-100 列（*_norm），
# 保证不同量纲指标（% / 倍 / 天）在欧氏距离中权重一致 —— 这是多指标综合评价的标准做法。
NORM_COLS = [c + "_norm" for c in RISK_COLS]
DIMENSIONS = {}
for code, _name, dim, _d, _u in RISK_INDICATORS:
    DIMENSIONS.setdefault(dim, []).append(code)


# ---------------------------------------------------------------------------
# 1. TOPSIS 贴近度（风险视角：输入经方向统一后"值越大=风险越高"）
# ---------------------------------------------------------------------------
def topsis_closeness(df_norm: pd.DataFrame, weights: np.ndarray) -> np.ndarray:
    """风险视角 TOPSIS 贴近度（数据驱动锚点）。

    输入为 *_norm 列：经方向统一后，【值越大 = 风险越高】。
    正/负理想解取样本内最优/最差（加权后）：
        v+_j = w_j * max_i(x_ij)  ← 风险最大状态
        v-_j = w_j * min_i(x_ij)  ← 风险最小（最安全）状态
    返回贴近度 C ∈ [0,1]：越接近 1 = 距"最安全"越远 = 越危险。
    """
    V = df_norm[NORM_COLS].astype(float).values * weights
    v_plus, v_minus = V.max(axis=0), V.min(axis=0)
    d_plus = np.sqrt(((V - v_plus) ** 2).sum(axis=1))     # 距"最危险"的距离
    d_minus = np.sqrt(((V - v_minus) ** 2).sum(axis=1))   # 距"最安全"的距离
    return d_minus / (d_plus + d_minus + 1e-12)           # 越危险 → C 越大


# ---------------------------------------------------------------------------
# 2. 灰色关联分析（GRA）
# ---------------------------------------------------------------------------
def grey_relation(df_norm: pd.DataFrame, weights: np.ndarray, rho: float = 0.5) -> np.ndarray:
    """灰色关联度（风险视角）。

        Δ_ij = |x_ij - x_j*|          与参考序列的绝对差
        ξ_ij = (Δmin + ρΔmax) / (Δ_ij + ρΔmax)     关联系数，ρ 为分辨系数
        r_i  = Σ_j w_j ξ_ij           加权关联度 ∈ (0,1]

    参考序列取样本内"风险最大"状态（各指标 _norm 最大值），
    因此 r_i 越大 = 与最危险状态越相似 = 越危险。
    """
    X = df_norm[NORM_COLS].astype(float).values
    ref = X.max(axis=0)                       # 参考序列 = 样本内风险最大状态
    delta = np.abs(X - ref)
    dmin, dmax = delta.min(), delta.max()
    xi = (dmin + rho * dmax) / (delta + rho * dmax)
    return (xi * weights).sum(axis=1)


# ---------------------------------------------------------------------------
# 3. 风险分级
# ---------------------------------------------------------------------------
def classify(score: float) -> str:
    """按综合风险得分（0-100，越高越危险）返回四级风险标签。"""
    for th, label, _color in RISK_THRESHOLDS:
        if score < th:
            return label
    return RISK_THRESHOLDS[-1][1]


# ---------------------------------------------------------------------------
# 4. 敏感性分析：熵权扰动 ±20%
# ---------------------------------------------------------------------------
def sensitivity(df_norm: pd.DataFrame, base_w: pd.Series, n_sim: int = 200,
                seed: int = 42) -> pd.DataFrame:
    """对权重做 Dirichlet 扰动（模拟 ±20% 量级的不确定性），检验评级稳定性。"""
    rng = np.random.default_rng(seed)
    w0 = base_w.values
    base_scores = composite_score(df_norm, w0)
    base_labels = np.array([classify(s) for s in base_scores])
    flip = np.zeros(n_sim)
    for k in range(n_sim):
        w = rng.dirichlet(np.ones(len(w0)) * 25)     # 集中在 w0 附近的扰动
        w = w0 * (w / w.mean())                      # 保持量级
        w = w / w.sum()
        s = composite_score(df_norm, w)
        lab = np.array([classify(x) for x in s])
        flip[k] = (lab != base_labels).mean()
    return pd.DataFrame({"sim_id": range(1, n_sim + 1),
                         "label_change_ratio": flip.round(4)})


def composite_score(df_norm: pd.DataFrame, weights: np.ndarray) -> np.ndarray:
    """综合风险得分 = 0.5*(100·TOPSIS风险贴近度) + 0.5*(100·灰色关联度)。

    两个指标此时均已统一为"越大越危险"（见各自 docstring），
    等权融合避免单一方法偏倚（科研上可做稳健性检验）。
    """
    c = topsis_closeness(df_norm, weights)
    g = grey_relation(df_norm, weights)
    return 0.5 * (c * 100) + 0.5 * (g * 100)


# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------
def run_model2(processed: dict):
    df = processed["care_risk"]
    weights = entropy_weights(df, NORM_COLS)
    # 熵权在 *_norm 列上计算，但对外统一使用原始指标代码命名
    weights.index = RISK_COLS
    weights.round(4).to_csv(RESULT_DIR / "m2_weights.csv", encoding="utf-8-sig")
    w = weights.values

    scores = composite_score(df, w)
    out = df[["record_id", "region_id", "org_type", "bed_count"]].copy()
    out["risk_score"] = scores.round(2)
    out["risk_level"] = [classify(s) for s in scores]
    out["region_name"] = out["region_id"].map(REGION_NAMES)

    # 分维度风险画像：每维度取指标均值（已正向化 0-100，越大越安全）
    for dim, cols in DIMENSIONS.items():
        out[f"dim_{dim}"] = df[cols].mean(axis=1).round(2)

    out.to_csv(RESULT_DIR / "m2_institution_scores.csv", index=False, encoding="utf-8-sig")

    # 区域汇总
    region_summary = (out.groupby("region_name")
                      .agg(机构数=("risk_score", "size"),
                           平均风险分=("risk_score", "mean"),
                           极高风险占比=("risk_level", lambda s: (s == "极高风险").mean() * 100),
                           高风险占比=("risk_level", lambda s: (s == "高风险").mean() * 100))
                      .round(2).reset_index())
    region_summary.to_csv(RESULT_DIR / "m2_region_summary.csv", index=False, encoding="utf-8-sig")

    # 敏感性分析
    sens = sensitivity(df, weights)
    sens.to_csv(RESULT_DIR / "m2_sensitivity.csv", index=False, encoding="utf-8-sig")

    print("\n========== 模型二：医养融合金融风险评估 ==========")
    print("熵权 Top5：")
    print(weights.sort_values(ascending=False).head(5).round(4).to_string())
    print("\n分区域风险概况：")
    print(region_summary.to_string(index=False))
    flip_mean = sens["label_change_ratio"].mean()
    print(f"\n敏感性分析：平均 {flip_mean:.1%} 的机构在权重扰动下改变评级"
          f"（评级体系{'较稳健' if flip_mean < 0.1 else '需复核阈值'}）")

    return {"scores": out, "region_summary": region_summary,
            "weights": weights, "sensitivity": sens}


if __name__ == "__main__":
    from src.data_pipeline import run_pipeline
    run_model2(run_pipeline())
