# AI 智能聊天应用 🤖

基于 Cloudflare Workers AI + D1 数据库的多联系人聊天系统。

## ✨ 功能特性

- **多 AI 助手**：默认内置服务介绍、林晓彤、陈子轩、周思敏等多个助手
- **人设定制**：每个 AI 助手拥有独立的人设提示词，生成个性化回复
- **登录认证**：SHA-256 密码哈希存储，会话管理
- **创建新助手**：支持用户自定义添加 AI 助手
- **聊天历史**：所有对话记录持久化到 D1 数据库
- **流式响应**：SSE 协议实现打字机效果

## 📦 技术栈

- **后端**: Cloudflare Workers (TypeScript)
- **AI**: Cloudflare Workers AI (`@cf/meta/llama-3.1-8b-instruct-fp8`)
- **数据库**: Cloudflare D1
- **前端**: Vanilla JavaScript + CSS

## 🚀 快速开始

### 1. 安装 Wrangler CLI

```bash
npm install -g wrangler
```

### 2. 登录 Cloudflare

```bash
wrangler login
```

### 3. 创建 D1 数据库

```bash
wrangler d1 create chat-db
```

获取数据库 ID，更新 `wrangler.jsonc` 中的 `database_id` 字段。

### 4. 执行数据库初始化

```bash
wrangler d1 execute chat-db --file=schema.sql
```

### 5. 开发模式运行

```bash
npm run dev
```

### 6. 部署到生产环境

```bash
npm run deploy
```

## 🔐 默认账户

- **用户名**: `admin`
- **密码**: `admin123`
- ⚠️ **重要**: 首次登录后请修改默认密码！

## 💬 API 接口

| 接口 | 方法 | 描述 |
|------|------|------|
| `/api/contacts` | GET | 获取所有联系人列表 |
| `/api/contacts` | POST | 创建新联系人（需登录） |
| `/api/chat` | POST | 发送消息获取 AI 回复 |
| `/api/history` | GET | 获取指定联系人的聊天历史 |
| `/api/login` | POST | 用户登录 |
| `/api/auth/check` | GET | 检查认证状态 |

## 🎨 默认助手人设

1. **🤖 服务介绍** (ID: 0) - 专门用于介绍系统功能和引导用户使用
2. **林晓彤** (ID: 1) - 活泼开朗的女孩，爱用表情符号，亲切可爱
3. **陈子轩** (ID: 2) - 专业 IT 工程师，逻辑清晰，简洁专业  
4. **周思敏** (ID: 3) - 设计师，有艺术气息，分享设计灵感

## 🛠️ 故障排查

### 数据库表不存在
```bash
wrangler d1 execute chat-db --file=schema.sql
```

### AI 模型调用失败
检查 Workers AI 是否已启用：`wrangler ai list`

## 📄 License

MIT
