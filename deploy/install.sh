#!/usr/bin/env bash
# 医讯通 一键部署脚本（Ubuntu）
# 用法：在服务器上执行  bash deploy/install.sh
set -euo pipefail

APP_DIR="/home/ubuntu/Documents/projects/new_eld_app"
PORT="8787"

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }
die() { printf '\n\033[1;31m[x] %s\033[0m\n' "$1" >&2; exit 1; }

# ---------- 0. 前置检查 ----------
[ -d "$APP_DIR" ] || die "找不到目录 $APP_DIR"

NODE_BIN="$(command -v node || true)"
[ -n "$NODE_BIN" ] || die "未安装 Node.js（需要 24 或更高版本）"
NODE_VER="$("$NODE_BIN" -v | sed 's/^v//')"
NODE_MAJOR="${NODE_VER%%.*}"
say "Node.js $NODE_VER ($NODE_BIN)"
# node:sqlite 在 Node 23.4 之前需要 --experimental-sqlite 标志，直接要求 >= 24 最省事
[ "$NODE_MAJOR" -ge 24 ] || die "Node.js 版本过低（需要 >= 24，当前 $NODE_VER）。
    本项目用内置 node:sqlite 模块，Node 22 需要额外标志、容易出错，请升级到 24：
    详见 deploy/FIX-STEPS.md 第 1 步。"
say "Node 版本检查通过"

# ---------- 1. 安装依赖 ----------
cd "$APP_DIR"
if [ ! -d node_modules ]; then
  say "安装依赖（首次较慢）"
  npm install
else
  say "依赖已存在，跳过 npm install（如需重装：rm -rf node_modules && bash deploy/install.sh）"
fi

# ---------- 2. 构建前端 ----------
say "构建前端"
npm run build || die "前端构建失败"

# ---------- 3. 检查 .env ----------
if [ ! -f server/.env ]; then
  say "未找到 server/.env，从模板生成"
  cat > server/.env <<'EOF'
PORT=8787
AUTH_SECRET=CHANGE_ME_TO_A_LONG_RANDOM_STRING
DB_PATH=./data/yinling.db

AI_API_KEY=
AI_BASE_URL=https://api.deepseek.com
AI_MODEL=deepseek-chat

MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=CHANGE_ME
MYSQL_DATABASE=yinling_ark
EOF
  echo "  ⚠ 已生成 server/.env，请编辑里面的 AUTH_SECRET 和 MYSQL_PASSWORD"
fi

# ---------- 4. MySQL 检查 ----------
say "检查 MySQL"
if command -v mysql >/dev/null 2>&1; then
  if mysql -h 127.0.0.1 -P 3306 -uroot -p1234 -e "SELECT 1" >/dev/null 2>&1; then
    echo "  ✓ MySQL 连接正常"
  else
    echo "  ⚠ 用 root/1234 连不上 MySQL。请确认 server/.env 里的 MYSQL_* 配置，"
    echo "    并确保已创建库： CREATE DATABASE yinling_ark CHARACTER SET utf8mb4;"
  fi
else
  echo "  ⚠ 未安装 mysql 客户端，跳过检查（服务端仍会尝试连接）"
fi

# ---------- 5. 安装 systemd 服务 ----------
say "配置 systemd 服务（开机自启 + 崩溃重启）"
sudo cp deploy/yinling.service /etc/systemd/system/yinling.service
# 把 ExecStart 里的 node 路径替换成实际路径
sudo sed -i "s|^ExecStart=.*|ExecStart=$NODE_BIN server/src/index.js|" /etc/systemd/system/yinling.service
sudo systemctl daemon-reload
sudo systemctl enable yinling >/dev/null 2>&1 || true
sudo systemctl restart yinling

# ---------- 6. 本地自检（直连 Node，绕过 nginx） ----------
# 服务启动时要先 seedAll() 再 initMySQL()，小机器上可能要 10 秒以上，
# 所以这里轮询等待（最多 60 秒），不要用固定 sleep，否则会误判成「服务异常」。
say "等待 Node 服务就绪（最多 60 秒）"
READY=0
for i in $(seq 1 60); do
  if curl -fsS --max-time 2 "http://127.0.0.1:$PORT/api/health" 2>/dev/null | grep -q '"ok":true'; then
    READY=1
    echo "  ✓ Node 服务已就绪（等待 ${i} 秒）"
    break
  fi
  # 服务已退出就别再等了，直接进报错分支
  if ! systemctl is-active --quiet yinling; then
    echo "  ! systemd 报告 yinling 已退出（第 ${i} 秒），停止等待"
    break
  fi
  sleep 1
done

say "自检 Node API http://127.0.0.1:$PORT/api/health"
if [ "$READY" = "1" ]; then
  curl -s --max-time 5 "http://127.0.0.1:$PORT/api/health"; echo
else
  echo "  ✗ Node 服务未能就绪，最后 40 行日志："
  sudo journalctl -u yinling -n 40 --no-pager || true
  echo
  echo "  常见原因："
  echo "   - MySQL 账号/库名不对 → 检查 server/.env 的 MYSQL_*"
  echo "   - 端口被占用 → sudo lsof -i:$PORT"
  echo "   - 代码报错 → 上面日志里找 Error/错误行"
  exit 1
fi

# ---------- 7. 打 Nginx 补丁（只加 /api 反代，不动其他站点） ----------
say "给 Nginx 增加 /api 反向代理（自动定位监听 89 端口的配置）"
# patch-nginx.mjs 会自己备份 + nginx -t + reload + 回滚
sudo "$NODE_BIN" deploy/patch-nginx.mjs || {
  echo
  echo "  ✗ Nginx 补丁失败。已自动回滚，其他站点不受影响。"
  echo "    手动排查： sudo bash deploy/doctor.sh"
  exit 1
}

# ---------- 8. 外部连通性验证 ----------
say "验证对外访问（127.0.0.1:89，经 nginx）"
FAIL=0
for path in "/api/health" "/api/meta"; do
  out="$(curl -s --max-time 10 -o /tmp/.yl_body -w '%{http_code} %{content_type}' "http://127.0.0.1:89$path" || echo 'ERR')"
  echo "  GET $path -> $out"
  case "$out" in
    *text/html*|ERR*) FAIL=1 ;;
  esac
done
echo
echo "  --- /api/health 实际响应 ---"
curl -s --max-time 10 http://127.0.0.1:89/api/health || true
echo
echo "  --- 首页 ---"
curl -s -o /dev/null -w '  GET / -> %{http_code} %{content_type}\n' --max-time 10 http://127.0.0.1:89/
echo
if [ "$FAIL" = "0" ]; then
  say "部署成功 → http://62.234.146.121:89"
else
  printf '\n\033[1;31m[x] /api 仍返回 HTML。请运行： sudo bash deploy/doctor.sh\033[0m\n'
  exit 1
fi
echo "  查看日志： sudo journalctl -u yinling -f"
echo "  重启服务： sudo systemctl restart yinling"
echo "  还原 nginx： sudo node deploy/patch-nginx.mjs --revert"
