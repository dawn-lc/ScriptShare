# ScriptShare

用户脚本分发平台 —— 上传、管理和分发 Tampermonkey / Violentmonkey 用户脚本。

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
├── package.json              # 根工作空间
├── client/                   # React 前端
│   ├── src/
│   │   ├── api/              # API 请求封装
│   │   ├── components/       # 通用组件（Layout, ConfirmDialog, ScriptIcon, StarRating）
│   │   ├── contexts/         # React Context（AuthContext）
│   │   ├── locales/          # 国际化（zh-CN, en-US）
│   │   ├── pages/            # 页面组件
│   │   └── utils/            # 工具函数（环境检测, PoW 求解器, 主题切换）
│   └── ...
├── server/                   # Express 后端
│   ├── src/
│   │   ├── config/           # 配置 + 风控参数
│   │   ├── db/               # 数据库 schema + 连接
│   │   ├── middleware/       # 认证中间件（JWT + PBKDF2）
│   │   ├── models/           # TypeScript 接口定义
│   │   ├── routes/           # API 路由（auth, scripts, stats, cap, debug, webhook）
│   │   ├── utils/            # 工具（Cap 集成, 风控, 校验, IP 处理, 审计）
│   │   └── index.ts          # 入口
│   ├── drizzle/              # 数据库迁移文件
│   └── scripts/              # 工具脚本
└── ...
```

## API 概览

| 方法   | 路径                              | 说明                         |
| ------ | --------------------------------- | ---------------------------- |
| POST   | `/api/auth/register`              | 注册                         |
| POST   | `/api/auth/login`                 | 登录                         |
| GET    | `/api/scripts`                    | 脚本列表（分页、搜索、排序） |
| GET    | `/api/scripts/:id`                | 脚本详情                     |
| POST   | `/api/scripts`                    | 上传脚本（需认证）           |
| PUT    | `/api/scripts/:id`                | 更新脚本（需认证）           |
| DELETE | `/api/scripts/:id`                | 删除脚本（需认证）           |
| GET    | `/api/scripts/:id/script.user.js` | 安装脚本（触发管理器）       |
| GET    | `/api/scripts/:id/code`           | 获取源码                     |
| GET    | `/api/scripts/:id/ratings`        | 获取评分                     |
| POST   | `/api/scripts/:id/rate`           | 提交评分（需认证）           |
| POST   | `/api/cap/challenge`              | 创建 PoW 挑战                |
| POST   | `/api/cap/redeem`                 | 兑换挑战 Token               |

## 环境变量

| 变量             | 说明                      | 默认                                      |
| ---------------- | ------------------------- | ----------------------------------------- |
| `PORT`           | 服务端口                  | `3000`                                    |
| `NODE_ENV`       | 运行环境                  | `development`                             |
| `DB_DIALECT`     | 数据库方言                | `sqlite`                                  |
| `DATABASE_URL`   | PostgreSQL 连接串（生产） | `postgresql://localhost:5432/scriptshare` |
| `SESSION_SECRET` | JWT 签名密钥              | _必需_                                    |
| `TRUST_PROXY`    | 信任代理层数              | `1`                                       |
| `CORS_ORIGIN`    | CORS 允许源               | `http://localhost:3000`                   |
| `DEBUG_ENABLED`  | 启用调试 API              | `false`（设为 `true` 开启）               |
| `RISK_*`         | 风控参数覆盖              | 见 `config/risk.ts`                       |

## 许可证

MIT
