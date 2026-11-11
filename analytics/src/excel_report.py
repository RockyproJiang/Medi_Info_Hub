# -*- coding: utf-8 -*-
"""
Excel 分析报表输出（openpyxl 多工作表 + 格式美化）
==================================================

产出一份《养老金融量化分析工具包.xlsx》，含 9 个工作表：

    01_说明            工具包说明与模型导航
    02_发展指数        模型一：三区域历年熵权-TOPSIS 发展指数
    03_差异测度        模型一：CV、Theil 分解、σ收敛结论
    04_指标权重        模型一/二熵权汇总
    05_机构风险得分    模型二：机构级风险得分与四级评级
    06_风险区域汇总    模型二：分区域风险概况
    07_预警模型指标    模型三：AUC/准确率/召回率/混淆矩阵
    08_风险因子        模型三：系数、OR 值与重要性排名
    09_评分卡          模型三：0-100 预警评分卡
    10_原始数据索引    各原始表的行列规模与字段说明（数据字典摘要）

样式：统一表头深蓝底白字、隔行浅灰、边框、列宽自适应、数字格式。
"""

from pathlib import Path

import pandas as pd
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from config import EXCEL_DIR, RESULT_DIR

HEADER_FILL = PatternFill("solid", fgColor="3F4E7A")
BAND_FILL = PatternFill("solid", fgColor="EEF1F8")
THIN = Side(style="thin", color="C9CFDF")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)


def _write_sheet(ws, df: pd.DataFrame, title: str = None, note: str = None):
    """把 DataFrame 写入工作表并套用统一样式。"""
    r = 1
    if title:
        ws.cell(r, 1, title).font = Font(size=13, bold=True, color="2B3A67")
        r += 1
    if note:
        ws.cell(r, 1, note).font = Font(size=9, italic=True, color="777777")
        r += 1
    r += (title is not None) + (note is not None) - ((title is None) and (note is None))
    header_row = r
    for j, col in enumerate(df.columns, 1):
        c = ws.cell(header_row, j, str(col))
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = HEADER_FILL
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.border = BORDER
    for i, (_, row) in enumerate(df.iterrows(), 1):
        for j, v in enumerate(row, 1):
            c = ws.cell(header_row + i, j, v if not pd.isna(v) else "")
            c.border = BORDER
            if i % 2 == 0:
                c.fill = BAND_FILL
            if isinstance(v, float):
                c.number_format = "0.0000" if abs(v) < 10 else "0.00"
    # 列宽自适应（中文按 2 字符宽度估算）
    for j, col in enumerate(df.columns, 1):
        width = max(
            [sum(2 if ord(ch) > 127 else 1 for ch in str(s)) for s in
             [col] + df[col].astype(str).head(50).tolist()])
        ws.column_dimensions[get_column_letter(j)].width = min(max(width + 2, 8), 42)
    ws.freeze_panes = ws.cell(header_row + 1, 1)


def export_excel(model1, model2, model3):
    """汇总三套模型结果，输出 Excel 报表。"""
    path = EXCEL_DIR / "养老金融量化分析工具包.xlsx"

    # ---- 组装各工作表数据 ----
    sheets = []

    sheets.append(("01_说明", pd.DataFrame({
        "项目": ["工具包名称", "版本", "生成方式", "模型一", "模型二", "模型三",
                "数据状态", "复现方式"],
        "内容": ["城乡养老金融量化分析工具包（医讯通）", "v1.0",
                "python run_all.py 一键生成（随机种子=42，可复现）",
                "熵权-TOPSIS + 变异系数 + Theil分解 + σ收敛",
                "熵权法 + TOPSIS + 灰色关联 + 四级风险分级 + 敏感性分析",
                "逻辑回归 + 5折交叉验证 + ROC/约登阈值 + 预警评分卡",
                "预设数据（模拟调研）。真实调研数据到位后替换 data/raw/ 下 CSV 重跑即可",
                "见 analytics/README.md《快速开始》"],
    })))

    idx = model1["index"].copy()
    idx.columns = ["region_id", "年份", "发展指数", "区域"]
    sheets.append(("02_发展指数", idx[["区域", "年份", "发展指数"]]))

    cv = model1["cv"].copy()
    cv.columns = ["年份", "变异系数CV", "城市指数", "县城指数", "农村指数"]
    theil = pd.read_csv(RESULT_DIR / "m1_theil.csv")
    conv = model1["convergence"]
    cv_note = pd.DataFrame({
        "项目": ["Theil总指数", "组间贡献占比", "组内贡献占比",
                "σ收敛相关系数", "收敛结论"],
        "数值": [theil["theil_total"].iloc[0], theil["between_share"].iloc[0],
                theil["within_share"].iloc[0], conv["pearson_r"], conv["conclusion"]],
    })
    sheets.append(("03_差异测度", cv))
    sheets.append(("03b_差异测度结论", cv_note))

    w1 = model1["weights"].rename("模型一权重").round(4)
    w2 = model2["weights"].rename("模型二权重").round(4)
    weights = pd.concat([w1, w2], axis=1)
    weights.index.name = "指标代码"
    sheets.append(("04_指标权重", weights.reset_index()))

    scores = model2["scores"].copy()
    dim_cols = [c for c in scores.columns if c.startswith("dim_")]
    sheets.append(("05_机构风险得分",
                   scores[["record_id", "region_name", "org_type", "bed_count",
                           "risk_score", "risk_level"] + dim_cols]))
    sheets.append(("06_风险区域汇总", model2["region_summary"]))

    rep = model3["report"]
    rep_df = pd.DataFrame({
        "指标": ["交叉验证AUC(均值)", "交叉验证AUC(标准差)", "测试集AUC", "测试集准确率",
                "测试集召回率", "最优阈值(约登指数)", "训练样本量", "测试样本量",
                "总体受害率", "混淆矩阵[[TN,FP],[FN,TP]]"],
        "数值": [rep["cv_auc_mean"], rep["cv_auc_std"], rep["test_auc"],
                rep["test_accuracy"], rep["test_recall"], rep["best_threshold"],
                rep["n_train"], rep["n_test"], rep["victim_rate"],
                str(rep["confusion_matrix"])]})
    sheets.append(("07_预警模型指标", rep_df))

    coefs = model3["coefficients"].rename(columns={
        "feature": "特征代码", "coef": "标准化系数", "abs_importance": "重要性(绝对值)"})
    sheets.append(("08_风险因子", coefs))
    sheets.append(("09_评分卡", model3["scorecard"].rename(columns={"feature": "特征代码"})))

    # ---- 写入工作簿 ----
    with pd.ExcelWriter(path, engine="openpyxl") as writer:
        for name, df in sheets:
            df.to_excel(writer, sheet_name=name[:31], index=False, startrow=1)
            ws = writer.sheets[name[:31]]
            ws.cell(1, 1, name).font = Font(size=12, bold=True, color="2B3A67")
            for j, col in enumerate(df.columns, 1):
                c = ws.cell(2, j, str(col))
                c.font = Font(bold=True, color="FFFFFF")
                c.fill = HEADER_FILL
                c.alignment = Alignment(horizontal="center", vertical="center")
                c.border = BORDER
                width = max([sum(2 if ord(ch) > 127 else 1 for ch in str(s)) for s in
                             [col] + df[col].astype(str).head(40).tolist()])
                ws.column_dimensions[get_column_letter(j)].width = min(max(width + 2, 8), 44)
            for i in range(len(df)):
                for j in range(1, len(df.columns) + 1):
                    c = ws.cell(3 + i, j)
                    c.border = BORDER
                    if i % 2 == 1:
                        c.fill = BAND_FILL

    print(f"[Excel] 已生成 {path.name}（{len(sheets)} 个工作表，"
          f"{path.stat().st_size/1024:.0f} KB）")
    return path


if __name__ == "__main__":
    from src.data_pipeline import run_pipeline
    from src.model1_gap import run_model1
    from src.model2_risk import run_model2
    from src.model3_fraud import run_model3
    p = run_pipeline()
    export_excel(run_model1(p), run_model2(p), run_model3(p))
