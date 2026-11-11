# -*- coding: utf-8 -*-
"""
标准化数据处理流水线
====================

提供一套「原始数据 -> 清洗 -> 标准化 -> 特征」的标准流程，
所有模型共享同一份 processed 数据，保证口径一致。

流程步骤（与《数据处理流程说明》文档一一对应）::

    Step 1  读取原始 CSV（data/raw/*.csv）
    Step 2  结构校验：必填列检查、类型转换
    Step 3  清洗：缺失值填充（数值中位数 / 分类众数）、异常值 IQR 裁剪
    Step 4  标准化：
              - 面板指标 -> Z-score / MinMax（模型一用）
              - 风险指标 -> 按方向正向化 + MinMax 0-100（模型二用）
              - 问卷特征 -> 训练/测试划分 + StandardScaler（模型三用）
    Step 5  落盘 data/processed/*.csv，供模型与看板直接读取

用法::

    from src.data_pipeline import run_pipeline
    run_pipeline()          # 一键跑完，返回各表 DataFrame
"""

from pathlib import Path

import numpy as np
import pandas as pd

import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from config import DATA_PROCESSED, DATA_RAW, GAP_INDICATORS, RISK_INDICATORS

# 面板指标的方向字典：+1 正向 / -1 负向（用于标准化时统一方向）
GAP_DIRECTION = {code: (1 if d == "+" else -1) for code, _, _, d, _ in GAP_INDICATORS}
RISK_DIRECTION = {code: (1 if d == "+" else -1) for code, _, _, d, _ in RISK_INDICATORS}


# ---------------------------------------------------------------------------
# Step 1-3：读取 + 校验 + 清洗
# ---------------------------------------------------------------------------
def load_raw(name: str) -> pd.DataFrame:
    """读取一张原始表，带基本存在性校验。"""
    path = DATA_RAW / f"{name}.csv"
    if not path.exists():
        raise FileNotFoundError(f"原始数据缺失：{path}\n请先运行 python src/data_generator.py")
    return pd.read_csv(path, encoding="utf-8-sig")


def clean(df: pd.DataFrame, numeric_cols=None, iqr_clip=True) -> pd.DataFrame:
    """通用清洗：缺失填充 + IQR 异常值裁剪。

    * 数值列缺失 -> 中位数填充（对偏态分布稳健）；
    * 分类列缺失 -> 众数填充；
    * IQR 裁剪：超过 Q3+1.5*IQR / 低于 Q1-1.5*IQR 的值截断到边界
      （选截断而非删除，避免损失样本；教学中可对比两种做法）。
    """
    df = df.copy()
    if numeric_cols is None:
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    for col in numeric_cols:
        if df[col].isna().any():
            df[col] = df[col].fillna(df[col].median())
        if iqr_clip and df[col].nunique() > 5:      # 0/1 变量不做 IQR
            q1, q3 = df[col].quantile([0.25, 0.75])
            iqr = q3 - q1
            df[col] = df[col].clip(q1 - 1.5 * iqr, q3 + 1.5 * iqr)
    for col in df.select_dtypes(include=["object"]).columns:
        if df[col].isna().any():
            df[col] = df[col].fillna(df[col].mode().iloc[0])
    return df


# ---------------------------------------------------------------------------
# Step 4：标准化（各模型专用方法）
# ---------------------------------------------------------------------------
def minmax(df: pd.DataFrame, cols, directions=None, to_100=False) -> pd.DataFrame:
    """Min-Max 标准化，可按方向统一为"越大越好"。

    directions: {col: +1/-1}；负向指标先取相反数再做 MinMax，
    保证标准化后所有指标同方向可比（熵权法的前提）。
    """
    out = df.copy()
    for col in cols:
        x = out[col].astype(float)
        if directions and directions.get(col, 1) < 0:
            x = -x
        lo, hi = x.min(), x.max()
        v = (x - lo) / (hi - lo) if hi > lo else x * 0.0
        out[col + "_norm"] = (v * 100).round(4) if to_100 else v.round(6)
    return out


def zscore(df: pd.DataFrame, cols) -> pd.DataFrame:
    """Z-score 标准化（均值 0，方差 1），用于 Theil 指数等基于比率的计算。"""
    out = df.copy()
    for col in cols:
        mu, sd = out[col].mean(), out[col].std(ddof=0)
        out[col + "_z"] = ((out[col] - mu) / sd).round(6) if sd > 0 else 0.0
    return out


def entropy_weights(df: pd.DataFrame, norm_cols) -> pd.Series:
    """熵权法客观赋权（教学实现）。

    原理：某指标各样本取值差异越大 -> 信息熵越小 -> 提供信息越多 -> 权重越高。

        p_ij = x_ij / sum_i(x_ij)
        e_j  = -1/ln(n) * sum_i( p_ij * ln p_ij )
        w_j  = (1 - e_j) / sum_k(1 - e_k)

    要求输入列已 MinMax 正向化且非负。
    """
    X = df[norm_cols].astype(float).values
    X = X + 1e-9                                   # 防 log(0)
    P = X / X.sum(axis=0, keepdims=True)
    n = X.shape[0]
    E = -(P * np.log(P)).sum(axis=0) / np.log(n)   # 各指标信息熵
    d = 1 - E                                      # 差异系数（效用值）
    w = d / d.sum()
    return pd.Series(w, index=norm_cols, name="entropy_weight")


# ---------------------------------------------------------------------------
# Step 5：一键流水线
# ---------------------------------------------------------------------------
def run_pipeline():
    """执行全流程，返回 dict[name -> DataFrame]，并落盘 processed CSV。"""
    print("[流水线] Step1-2 读取并校验原始数据 ...")
    gap_panel = load_raw("gap_panel")
    banks = load_raw("banks")
    medical = load_raw("medical")
    care = load_raw("care_risk")
    survey = load_raw("survey")

    print("[流水线] Step3 清洗（缺失填充 + IQR 裁剪）...")
    gap_panel = clean(gap_panel, [c for c, *_ in GAP_INDICATORS])
    banks = clean(banks)
    medical = clean(medical)
    care = clean(care, [c for c, *_ in RISK_INDICATORS])
    survey = clean(survey, ["age", "edu_years", "monthly_income", "fin_literacy",
                            "health_score", "num_apps", "social_freq",
                            "family_contact", "promo_exposure"], iqr_clip=False)

    print("[流水线] Step4 标准化 ...")
    gap_cols = [c for c, *_ in GAP_INDICATORS]
    gap_panel = minmax(gap_panel, gap_cols, GAP_DIRECTION, to_100=True)
    risk_cols = [c for c, *_ in RISK_INDICATORS]
    care = minmax(care, risk_cols, RISK_DIRECTION, to_100=True)

    print("[流水线] Step5 落盘 processed ...")
    for name, df in [("gap_panel", gap_panel), ("banks", banks), ("medical", medical),
                     ("care_risk", care), ("survey", survey)]:
        df.to_csv(DATA_PROCESSED / f"{name}.csv", index=False, encoding="utf-8-sig")

    print("[流水线] 完成。")
    return {"gap_panel": gap_panel, "banks": banks, "medical": medical,
            "care_risk": care, "survey": survey}


if __name__ == "__main__":
    run_pipeline()
