# 门店财务运营看板 v2.0 · 三步启动

这是完整包：已构建好的前端（dist/）、后端（server.mjs）、源码（src/）。
**运行不需要 npm install**，服务只用 Node 内置模块。

## 1. 准备
- 安装 Node.js 22.5 或更高版本（推荐 24）：https://nodejs.org
- 把本压缩包解压到一个**全新的空目录**。不要覆盖到旧版目录上，也不要和旧版混放。

## 2. 启动
- Windows：双击 `start.bat`
- macOS：双击 `start.command`（首次可能需要在「系统设置 → 隐私与安全性」允许运行）
- 或者在该目录打开终端执行：`node server.mjs`

看到 `Store dashboard server listening on http://0.0.0.0:5174` 即启动成功。

## 3. 打开
浏览器访问 http://localhost:5174
- 初始管理员：账号 `wyb`，密码 `123456`，登录后请在「权限管理」里改密码。
- **如何确认看到的是新版**：登录页右上角显示 `V02.0 · 门店财务运营看板`，页面底部显示 `门店财务运营看板 · V2.0`。看不到 V2.0 就是打开了旧版，请按 Ctrl+Shift+R（Mac：Cmd+Shift+R）强制刷新，或确认旧版服务已经停掉。

## 常见问题
- **端口被占用**：`PORT=5180 node server.mjs`（Windows：`set PORT=5180 && node server.mjs`），再访问对应端口。
- **数据在哪**：首次启动自动创建 `data/store-dashboard.sqlite`。升级时保留 `data/`，替换其它文件即可，程序会自动迁移表结构。
- **要改代码**：`npm install` 后 `npm run dev` 开发，`npm run build` 重新构建到 dist/。详见 README.md 与 DEPLOY.md。
