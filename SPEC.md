# Spec — 素笺 Sujian（独立极简博客程序）

> 生成日期：2026-10-26
> 基于：用户需求「做一个脱离 WordPress & Typecho 的独立程序」+ 用户极简单色纸感设计规范（minimalist-paper-ui）
> 状态：已确认（用户指令明确，MVP 直接交付）

## 1. 产品定义

- **一句话描述**：一个不依赖 WordPress/Typecho 的单用户极简博客独立程序，视觉参考 Bear Blog 的纯文本单栏风格，并遵循用户的极简单色纸感设计规范。
- **目标用户**：想要零依赖、静态感、纯文本写作体验的个人博主。
- **核心问题**：跑 WordPress/Typecho 需要 PHP + MySQL + 插件维护；本程序只要 Node.js 一个运行时，零依赖、单文件配置、Markdown 放进文件夹即发布。

## 2. MVP 范围（锁定）

| 优先级 | 功能 | 验收标准摘要 |
|--------|------|-------------|
| P0 | 文章系统 | content/posts/*.md 放入即发布；Markdown→HTML；front-matter（title/date/tags/category/draft） |
| P0 | 首页 | 站名 h1 + 导航 + about 内容外露 + 「近期文章」日期/分类/标题列表（默认 8 篇） |
| P0 | 文章页 | 标题、分类·日期 meta、正文排版、#标签行 |
| P0 | 归档页 | 全部文章按「YYYY年MM月」分组列表 |
| P0 | 搜索页 | GET /search?q= 全文标题+正文匹配，结果列表与空结果提示 |
| P0 | RSS | /feed.xml 输出 RSS 2.0 |
| P0 | 暗色模式 | 极简规范令牌：.dark 类切换 + localStorage + prefers-color-scheme，页头主题切换按钮 |
| P1 | 405 页 | 非法方法返回 405，页面呈现统一页脚风格 |
| P1 | 分页 | 首页「较早的文章」分页（?page=2） |

## 3. 明确不做（Out-of-Scope — 锁定）

| 不做的功能 | 原因 | 何时考虑 |
|------------|------|----------|
| 在线编辑后台/登录 | MVP 保持零依赖纯文件写作；本地编辑器即可 | v2 |
| 评论系统 | Dear 默认亦无评论；保持纯文本 | 接 giscus 等外部服务时 |
| 图片上传/媒体库 | 纯文本定位，图片走 Markdown 外链 | v2 |
| 数据库 | 文章量级为个人博客，文件系统即数据库 | 永不（除非多用户） |
| 多主题/字体方案切换 | 遵循用户单一极简规范（霞鹜文楷） | 永不（规范锁定） |

## 4. 技术架构（锁定 — 含版本锚定）

| 层 | 技术 | 实际版本 | 锁定原因 |
|----|------|----------|----------|
| 运行时 | Node.js（managed） | 22.22.2 | 本机已装，http 内置模块零依赖 |
| 服务端 | Node http + 手写微型路由 | 0 依赖 | 零 npm install，任何装了 Node 的机器 node server.js 即跑 |
| 模板 | 手写极简模板函数 | 0 依赖 | 页面结构极简，无需模板引擎 |
| Markdown | 内置解析器（约 80 行） | 0 依赖 | 支持标题/粗斜体/行内代码/代码块/引用/列表/链接/图片/表格/hr |
| 数据库 | 文件系统（content/） | - | 见 Out-of-Scope |
| 部署 | 任意 Node 主机 / 云函数 | - | 单进程无状态 |
| 认证 | 无（只读公开站点） | - | 见 Out-of-Scope |

## 5. 路由清单（锁定）

| Method | Path | 功能 | 响应 |
|--------|------|------|------|
| GET | / | 首页：about 外露 + 近期文章 8 篇 + 分页 | 200 HTML |
| GET | /post/:slug | 文章页 | 200 HTML / 404 |
| GET | /archive | 归档：按年月分组 | 200 HTML |
| GET | /search | 搜索页（q 参数） | 200 HTML |
| GET | /feed.xml | RSS 2.0 | 200 XML |
| GET | /style.css | 样式表 | 200 CSS |
| * | 其他 | 404 页 | 404 |
| 非 GET | 任意 | 仅读站点 | 405 |

## 6. 数据库表清单（锁定）

无数据库。文件即数据：

```
content/posts/*.md   文章（front-matter + Markdown 正文）
content/about.md     首页外露的关于内容
config.json          站点配置（title/subtitle/导航/每页篇数）
```

front-matter 字段：`title`（必填）、`date`（YYYY-MM-DD，缺省用文件 mtime）、`tags`（数组）、`category`（字符串）、`draft`（true 时不发布）。

## 7. 页面清单（锁定）

| 页面 | 路由 | 核心组件 | 设计 Token 主题 |
|------|------|----------|-----------------|
| 首页 | / | 站名标题、nav、about、h3 近期文章、ul.posts 日期+分类+标题 | 极简单色纸感·内容页 760px |
| 文章页 | /post/:slug | h1 标题、meta 行、正文排版（引用/代码/表格/图片）、#标签 | 同上 |
| 归档 | /archive | h1 + 年月 h3 分组 + ul.posts | 同上 |
| 搜索 | /search?q= | 搜索表单 + 结果列表/空态 | 同上 |
| 404/405 | * | 简单提示 + 返回首页链接 | 同上 |

## 8. 设计 Token（锁定 — 极简单色纸感规范）

- **色彩**：仅规范令牌灰阶（--bg/--text/--text-light/--faint/--border/--box-border/--box-bg），金色 #9a7b12/#d4af37 仅用于当前导航项标记，红色仅用于错误态。**禁止 Dear 原版蓝/紫链接色**（--link-color #3273dc、--visited-color #8b6fcb 不引入），链接统一文字色 + hover 下划线（规范 8 节）。
- **字体**：`"LXGW 975 Yuan SC 400W", system-ui, -apple-system, sans-serif`；正文 400/1.6，标题 600/700；代码块等宽栈。
- **布局**：单栏居中 max-width 760px，body padding 2rem 1.5rem；日期列 flex 0 0 115px 复刻 Dear。
- **圆角**：输入框/按钮 6px、代码 4px 内嵌、卡片 8px；无 >12px。
- **暗色**：html.dark 切换令牌 + localStorage('theme') + prefers-color-scheme；切换无过渡动画。
- **图标**：主题切换按钮内联线性 SVG（太阳/月亮，20px，currentColor），全站无 emoji。
- **动效**：链接下划线 hover、focus-visible 描边、prefers-reduced-motion 适配。

## 9. 验收标准（EARS）

| 编号 | 功能 | EARS 验收标准 | 优先级 |
|------|------|---------------|--------|
| AC-01 | 首页 | When GET /，系统必须返回 200 且包含「近期文章」与 8 篇文章的日期/分类/标题 | P0 |
| AC-02 | 文章页 | When GET /post/hello-dear，系统必须返回 200 且正文含渲染后的 h2/p/blockquote/代码块 | P0 |
| AC-03 | 404 | When GET /post/not-exist，系统必须返回 404 且页面含「404」与返回首页链接 | P0 |
| AC-04 | 搜索 | When GET /search?q=极简，系统必须返回 200 且列表含标题或正文命中该词的文章 | P0 |
| AC-05 | 搜索空态 | When GET /search?q=zzzz不存在，系统必须返回 200 且显示「没有找到相关文章」 | P0 |
| AC-06 | 归档 | When GET /archive，系统必须返回 200 且按「YYYY年MM月」分组全部文章 | P0 |
| AC-07 | RSS | When GET /feed.xml，系统必须返回 200 且 Content-Type 为 application/rss+xml 且含 channel/item | P0 |
| AC-08 | 405 | When POST /，系统必须返回 405 | P0 |
| AC-09 | 样式 | When GET /style.css，系统必须返回 200 且含 --bg、.dark 令牌，不含 #3273dc/#8b6fcb/linear-gradient | P0 |
| AC-10 | P0 规则 | 全部 HTML 产物经 emoji 正则扫描必须为 0 命中；全部 CSS 不得出现渐变/重阴影/胶囊按钮/彩色 | P0 |
| AC-11 | 排版保真 | 首页文章行必须为「日期 分类 · 标题」三段式（复刻 Dear index.php 结构） | P1 |

## 10. 边界与约束

- 零外部依赖：不执行 npm install，无 CDN/外链字体/外链 JS。
- 端口 3000（PORT 环境变量可覆盖）。
- 中文站点，lang=zh-CN。
- 路径安全：slug 解码后禁止包含 `..` 与 `/`。
- 响应式：640px 断点收窄、日期列保持可读；400px 以下缩紧。

## 11. 内嵌已知坑

| 坑 | 指纹 | 根因 | 修法 |
|----|------|------|------|
| Windows 控制台 GBK 乱码 | node-win32-console | stdout 默认非 UTF-8 | 打印 ASCII 英文日志，不打印中文 |
| fs.readdir 顺序不稳定 | node-fs-order | 文件系统返回顺序不定 | 按 date desc + 文件名排序 |
| URL 中文查询乱码 | node-url-encoding | 手动解析 query 不 decode | 用 URLSearchParams（自动 UTF-8 解码） |

## 12. 端到端验证步骤

```bash
# 1. 启动（后台）
node server.js  # 日志: Dear blog running at http://localhost:3000

# 2. 核心成功流
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/                 # 200
curl -s http://localhost:3000/post/hello-dear | grep -c "<h2"                 # >=1
curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/search?q=%E6%9E%81%E7%AE%80"  # 200
curl -s http://localhost:3000/feed.xml | head -5                              # <?xml ... <rss

# 3. 关键错误流
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/post/nope        # 404
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/         # 405

# 4. P0 门禁
curl -s http://localhost:3000/style.css | grep -cE "#3273dc|#8b6fcb|linear-gradient"  # 0
```

## 13. 变更记录

| 日期 | 变更内容 | 原因 | 影响范围 |
|------|----------|------|----------|
| 2026-10-26 | 初版 | MVP 立项 | - |
| 2026-10-26 | v1.1 新增后台 /admin：登录（HMAC Cookie + 限速）、文章增删改（草稿/slug 自动生成/Origin 校验）、站点设置、关于编辑、预览 API | 用户要求补齐在线写作后台 | 新增 lib/auth.js、lib/admin.js、lib/admin-templates.js、lib/send.js；router.js 增 /admin 委派；templates.js 布局支持 body.admin；style.css 追加后台区块；config.json 增 adminPassword 与后台导航项 |

### v1.1 后台验收标准（已全部通过）

| 编号 | 验收项 | 结果 |
|------|--------|------|
| AD-01 | 未登录访问 /admin 必须 302 到 /admin/login | 通过 |
| AD-02 | 错误密码返回 401 并提示 | 通过 |
| AD-03 | 正确密码 303 到 /admin，后续请求带 Cookie 通过 | 通过 |
| AD-04 | 10 分钟内错 5 次后第 6 次返回 429 | 通过 |
| AD-05 | 后台新建文章前台立即可见；中文标题自动生成日期 slug | 通过 |
| AD-06 | 草稿文章前台不外露 | 通过 |
| AD-07 | 编辑保存即时生效；删除后前台 404、文件移除 | 通过 |
| AD-08 | 设置保存（副标题/导航/每页篇数）即时生效 | 通过 |
| AD-09 | 预览 API 返回渲染 HTML 片段 | 通过 |
| AD-10 | 登出清 Cookie，再访问 /admin 重新 302 | 通过 |
| AD-11 | 后台写操作 Origin 校验；正文/表单体积上限防滥用 | 通过 |
| AD-12 | emoji 正则全库扫描 0 命中；后台沿用同一套设计令牌 | 通过 |
