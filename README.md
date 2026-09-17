# 门店财务运营看板 v3.0

一套面向多门店经营场景的财务数据管理系统。支持 Excel 账目导入、月度手工录入、经营看板、门店 PK、用户权限和跨设备共享数据。

---

## 功能一览

| 功能 | 说明 |
| --- | --- |
| 数据看板 | 按年份/月份/门店筛选，查看营业额、支出、毛利率等八项指标，全年视图带月度趋势折线图和同比，月份视图带环比 |
| 月度录入 | 按门店+年份+月份录入收入渠道、支出渠道、订货支出、工资支出和提现，并独立记录收支明细 |
| Excel 导入 | 支持 `.xls`/`.xlsx`，导入前提供预览，自动跳过空月份，自动创建不存在的门店 |
| 门店 PK | 选两家门店做同周期对比，查看逐项数值、差值和领先方，支持切换指标查看全年趋势 |
| 门店管理 | 新增、重命名、删除门店（删除会连带清理其月度记录和年度目标） |
| 用户和权限 | 创建观察者账号、分配可见门店、改密码、查看上次登录时间 |

---

## 快速开始

### 方式一：运行服务

发布包已带构建好的前端（`dist/`）。服务端需要安装依赖并连接 MySQL。

1. **安装 Node.js 22.5+**（推荐 24）：https://nodejs.org
2. **安装依赖并配置 MySQL**：
   ```bash
   npm ci --omit=dev
   # 配置 MYSQL_HOST、MYSQL_USER、MYSQL_PASSWORD、MYSQL_DATABASE
   ```
3. **启动**：
   - Windows：双击 `start.bat`
   - macOS：双击 `start.command`（首次可能需在「系统设置 → 隐私与安全性」允许运行）
   - 或终端执行：`node server.mjs`
4. **打开浏览器**：访问 http://localhost:5174

看到 `Store dashboard server listening on http://0.0.0.0:5174` 即启动成功。

> 升级时只替换代码并重新构建，不需要复制容器本地目录；MySQL 数据库保持不变。

### 方式二：从源码开发

```bash
npm install        # 安装依赖
npm run server     # 后端 + MySQL（默认 5174）
npm run dev        # 终端 2：前端开发服务（默认 5173，/api 代理到 5174）
```

构建生产文件：`npm run build`（输出到 `dist/`），再用 `npm start` 一并提供页面和 API。

---

## 初始管理员

首次启动时自动创建：

| 项目 | 值 |
| --- | --- |
| 账号 | `wyb` |
| 初始密码 | `123456` |
| 角色 | 管理员 |

登录后请在「权限管理」中修改密码。密码经 `scrypt` 加盐哈希存储，不保存明文。

> 没有找回密码流程：管理员密码遗失时需直接维护数据库或增加恢复工具。

---

## 用户角色与权限

| 功能 | 管理员 | 观察者 |
| --- | --- | --- |
| 数据看板 | 全部门店 | 仅授权门店 |
| 门店 PK | 全部门店 | 仅授权门店 |
| 月度录入和 Excel 导入 | ✅ | ❌ |
| 门店管理 | ✅ | ❌ |
| 用户和权限管理 | ✅ | ❌ |

权限不仅由前端菜单控制，服务端接口也会校验：观察者向数据写入接口发请求会收到 `403`，读取 `/api/data` 时服务端会过滤掉未授权门店的数据。

---

## 核心计算规则

```
营业额实收 = 所有收入渠道金额之和
总支出     = 所有支出渠道金额之和
订货占比   = 订货支出 / 营业额实收
工资占比   = 工资支出 / 营业额实收
毛利率     = (营业额实收 - 总支出) / 营业额实收
```

> 营业额实收 ≤ 0 时，订货占比、工资占比和毛利率均按 0 处理。
>
> 收支明细只用于记录和阅读，**不参与**上述任何计算。

---

## Excel 导入规则

系统寻找包含"店、月、营业额"表头的工作表作为汇总页，并尝试识别明细工作表。

**汇总页：**
- 门店名称和月份用于定位月度记录
- 渠道中正数归入收入，负数归入支出（支出以绝对值保存）
- `订货总支出`→订货支出，`工资`→工资支出，`提现`/`提取`列→总提现
- 提现不计入收入渠道，避免抬高营业额实收和毛利率
- 全空或全 0 的月份会被忽略
- Excel 中出现不存在的门店时自动创建

**明细页：**
- 识别月份、日期、明细/摘要、收入、支出列
- 写入对应月份的收入明细和支出明细，不参与经营指标计算
- 重新导入同一月份时替换 Excel 来源的数据，保留手工新增内容

---

## 常用命令

```bash
npm run dev       # 前端开发服务
npm run server    # 后端和 MySQL 服务
npm run build     # TypeScript 检查 + 构建到 dist/
npm run lint      # oxlint 静态检查
npm start         # 生产模式启动，提供页面和 API
npm run preview   # 预览已构建的前端
```

---

## 生产部署

```bash
npm install
npm run build
npm start
```

默认监听 `0.0.0.0:5174`，可自定义：

```bash
HOST=127.0.0.1 PORT=5174 npm start
# Windows: set HOST=127.0.0.1 && set PORT=5174 && npm start
```

**部署建议：**
- 用 PM2 或 systemd 保持服务运行
- 用 Nginx/Caddy 配置域名、HTTPS 反向代理（公网必须 HTTPS）
- 让 Node 服务只监听 `127.0.0.1`，由反向代理对外
- 为 MySQL 配置定期备份
- 升级时不要覆盖现有数据库，程序会自动迁移表结构

详见 [`DEPLOY.md`](./DEPLOY.md)。

### Docker 部署

```bash
docker build -t store-dashboard .
docker run -d -p 80:80 --env-file .env store-dashboard
```

- 容器内默认 `HOST=0.0.0.0 PORT=80`
- 通过云托管环境变量配置 MySQL，不需要挂载容器本地数据目录

---

## 数据存储

生产环境使用 MySQL。启动时会自动创建以下数据表：

| 表 | 用途 |
| --- | --- |
| `app_state` | 业务数据 JSON（门店、月度记录、年度目标） |
| `users` | 用户、密码哈希、角色、上次登录时间 |
| `observer_store_permissions` | 观察者与可查看门店的对应关系 |
| `sessions` | 登录会话令牌哈希和过期时间 |

> 业务数据采用单条 JSON 保存，适合轻量服务器和小团队。不支持高并发协同录入（最后写入结果覆盖之前的）。MySQL 负责持久化，浏览器缓存不会自动覆盖服务器数据。

---

## 技术栈

- **前端**：React 19 + TypeScript + Vite 8 + Tailwind CSS 4 + React Router 7
- **图表**：ECharts 6 + echarts-for-react
- **Excel**：@e965/xlsx
- **后端**：Node.js 原生 HTTP 服务（`node:http`）+ MySQL（`mysql2`）
- **生产环境需要 MySQL 8.0+（云托管 MySQL 或其他托管 MySQL）**

---

## 项目结构

```
store-dashboard/
├─ server.mjs                 # 后端：HTTP 服务、MySQL、认证、API
├─ dist/                      # 已构建的前端（发布包附带）
├─ src/
│  ├─ main.tsx                # 应用入口
│  ├─ App.tsx                 # 路由和权限保护
│  ├─ types.ts                # 核心业务类型
│  ├─ context/DataContext.tsx # 数据加载、缓存、离线降级
│  ├─ pages/                  # Login, Dashboard, DataEntry, StorePK, Stores, UserManagement
│  ├─ components/             # Layout, FilterBar, KpiCards, LineChart, charts, ui/*
│  └─ lib/                    # auth, storage, excelImport, aggregates, formulas 等
├─ Dockerfile                 # 容器部署
├─ start.bat / start.command  # 一键启动脚本
├─ DEPLOY.md                  # 部署说明
└─ START_HERE.md              # 三步启动速查
```

---

## 页面路由

| 路由 | 页面 | 权限 |
| --- | --- | --- |
| `/login` | 登录 | 公开 |
| `/` | 数据看板 | 已登录 |
| `/pk` | 门店 PK | 已登录 |
| `/data` | 月度录入 | 管理员 |
| `/stores` | 门店管理 | 管理员 |
| `/users` | 用户和权限管理 | 管理员 |

---

## API 概览

| 方法和路径 | 说明 | 权限 |
| --- | --- | --- |
| `POST /api/auth/login` | 登录 | 公开 |
| `POST /api/auth/logout` | 退出 | 已登录 |
| `GET /api/auth/me` | 获取当前用户 | 已登录 |
| `GET /api/data` | 读取业务数据（观察者自动过滤） | 已登录 |
| `PUT /api/data` | 保存业务数据 | 管理员 |
| `GET /api/users` | 获取用户列表 | 管理员 |
| `POST /api/users` | 创建观察者 | 管理员 |
| `DELETE /api/users/:id` | 删除观察者 | 管理员 |
| `GET /api/users/:id/permissions` | 获取观察者门店权限 | 管理员 |
| `PUT /api/users/:id/permissions` | 更新观察者门店权限 | 管理员 |
| `PUT /api/users/:id/password` | 修改密码 | 管理员 |

---

## 登录和会话

- 登录后设置 `HttpOnly`、`SameSite=Lax` 的会话 Cookie，有效期 7 天
- 令牌以 SHA-256 哈希存储
- 退出登录删除当前会话
- 观察者读取 `/api/data` 时服务端自动过滤未授权门店

---

## 开发维护约束

修改代码时必须遵守：

1. 营业额实收和总支出必须来自渠道合计，不能改为手工输入
2. 收支明细不参与 KPI、利润率、渠道合计或门店 PK 计算
3. Excel 负数渠道归支出，汇总列必须排除避免重复
4. Excel 全空或全 0 月份必须忽略
5. 重新导入 Excel 时保留手工渠道和手工明细
6. 观察者权限必须在服务端执行，不能只隐藏前端菜单
7. 管理员路由需同时保留前端保护和服务端校验
8. 密码不能明文存储
9. 删除门店时同步删除其月度记录和年度目标
10. 看板全年视图用同比，月份视图用环比，折线图只在全年视图显示

修改后至少执行：

```bash
npm run build && npm run lint && node --check server.mjs
```

---

## 已知限制

- 年份范围固定为 2024–2030（见 `src/types.ts` 的 `YEARS`）
- 业务数据整体写入单条 JSON，不支持逐记录并发冲突处理
- 没有"忘记密码"流程
- 会话表无定时清理过期记录
- 首次启动写入的是演示数据，需替换为真实经营数据

---

## 版本

当前版本：**v3.0**（见 `VERSION.txt`）

登录页右上角显示 `V03.0`，页面底部显示 `门店财务运营看板 · V3.0`。
