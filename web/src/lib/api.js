const BASE = '/api'

async function request(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  const t = token ?? localStorage.getItem('yl_token')
  if (t) headers.Authorization = `Bearer ${t}`
  const resp = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  let json = null
  try {
    json = await resp.json()
  } catch {
    throw new Error('服务器返回了无法解析的内容')
  }
  if (!resp.ok || json?.ok === false) {
    throw new Error(json?.error || `请求失败（${resp.status}）`)
  }
  return json.data
}

export const api = {
  get: (p) => request(p),
  post: (p, body) => request(p, { method: 'POST', body }),
  put: (p, body) => request(p, { method: 'PUT', body }),
  del: (p) => request(p, { method: 'DELETE' }),
}

/* ---------- 会话 ---------- */

export function saveSession(token, user) {
  localStorage.setItem('yl_token', token)
  localStorage.setItem('yl_user', JSON.stringify(user))
  window.dispatchEvent(new Event('yl-auth'))
}

export function clearSession() {
  localStorage.removeItem('yl_token')
  localStorage.removeItem('yl_user')
  window.dispatchEvent(new Event('yl-auth'))
}

export function currentUser() {
  try {
    return JSON.parse(localStorage.getItem('yl_user') || 'null')
  } catch {
    return null
  }
}

export function isLoggedIn() {
  return !!localStorage.getItem('yl_token')
}

/* ---------- 格式化 ---------- */

export function money(n, digits = 0) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—'
  return Number(n).toLocaleString('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export function wan(n) {
  if (n === null || n === undefined) return '—'
  const v = Number(n)
  if (Math.abs(v) >= 100000000) return `${(v / 100000000).toFixed(2)}亿`
  if (Math.abs(v) >= 10000) return `${(v / 10000).toFixed(1)}万`
  return money(v)
}

export function pct(n, digits = 1) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—'
  return `${Number(n).toFixed(digits)}%`
}

export function dateText(s) {
  if (!s) return ''
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}
