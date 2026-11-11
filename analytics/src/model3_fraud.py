# -*- coding: utf-8 -*-
"""
模型三：老年金融诈骗预警模型
====================================

目标：基于老年群体问卷数据，识别金融诈骗受害的高风险人群，
输出可解释的个体风险概率与预警评分卡，支撑"事前预警"而非事后统计。

方法体系：

1. 逻辑回归（Logistic Regression）
   - 二分类因变量 fraud_victim（是否受害）；
   - 系数即"风险因子/保护因子"的方向与强度，可解释性强（科研+监管友好）；
2. 5 折交叉验证 + 分层抽样：报告 AUC、准确率、召回率，防过拟合；
3. ROC 曲线 + 混淆矩阵：选择约登指数最优阈值；
4. 特征重要性（标准化系数绝对值）→ 风险因子排名；
5. 预警评分卡：把逻辑回归系数转换为 0-100 的记分卡（教学经典转换：
   score = offset + factor * ln(odds)，各特征按分箱贡献取整）；
6. 人群分层预警：按预测概率划分 绿/黄/橙/红 四级预警人群。

输出：
    output/results/m3_model_report.json     模型指标
    output/results/m3_coefficients.csv      系数表（含 OR 值）
    output/results/m3_risk_scores.csv       个体风险概率与预警等级
    output/results/m3_scorecard.csv         评分卡
    output/figures/m3_*.png
"""

import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (accuracy_score, confusion_matrix, recall_score,
                             roc_auc_score, roc_curve)
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.preprocessing import StandardScaler

import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from config import FIG_DIR, FRAUD_FEATURES, REGION_NAMES, RESULT_DIR, SEED

FEATURES = [f for f, _, _ in FRAUD_FEATURES]


def _risk_band(p: float) -> str:
    """按预测受害概率划分四级预警人群。"""
    if p < 0.20:
        return "绿色(低关注)"
    if p < 0.40:
        return "黄色(一般关注)"
    if p < 0.60:
        return "橙色(重点关注)"
    return "红色(高警戒)"


def run_model3(processed: dict):
    df = processed["survey"].copy()
    df["region_name"] = df["region_id"].map(REGION_NAMES)
    X = df[FEATURES].astype(float).values
    y = df["fraud_victim"].values

    # ---- 1. 训练/测试划分（分层，保持正负比例）----
    X_train, X_test, y_train, y_test, idx_train, idx_test = train_test_split(
        X, y, np.arange(len(y)), test_size=0.25, stratify=y, random_state=SEED)

    # ---- 2. 标准化（逻辑回归要求特征量纲一致，系数才可比）----
    scaler = StandardScaler().fit(X_train)
    Xtr, Xte = scaler.transform(X_train), scaler.transform(X_test)

    # ---- 3. 模型训练与交叉验证 ----
    clf = LogisticRegression(max_iter=2000, C=1.0, random_state=SEED)
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=SEED)
    cv_auc = cross_val_score(clf, Xtr, y_train, cv=cv, scoring="roc_auc")
    clf.fit(Xtr, y_train)

    prob_test = clf.predict_proba(Xte)[:, 1]
    auc_test = roc_auc_score(y_test, prob_test)

    # ---- 4. 约登指数选最优阈值 ----
    fpr, tpr, thr = roc_curve(y_test, prob_test)
    j = tpr - fpr
    best_i = int(np.argmax(j))
    best_thr = float(thr[best_i])
    pred = (prob_test >= best_thr).astype(int)
    cm = confusion_matrix(y_test, pred)
    report = {
        "cv_auc_mean": round(float(cv_auc.mean()), 4),
        "cv_auc_std": round(float(cv_auc.std()), 4),
        "test_auc": round(float(auc_test), 4),
        "test_accuracy": round(float(accuracy_score(y_test, pred)), 4),
        "test_recall": round(float(recall_score(y_test, pred)), 4),
        "best_threshold": round(best_thr, 4),
        "confusion_matrix": cm.tolist(),
        "n_train": int(len(y_train)), "n_test": int(len(y_test)),
        "victim_rate": round(float(y.mean()), 4),
    }

    # ---- 5. 系数表（含 OR 值）----
    coefs = pd.DataFrame({
        "feature": FEATURES,
        "含义": [n for _, n, _ in FRAUD_FEATURES],
        "coef": clf.coef_[0].round(4),
        "OR": np.exp(clf.coef_[0]).round(4),       # 优势比：>1 风险因子，<1 保护因子
        "abs_importance": np.abs(clf.coef_[0]).round(4),
    }).sort_values("abs_importance", ascending=False)
    coefs.to_csv(RESULT_DIR / "m3_coefficients.csv", index=False, encoding="utf-8-sig")

    # ---- 6. 全样本个体风险评分 ----
    prob_all = clf.predict_proba(scaler.transform(X))[:, 1]
    score_out = df[["record_id", "region_id", "region_name", "age", "fraud_victim"]].copy()
    score_out["fraud_prob"] = prob_all.round(4)
    score_out["warning_band"] = [_risk_band(p) for p in prob_all]
    score_out.to_csv(RESULT_DIR / "m3_risk_scores.csv", index=False, encoding="utf-8-sig")

    # ---- 7. 预警评分卡（经典 log-odds 记分卡转换，教学演示）----
    # score_j = factor * beta_j * (x_j - ref_j)；base 分对齐到 600 分 / PDO=50
    PDO, BASE = 50.0, 600.0
    factor = PDO / np.log(2)
    offset = BASE - factor * np.log(20)            # 好:坏 = 20:1 时 600 分
    Xs = scaler.transform(X)
    contrib = clf.coef_[0] * Xs                    # 每特征 log-odds 贡献
    scorecard = pd.DataFrame({
        "feature": FEATURES,
        "含义": [n for _, n, _ in FRAUD_FEATURES],
        "min_contribution": contrib.min(axis=0).round(3),
        "max_contribution": contrib.max(axis=0).round(3),
        "score_range": ((contrib.max(axis=0) - contrib.min(axis=0)) * factor).round(0),
    }).sort_values("score_range", ascending=False)
    scorecard.to_csv(RESULT_DIR / "m3_scorecard.csv", index=False, encoding="utf-8-sig")

    (RESULT_DIR / "m3_model_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    # 保存预测对象供图表使用
    np.save(RESULT_DIR / "_m3_roc.npy", np.vstack([fpr, tpr]))
    np.save(RESULT_DIR / "_m3_proba.npy", prob_all)
    np.save(RESULT_DIR / "_m3_ytest.npy", y_test)

    print("\n========== 模型三：老年金融诈骗预警 ==========")
    print(f"样本 {len(df)} 份，受害率 {report['victim_rate']*100:.1f}%")
    print(f"5折交叉验证 AUC = {report['cv_auc_mean']} ± {report['cv_auc_std']}")
    print(f"测试集 AUC = {report['test_auc']}，准确率 = {report['test_accuracy']}，"
          f"召回率 = {report['test_recall']}（阈值 {report['best_threshold']}）")
    print("\n风险因子排名（OR 值 Top6）：")
    print(coefs.head(6)[["含义", "coef", "OR"]].to_string(index=False))
    band_dist = score_out["warning_band"].value_counts()
    print("\n预警人群分布：")
    print(band_dist.to_string())

    return {"report": report, "coefficients": coefs, "scores": score_out,
            "scorecard": scorecard, "roc": (fpr, tpr)}


if __name__ == "__main__":
    from src.data_pipeline import run_pipeline
    run_model3(run_pipeline())
