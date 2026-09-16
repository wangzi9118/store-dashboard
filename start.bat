@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 未检测到 Node.js，请先安装 22.5 或更高版本：https://nodejs.org
  pause
  exit /b 1
)
echo 正在启动门店财务运营看板 v1.1 ...
start "" http://localhost:5174
node server.mjs
pause
