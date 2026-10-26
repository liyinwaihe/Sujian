# Dear Blog — 独立极简博客程序

不依赖 WordPress、不依赖 Typecho、不依赖任何 npm 包。视觉复刻 [Bear Blog](https://bearblog.dev) / [Dear 主题](https://github.com/imjeff/typecho-dear) 的单栏纯文本排版，配色遵循「极简单色纸感」设计规范（黑白灰 + 少量金/红，霞鹜文楷，亮/暗双主题）。

## 运行

```bash
cp config.example.json config.json   # 首次运行前，改掉里面的 adminPassword
node server.js
# 打开 http://localhost:3000
# 后台：http://localhost:3000/admin
```

仅此而已。没有 `npm install`，没有构建，任何装有 Node.js（≥16）的机器直接跑。

> 想更安全：启动前设置环境变量 `ADMIN_PASSWORD=你的密码`（优先级高于 config.json），或在后台「站点设置」里改密码——密码会写回 config.json。

## 写作

1. 在 `content/posts/` 新建 `my-first-post.md`：

```markdown
---
title: 我的第一篇
date: 2026-10-26
category: 随笔
tags: [开始]
---

正文用 Markdown 写。
```

2. 保存，刷新页面，即已发布。`draft: true` 可隐藏草稿。
3. 首页外露的「关于」内容改 `content/about.md`。
4. 站名、导航、每页篇数改 `config.json`。

## 功能

### 前台

- 首页：关于外露 + 近期文章（日期 分类 · 标题，默认 8 篇）+ 分页
- 文章页：Markdown 渲染（标题/引用/代码块/表格/图片/列表），标签行
- 归档 `/archive`：按年月分组
- 搜索 `/search?q=`：标题、标签、分类、正文全文匹配
- 订阅 `/feed.xml`：RSS 2.0
- 暗色模式：跟随系统 + 页脚按钮切换 + localStorage 记忆
- 错误页：404 / 405（前台只读，非 GET 一律 405）

### 后台 `/admin`

- 登录：密码 + HMAC 签名 Cookie 会话（HttpOnly / SameSite=Lax，7 天有效）
- 防爆破：10 分钟内错 5 次锁定，返回 429
- 写文章：标题/日期/分类/标签/草稿/Markdown 正文；中文标题自动用日期生成 slug；支持 CSRF Origin 校验
- 草稿：勾选后前台与 RSS 均不显示
- 管理：文章列表、编辑、删除（删除前二次确认语义由按钮承担）
- 站点设置：站名、副标题、作者、每页篇数、页脚、导航（`名称 | 链接` 每行一项）、修改管理密码
- 关于：编辑首页外露的关于内容（Markdown）
- 预览：`POST /admin/preview` 返回渲染后的 HTML 片段

## 结构

```
dear-blog/
├── server.js              入口（只装配）
├── config.json            站点配置（不提交版本库，复制 config.example.json 改名）
├── data/secret.key        首次启动自动生成的会话签名密钥（勿提交版本库）
├── content/
│   ├── about.md           首页关于内容
│   └── posts/*.md         文章（front-matter + Markdown）
├── lib/
│   ├── router.js          路由分发（前台 + 后台委派）
│   ├── site.js            配置/文章加载/front-matter
│   ├── markdown.js        内置渲染器
│   ├── templates.js       前台页面模板
│   ├── admin.js           后台业务（登录/增删改/设置/关于/预览）
│   ├── admin-templates.js 后台页面模板
│   ├── auth.js            HMAC 会话 + 登录限速
│   └── send.js            统一响应出口
└── public/style.css       唯一样式表（前台 + 后台同一套设计令牌）
```

## 设计规范

样式表头部即令牌区：`--bg/--text/--text-light/--faint/--border/--box-border/--box-bg` 亮暗两套，金色仅用于当前导航项，红色保留给错误态。字体霞鹜文楷（本机未安装时自动回退系统字体）。全站无 JS 框架、无外部请求。

## 部署到服务器

程序无状态、零依赖，部署只需把目录传上去跑起来：

```bash
# 本地打包（已提供 dear-blog-deploy.tar.gz）
tar --exclude='server.log' --exclude='data/secret.key' -czf dear-blog-deploy.tar.gz .

# 上传并解压
scp dear-blog-deploy.tar.gz root@YOUR_SERVER:/opt/
ssh root@YOUR_SERVER "mkdir -p /opt/dear-blog && tar -xzf /opt/dear-blog-deploy.tar.gz -C /opt/dear-blog"

# 执行部署脚本（含 Node 版本检查、语法自检、启动、健康检查）
ssh root@YOUR_SERVER "cd /opt/dear-blog && chmod +x deploy.sh && ADMIN_PASSWORD=你的后台密码 ./deploy.sh 3000"
```

生产建议用 systemd 守护（在服务器上创建 `/etc/systemd/system/dear-blog.service`）：

```ini
[Unit]
Description=Dear Blog
After=network.target

[Service]
WorkingDirectory=/opt/dear-blog
ExecStart=/usr/bin/node /opt/dear-blog/server.js
Environment=PORT=3000
Environment=ADMIN_PASSWORD=改成强密码
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
systemctl enable --now dear-blog
```

外网访问建议加 Nginx 反代（80/443 -> 127.0.0.1:3000）并配 HTTPS。别忘了服务器防火墙放行对应端口。

## 部署到 Vercel（可选）

仓库已含 Vercel 适配层（`api/index.js` + `vercel.json`），两种方式任选：

**方式 A：GitHub 一键部署（推荐）**

1. 登录 [vercel.com](https://vercel.com)，Add New → Project → Import `liyinwaihe/dear-blog`
2. Framework Preset 选 **Other**，直接 Deploy
3. 部署后在 Settings → Environment Variables 添加：

| 变量 | 值 | 说明 |
|------|-----|------|
| `ADMIN_PASSWORD` | 你的后台密码 | 必设，否则无法登录后台 |
| `SESSION_SECRET` | 任意长随机串 | 必设，否则实例更替后登录态失效 |

**方式 B：Vercel CLI**

```bash
npm i -g vercel
cd dear-blog
vercel --prod
# 首次部署后同样到控制台补上面两个环境变量并 Redeploy
```

### Vercel 环境与自建服务器的差异（读一遍再决定）

| 能力 | Vercel 上 | 自建服务器上 |
|------|-----------|--------------|
| 前台阅读/搜索/RSS | 完全可用 | 完全可用 |
| 写文章到本地文件 | **不可用**（文件系统只读） | 可用 |
| 后台登录 | 可用（会话需 `SESSION_SECRET`） | 可用 |
| 后台发文/删文/设置 | **不可用**（写操作会被文件系统拒绝） | 可用 |

结论：**Vercel 适合「本地写 Markdown → git push → 自动发布」的纯静态用法**；需要在线后台写作就留在你的宝塔服务器上，两边可以同时跑（同一个 GitHub 仓库，Vercel 自动跟随 push 更新前台内容）。

## 致谢

- [Dear 主题](https://github.com/imjeff/typecho-dear)（CC BY-NC-SA 4.0）— 排版结构复刻来源
- [Bear Blog](https://bearblog.dev) — 极简博客的原始精神
