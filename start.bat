@echo off
chcp 65001 >nul
title 医讯通 - 生产模式
cd /d "%~dp0"
echo ============================================
echo   医讯通 · 养老金融公共信息服务平台
echo   模式：单端口生产模式 http://127.0.0.1:8787
echo ============================================
if not exist node_modules (
  echo 首次运行，正在安装依赖...
  call npm install || goto :err
)
if not exist web\dist (
  echo 正在构建前端（约 30 秒）...
  call npm run build || goto :err
)
echo 启动服务...
node server/src/index.js
goto :eof
:err
echo.
echo 启动失败：请确认已安装 Node.js 24 或更高版本（node:sqlite 需要）；MySQL 8.x 是否已启动。
pause
