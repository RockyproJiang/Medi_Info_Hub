# -*- coding: utf-8 -*-
"""
交互式看板数据导出
==================

把三套模型的结果压缩成一个 JS 数据文件 dashboard/data.js，
供 ECharts 交互看板（dashboard/index.html）使用：

    window.DASH = { meta, model1: {...}, model2: {...}, model3: {...} }

看板端交互能力（不依赖任何后端）：
* 模型一：年份滑块 + 区域勾选 + 指标雷达切换
* 模型二：风险维度权重滑杆（实时重算机构风险得分并重排序）
* 模型三：输入个体特征 -> 前端用导出的逻辑回归系数实时算受害概率
"""

import json
from pathlib import Path

import numpy as np
import pandas as pd

import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from config import (BASE_DIR, DASH_DIR, GAP_INDICATORS, RESULT_DIR,
                    RISK_INDICATORS, RISK_THRESHOLDS)
from src.model1_gap import GAP_COLS
from src.model2_risk import DIMENSIONS, composite_score

FEATURE_COEF_JSON = RESULT_DIR / "_m3_dashboard_coef.json"


def export_dashboard(model1, model2, model3, processed):
    panel = processed["gap_panel"]
    survey = processed["survey"]

    # ---------- 模型一 ----------
    m1_index = model1["index"].assign(
        region=lambda d: d["region_name"])[["region", "year", "development_index"]]
    m1_weights = {code: round(float(model1["weights"][code]), 4) for code in GAP_COLS}
    m1_radar = {}
    for rid in ["C", "X", "R"]:
        sub = panel[panel.region_id == rid].sort_values("year")
        m1_radar[rid] = {
            "years": sub["year"].tolist(),
            "values": {c: [round(float(v), 2) for v in sub[f"{c}_norm"]] for c in GAP_COLS},
        }
    model1_data = {
        "years": sorted(panel["year"].unique().tolist()),
        "regions": ["城市", "县城", "农村"],
        "index": m1_index.to_dict(orient="records"),
        "cv": model1["cv"][["year", "cv"]].to_dict(orient="records"),
        "weights": m1_weights,
        "indicators": [{"code": c, "name": n, "dim": d} for c, n, d, _dir, _u in GAP_INDICATORS],
        "radar": m1_radar,
        "theil": pd.read_csv(RESULT_DIR / "m1_theil.csv").to_dict(orient="records"),
        "theilByRegion": pd.read_csv(RESULT_DIR / "m1_theil_by_region.csv").to_dict(orient="records"),
    }

    # ---------- 模型二 ----------
    df = processed["care_risk"]
    base_w = model2["weights"]
    scores_df = model2["scores"]

    def _norm_col(key):
        """兼容权重索引为原始代码或 *_norm 列名两种情况。"""
        return key if key.endswith("_norm") else key + "_norm"

    raw = {key.replace("_norm", ""): [round(float(v), 2) for v in df[_norm_col(key)]]
           for key in base_w.index}

    model2_data = {
        "indicators": [{"code": c, "name": n, "dim": d} for c, n, d, _dir, _u in RISK_INDICATORS],
        "weights": {c: round(float(base_w[c]), 4) for c in base_w.index},
        "thresholds": [{"threshold": th, "label": lab} for th, lab, _c in RISK_THRESHOLDS],
        "institutions": scores_df[["record_id", "region_name", "org_type",
                                   "risk_score", "risk_level"] + [f"dim_{d}" for d in DIMENSIONS]].to_dict(orient="records"),
        "regionSummary": model2["region_summary"].to_dict(orient="records"),
        # 为看板实时重算准备：每家机构的正向化指标（0-100，与离线模型输入一致），
        # 键统一为原始指标代码
        "raw": raw,
        "ids": scores_df["record_id"].tolist(),
    }

    # ---------- 模型三 ----------
    from sklearn.linear_model import LogisticRegression
    from sklearn.preprocessing import StandardScaler
    from config import FRAUD_FEATURES, SEED
    feats = [f for f, _, _ in FRAUD_FEATURES]
    X = survey[feats].astype(float).values
    y = survey["fraud_victim"].values
    scaler = StandardScaler().fit(X)
    clf = LogisticRegression(max_iter=2000, random_state=SEED).fit(scaler.transform(X), y)
    coef_payload = {
        "features": feats,
        "means": [round(float(m), 4) for m in scaler.mean_],
        "scales": [round(float(s), 4) for s in scaler.scale_],
        "coef": [round(float(c), 4) for c in clf.coef_[0]],
        "intercept": round(float(clf.intercept_[0]), 4),
        "labels": [n for _, n, _ in FRAUD_FEATURES],
        "report": model3["report"],
    }
    FEATURE_COEF_JSON.write_text(json.dumps(coef_payload, ensure_ascii=False), encoding="utf-8")

    model3_data = {
        "report": model3["report"],
        "coefficients": model3["coefficients"][["feature", "含义", "coef", "OR"]].to_dict(orient="records"),
        "bands": model3["scores"]["warning_band"].value_counts().to_dict(),
        "regionRisk": (model3["scores"].groupby("region_name")["fraud_prob"]
                       .mean().round(4).to_dict()),
        "channels": processed["survey"].groupby("fraud_channel")["fraud_victim"].agg(["size", "mean"]).reset_index().rename(columns={"size": "n", "mean": "rate"}).to_dict(orient="records"),
        "roc": _load_roc(),                       # ROC 曲线点（fpr/tpr 数组）
        "coefForClient": coef_payload,
    }

    payload = {
        "meta": {"title": "养老金融量化分析", "updated": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M"),
                 "source": "预设数据（模拟调研）", "seed": 42},
        "model1": model1_data, "model2": model2_data, "model3": model3_data,
    }
    out = DASH_DIR / "data.js"
    out.write_text("window.DASH = " + json.dumps(payload, ensure_ascii=False) + ";", encoding="utf-8")
    print(f"[看板] 已导出 {out.name}（{out.stat().st_size/1024:.0f} KB）")

    # 同步导出一份 JSON 给医讯通 Web 端（/api/analytics 端点读取）
    web_json = BASE_DIR.parent / "server" / "data" / "analytics_export.json"
    web_json.parent.mkdir(parents=True, exist_ok=True)
    web_json.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    print(f"[Web]   已导出 {web_json}（{web_json.stat().st_size/1024:.0f} KB）→ /api/analytics")


def _load_roc():
    """读取 model3 保存的 ROC 点；缺失时返回 None（前端退化为展示 AUC）。"""
    p = RESULT_DIR / "_m3_roc.npy"
    if p.exists():
        arr = np.load(p)
        return {"fpr": [round(float(v), 4) for v in arr[0]],
                "tpr": [round(float(v), 4) for v in arr[1]]}
    return None


if __name__ == "__main__":
    from src.data_pipeline import run_pipeline
    from src.model1_gap import run_model1
    from src.model2_risk import run_model2
    from src.model3_fraud import run_model3
    p = run_pipeline()
    export_dashboard(run_model1(p), run_model2(p), run_model3(p), p)
