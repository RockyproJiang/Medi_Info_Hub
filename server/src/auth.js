import crypto from 'node:crypto'

const SECRET = process.env.AUTH_SECRET || 'yinling-ark-dev-secret-2025'
const TOKEN_TTL = 1000 * 60 * 60 * 24 * 7

export function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, s, 32).toString('hex')
  return `${s}:${hash}`
}

export function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false
  const [salt, hash] = stored.split(':')
  const test = crypto.scryptSync(password, salt, 32).toString('hex')
  const a = Buffer.from(hash, 'hex')
  const b = Buffer.from(test, 'hex')
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64url(str) {
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

export function signToken(payload) {
  const body = b64url(JSON.stringify({ ...payload, exp: Date.now() + TOKEN_TTL }))
  const sig = b64url(crypto.createHmac('sha256', SECRET).update(body).digest())
  return `${body}.${sig}`
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null
  const [body, sig] = token.split('.')
  const expect = b64url(crypto.createHmac('sha256', SECRET).update(body).digest())
  if (sig !== expect) return null
  try {
    const data = JSON.parse(fromB64url(body).toString('utf8'))
    if (!data.exp || data.exp < Date.now()) return null
    return data
  } catch {
    return null
  }
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  const data = verifyToken(token)
  if (data) {
    req.user = { id: data.uid, username: data.username, role: data.role }
  }
  next()
}

export function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: '请先登录后再进行该操作' })
  next()
}

export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: '请先登录' })
  if (req.user.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' })
  next()
}
