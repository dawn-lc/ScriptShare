---
description: 'Use when: working on the ScriptShare project (Express + React + TypeScript monorepo). Covers project architecture, TypeScript strict mode rules, Drizzle ORM patterns, API design conventions, security guidelines, i18n, dark mode, and frontend component patterns.'
applyTo: '**/*.{ts,tsx,json}'
---

# ScriptShare 项目规范

## 总体原则

1. **先读后写**：修改前先理解现有代码的风格和模式，保持一致
2. **最小改动**：尽量复用现有工具函数和组件，不引入新依赖
3. **防御性编程**：所有外部输入都必须校验和清理
4. **中文注释**：代码中所有注释使用中文，专有名词保留原文

## 1. 项目架构

- **所有终端命令在项目根目录 `D:\code\ScriptShare` 执行**，使用根 `package.json` 的脚本：
    - `npm run dev` — 同时启动前后端（`concurrently`）
    - `npm run build` — 构建前后端
    - `npm run dev:server` — 仅启动后端
    - `npm run dev:client` — 仅启动前端

## 2. TypeScript 规范

- 严格模式开启，禁止 `any`（Proxy 适配和限流消息配置除外）
- 禁止 `as` 断言（`as const` 和注明原因的运行时安全场景除外）
- `req.params` 用 `String()` 转换，`req.query` 用 `String(... ?? '')`
- 导入顺序：外部库 → 项目内部模块 → 相对路径工具

## 3. 安全模式

- 所有密码使用 PBKDF2 哈希，会话用 HMAC 签名 + httpOnly Cookie
- 关键资源操作（创建/修改/删除）需 `requireAuth` + 所有权校验
- 全局限流 + 敏感端点独立限流，Helmet 安全头部，CORS 生产环境限制来源
- PoW 验证码：`POST /api/captcha/challenge` → 客户端求解 → `POST /api/captcha/redeem` → 原子消费（单条 SQL）
    - 挑战参数 `{ c, s, d }`：`c`=子挑战数、`s`=salt 十六进制长度（固定 32）、`d`=目标前缀十六进制字符数（难度）
    - 参数随 challenge 返回，客户端回传时附 HMAC 签名（`CAPTCHA_SIGN_SECRET`），服务端验签后直接验证，无需查 `captcha_challenges` 表
    - 原理：`challenge` 返回时将 `{ token, c, s, d, expires }` 用 HMAC 签名得到 `sig`，发给客户端；兑换时客户端原样送回 `{ token, c, s, d, sig }`，服务端用同一密钥重算签名比对。因攻击者不知道密钥，无法篡改参数，故参数可信，无需查数据库验证
    - 子挑战 salt/target 用 **HMAC-SHA256** 确定性派生：`salt_i = HMAC(token, i)`、`target_i = HMAC(token, i+"d")`，替代手写 PRNG
    - 区块链式链式依赖：`prevNonce = solutions[i-1]`，强制串行计算，抵抗并行化
    - 内存硬哈希用 Argon2id（`hash-wasm`），16MB / 3 轮 / 单路并行，两端参数硬编码一致
    - token 原子消费：`DELETE FROM captcha_tokens WHERE key = ? AND expires > now`，`changes`=0 视为无效
    - 配置：`CAPTCHA_SIGN_SECRET`、`CAPTCHA_SIGN_EXPIRES_MS`、`CAPTCHA_TOKEN_EXPIRES_MS`
- Webhook 使用 HMAC 签名验证，`rawBody` 捕获必须在 JSON 解析之前
- 管理员凭据通过环境变量注入，启动时自动初始化

## 4. 数据库（Drizzle ORM）

- **各方言最优类型原则**：所有字段在各方言中使用各自最高效的存储格式，通过 Drizzle ORM 在运行时透明映射，应用层无感。
    - 整数/布尔 → SQLite `integer` / PG `integer`/ `bigint` / `boolean`
    - 浮点数 → SQLite `real` / PG `double precision`
    - 文本 → SQLite `text` / PG `text` / `varchar`
    - 时间 → SQLite `integer`（Unix 毫秒时间戳）/ PG `timestamp with time zone`
    - JSON → SQLite `text`（存入时 `JSON.stringify`，取出时 `JSON.parse`）/ PG `jsonb`
- 不写原生 SQL；SQLite 下 `returning()` 不可用，需用 `changes`/`rowCount` 判断影响行
- 外键显式 `references()` + `onDelete: 'cascade'`

## 5. API 设计

- RESTful 路由：`GET` 列表/详情、`POST` 创建、`PUT` 更新、`DELETE` 删除
- 认证中间件三层：`requireAuth`（401）、`requireAdmin`（403）、`optionalAuth`
- 响应格式：成功直接 `res.json(data)`，错误 `res.status(code).json({ error, code? })`，分页含 `pagination` 对象
- 错误消息返回中文，输入校验失败立即 return 终止

## 6. 前端模式

- 页面组件放 `pages/`，通用组件放 `components/`，默认导出
- 图标用 `@heroicons/react`（outline 系列），按需 import
- 全局状态用 `AuthContext`（`useAuth()`），页面局部用 `useState`/`useReducer`
- 国际化用 `useTranslation()` + `locales/*.json`，键格式 `module.section.key`
- 数字紧凑格式化使用 `Intl.NumberFormat({ notation: 'compact' })`，不手写多语言分支
- 深色模式用 Tailwind `dark:` 变体 + `transition-colors duration-200`
- 路由保护用 `RequireAuth` / `RequireAdmin` 包裹组件
- 模态对话框用 `await confirm(msg)` / `await alert(msg)` / `await prompt(msg)`，由全局 `DialogProvider` 自实现，`DialogProvider` 在 `main.tsx` 顶层注入
    - `confirm(opts)` → `Promise<boolean>`；`alert(msg, type?)` → `Promise<void>`；`prompt(opts)` → `Promise<string | null>`
    - 选项支持 `title`、`message`、`confirmText`、`cancelText`、`type`（`danger`/`info`/`success`）
    - 支持关闭按钮、ESC 关闭、背景遮罩（点击关闭）、输入框自动聚焦

## 7. 调试 API

- 仅限 `127.0.0.1` 本地访问
- 模拟操作优先调用真实 API 端点（`fetch` 到 localhost），不直接操作数据库
