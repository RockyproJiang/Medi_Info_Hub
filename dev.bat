@echo off
chcp 65001 >nul
title 医讯通 - 开发模式
cd /d "%~dp0"
echo ============================================
echo   医讯通 · 开发模式
echo   API   → http://127.0.0.1:8787
echo   前端  → http://127.0.0.1:5599
echo ============================================
if not exist node_modules (
  echo 首次运行，正在安装依赖...
  call npm install || goto :err
)
call npm run dev
goto :eof
:err
echo.
echo 启动失败：请确认已安装 Node.js 24 或更高版本（node:sqlite 需要）；MySQL 8.x 是否已启动。
pause
