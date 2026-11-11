# 医讯通部署修复 · 一步一步照抄手册

> 目标：让 http://62.234.146.121:89 的后端接口恢复正常。
> 用法：用 FinalShell 连上服务器（ubuntu 用户），**从上到下按顺序复制每一段命令**，一段执行完看输出，再执行下一段。
> 全程不要跳步骤；遇到「出问题」提示，先按提示排查，别继续往下走。

## 懒人版（想快就只做这两段）

如果你不想一步步来，**第 1 步（装 Node 24）必须手动做**，做完之后剩下的交给一键脚本：

```bash
# ① 装 Node 24（复制这一整段，粘进 FinalShell 回车）
cd /tmp && curl -fL --retry 3 --connect-timeout 20 -o node24.tar.xz \
  https://registry.npmmirror.com/-/binary/node/v24.14.1/node-v24.14.1-linux-x64.tar.xz \
  && sudo mkdir -p /usr/local/lib/node24 \
  && sudo tar -xJf node24.tar.xz -C /usr/local/lib/node24 --strip-components=1 \
  && sudo ln -sf /usr/local/lib/node24/bin/node /usr/local/bin/node \
  && sudo ln -sf /usr/local/lib/node24/bin/npm /usr/local/bin/npm \
  && sudo ln -sf /usr/local/lib/node24/bin/npx /usr/local/bin/npx \
  && hash -r && node -v
# 期望最后打印：v24.14.1
```

```bash
# ② 一键修复（构建 + systemd + nginx 反代 + 验证，失败自动回滚）
cd /home/ubuntu/Documents/projects/new_eld_app && sudo bash deploy/install.sh
```

看到 `部署成功 → http://62.234.146.121:89` 就通了。
**如果 ② 报错或者最后显示「/api 仍返回 HTML」，就回到下面正文，从第 1 步老老实实走一遍**，正文里每一步都有对应的排错。

---

## 现在到底是什么坏了（结论）

你服务器的真实状态（我按你贴的输出核对过）：

| 项目 | 实测结果 | 含义 |
|---|---|---|
| `node -v` | v20.20.2（`/usr/bin/node`） | **版本太低**，项目用的 `node:sqlite` 需要 Node ≥ 24 |
| 8787 端口 | 没在监听，`curl` 直接失败 | Node 服务根本没起来 |
| `systemctl status yinling` | inactive（服务未安装） | 没有守护进程，崩了不会自动拉起来 |
| `curl :89/api/health` | 返回 `text/html` | nginx 把 `/api/...` 当成前端路由，兜底成 index.html |
| `/etc/nginx/nginx.conf:67` | `server { listen 89; ... root .../web/dist; }` | 89 端口块在 nginx.conf 里，**但里面没有 `/api/` 反向代理** |

所以是三件事叠在一起，**缺一不可**：

1. 升级 Node（20 → 24）
2. 把 Node 服务用 systemd 跑起来（监听 127.0.0.1:8787）
3. 给 nginx 的 89 端口块补一段 `/api/` 反向代理

---

## 第 1 步：升级 Node.js 到 24（不卸载系统自带的 20）

> 为什么不用 `apt`：Ubuntu 24.04 源里的 nodejs 就是 20，装了也不够。这里用官方二进制解压到 `/usr/local/lib/node24`，再用 `/usr/local/bin` 里的软链接盖住旧版本，**不动系统已有的 `/usr/bin/node`**，随时可回退。

```bash
cd /tmp
curl -fL --retry 3 --connect-timeout 20 -o node24.tar.xz \
  https://registry.npmmirror.com/-/binary/node/v24.14.1/node-v24.14.1-linux-x64.tar.xz
ls -lh node24.tar.xz
```

期望：最后一行显示一个 **20M+ 的文件**（约 32MB）。如果报 `No such file` 或文件是几 KB（下载失败页），执行下面这条改用 gz 版重试：

```bash
cd /tmp
curl -fL --retry 3 --connect-timeout 20 -o node24.tar.gz \
  https://registry.npmmirror.com/-/binary/node/v24.14.1/node-v24.14.1-linux-x64.tar.gz
```

接着解压并挂到 PATH 前面：

```bash
sudo mkdir -p /usr/local/lib/node24
if [ -f /tmp/node24.tar.xz ]; then
  sudo tar -xJf /tmp/node24.tar.xz -C /usr/local/lib/node24 --strip-components=1
else
  sudo tar -xzf /tmp/node24.tar.gz -C /usr/local/lib/node24 --strip-components=1
fi
sudo ln -sf /usr/local/lib/node24/bin/node /usr/local/bin/node
sudo ln -sf /usr/local/lib/node24/bin/npm  /usr/local/bin/npm
sudo ln -sf /usr/local/lib/node24/bin/npx  /usr/local/bin/npx
hash -r
```

验证（**这一步的输出必须是这样**）：

```bash
node -v && npm -v && which node
```

期望：

```
v24.14.1
11.x.x          ← 具体小版本无所谓
/usr/local/bin/node
```

> **出问题**：如果 `node -v` 还是 `v20.20.2`，说明 `/usr/local/bin` 没在 PATH 前面。执行 `echo $PATH` 看 `/usr/local/bin` 是否在 `/usr/bin` 之前；临时用绝对路径也行——后面所有命令把 `node` 换成 `/usr/local/lib/node24/bin/node` 即可。

---

## 第 2 步：装依赖 + 构建前端

```bash
cd /home/ubuntu/Documents/projects/new_eld_app
npm install
```

期望：出现 `added N packages` 或 `up to date`，**没有 ERR!**。
（`node_modules` 你已经有了，这一步主要是把依赖跟新 Node 对齐，通常 10–60 秒。）

> **出问题**：如果报 `EACCES: permission denied`，说明之前有人用 `sudo npm install` 装过，`node_modules` 变成 root 所有了。执行一次修正所有权：
> ```bash
> sudo chown -R ubuntu:ubuntu /home/ubuntu/Documents/projects/new_eld_app
> ```
> 然后重新 `npm install`。**以后一律不要加 sudo 跑 npm。**

如果 `npm install` 报网络超时，加国内源重跑：

```bash
cd /home/ubuntu/Documents/projects/new_eld_app
npm install --registry=https://registry.npmmirror.com
```

再构建前端：

```bash
cd /home/ubuntu/Documents/projects/new_eld_app
npm run build
```

期望：`✓ built in 5.xx s`，并且 `web/dist/assets/` 下出现新的 `index-xxxx.js`。

> **出问题**：如果内存不足被 Killed（腾讯云轻量常见 2G 内存），先加 swap 再构建：
> ```bash
> sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
> sudo mkswap /swapfile && sudo swapon /swapfile
> free -h
> ```
> 然后重新执行 `npm run build`。

---

## 第 3 步：确认 server/.env 配置

```bash
cd /home/ubuntu/Documents/projects/new_eld_app
cat server/.env
```

**必须包含这 6 项**（值按你的实际来）：

```
PORT=8787
AUTH_SECRET=随便一串够长的随机字符
AI_API_KEY=sk-...
MYSQL_HOST=127.0.0.1
MYSQL_USER=root
MYSQL_PASSWORD=你的MySQL密码
MYSQL_DATABASE=yinling_ark
```

缺什么就补什么（在 FinalShell 里用 `nano server/.env` 编辑，`Ctrl+O` 保存、`Ctrl+X` 退出）：

```bash
cd /home/ubuntu/Documents/projects/new_eld_app
nano server/.env
```

顺手确认 MySQL 密码是对的、库存在：

```bash
mysql -h 127.0.0.1 -uroot -p -e "SHOW DATABASES LIKE 'yinling_ark';"
```

（会提示输入密码，输你的 MySQL root 密码。）期望看到：

```
Database (yinling_ark)
yinling_ark
```

> **出问题**：如果提示 `Access denied`，就是密码不对——去改 `server/.env` 里的 `MYSQL_PASSWORD`。如果库不存在，执行：
> ```bash
> mysql -h 127.0.0.1 -uroot -p -e "CREATE DATABASE IF NOT EXISTS yinling_ark CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
> ```
> 库就算新建也没关系，服务第一次启动会自动建表 + 建演示账号。

---

## 第 4 步：前台试跑一次（最关键的一步，能直接看到报错）

**先别装服务，先手动跑一遍**，这样任何启动错误都会直接打在屏幕上：

```bash
cd /home/ubuntu/Documents/projects/new_eld_app
timeout 20 /usr/local/lib/node24/bin/node server/src/index.js
```

期望输出（服务会**分阶段**打印进度，最后停住，20 秒后自动退出）：

```
[启动] 加载 SQLite 内容库种子…（+0.0s）
[启动] 内容库就绪：政策 13 / 文章 14 / 产品 12（+0.0s）
[启动] 连接 MySQL 127.0.0.1:3306/yinling_ark …（+0.1s）
[启动] MySQL 连接与建表完成（+0.3s）
[启动] 准备演示账号…（+0.3s）
[启动] 演示账号就绪（+0.4s）
医讯通 API 已启动： http://127.0.0.1:8787
静态目录： /home/ubuntu/Documents/projects/new_eld_app/web/dist
用户数据库： MySQL 127.0.0.1:3306/yinling_ark（内容库： SQLite）
启动总耗时： 0.4s
```

另一行 `(node:xxxx) ExperimentalWarning: SQLite is an experimental feature` 是 Node 对内置 SQLite 模块的**正常提示**，不是错误，忽略即可。

同时**另开一个 FinalShell 标签页**（不用关这个）测接口：

```bash
curl -s http://127.0.0.1:8787/api/health; echo
```

期望：`{"ok":true,"data":{"status":"up",...}}`

> **卡住 / 报错的定位方法**：看最后打印到哪一行——
> - 停在「加载 SQLite 内容库种子…」→ 内容库建表/写种子出错（看后面的报错）。
> - 停在「连接 MySQL …」→ MySQL 没启动 / 密码错 / 库不存在，回第 3 步。
> - 停在「准备演示账号…」→ 建表语句有问题（多半是 MySQL 8 太老或账号无建库权限）。
> - 六行全打印出来但 curl 不通 → 端口被别的程序占用，见下面 EADDRINUSE。
>
> **错误对照表**：
> - `Error [ERR_UNKNOWN_BUILTIN_MODULE]: No such built-in module: node:sqlite` → Node 还是旧版，回第 1 步。
> - `listen EADDRINUSE :::8787` → 已有进程占用，执行 `sudo lsof -i:8787` 找到 pid 后 `sudo kill <pid>`。
> - `Access denied for user 'root'` / `ECONNREFUSED 3306` → MySQL 没启动或密码错：`sudo systemctl status mysql`，回第 3 步。
> - `Cannot find package 'mysql2'` → 回第 2 步 `npm install`。

跑完（20 秒自动退出，或按 `Ctrl+C`）再继续。

---

## 第 5 步：装成 systemd 服务（开机自启 + 崩溃自动重启）

```bash
cd /home/ubuntu/Documents/projects/new_eld_app
sudo cp deploy/yinling.service /etc/systemd/system/yinling.service
sudo sed -i 's|^ExecStart=.*|ExecStart=/usr/local/lib/node24/bin/node server/src/index.js|' /etc/systemd/system/yinling.service
sudo systemctl daemon-reload
sudo systemctl enable --now yinling
```

**注意：不要立刻 curl。** 服务启动时要先灌 SQLite 种子、再连 MySQL 建表建演示账号，**小机器上要 10 秒左右**。用下面这条轮询等它就绪（最长 60 秒，通了自动退出）：

```bash
for i in $(seq 1 60); do
  if curl -fsS --max-time 2 http://127.0.0.1:8787/api/health 2>/dev/null | grep -q '"ok":true'; then
    echo "✓ 已就绪（${i}s）"; curl -s http://127.0.0.1:8787/api/health; echo; break
  fi
  sleep 1
done
```

期望最后一行是 `{"ok":true,"data":{"status":"up",...}}`。

再确认服务不是反复重启：

```bash
sudo systemctl status yinling --no-pager
```

期望：`Active: active (running)`。

> **出问题**：
> 1. 状态是 `activating (auto-restart)` → 一直在崩，看日志定位：
>    ```bash
>    sudo journalctl -u yinling -n 50 --no-pager
>    ```
>    日志里的报错对照第 4 步的对照表处理。
> 2. 日志里**只有** `ExperimentalWarning: SQLite is an experimental feature` 一行、别的一个字没有 → **这不是错误**，是 Node 对内置 SQLite 的正常提示，说明服务正在初始化或已经在跑。回上面再等十几秒。
> 3. 想知道它到底卡在哪，停掉服务在前台跑一次（完整输出都在屏幕上）：
>    ```bash
>    sudo systemctl stop yinling
>    cd /home/ubuntu/Documents/projects/new_eld_app
>    timeout 30 /usr/local/lib/node24/bin/node server/src/index.js
>    sudo systemctl start yinling
>    ```

---

## 第 6 步：给 nginx 补 `/api/` 反向代理

先**干跑**看它准备改哪里（不写入任何文件）：

```bash
cd /home/ubuntu/Documents/projects/new_eld_app
sudo /usr/local/lib/node24/bin/node deploy/patch-nginx.mjs --dry-run
```

期望开头看到：

```
[i] 找到监听 89 的 server 块 → /etc/nginx/nginx.conf
```

以及一段新增的 `location /api/ { ... }` 内容。

确认无误后正式打补丁：

```bash
cd /home/ubuntu/Documents/projects/new_eld_app
sudo /usr/local/lib/node24/bin/node deploy/patch-nginx.mjs
```

这个脚本会：自动备份成 `nginx.conf.bak.<时间戳>` → 插入 `location /api/`（含 SSE 流式必需的三行 `proxy_buffering off` 等）→ 跑 `nginx -t` 校验 → `systemctl reload nginx` → 自检 `/api/health`。**语法不过会自动回滚原文。**

期望结尾：

```
[✓] nginx 已重载
  GET /api/health -> {"ok":true,...}
[✓] 成功！/api 已经正确转发到 Node 服务。
```

> **出问题**：
> - 提示「该 server 块里已经有 /api 反向代理」但接口还是 HTML → 说明 89 那块在别的文件里，用这个命令确认：`sudo nginx -T | grep -n "location /api"`，如果搜不到就是没生效，把输出发我。
> - 提示 `nginx -t` 失败并自动回滚 → 把屏幕上的错误行发我，其他 8 个站点没被影响，可以放心。

---

## 第 7 步：最终验收（3 条命令）

```bash
curl -s http://127.0.0.1:89/api/health; echo
curl -s -o /dev/null -w 'index: %{http_code} %{content_type}\n' http://127.0.0.1:89/
curl -s http://127.0.0.1:89/api/meta | head -c 300; echo
```

期望：

```
{"ok":true,...}                                  ← 关键：返回 JSON，不是 HTML
index: 200 text/html
{"ok":true,"data":{...}}                          ← 能看到 policies/articles 等计数
```

然后在**你自己的电脑浏览器**里打开 http://62.234.146.121:89 ：

1. 首页应该能加载数据（不再是空白/报错）
2. 右上角「登录」→ 用 `demo` / `Demo@2025` 登录成功
3. 「测算中心」随便填个参数能算出结果
4. 「AI 顾问」发一句话，能看到**逐字流式**输出

4 项都 OK 就彻底通了。

---

## 附：常用运维命令

```bash
# 看实时日志
sudo journalctl -u yinling -f

# 改完代码后重启
cd /home/ubuntu/Documents/projects/new_eld_app && npm run build && sudo systemctl restart yinling

# 只重启后端
sudo systemctl restart yinling

# 查看 nginx 最终生效的配置（含 include）
sudo nginx -T | grep -n "location /api" -A 3
```

---

## 附：完整回滚（出事时把自己还原到动手前）

```bash
# 1) 撤销 nginx 补丁
cd /home/ubuntu/Documents/projects/new_eld_app
sudo /usr/local/lib/node24/bin/node deploy/patch-nginx.mjs --revert
sudo nginx -t && sudo systemctl reload nginx

# 2) 停掉并卸载服务
sudo systemctl disable --now yinling
sudo rm -f /etc/systemd/system/yinling.service
sudo systemctl daemon-reload

# 3) 撤销 Node 24（系统自带的 v20 一直没动，删掉软链接就回去了）
sudo rm -f /usr/local/bin/node /usr/local/bin/npm /usr/local/bin/npx
hash -r
node -v      # 回到 v20.20.2
```

---

## 附：这次修复涉及的文件

| 文件 | 作用 |
|---|---|
| `deploy/yinling.service` | systemd 单元模板（第 5 步用） |
| `deploy/patch-nginx.mjs` | 自动定位 89 端口块并插入 `/api/` 反代（第 6 步用） |
| `deploy/doctor.sh` | 只读体检脚本，任何时候可跑，不改任何东西 |
| `server/.env` | 端口 / AI Key / MySQL 连接（第 3 步检查） |
| `web/dist/` | 前端构建产物，nginx 89 端口的 root 指向这里 |
