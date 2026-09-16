#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "未检测到 Node.js，请先安装 22.5 或更高版本：https://nodejs.org"
  read -r -p "按回车退出"
  exit 1
fi
echo "正在启动门店财务运营看板 v1.1 ..."
(sleep 1.5; open "http://localhost:5174") &
node server.mjs
