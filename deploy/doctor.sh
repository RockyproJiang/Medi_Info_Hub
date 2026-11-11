#!/usr/bin/env bash
# 医讯通 服务器体检脚本
# 用法： bash deploy/doctor.sh
# 作用：只读诊断，不修改任何文件。把输出整段贴给我即可定位问题。

APP_DIR="/home/ubuntu/Documents/projects/new_eld_app"
PORT=89
API_PORT=8787

G='\033[1;32m'; R='\033[1;31m'; Y='\033[1;33m'; C='\033[1;36m'; N='\033[0m'
sec() { printf "\n${C}===== %s =====${N}\n" "$1"; }
pass() { printf "${G}[✓]${N} %s\n" "$1"; }
warn() { printf "${Y}[!]${N} %s\n" "$1"; }
bad()  { printf "${R}[x]${N} %s\n" "$1"; }

sec "1. 系统信息"
uname -a
lsb_release -ds 2>/dev/null || cat /etc/os-release | head -2

sec "2. Node / npm"
if command -v node >/dev/null; then
  pass "node $(node -v) → $(command -v node)"
  MAJ="$(node -v | sed 's/^v//' | cut -d. -f1)"
  [ "$MAJ" -ge 24 ] || bad "Node 版本 < 24，本项目需要 node:sqlite（Node 23.4 起默认可用），必须 >= 24"
else
  bad "未安装 node"
fi
command -v npm >/dev/null && pass "npm $(npm -v)" || bad "未安装 npm"

sec "3. 项目目录"
if [ -d "$APP_DIR" ]; then
  pass "存在 $APP_DIR"
  echo "--- 顶层内容 ---"
  ls -la "$APP_DIR" | head -20
  echo "--- 关键文件 ---"
  for f in server/src/index.js server/.env server/data/yinling.db web/dist/index.html package.json node_modules; do
    [ -e "$APP_DIR/$f" ] && pass "$f" || bad "缺失 $f"
  done
else
  bad "找不到 $APP_DIR"
fi

sec "4. Node 服务进程"
if ss -lntp 2>/dev/null | grep -q ":$API_PORT"; then
  pass "端口 $API_PORT 正在监听"
  ss -lntp | grep ":$API_PORT"
else
  bad "端口 $API_PORT 没有监听 —— Node 服务没跑起来"
fi
echo "--- systemd 状态 ---"
systemctl is-active yinling 2>/dev/null && systemctl status yinling --no-pager -n 5 2>/dev/null | head -12 || warn "没有 yinling 这个 systemd 服务（可能用 pm2 / nohup / screen 跑的）"
echo "--- 相关进程 ---"
ps aux | grep -E "node .*(index|server)" | grep -v grep || warn "没找到 node 服务进程"

sec "5. 本地 API 直连（绕过 nginx）"
if curl -fsS --max-time 8 "http://127.0.0.1:$API_PORT/api/health"; then
  echo
  pass "Node API 本身正常"
else
  bad "直连 127.0.0.1:$API_PORT 失败 —— 问题在 Node 服务，不在 nginx"
fi

sec "6. 经过 nginx（127.0.0.1:$PORT）"
for p in "/api/health" "/api/meta" "/"; do
  CT="$(curl -s -o /dev/null -w '%{http_code} %{content_type}' --max-time 8 "http://127.0.0.1:$PORT$p")"
  echo "  GET $p -> $CT"
  case "$CT" in
    *text/html*) [ "$p" = "/" ] || bad "  ↑ 返回 HTML，说明 /api 没走反向代理" ;;
  esac
done

sec "7. nginx 配置里有没有 89 端口的 /api 反代"
echo "--- 所有含 listen 89 的配置文件 ---"
grep -rn "listen *89" /etc/nginx/ 2>/dev/null || warn "grep 不到 listen 89（可能在 sites-enabled 之外）"
echo "--- 所有含 proxy_pass ...8787 的配置 ---"
grep -rn "8787" /etc/nginx/ 2>/dev/null || bad "整个 /etc/nginx 里没有 8787 的反向代理配置 —— 这就是根因"
echo "--- nginx -t ---"
nginx -t 2>&1 | head -5

sec "8. MySQL"
if command -v mysql >/dev/null; then
  pass "mysql 客户端存在： $(mysql --version)"
else
  warn "没有 mysql 客户端（CLI 不在，但 Node 用 mysql2 驱动仍可连）"
fi
if [ -f "$APP_DIR/server/.env" ]; then
  echo "--- server/.env 的 MySQL 配置（密码已打码）---"
  grep -E "^MYSQL_" "$APP_DIR/server/.env" | sed 's/\(PASSWORD=\).*/\1***/'
  MH="$(grep -E '^MYSQL_HOST=' "$APP_DIR/server/.env" | cut -d= -f2)"
  MP="$(grep -E '^MYSQL_PORT=' "$APP_DIR/server/.env" | cut -d= -f2)"
  MU="$(grep -E '^MYSQL_USER=' "$APP_DIR/server/.env" | cut -d= -f2)"
  MW="$(grep -E '^MYSQL_PASSWORD=' "$APP_DIR/server/.env" | cut -d= -f2)"
  MD="$(grep -E '^MYSQL_DATABASE=' "$APP_DIR/server/.env" | cut -d= -f2)"
  if command -v mysql >/dev/null; then
    if mysql -h"${MH:-127.0.0.1}" -P"${MP:-3306}" -u"${MU:-root}" -p"${MW}" -e "SELECT 1" >/dev/null 2>&1; then
      pass "MySQL 连接成功"
      mysql -h"${MH:-127.0.0.1}" -P"${MP:-3306}" -u"${MU:-root}" -p"${MW}" -e "SHOW DATABASES LIKE '${MD:-yinling_ark}'" 2>/dev/null
    else
      bad "MySQL 连接失败（用 .env 里的配置）"
    fi
  fi
fi

sec "9. 最近的 Node 日志"
journalctl -u yinling -n 30 --no-pager 2>/dev/null || warn "没有 journald 日志（服务不是 systemd 托管的）"

sec "10. 端口占用总览"
ss -lntp 2>/dev/null | grep -E ':(89|8787|3306)' || warn "无匹配"

printf "\n${C}===== 体检结束，把以上内容整段复制给我 =====${N}\n"
