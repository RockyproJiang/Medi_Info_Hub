#!/usr/bin/env node
/**
 * 医讯通 Nginx 补丁脚本
 *
 * 作用：自动找到「监听 89 端口」的那个 nginx 配置文件（可能是
 *       /etc/nginx/nginx.conf，也可能是 /etc/nginx/sites-enabled/xxx 或
 *       /etc/nginx/conf.d/xxx.conf），只在该 server 块里插入 /api/ 反向代理。
 *       不会动其他任何站点。
 *
 * 用法（需要 root）：
 *   sudo node deploy/patch-nginx.mjs              # 应用补丁
 *   sudo node deploy/patch-nginx.mjs --dry-run    # 只打印，不写入
 *   sudo node deploy/patch-nginx.mjs --revert     # 从最近备份还原
 *
 * 修改前自动备份为 <文件>.bak.<时间戳>
 */
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const PORT = 89
const UPSTREAM = '127.0.0.1:8787'
const NGINX_DIR = process.env.NGINX_DIR || '/etc/nginx'

const args = process.argv.slice(2)
const DRY = args.includes('--dry-run')
const REVERT = args.includes('--revert')
const NO_TEST = args.includes('--no-test')

const log = (m = '') => console.log(m)
const fail = (m) => {
  console.error(`\n[x] ${m}\n`)
  process.exit(1)
}

/* ================= 收集候选配置文件 ================= */
function collectConfFiles() {
  const list = []
  const push = (p) => {
    try {
      if (fs.statSync(p).isFile() && p.endsWith('.conf')) list.push(p)
    } catch {}
  }
  push(`${NGINX_DIR}/nginx.conf`)
  for (const dir of [`${NGINX_DIR}/sites-enabled`, `${NGINX_DIR}/conf.d`]) {
    try {
      for (const f of fs.readdirSync(dir)) push(path.join(dir, f))
    } catch {}
  }
  return [...new Set(list)]
}

/* ================= --revert ================= */
if (REVERT) {
  const all = collectConfFiles()
  let done = false
  for (const f of all) {
    const dir = path.dirname(f)
    const base = path.basename(f)
    let backups = []
    try {
      backups = fs
        .readdirSync(dir)
        .filter((n) => n.startsWith(`${base}.bak.`))
        .sort()
    } catch {}
    if (!backups.length) continue
    const latest = path.join(dir, backups[backups.length - 1])
    fs.copyFileSync(latest, f)
    log(`已还原：${f}  ←  ${latest}`)
    done = true
  }
  if (!done) fail('没找到任何 .bak.* 备份文件')
  log('\n请执行： sudo nginx -t && sudo systemctl reload nginx')
  process.exit(0)
}

/* ================= 括号配对，找出所有块 ================= */
function findBlocks(text) {
  // 注释抹成等长空白，避免注释里的 { } 干扰
  const masked = text.replace(/#[^\n]*/g, (m) => ' '.repeat(m.length))
  const blocks = []
  const stack = []
  for (let i = 0; i < masked.length; i++) {
    const ch = masked[i]
    if (ch === '{') {
      const before = masked.slice(Math.max(0, i - 240), i)
      const m = before.match(/([A-Za-z_@][\w\-]*)\s*$/)
      stack.push({ open: i, keyword: m ? m[1] : '' })
    } else if (ch === '}') {
      const b = stack.pop()
      if (b) {
        b.close = i
        b.body = masked.slice(b.open + 1, i)
        blocks.push(b)
      }
    }
  }
  return blocks
}

/* ================= 找出监听 PORT 的 server 块 ================= */
function findPortServer(text) {
  const blocks = findBlocks(text)
  const servers = blocks.filter((b) => b.keyword === 'server')
  const re = new RegExp(`\\blisten\\s+(?:\\[::\\]:|[\\d.]+:)?${PORT}\\b`)
  for (const b of servers) {
    if (re.test(b.body)) return { block: b, blocks, servers }
  }
  return { block: null, blocks, servers }
}

const hasApiProxy = (body) =>
  /location\s+[\^=~]*\s*\/api\//.test(body) ||
  /proxy_pass\s+https?:\/\/127\.0\.0\.1:8787/.test(body)

/* ================= 要插入的片段 ================= */
const apiLocation = (indent) => {
  const p = (s) => indent + s
  return [
    `${indent}# ===== 医讯通 API 反向代理（由 patch-nginx.mjs 插入，可删）=====`,
    `${indent}location /api/ {`,
    `${indent}    proxy_pass http://${UPSTREAM};`,
    `${indent}    proxy_http_version 1.1;`,
    ``,
    `${indent}    proxy_set_header Host              $host;`,
    `${indent}    proxy_set_header X-Real-IP         $remote_addr;`,
    `${indent}    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;`,
    `${indent}    proxy_set_header X-Forwarded-Proto $scheme;`,
    `${indent}    proxy_set_header Connection        "";`,
    ``,
    `${indent}    # AI 对话为 SSE 流式输出，必须关闭缓冲，否则前端拿不到逐字效果`,
    `${indent}    proxy_buffering off;`,
    `${indent}    proxy_cache off;`,
    `${indent}    proxy_set_header X-Accel-Buffering no;`,
    `${indent}    chunked_transfer_encoding on;`,
    ``,
    `${indent}    proxy_connect_timeout 15s;`,
    `${indent}    proxy_send_timeout    300s;`,
    `${indent}    proxy_read_timeout    300s;`,
    `${indent}}`,
    `${indent}# ===== 补丁结束 =====`,
  ].join('\n')
}

/* ================= 主流程 ================= */
const files = collectConfFiles()
if (!files.length) fail(`在 ${NGINX_DIR} 下没找到任何 .conf 文件`)

log(`扫描 ${files.length} 个配置文件：`)
for (const f of files) log(`  - ${f}`)
log()

let hit = null
for (const f of files) {
  const text = fs.readFileSync(f, 'utf8')
  const { block } = findPortServer(text)
  if (block) {
    hit = { file: f, text, block }
    break
  }
}

if (hit) {
  log(`[i] 找到监听 ${PORT} 的 server 块 → ${hit.file}`)

  if (hasApiProxy(hit.block.body)) {
    log(`[✓] 该 server 块里已经有 /api 反向代理，无需打补丁。`)
    log(`    若接口仍返回 HTML，请确认这段是否真的在其内部：`)
    log(`    sed -n '/listen 89/,/^}/p' ${hit.file} | grep -n 'location /api'`)
    process.exit(0)
  }

  // 推测缩进：看 server 块内部第一行的缩进
  const firstLine = hit.text.slice(hit.block.open + 1).split('\n')[1] || ''
  const indent = (firstLine.match(/^[ \t]*/) || [''])[0] || '    '

  // 插在该 server 块结尾、闭合 } 之前（位置更自然，nginx 对 location 顺序不敏感）
  const insertAt = hit.block.close
  const next =
    hit.text.slice(0, insertAt) + '\n' + apiLocation(indent) + '\n' + hit.text.slice(insertAt)

  applyPatch(hit.file, hit.text, next)
  verifyAndReload(hit.file, hit.text)
} else {
  log(`[!] 所有配置文件里都没有监听 ${PORT} 的 server 块。`)
  log(`    说明现在的 89 端口不是 nginx 直接提供的，或配置在别处。`)
  log(`    接下来会在 ${NGINX_DIR}/nginx.conf 的 http{} 里新增一个完整 server 块。`)
  log()

  const mainConf = `${NGINX_DIR}/nginx.conf`
  if (!fs.existsSync(mainConf)) fail(`找不到 ${mainConf}`)

  const text = fs.readFileSync(mainConf, 'utf8')
  const { blocks } = findPortServer(text)
  const httpBlock = blocks
    .filter((b) => b.keyword === 'http')
    .sort((a, b) => b.open - a.open)[0]
  if (!httpBlock) fail(`找不到 http { } 块，配置结构异常，请手动编辑`)

  const serverBlock = `
    # ==================== 端口 ${PORT}：医讯通（前端静态 + API） ====================
    server {
        listen ${PORT};
        server_name _;

        root /home/ubuntu/Documents/projects/new_eld_app/web/dist;
        index index.html;
        charset utf-8;

${apiLocation('        ')}

        location /assets/ {
            expires 1y;
            add_header Cache-Control "public, immutable";
            access_log off;
        }

        location = /favicon.ico {
            access_log off;
            log_not_found off;
        }

        location / {
            try_files $uri $uri/ /index.html;
        }
    }
`
  const next =
    text.slice(0, httpBlock.close) + serverBlock + text.slice(httpBlock.close)

  applyPatch(mainConf, text, next)
  verifyAndReload(mainConf, text)
}

/* ================= 工具函数 ================= */
function applyPatch(file, oldText, newText) {
  if (DRY) {
    log('\n---------- 修改后的完整内容 ----------')
    console.log(newText)
    log('---------- 结束（未写入） ----------')
    process.exit(0)
  }
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\..*/, '')
  const backup = `${file}.bak.${stamp}`
  fs.copyFileSync(file, backup)
  log(`[✓] 已备份：${backup}`)
  fs.writeFileSync(file, newText, 'utf8')
  log(`[✓] 已写入：${file}`)
}

function verifyAndReload(file, oldText) {
  if (DRY || NO_TEST) return

  // 1. nginx -t
  log('\n[i] 校验配置语法： nginx -t')
  try {
    const out = execSync('nginx -t', { encoding: 'utf8', stdio: 'pipe' })
    process.stdout.write(out)
    log('[✓] 语法校验通过')
  } catch (e) {
    const msg = `${e.stdout || ''}${e.stderr || ''}`
    console.error(msg)
    log('\n[x] 语法校验失败，自动回滚…')
    fs.writeFileSync(file, oldText, 'utf8')
    log('[✓] 已回滚到修改前内容（备份文件保留）')
    process.exit(1)
  }

  // 2. reload
  log('\n[i] 重载 nginx： systemctl reload nginx')
  try {
    execSync('systemctl reload nginx', { stdio: 'pipe' })
    log('[✓] nginx 已重载')
  } catch (e) {
    log('[!] 自动重载失败，请手动执行： sudo systemctl reload nginx')
    log(String(e.message).slice(0, 300))
  }

  // 3. 自检
  log('\n[i] 自检接口')
  try {
    const body = execSync(
      `curl -s --max-time 8 http://127.0.0.1:${PORT}/api/health`,
      { encoding: 'utf8' },
    )
    log(`  GET /api/health -> ${body.slice(0, 200)}`)
    if (body.trim().startsWith('{')) {
      log('\n[✓] 成功！/api 已经正确转发到 Node 服务。')
    } else {
      log('\n[!] 返回的不是 JSON，说明 Node 服务可能没在跑：')
      log('    sudo systemctl status yinling')
      log('    sudo journalctl -u yinling -n 50 --no-pager')
    }
  } catch (e) {
    log(`  curl 失败：${e.message.slice(0, 200)}`)
  }
}
