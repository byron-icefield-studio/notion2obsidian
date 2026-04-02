# Notion2Obsidian

一个面向本地使用场景的 Notion -> Obsidian 数据迁移工具。

项目提供 Web 界面来浏览 Notion 工作区中的数据库与页面，并按可配置的路径模板、Markdown 模板和图片存储策略，将内容批量写入本地 Obsidian Vault。

## 功能概览

- 浏览 Notion 工作区中的数据库和独立页面
- 支持勾选数据库或单个页面进行迁移
- 自动将数据库展开为页面后逐条迁移
- 支持自定义目标路径模板
- 支持自定义 Markdown 输出模板
- 支持将图片下载到相对路径或绝对路径目录
- 迁移过程通过 SSE 实时反馈进度
- 支持中途取消迁移任务

## 项目结构

```text
.
├── src/client              # 前端界面 / React + Zustand + Vite
├── src/server              # 后端服务 / Express + Notion API
├── dist/client             # 前端构建产物
├── dist/server             # 后端构建产物
├── package.json
└── README.md
```

## 技术栈

- 前端：React 18、Vite、Zustand、lucide-react
- 后端：Express、TypeScript、`@notionhq/client`
- 内容转换：`notion-to-md`
- 运行方式：单服务启动，开发环境下由 Express 挂载 Vite 中间件

## 启动前准备

### 1. 创建 Notion Integration

1. 打开 `https://www.notion.so/my-integrations`
2. 创建一个 Integration
3. 复制生成的 Token
4. 将需要迁移的页面或数据库共享给该 Integration

如果页面没有共享给 Integration，界面里可能显示“未发现数据”。

### 2. 确认本地 Obsidian Vault 路径

迁移输出会直接写入你指定的 Vault 目录，请确保该目录存在且当前账号有写权限。

## 安装与运行

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

默认会启动在 `http://localhost:3000`。

### 生产构建

```bash
npm run build
```

### 生产启动

```bash
npm run start
```

## 使用流程

### 1. 打开设置

进入页面后，先点击右上角“设置”。

### 2. 配置 Notion Token

- 粘贴 Notion Integration Token
- 点击“测试连接”确认能读取到工作区内容
- 保存后会自动加载可迁移的数据

### 3. 配置 Obsidian Vault 路径

- 指定本地 Vault 根目录
- 可通过目录浏览器选择路径
- 目录浏览器只允许访问当前用户主目录及其子目录

### 4. 选择需要迁移的内容

- 可直接选择整个数据库
- 也可展开数据库后只选择其中部分页面
- 支持选择独立页面

### 5. 配置迁移规则

右侧面板支持配置以下内容：

- 目标路径模板
- 图片保存方式
- Markdown 文件模板

### 6. 开始迁移

点击“开始迁移”后，系统会：

1. 收集所选页面
2. 将 Notion 内容转换为 Markdown
3. 下载页面中的图片资源
4. 将 Markdown 和图片写入 Obsidian Vault
5. 实时显示进度、成功数量和失败信息

如有需要，可在迁移过程中点击“取消迁移”。

## 默认配置

### 默认目标路径模板

```text
{{database}}/{{title}}
```

### 默认图片目录

```text
./assets
```

默认使用相对路径模式，即图片保存到 Markdown 文件所在目录下的 `assets` 目录。

### 默认 Markdown 模板

```md
---
title: "{{title}}"
date: {{date}}
last_edited: {{last_edited}}
notion_id: {{id}}
{{#each properties}}
{{key}}: {{value}}
{{/each}}
---

{{content}}
```

## 模板变量

### 路径模板变量

| 变量 | 说明 |
| --- | --- |
| `{{title}}` | 页面标题 |
| `{{database}}` | 所属数据库名称 |
| `{{date}}` | 创建日期，格式为 `YYYY-MM-DD` |
| <code>{{date|year}}</code> | 创建年份 |
| <code>{{date|month}}</code> | 创建月份 |
| <code>{{date|day}}</code> | 创建日 |
| `{{last_edited}}` | 最后编辑日期 |
| `{{id}}` | Notion Page ID |
| `{{prop.属性名}}` | 任意数据库属性值 |

### Markdown 模板变量

| 变量 | 说明 |
| --- | --- |
| `{{title}}` | 页面标题 |
| `{{date}}` | 创建日期 |
| `{{last_edited}}` | 最后编辑日期 |
| `{{id}}` | Notion Page ID |
| `{{url}}` | Notion 原始链接 |
| `{{database}}` | 所属数据库名称 |
| `{{content}}` | 转换后的 Markdown 正文 |
| `{{prop.属性名}}` | 任意属性值 |
| `{{#each properties}}...{{/each}}` | 遍历所有属性 |
| `{{key}}` | 属性名，仅在 `each` 块中可用 |
| `{{value}}` | 属性值，仅在 `each` 块中可用 |

### 可用格式化器

支持在变量后追加格式化器，例如：

```text
{{date|year}}
{{date|format:YYYY/MM/DD}}
{{title|slug}}
{{prop.Tags|join:, }}
```

当前实现支持的格式化能力包括：

- 日期：`year`、`month`、`day`、`hour`、`minute`、`timestamp`
- 日期格式：`format:YYYY/MM/DD`
- 字符串：`upper`、`lower`、`trim`、`slug`
- 数组样式值：`join:分隔符`

## 图片处理规则

- 仅处理 Markdown 中的远程图片链接
- 图片文件名会生成为 `UUID.ext`
- Markdown 中的图片引用会转换为 Obsidian 风格的 `![[uuid.ext]]`
- 相对路径模式下，图片目录相对于当前 Markdown 文件所在目录
- 绝对路径模式下，所有图片会写入指定的固定目录

## 文件写入规则

- 页面文件扩展名固定为 `.md`
- 路径中的非法文件名字符会被替换为 `_`
- 如果目标文件已存在，会自动追加当天日期
- 如果追加日期后仍重名，会继续追加计数后缀

示例：

```text
Daily/Standup.md
Daily/Standup-2026-04-03.md
Daily/Standup-2026-04-03-2.md
```

## 后端接口概览

| 接口 | 说明 |
| --- | --- |
| `POST /api/notion/search` | 搜索工作区中的页面与数据库 |
| `POST /api/notion/databases/:id` | 获取数据库结构 |
| `POST /api/notion/databases/:id/entries` | 获取数据库下的页面 |
| `POST /api/notion/pages/:id` | 获取单页信息 |
| `GET /api/fs/home` | 获取当前用户主目录 |
| `GET /api/fs/list` | 列出目录选择器可访问的目录 |
| `POST /api/migration/start` | 启动迁移并通过 SSE 返回进度 |
| `POST /api/migration/cancel` | 按 `sessionId` 取消迁移 |

## 可用脚本

```bash
npm run dev
npm run build:client
npm run build:server
npm run build
npm run start
```

## 注意事项

- Notion Token、Vault 路径和迁移配置会持久化保存在浏览器本地存储中
- 数据库迁移时，系统会先查询数据库中的所有页面，再逐条转换
- 图片下载失败不会中断整页写入，但会在服务端日志中输出错误
- 若 Notion API 遇到 429 限流，服务端会按重试策略自动退避重试
- 该项目当前面向本地使用，不包含登录、权限系统或多用户隔离

## 后续可扩展方向

- 支持过滤数据库条目
- 支持自定义文件命名冲突策略
- 支持更多 Notion block 类型优化
- 支持增量同步而非一次性迁移

## 许可证

当前仓库未声明许可证，如需开源发布，建议补充 `LICENSE` 文件。
