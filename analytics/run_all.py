# -*- coding: utf-8 -*-
"""
养老金融量化分析工具包 —— 一键运行入口
======================================

完整执行顺序（每步都打印进度）：

    [1/6] 预设调研数据生成        src/data_generator.py
    [2/6] 标准化数据处理流水线    src/data_pipeline.py
    [3/6] SQLite 调研数据库建库   src/database.py
    [4/6] 模型一/二/三 计算        src/model{1,2,3}_*.py
    [5/6] 静态图表 + Excel 报表   src/figures.py / excel_report.py
    [6/6] 交互看板数据导出        src/dashboard_export.py

用法::

    python run_all.py

产物清单见 README.md《产物一览》。
"""

from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

from src import database
from src.data_generator import generate_all
from src.data_pipeline import run_pipeline
from src.dashboard_export import export_dashboard
from src.excel_report import export_excel
from src.figures import render_all
from src.model1_gap import run_model1
from src.model2_risk import run_model2
from src.model3_fraud import run_model3


def main():
    print("#" * 64)
    print("#  医讯通 · 城乡养老金融量化分析工具包  (随机种子=42, 全流程可复现)")
    print("#" * 64)

    print("\n[1/6] 生成预设调研数据 ...")
    generate_all()

    print("\n[2/6] 标准化数据处理流水线 ...")
    processed = run_pipeline()

    print("\n[3/6] 构建 SQLite 多维度调研数据库 ...")
    database.build_database(regenerate_raw=False)

    print("\n[4/6] 运行三套量化模型 ...")
    m1 = run_model1(processed)
    m2 = run_model2(processed)
    m3 = run_model3(processed)

    print("\n[5/6] 输出图表与 Excel 报表 ...")
    render_all(m1, m2, m3, processed)
    export_excel(m1, m2, m3)

    print("\n[6/6] 导出交互看板数据 ...")
    export_dashboard(m1, m2, m3, processed)

    print("\n" + "=" * 64)
    print("全部完成！产物位置：")
    print("  图表        analytics/output/figures/   （12 张 PNG）")
    print("  Excel 报表  analytics/output/excel/养老金融量化分析工具包.xlsx")
    print("  模型结果    analytics/output/results/   （CSV/JSON）")
    print("  调研数据库  analytics/database/pension_finance_survey.db")
    print("  交互看板    analytics/dashboard/index.html  （双击打开）")
    print("=" * 64)


if __name__ == "__main__":
    main()
