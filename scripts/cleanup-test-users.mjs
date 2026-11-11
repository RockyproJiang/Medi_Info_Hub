// 清理验证过程中创建的测试账号
import mysql from 'mysql2/promise'

const conn = await mysql.createConnection({
  host: '127.0.0.1',
  port: 3306,
  user: 'root',
  password: '1234',
  database: 'yinling_ark',
})

const [r] = await conn.query(
  "DELETE FROM users WHERE username LIKE 'ui\\_%' OR username LIKE 'probe\\_%'"
)
console.log('cleaned test users:', r.affectedRows)

const [users] = await conn.query('SELECT id, username, role FROM users ORDER BY id')
console.table(users)

for (const t of ['profiles', 'calc_records', 'favorites', 'risk_assessments', 'ai_conversations', 'ai_messages', 'user_notes', 'audit_logs']) {
  const [[{ c }]] = await conn.query(`SELECT COUNT(*) c FROM ${t}`)
  console.log(`${t}: ${c}`)
}

await conn.end()
