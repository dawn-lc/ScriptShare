# ScriptShare

用户脚本分发平台 —— 上传、管理和分发 Tampermonkey / Violentmonkey 用户脚本。

## 功能特性

- **脚本管理** — 上传、编辑、删除用户脚本，支持稳定版和 canary 测试版
- **安装统计** — 跟踪脚本安装量和版本更新检查，按浏览器/OS 聚合分析
- **评分系统** — 用户对脚本进行评分（1-5 星）
- **风控系统** — 基于 PoW 验证码 + 设备指纹 + 行为分析的多层防护
- **多语言** — 中文 / English 界面切换
- **主题切换** — 浅色 / 深色 / 跟随系统
- **GitHub Webhook** — 关联 GitHub Release，发布时自动同步脚本更新
- **管理后台** — 用户管理、审计日志、Webhook 事件、系统信息监控
- **调试 API** — 测试数据填充、数据库重置（仅本地可用）

## 快速开始

```bash
# 安装所有依赖
npm install
npm run install:all

# 生成数据库迁移
npm run db:generate

# 启动开发服务器（前后端同时启动）
npm run dev
```

- 前端：`http://localhost:5173`
- 后端：`http://localhost:3000`

### 填充测试数据

确保服务器运行中，然后：

```bash
npx tsx server/scripts/seed.ts
```

创建 3000 条测试脚本和管理员账号 `admin / admin123`。

## 项目结构

```
ScriptShare/
├── package.json                # 根工作空间
├── client/                     # React 前端（Vite）
│   ├── src/
│   │   ├── api/                # API 请求封装
│   │   ├── components/         # 通用组件
│   │   │   ├── Layout.tsx      # 全局布局（导航栏 + 页脚）
│   │   │   ├── ConfirmDialog.tsx # 确认弹窗
│   │   │   ├── ScriptIcon.tsx  # 脚本图标（自动生成颜色）
│   │   │   └── StarRating.tsx  # 星级评分组件
│   │   ├── contexts/           # React Context
│   │   │   └── AuthContext.tsx  # 全局认证状态
│   │   ├── locales/            # 国际化
│   │   │   ├── i18n.ts         # i18next 配置
│   │   │   ├── zh-CN.json      # 中文翻译
│   │   │   └── en-US.json      # 英文翻译
│   │   ├── pages/              # 页面组件
│   │   │   ├── Home.tsx        # 首页（管理员仪表盘）
│   │   │   ├── ScriptList.tsx  # 脚本列表（搜索/排序/分页）
│   │   │   ├── ScriptDetail.tsx # 脚本详情 + 安装
│   │   │   ├── Upload.tsx      # 上传脚本
│   │   │   ├── EditScript.tsx  # 编辑脚本
│   │   │   ├── ScriptStatsPage.tsx # 脚本统计
│   │   │   ├── Login.tsx       # 登录
│   │   │   ├── Register.tsx    # 注册（含 PoW 验证码）
│   │   │   ├── Settings.tsx    # 用户设置
│   │   │   ├── MyStats.tsx     # 我的统计
│   │   │   ├── Stats.tsx       # 全局统计
│   │   │   └── Admin.tsx       # 管理后台
│   │   └── utils/              # 工具函数
│   │       ├── environment.ts  # 设备指纹 + 环境检测
│   │       ├── cap-solver.ts   # PoW 验证码求解器
│   │       ├── theme.ts        # 主题管理
│   │       ├── useSystemTheme.ts # 系统主题 Hook
│   │       └── localize.ts     # 本地化辅助
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── postcss.config.js
├── server/                     # Express 后端
│   ├── src/
│   │   ├── index.ts            # 入口（中间件链 + 路由注册 + SPA 回退）
│   │   ├── config/
│   │   │   ├── index.ts        # 环境配置集中管理
│   │   │   └── risk.ts         # 风控参数配置
│   │   ├── db/
│   │   │   ├── index.ts        # 数据库连接（SQLite / PostgreSQL）
│   │   │   ├── schema.ts       # 统一导出
│   │   │   ├── schema-sqlite.ts # SQLite 表定义
│   │   │   └── schema-pg.ts    # PostgreSQL 表定义
│   │   ├── middleware/
│   │   │   └── auth.ts         # 认证中间件（PBKDF2 + HMAC-SHA256）
│   │   ├── models/
│   │   │   └── script.ts       # TypeScript 类型定义
│   │   ├── routes/
│   │   │   ├── auth.ts         # 认证路由
│   │   │   ├── scripts.ts      # 脚本 CRUD 路由
│   │   │   ├── stats.ts        # 统计路由
│   │   │   ├── cap.ts          # PoW 验证码路由
│   │   │   ├── webhook.ts      # GitHub Webhook 接收器
│   │   │   └── debug.ts        # 调试路由（仅本地）
│   │   └── utils/
│   │       ├── cap.ts          # Cap.js 集成
│   │       ├── risk.ts         # 风控逻辑
│   │       ├── validate.ts     # 输入校验
│   │       ├── ip.ts           # IP 处理
│   │       └── audit.ts        # 审计日志
│   ├── drizzle/                # 数据库迁移文件
│   ├── scripts/                # 工具脚本
│   │   ├── seed.ts             # 测试数据填充
│   │   └── tsconfig.json
│   ├── data/                   # SQLite 数据库存储（gitignore）
│   ├── drizzle.config.ts
│   └── tsconfig.json
├── .gitignore
├── .prettierrc.yaml
└── package.json
```

## API 概览

### 认证 `/api/auth`

| 方法 | 路径                        | 说明                    | 权限   |
| ---- | --------------------------- | ----------------------- | ------ |
| POST | `/api/auth/register`        | 注册新用户              | 公开   |
| POST | `/api/auth/login`           | 登录                    | 公开   |
| POST | `/api/auth/logout`          | 注销                    | 已登录 |
| GET  | `/api/auth/status`          | 认证状态                | 公开   |
| GET  | `/api/auth/me`              | 当前用户信息            | 已登录 |
| PUT  | `/api/auth/me`              | 更新资料（displayName） | 已登录 |
| POST | `/api/auth/change-password` | 修改密码                | 已登录 |

### 脚本 `/api/scripts`

| 方法   | 路径                                 | 说明                                 | 权限          |
| ------ | ------------------------------------ | ------------------------------------ | ------------- |
| GET    | `/api/scripts`                       | 脚本列表（分页、搜索、排序）         | 公开          |
| GET    | `/api/scripts/:id`                   | 脚本详情                             | 公开          |
| GET    | `/api/scripts/:id/code`              | 获取源码                             | 公开          |
| GET    | `/api/scripts/:id/install`           | 安装脚本（记录安装日志）             | 公开          |
| GET    | `/api/scripts/:id/update`            | 更新检查（返回原始代码供管理器更新） | 公开          |
| GET    | `/api/scripts/:id/check-update`      | 更新检查（返回 JSON 供前端 UI 使用） | 公开          |
| GET    | `/api/scripts/:id/:filename.user.js` | 通过 `.user.js` 路径安装脚本         | 公开          |
| POST   | `/api/scripts`                       | 上传脚本                             | 已登录        |
| PUT    | `/api/scripts/:id`                   | 更新脚本                             | 所有者/管理员 |
| DELETE | `/api/scripts/:id`                   | 删除脚本                             | 所有者/管理员 |
| POST   | `/api/scripts/:id/webhook-secret`    | 生成/重置 Webhook 密钥               | 所有者/管理员 |
| GET    | `/api/scripts/:id/webhook-info`      | 获取 Webhook 配置信息                | 所有者/管理员 |
| PUT    | `/api/scripts/:id/github-config`     | 设置 GitHub 仓库信息                 | 所有者/管理员 |
| GET    | `/api/scripts/:id/ratings`           | 获取评分列表                         | 公开          |
| POST   | `/api/scripts/:id/rate`              | 提交评分（1-5 星）                   | 已登录        |

> **渠道说明**：上述 `code`、`install`、`update`、`check-update` 和 `:filename.user.js` 路由均支持在 `/:id/` 后插入 `/stable/` 或 `/canary/` 路径段来指定渠道，例如 `/api/scripts/42/canary/install` 安装 canary 版本，不带渠道前缀时默认为 `stable`。

### 统计 `/api/stats`

| 方法 | 路径                            | 说明             | 权限          |
| ---- | ------------------------------- | ---------------- | ------------- |
| GET  | `/api/stats/overview`           | 平台总览统计     | 公开          |
| GET  | `/api/stats/scripts/:id`        | 单脚本统计       | 所有者/管理员 |
| GET  | `/api/stats/trends`             | 趋势数据         | 管理员        |
| GET  | `/api/stats/my`                 | 当前用户统计     | 已登录        |
| GET  | `/api/stats/admin/users`        | 用户列表 + 统计  | 管理员        |
| GET  | `/api/stats/admin/audit-logs`   | 审计日志         | 管理员        |
| GET  | `/api/stats/admin/webhook-logs` | Webhook 事件日志 | 管理员        |
| GET  | `/api/stats/admin/system`       | 系统信息         | 管理员        |

### 验证码 `/api/cap`

| 方法 | 路径                 | 说明              | 权限 |
| ---- | -------------------- | ----------------- | ---- |
| POST | `/api/cap/challenge` | 创建 PoW 挑战     | 公开 |
| POST | `/api/cap/redeem`    | 提交验证码解      | 公开 |
| POST | `/api/cap/verify`    | 验证 Token 有效性 | 公开 |

### Webhook `/api/webhook`

| 方法 | 路径                       | 说明                    | 权限 |
| ---- | -------------------------- | ----------------------- | ---- |
| POST | `/api/webhook/scripts/:id` | GitHub Release 自动同步 | HMAC |

### 调试 `/api/debug`（仅本地 127.0.0.1）

| 方法 | 路径               | 说明                 |
| ---- | ------------------ | -------------------- |
| POST | `/api/debug/seed`  | 填充 3000 条测试数据 |
| POST | `/api/debug/reset` | 清空数据库           |

## 环境变量

| 变量             | 说明              | 默认                                      |
| ---------------- | ----------------- | ----------------------------------------- |
| `PORT`           | 服务端口          | `3000`                                    |
| `NODE_ENV`       | 运行环境          | `development`                             |
| `DB_DIALECT`     | 数据库方言        | `sqlite`                                  |
| `DATABASE_URL`   | PostgreSQL 连接串 | `postgresql://localhost:5432/scriptshare` |
| `SESSION_SECRET` | 签名密钥          | _必需_                                    |
| `TRUST_PROXY`    | 信任代理层数      | `1`                                       |
| `CORS_ORIGIN`    | CORS 允许源       | `http://localhost:3000`                   |
| `DEBUG_ENABLED`  | 启用调试 API      | `false`（设为 `true` 开启）               |
| `RISK_*`         | 风控参数覆盖      | 见 `config/risk.ts`                       |

## 许可证

MIT
