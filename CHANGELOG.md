# 更新日志

本项目的所有重要变更都记录在这里。版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## v1.0.0 — 2026-10-30

首个公开版本。线上实例：<https://blog.liyinwaihe.com>

### 新增

- **零依赖博客内核**：仅用 Node.js 内置模块，无 `npm install`、无构建步骤，Node ≥ 16 直接运行
- **文件即数据库**：`content/posts/*.md` 一个文件一篇文章，front-matter 写标题/日期/分类/标签/草稿
- **前台**：首页（关于 + 近期文章 + 分页）、文章页、归档 `/archive`、标签 `/tags` 与 `/tag/:名称`、搜索 `/search?q=`、RSS 2.0 `/feed.xml`
- **内置 Markdown 渲染器**：标题、引用、代码块、表格、图片、列表、链接、行内样式，无外部依赖
- **在线后台** `/admin`：密码登录、写/改/删文章、草稿、站点设置（站名/副标题/作者/每页篇数/页脚/导航/改密码）、首页关于编辑、文章预览
- **安全**：HMAC 签名 Cookie 会话（HttpOnly + SameSite=Lax，7 天）、Origin CSRF 校验、登录限速（10 分钟 5 次失败锁定）、正文体积上限 100 KB
- **亮/暗双主题**：跟随系统 + 手动切换 + localStorage 记忆，内联脚本防闪白
- **部署**：`deploy.sh`（Node 版本检查 + 语法自检 + 启动 + 健康检查）、systemd 示例、Nginx 反代示例、Vercel 适配层（`api/index.js` + `vercel.json`）

### 修复

- 移动端：正文基准字号偏小、表格第三列被压成竖排（改 `width: max-content` + `overflow-x: auto`）、文章上下篇长标题挤成一行、输入框字号 <16px 触发 iOS 聚焦缩放、主题切换按钮触摸目标偏小
- 后台：未登录跳转时 `Location` 头被吞（`send()` 多处定义漂移，统一收归 `lib/send.js`）
- 登录页：缺 `.btn` 基础类导致渲染成浏览器默认按钮，改为卡片化布局
- RSS：链接协议硬编码 `http://`，改为跟随反代传入的 `X-Forwarded-Proto`
- 静态资源：`style.css` 引用加 `?v=mtime`，改样式后不再需要手动强刷

### 说明

- `config.json`、`data/secret.key`、`.env*`、`.vercel/` 均不入版本库
- Vercel 环境下文件系统只读，仅适合「本地写 Markdown → git push」的静态用法，在线后台写作需自建服务器
