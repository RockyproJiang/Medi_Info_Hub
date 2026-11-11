import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '../data')
fs.mkdirSync(DATA_DIR, { recursive: true })

const dbFile = process.env.DB_PATH || path.join(DATA_DIR, 'yinling.db')
export const db = new DatabaseSync(dbFile)

db.exec('PRAGMA journal_mode = WAL')
db.exec('PRAGMA foreign_keys = ON')

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  display_name TEXT,
  phone TEXT,
  created_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  gender TEXT,
  birth_month TEXT,
  job_type TEXT,
  monthly_income REAL,
  monthly_expense REAL,
  expected_life INTEGER,
  risk_level TEXT,
  city TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS policies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  issuer TEXT,
  doc_no TEXT,
  publish_date TEXT,
  effective_date TEXT,
  level TEXT,
  region TEXT,
  category TEXT,
  summary TEXT,
  highlights TEXT,
  body TEXT,
  source_url TEXT,
  source_name TEXT,
  tags TEXT,
  featured INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  category TEXT,
  summary TEXT,
  body TEXT,
  read_minutes INTEGER,
  tags TEXT,
  source_name TEXT,
  source_url TEXT,
  featured INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT,
  issuer TEXT,
  term_years TEXT,
  yield_low REAL,
  yield_high REAL,
  yield_type TEXT,
  risk_level TEXT,
  min_amount TEXT,
  liquidity TEXT,
  tax_eligible INTEGER DEFAULT 0,
  guaranteed INTEGER DEFAULT 0,
  suitable_for TEXT,
  highlights TEXT,
  notes TEXT,
  is_demo INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  label TEXT,
  unit TEXT,
  period TEXT,
  source TEXT,
  payload TEXT
);

CREATE TABLE IF NOT EXISTS glossary (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  term TEXT NOT NULL UNIQUE,
  alias TEXT,
  definition TEXT,
  category TEXT
);

CREATE TABLE IF NOT EXISTS faqs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category TEXT,
  sort INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, item_type, item_id)
);

CREATE TABLE IF NOT EXISTS calc_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  calc_type TEXT NOT NULL,
  title TEXT,
  payload TEXT,
  result TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS risk_assessments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score INTEGER,
  level TEXT,
  answers TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  title TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  refs TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT,
  target TEXT,
  detail TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS care_services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  service_type TEXT,
  care_level TEXT,
  city_tier TEXT,
  monthly_cost_low INTEGER,
  monthly_cost_high INTEGER,
  coverage TEXT,
  highlights TEXT,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_articles_cat ON articles(category);
CREATE INDEX IF NOT EXISTS idx_policies_level ON policies(level);
CREATE INDEX IF NOT EXISTS idx_products_cat ON products(category);
CREATE INDEX IF NOT EXISTS idx_msgs_conv ON ai_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_calc_user ON calc_records(user_id);
`

db.exec(SCHEMA)

export function parseJSON(v, fallback) {
  if (v === null || v === undefined || v === '') return fallback
  if (typeof v === 'object') return v
  try {
    return JSON.parse(v)
  } catch {
    return fallback
  }
}

export function rowToPolicy(r) {
  if (!r) return null
  return {
    ...r,
    highlights: parseJSON(r.highlights, []),
    tags: parseJSON(r.tags, []),
    featured: !!r.featured,
  }
}

export function rowToArticle(r) {
  if (!r) return null
  return {
    ...r,
    tags: parseJSON(r.tags, []),
    featured: !!r.featured,
  }
}

export function rowToProduct(r) {
  if (!r) return null
  return {
    ...r,
    highlights: parseJSON(r.highlights, []),
    tax_eligible: !!r.tax_eligible,
    guaranteed: !!r.guaranteed,
    is_demo: !!r.is_demo,
  }
}

export function rowToCareService(r) {
  if (!r) return null
  return { ...r, highlights: parseJSON(r.highlights, []) }
}

export function count(table) {
  const r = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get()
  return r ? r.c : 0
}
