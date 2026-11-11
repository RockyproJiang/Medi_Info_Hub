// 校验 deploy/FIX-STEPS.md 里每一段 bash 代码块能否通过 bash 语法检查
// 用法： node scripts/check-manual.mjs
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MD = path.join(ROOT, 'deploy', 'FIX-STEPS.md')
const text = fs.readFileSync(MD, 'utf8')

const blocks = []
const re = /```bash\n([\s\S]*?)```/g
let m
while ((m = re.exec(text)) !== null) {
  const before = text.slice(0, m.index)
  const line = before.split('\n').length + 1
  // 引用块（> 开头）里的代码块，每行都带 "> " 前缀；用户从渲染后的页面复制时不会带上它，
  // 所以这里先剥掉再校验，否则会把「> sudo xxx」误判成重定向语法错。
  const quoted = />[ \t]*$/.test(before)
  let code = m[1]
  if (quoted) code = code.replace(/^> ?/gm, '')
  blocks.push({ line, code, quoted })
}

console.log(`扫描 ${path.basename(MD)}：找到 ${blocks.length} 段 bash\n`)

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yl-manual-'))
let bad = 0
for (const b of blocks) {
  const f = path.join(tmpDir, `block-${b.line}.sh`)
  fs.writeFileSync(f, b.code, 'utf8')
  // 转成 WSL 能读的路径
  const winPath = f.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, d) => `/mnt/${d.toLowerCase()}`)
  const tag = b.quoted ? '（引用块内）' : ''
  try {
    execFileSync('wsl', ['bash', '-n', winPath], { stdio: 'pipe' })
    console.log(`  [✓] 第 ${b.line} 行起的代码块${tag}：语法 OK`)
  } catch (e) {
    bad++
    const err = (e.stderr?.toString() || e.message || '').trim()
    console.log(`  [x] 第 ${b.line} 行起的代码块${tag}：语法错误`)
    console.log('      ' + err.split('\n').join('\n      '))
  }
}

fs.rmSync(tmpDir, { recursive: true, force: true })
console.log('')
if (bad === 0) {
  console.log(`全部 ${blocks.length} 段 bash 代码块语法通过，可以放心逐段复制粘贴。`)
} else {
  console.log(`有 ${bad} 段代码块语法有问题，需要修。`)
  process.exitCode = 1
}
