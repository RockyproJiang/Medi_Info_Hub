# -*- coding: utf-8 -*-
"""
科研级静态图表输出（matplotlib，中文，统一品牌配色）
====================================================

为三套模型各输出一组 PNG 图表，可直接用于论文/报告/课件。
配色与医讯通 Web 端统一（见 config.PALETTE）。

模型一：发展指数趋势线、雷达图、CV 演变、Theil 分解堆叠柱
模型二：风险等级分布、分维度画像热力图、区域箱线图、权重条形图
模型三：ROC 曲线、特征重要性、风险概率分布、预警人群构成
"""

from pathlib import Path

import matplotlib
matplotlib.use("Agg")                       # 无界面环境安全
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from config import (FIG_DIR, GAP_INDICATORS, MPL_STYLE, PALETTE, RESULT_DIR,
                    RISK_THRESHOLDS)
from src.model1_gap import GAP_COLS

plt.rcParams.update(MPL_STYLE)


def _save(fig, name):
    fig.savefig(FIG_DIR / name)
    plt.close(fig)
    print(f"  [图] {name}")


# ===========================================================================
# 模型一图表
# ===========================================================================
def fig_m1(model1: dict):
    index_df, cv_df, weights = model1["index"], model1["cv"], model1["weights"]
    colors = {"城市": PALETTE[0], "县城": PALETTE[2], "农村": PALETTE[1]}

    # 图1：三区域发展指数趋势
    fig, ax = plt.subplots(figsize=(8.6, 5))
    for rid in ["C", "X", "R"]:
        g = index_df[index_df.region_id == rid]
        ax.plot(g["year"], g["development_index"], marker="o", lw=2.2,
                label=g["region_name"].iloc[0], color=colors[g["region_name"].iloc[0]])
    ax.set_title("图1-1 三类区域养老金融发展指数（熵权-TOPSIS）", fontsize=13, pad=12)
    ax.set_xlabel("年份"); ax.set_ylabel("发展指数（0-100）")
    ax.legend(frameon=False)
    _save(fig, "m1_01_发展指数趋势.png")

    # 图2：雷达图（2025 年三区域 12 指标，取已 MinMax 正向化 0-100 的 _norm 列）
    latest = index_df[index_df.year == index_df.year.max()]
    panel = model1.get("panel_norm")   # 传入 processed 后的 gap_panel
    labels = [name for _c, name, *_ in GAP_INDICATORS]
    angles = np.linspace(0, 2 * np.pi, len(labels), endpoint=False).tolist()
    angles += angles[:1]
    fig, ax = plt.subplots(figsize=(7.4, 7.4), subplot_kw={"polar": True})
    for _, row in latest.iterrows():
        if panel is not None:
            sub = panel[(panel.region_id == row["region_id"]) &
                        (panel.year == row["year"])]
            vals = [sub[f"{c}_norm"].iloc[0] for c in GAP_COLS]
            vals = vals + vals[:1]
        else:
            vals = [50] * (len(labels) + 1)
        ax.plot(angles, vals, lw=2, label=row["region_name"],
                color=colors[row["region_name"]])
        ax.fill(angles, vals, alpha=0.08, color=colors[row["region_name"]])
    ax.set_xticks(angles[:-1]); ax.set_xticklabels(labels, fontsize=9)
    ax.set_title("图1-2 2025年养老金融指标维度雷达图", fontsize=13, pad=22)
    ax.legend(loc="upper right", bbox_to_anchor=(1.25, 1.08), frameon=False)
    _save(fig, "m1_02_指标雷达图.png")

    # 图3：变异系数演变（σ收敛）
    fig, ax = plt.subplots(figsize=(8.2, 4.6))
    ax.bar(cv_df["year"], cv_df["cv"], color=PALETTE[4], alpha=0.85, width=0.62)
    z = np.polyfit(cv_df["year"], cv_df["cv"], 1)
    ax.plot(cv_df["year"], np.polyval(z, cv_df["year"]), color=PALETTE[3],
            lw=2, ls="--", label=f"线性趋势（斜率{z[0]:.4f}）")
    ax.set_title("图1-3 城乡差异演变：变异系数与σ收敛检验", fontsize=13, pad=12)
    ax.set_xlabel("年份"); ax.set_ylabel("变异系数 CV")
    ax.legend(frameon=False)
    _save(fig, "m1_03_变异系数演变.png")

    # 图4：Theil 分解
    region_csv = pd.read_csv(RESULT_DIR / "m1_theil_by_region.csv")
    region_csv["region_name"] = region_csv["region_id"].map({"C": "城市", "X": "县城", "R": "农村"})
    fig, axes = plt.subplots(1, 2, figsize=(10.5, 4.4), gridspec_kw={"width_ratios": [1.2, 1]})
    axes[0].bar(region_csv["region_name"], region_csv["t_between"],
                color=PALETTE[0], label="组间贡献（区域水平差）")
    axes[0].bar(region_csv["region_name"], region_csv["t_within"],
                bottom=region_csv["t_between"], color=PALETTE[2],
                label="组内贡献（区域内部波动）")
    axes[0].set_title("Theil 指数分解（贡献占比）", fontsize=12)
    axes[0].legend(frameon=False, fontsize=9)
    w = weights.sort_values(ascending=False).head(8)
    axes[1].barh(w.index[::-1], w.values[::-1], color=PALETTE[4])
    axes[1].set_title("熵权法权重 Top8", fontsize=12)
    axes[1].set_xlabel("权重")
    fig.suptitle("图1-4 差异来源分解与指标权重", fontsize=13, y=1.02)
    _save(fig, "m1_04_差异分解与权重.png")


# ===========================================================================
# 模型二图表
# ===========================================================================
def fig_m2(model2: dict):
    scores, weights = model2["scores"], model2["weights"]

    # 图1：风险等级分布（分区域堆叠柱）
    order = [lab for _th, lab, _c in RISK_THRESHOLDS]
    cmap = {lab: c for _th, lab, c in RISK_THRESHOLDS}
    piv = (scores.groupby(["region_name", "risk_level"]).size().unstack(fill_value=0)
           .reindex(columns=order))
    fig, ax = plt.subplots(figsize=(8.4, 5))
    bottom = np.zeros(len(piv))
    for lab in order:
        if lab in piv:
            ax.bar(piv.index, piv[lab], bottom=bottom, color=cmap[lab], label=lab, width=0.55)
            bottom += piv[lab].values
    ax.set_title("图2-1 医养融合机构风险等级分布（分区域）", fontsize=13, pad=12)
    ax.set_ylabel("机构数量"); ax.legend(frameon=False)
    _save(fig, "m2_01_风险等级分布.png")

    # 图2：分维度风险画像热力图（区域 × 维度平均"安全度"）
    dim_cols = [c for c in scores.columns if c.startswith("dim_")]
    heat = scores.groupby("region_name")[dim_cols].mean()
    heat.columns = [c.replace("dim_", "") for c in dim_cols]
    fig, ax = plt.subplots(figsize=(8.6, 4.2))
    im = ax.imshow(heat.values, cmap="RdYlGn", aspect="auto", vmin=30, vmax=80)
    ax.set_xticks(range(len(heat.columns))); ax.set_xticklabels(heat.columns)
    ax.set_yticks(range(len(heat.index))); ax.set_yticklabels(heat.index)
    for i in range(heat.shape[0]):
        for j in range(heat.shape[1]):
            ax.text(j, i, f"{heat.values[i, j]:.1f}", ha="center", va="center", fontsize=10)
    ax.set_title("图2-2 分维度安全度画像（0-100，越大越安全）", fontsize=13, pad=12)
    fig.colorbar(im, ax=ax, shrink=0.85)
    _save(fig, "m2_02_维度热力图.png")

    # 图3：风险得分分布（分区域箱线图）
    fig, ax = plt.subplots(figsize=(8.0, 4.8))
    data = [scores[scores.region_name == r]["risk_score"] for r in ["城市", "县城", "农村"]]
    bp = ax.boxplot(data, tick_labels=["城市", "县城", "农村"], patch_artist=True, widths=0.5)
    for patch, c in zip(bp["boxes"], PALETTE[:3]):
        patch.set_facecolor(c); patch.set_alpha(0.65)
    for th, lab, c in RISK_THRESHOLDS:
        ax.axhline(th, color=c, ls=":", lw=1.2)
        ax.text(3.42, th, lab, fontsize=8, color=c, va="center")
    ax.set_title("图2-3 机构综合风险得分分布", fontsize=13, pad=12)
    ax.set_ylabel("综合风险得分")
    _save(fig, "m2_03_风险得分箱线图.png")

    # 图4：熵权 Top10
    w = weights.sort_values(ascending=False).head(10)
    name_map = {code: name for code, name, *_ in [
        (c, n) for c, n, _d, _dir, _u in __import__("config").RISK_INDICATORS]}
    fig, ax = plt.subplots(figsize=(8.0, 5.2))
    ax.barh([name_map.get(i, i) for i in w.index][::-1], w.values[::-1], color=PALETTE[4])
    ax.set_title("图2-4 风险指标熵权 Top10", fontsize=13, pad=12)
    ax.set_xlabel("权重")
    _save(fig, "m2_04_熵权Top10.png")


# ===========================================================================
# 模型三图表
# ===========================================================================
def fig_m3(model3: dict):
    scores, coefs, report = model3["scores"], model3["coefficients"], model3["report"]
    fpr, tpr = model3["roc"]

    # 图1：ROC 曲线
    fig, ax = plt.subplots(figsize=(6.8, 6.0))
    ax.plot(fpr, tpr, color=PALETTE[0], lw=2.4,
            label=f"逻辑回归（AUC={report['test_auc']:.3f}）")
    ax.plot([0, 1], [0, 1], ls="--", color="#999", lw=1.2, label="随机基准 0.5")
    ax.fill_between(fpr, tpr, alpha=0.08, color=PALETTE[0])
    ax.set_xlabel("假阳性率 FPR"); ax.set_ylabel("真阳性率 TPR")
    ax.set_title("图3-1 模型三 ROC 曲线（测试集）", fontsize=13, pad=12)
    ax.legend(frameon=False, loc="lower right")
    _save(fig, "m3_01_ROC曲线.png")

    # 图2：特征重要性（标准化系数）
    top = coefs.head(12).iloc[::-1]
    colors = [PALETTE[3] if v > 0 else PALETTE[1] for v in top["coef"]]
    fig, ax = plt.subplots(figsize=(8.6, 6.0))
    ax.barh(top["含义"], top["coef"], color=colors)
    ax.axvline(0, color="#333", lw=0.8)
    ax.set_title("图3-2 风险因子排名（标准化系数，红=风险因子 绿=保护因子）",
                 fontsize=12.5, pad=12)
    ax.set_xlabel("逻辑回归标准化系数")
    _save(fig, "m3_02_风险因子排名.png")

    # 图3：预测概率分布（受害 vs 未受害）
    prob = np.load(RESULT_DIR / "_m3_proba.npy")
    y = scores["fraud_victim"].values
    fig, ax = plt.subplots(figsize=(8.4, 4.8))
    ax.hist(prob[y == 0], bins=32, alpha=0.7, color=PALETTE[1], label="未受害", density=True)
    ax.hist(prob[y == 1], bins=32, alpha=0.7, color=PALETTE[3], label="受害", density=True)
    ax.axvline(0.5, color="#555", ls="--", lw=1.2, label="0.5 参考线")
    ax.set_title("图3-3 个体受害概率分布（模型区分能力）", fontsize=13, pad=12)
    ax.set_xlabel("预测受害概率"); ax.set_ylabel("密度")
    ax.legend(frameon=False)
    _save(fig, "m3_03_概率分布.png")

    # 图4：预警人群构成
    band_order = ["绿色(低关注)", "黄色(一般关注)", "橙色(重点关注)", "红色(高警戒)"]
    band_colors = ["#2e9e5b", "#e8c93d", "#e88a3d", "#d64545"]
    dist = scores["warning_band"].value_counts().reindex(band_order, fill_value=0)
    fig, ax = plt.subplots(figsize=(8.0, 4.6))
    bars = ax.bar(range(4), dist.values, color=band_colors, width=0.58)
    for b, v in zip(bars, dist.values):
        ax.text(b.get_x() + b.get_width() / 2, v + 5, f"{v}\n({v/dist.sum():.0%})",
                ha="center", fontsize=10)
    ax.set_xticks(range(4)); ax.set_xticklabels(band_order)
    ax.set_title("图3-4 四级预警人群构成（n=1500）", fontsize=13, pad=12)
    ax.set_ylabel("人数")
    _save(fig, "m3_04_预警人群.png")


def render_all(model1, model2, model3, processed):
    print("[图表] 输出静态 PNG ...")
    fig_m1({**model1, "panel_norm": processed["gap_panel"]})
    fig_m2(model2)
    fig_m3(model3)
    print(f"[图表] 全部输出至 {FIG_DIR}")
