# -*- coding: utf-8 -*-
"""
多维度调研数据库（SQLite）建库与导入
====================================

将 data/raw/ 下 5 张表导入一个 SQLite 数据库，形成可追溯的
多维度调研数据库，供教学演示 SQL 查询与后续扩展：

    database/pension_finance_survey.db
    ├── dim_region            区域维表（城市/县城/农村）
    ├── fact_gap_panel        区域养老金融发展面板（2015-2025）
    ├── fact_banks            商业银行运营数据
    ├── fact_medical          医疗机构运营数据
    ├── fact_care_risk        医养融合机构风险数据
    └── fact_survey           老年群体需求问卷

每张事实表附带 record_id（可回溯到原始 CSV 行）与 data_source 字段。
"""

import sqlite3
from pathlib import Path

import pandas as pd

import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from config import DATA_RAW, DB_PATH, REGIONS, SEED
from src.data_generator import generate_all


SCHEMA = """
-- 区域维表
CREATE TABLE IF NOT EXISTS dim_region (
    region_id   TEXT PRIMARY KEY,
    region_name TEXT NOT NULL,
    tier        INTEGER NOT NULL
);
-- 区域养老金融发展面板（模型一）
CREATE TABLE IF NOT EXISTS fact_gap_panel (
    record_id   TEXT PRIMARY KEY,
    region_id   TEXT REFERENCES dim_region(region_id),
    year        INTEGER,
    acc_branch  REAL, acc_atm REAL, acc_mobile REAL,
    use_deposit REAL, use_insurance REAL, use_fund REAL, use_credit REAL,
    cov_pension REAL, cov_annuity REAL, cov_medical REAL,
    qua_complaint REAL, qua_satisfaction REAL,
    data_source TEXT
);
-- 商业银行运营（调研）
CREATE TABLE IF NOT EXISTS fact_banks (
    record_id TEXT PRIMARY KEY, region_id TEXT REFERENCES dim_region(region_id),
    institution_type TEXT, sample_year INTEGER, staff_count INTEGER,
    elder_customer_ratio REAL, agefriendly_score REAL, pension_products INTEGER,
    pension_deposit_wan REAL, annual_elder_visits_wan REAL,
    mobile_bank_open_ratio REAL, complaints_per_100 REAL,
    fraud_cases_reported INTEGER, data_source TEXT
);
-- 医疗机构运营（调研）
CREATE TABLE IF NOT EXISTS fact_medical (
    record_id TEXT PRIMARY KEY, region_id TEXT REFERENCES dim_region(region_id),
    level TEXT, sample_year INTEGER, bed_count INTEGER,
    elder_patient_ratio REAL, geriatric_dept INTEGER, rehab_beds INTEGER,
    avg_los_elder REAL, medical_insurance_ratio REAL,
    partners_care_home INTEGER, green_channel INTEGER, data_source TEXT
);
-- 医养融合机构风险（模型二）
CREATE TABLE IF NOT EXISTS fact_care_risk (
    record_id TEXT PRIMARY KEY, region_id TEXT REFERENCES dim_region(region_id),
    org_type TEXT, sample_year INTEGER, bed_count INTEGER,
    r_debt REAL, r_current REAL, r_interest REAL, r_bed REAL, r_occupancy REAL,
    r_payback REAL, r_receivable REAL, r_cashflow REAL, r_advance REAL,
    r_policy REAL, r_license REAL, r_insurance REAL, r_staff REAL,
    r_turnover REAL, r_incident REAL, data_source TEXT
);
-- 老年群体需求问卷（模型三）
CREATE TABLE IF NOT EXISTS fact_survey (
    record_id TEXT PRIMARY KEY, region_id TEXT REFERENCES dim_region(region_id),
    age INTEGER, female INTEGER, edu_years INTEGER, live_alone INTEGER,
    monthly_income REAL, fin_literacy REAL, health_score REAL,
    use_smartphone INTEGER, num_apps INTEGER, social_freq INTEGER,
    family_contact INTEGER, promo_exposure INTEGER, trust_high INTEGER,
    fraud_victim INTEGER, fraud_channel TEXT, loss_amount_wan REAL,
    reported INTEGER, demand_pension_product INTEGER, demand_medical_finance INTEGER,
    data_source TEXT
);
"""


def build_database(regenerate_raw: bool = False):
    """建库并导入 5 张事实表。

    regenerate_raw=True 时先用生成器重造原始数据（固定种子，结果一致）；
    默认直接读取 data/raw/ 现有 CSV（便于后续换成真实调研数据）。
    """
    if regenerate_raw:
        generate_all()

    tables = {name: pd.read_csv(DATA_RAW / f"{name}.csv", encoding="utf-8-sig")
              for name in ["gap_panel", "banks", "medical", "care_risk", "survey"]}

    if DB_PATH.exists():
        DB_PATH.unlink()               # 重建：保证数据库与 CSV 完全同步
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.executescript(SCHEMA)
        pd.DataFrame(REGIONS).to_sql("dim_region", conn, if_exists="replace", index=False)
        for name, df in tables.items():
            df.to_sql(f"fact_{name}", conn, if_exists="append", index=False)
        conn.commit()
    finally:
        conn.close()

    print(f"[数据库] 已生成 {DB_PATH.name}（{DB_PATH.stat().st_size/1024:.0f} KB）")
    return tables


if __name__ == "__main__":
    print("=" * 60)
    print("多维度调研数据库建库（SQLite），随机种子 =", SEED)
    print("=" * 60)
    build_database(regenerate_raw=False)
    # 演示一条教学用 SQL：分区域问卷受害率
    conn = sqlite3.connect(DB_PATH)
    demo = pd.read_sql_query(
        "SELECT r.region_name AS 区域, COUNT(*) AS 样本量, "
        "       ROUND(AVG(s.fraud_victim)*100,1) AS 受害比例 "
        "FROM fact_survey s JOIN dim_region r USING(region_id) "
        "GROUP BY r.region_id", conn)
    conn.close()
    print("\n示例查询（分区域金融诈骗受害比例）：")
    print(demo.to_string(index=False))
