# 部署修复指南 · 医讯通（62.234.146.121:89）

## 一、诊断结果（已确认）

我从外网直接探测了你的服务器，结果很明确：

```
GET http://62.234.146.121:89/            → 200  text/html   ✅ 前端正常
GET http://62.234.146.121:89/api/health  → 200  text/html   ❌ 返回的是 index.html
GET http://62.234.146.121:89/api/meta    → 200  text/html   ❌ 同上
GET http://62.234.146.121:89/api/policies → 200 text/html   ❌ 同上
GET http://62.234.146.121:8787/api/health → 超时             （正常，Node 只监听内网）
```

**根因**：89 端口的 nginx server 块里**没有 `/api/` 的反向代理**，所有请求都被 `try_files ... /index.html` 兜底成前端页面。前端 `fetch('/api/health')` 拿到的是一段 HTML，`JSON.parse` 失败 → 所有接口报错 → 表现为「前端能开，但登录/测算/AI 全都用不了」。

**三件事叠在一起，缺一不可**：

| # | 问题 | 实测 |
| --- | --- | --- |
| 1 | Node 版本太低 | `node -v` = v20.20.2，项目要 `node:sqlite`（≥ 24） |
| 2 | Node 服务没跑 | 8787 未监听，systemd `yinling` = inactive（未安装） |
| 3 | nginx 缺 `/api/` 反代 | `/etc/nginx/nginx.conf:67` 有 `listen 89` 块，但块内无 `/api/` |

> ⚠️ **先看 [`FIX-STEPS.md`](./FIX-STEPS.md)** —— 那是按你服务器实测状态重写的「一段一段复制粘贴」手册，把 Node 从 20 升到 24；本文档是背景说明与排错参照。

## 二、修复方案

**只加一段，不替换整个文件**：用 `deploy/patch-nginx.mjs` 自动找到监听 89 的那个配置文件，在它的 server 块内插入 `/api/` 反向代理。其他站点（My_Blog、My_school、刷题软件…）完全不受影响。

## 三、操作步骤（FinalShell 里执行）

### 第 0 步：先跑体检，确认现状

```bash
cd /home/ubuntu/Documents/projects/new_eld_app
bash deploy/doctor.sh
```

只读诊断，不改任何东西。**把输出整段贴给我**，我能立刻确认你的实际情况。

### 第 1 步：上传 deploy 目录

把本地 `new_eld_app/deploy/` 整个目录拖进 FinalShell 的
`/home/ubuntu/Documents/projects/new_eld_app/` 下。

需要的文件：

| 文件 | 作用 | 必需 |
| --- | --- | --- |
| `FIX-STEPS.md` | **按你服务器实测状态写的逐段复制粘贴手册**（推荐照它做） | ✅ 强烈推荐 |
| `install.sh` | 一键部署：构建 + systemd + nginx 补丁 + 验证 | ✅ |
| `patch-nginx.mjs` | 智能打 `/api` 反代补丁（自动定位 + 备份 + 回滚） | ✅ |
| `yinling.service` | systemd 服务定义（开机自启、崩溃重启） | ✅ |
| `doctor.sh` | 只读体检脚本，排查用 | 推荐 |
| `nginx.conf.example` | 完整 nginx 配置参考（**不要直接覆盖**，仅供对照） | 参考 |

### 第 2 步：确认 Node 版本 ≥ 24

```bash
node -v
```

本项目用了 Node 内置的 `node:sqlite`（不需要 better-sqlite3）。它从 **Node 23.4 起默认可用**，Node 22 还得加 `--experimental-sqlite` 标志（容易踩坑），所以门槛定 **24**：

```bash
# 推荐：官方二进制装到 /usr/local/lib/node24，不动系统自带的 20
cd /tmp
curl -fL --retry 3 -o node24.tar.xz \
  https://registry.npmmirror.com/-/binary/node/v24.14.1/node-v24.14.1-linux-x64.tar.xz
sudo mkdir -p /usr/local/lib/node24
sudo tar -xJf node24.tar.xz -C /usr/local/lib/node24 --strip-components=1
sudo ln -sf /usr/local/lib/node24/bin/{node,npm,npx} /usr/local/bin/
hash -r && node -v    # 期望 v24.14.1
```

> 详细版（含 gz 回退、PATH 排查）见 [`FIX-STEPS.md`](./FIX-STEPS.md) 第 1 步。

### 第 3 步：一键修复

```bash
cd /home/ubuntu/Documents/projects/new_eld_app
sudo bash deploy/install.sh
```

它会依次做：
1. 检查 Node ≥ 24（不够就提示去 `FIX-STEPS.md` 第 1 步，直接退出，不做任何破坏性改动）
2. `npm install` + `npm run build`（前端产物）
3. 检查 `server/.env`（不存在则生成模板）
4. 检查 MySQL 连通性
5. 安装 systemd 服务 `yinling`（开机自启 + 崩溃自动重启）
6. 自检 Node 直连 `127.0.0.1:8787/api/health`
7. **打 nginx 补丁**（自动定位 + 备份 + `nginx -t` 校验 + reload，失败自动回滚）
8. 经 nginx 验证 `/api/health` 是否返回 JSON

> 想一步步看清楚每一步在做什么、或者 `install.sh` 中途失败，就用 [`FIX-STEPS.md`](./FIX-STEPS.md) 手动逐段执行。

### 第 4 步：验证

```bash
curl -s http://127.0.0.1:89/api/health
# 期望：{"ok":true,"data":{"status":"up","time":"...","ai":null}}
```

浏览器打开 <http://62.234.146.121:89>，用 `demo / Demo@2025` 登录应该能进去了。

## 四、如果出问题

### 只看会改成什么，不动文件

```bash
sudo node deploy/patch-nginx.mjs --dry-run
```

会打印「找到哪个文件 + 插入后完整内容」。

### 回滚 nginx

```bash
sudo node deploy/patch-nginx.mjs --revert
sudo nginx -t && sudo systemctl reload nginx
```

### 手动验证三段链路

```bash
# ① Node 服务本身
curl -s http://127.0.0.1:8787/api/health

# ② 经 nginx
curl -s http://127.0.0.1:89/api/health

# ③ 确认 89 端口配置里确实有 /api 反代
grep -rn "8787" /etc/nginx/
```

- ① 通、② 不通 → nginx 补丁没生效（用 dry-run 看是不是找错了文件）
- ①② 都不通 → Node 没跑起来，`sudo journalctl -u yinling -n 50 --no-pager`

### 后端日志

```bash
sudo journalctl -u yinling -f
sudo systemctl restart yinling
```

## 五、常见坑对照表

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `/api/health` 仍返回 HTML | nginx 没 reload，或补丁找错了文件 | `sudo node deploy/patch-nginx.mjs --dry-run` 看定位，`sudo nginx -t && sudo systemctl reload nginx` |
| 502 Bad Gateway | Node 进程没起 | `sudo journalctl -u yinling -n 50` |
| 登录后刷新就掉线 | `AUTH_SECRET` 每次重启都变 | 在 `server/.env` 写死一个长随机串，然后 `sudo systemctl restart yinling` |
| AI 回答一次性蹦出来 | SSE 被 nginx 缓冲 | 补丁里已含 `proxy_buffering off`，确认它在 89 的 server 块内 |
| 启动报 `No such built-in module: node:sqlite` | Node < 24 | 升级 Node（见第 2 步 / `FIX-STEPS.md` 第 1 步） |
| 启动报 MySQL 连接失败 | 服务器没装 MySQL / 密码不对 | 改 `server/.env` 的 `MYSQL_*`；`CREATE DATABASE yinling_ark CHARACTER SET utf8mb4;` |
| 服务器内 `curl 127.0.0.1:89` 正常，外网打不开 | 腾讯云安全组没放行 | 控制台 → 安全组 → 入站规则 TCP:89 来源 0.0.0.0/0 |
| 前端 404 或白屏 | `web/dist` 没构建 / 路径不对 | `npm run build`，确认 `web/dist/index.html` 存在 |

## 六、关于密码安全（提醒）

我在你 FinalShell 的 `conn/` 配置里看到 SSH 密码是加密存储的（这是好事）。但 `server/.env` 里目前是：

```
AUTH_SECRET=yinling-ark-dev-secret-2025     ← 上线必须改
MYSQL_PASSWORD=1234                          ← 太弱，建议改
```

上线前建议：

```bash
# 生成一个强随机串填进 AUTH_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

改完 `sudo systemctl restart yinling`（注意：改 AUTH_SECRET 会让已登录用户重新登录一次，这是正常的）。
