---
title: 素笺 · 一个不依赖框架的博客程序
date: 2026-10-26
category: 部署教程
tags: [素笺, 自建博客]
---

> 当前版本 v1.1.0，最后更新 2026-10-30。你现在看到的这个站，就是它跑出来的。

## 它是什么

一个不依赖 WordPress、不依赖 Typecho、不依赖任何 npm 包的博客程序。下载目录、跑起来、开始写——没有安装向导，没有数据库，没有构建步骤。

单栏纯文本排版参考 [Bear Blog](https://bearblog.dev)：黑白灰为底，金色只用来标当前页，霞鹜文楷，亮暗双主题。

**为什么叫素笺**：素是无装饰，笺是小幅的纸。一张笺写一件事——正好对应它的两条设计：样式极简，一个 Markdown 文件就是一篇文章。

## 它的三个取舍

| 取舍 | 素笺的选择 | 代价 |
|---|---|---|
| 数据存哪 | Markdown 文件，`content/posts/` 就是全部 | 没有后台筛选、批量操作这类数据库带来的便利 |
| 依赖多少 | 零依赖，只用 Node.js 内置模块 | 图片上传、评论这类功能得自己加 |
| 面向谁 | 只想安静写字、不想维护服务器的人 | 不适合多人协作、不适合做内容站 |

## 特性

**前台**：首页（关于外露 + 近期文章 + 分页）、文章页、归档、标签、全文搜索、RSS 2.0、独立 `/about` 页、暗色模式、移动端适配（表格横向滚动不压列）。前台只读，非 GET 请求一律 405。

**后台**：密码登录，HMAC 签名 Cookie 会话，10 分钟内错 5 次锁定。写/改/删文章、草稿、站点设置（站名、副标题、作者、每页篇数、底部栏文字、导航、改密码）、关于编辑、文章预览。底部栏支持 HTML，可以放链接。

**部署**：`deploy.sh` 一键脚本、systemd 服务示例、Nginx 反代示例，另有 Vercel 适配层（只适合「本地写 → git push」的静态用法，在线写作要自建服务器）。

## 跑起来

```bash
cp config.example.json config.json   # 首次运行，改掉里面的 adminPassword
node server.js
```

打开 `http://localhost:3000`，后台在 `/admin`。任何装了 Node.js（≥ 16）的机器都能跑，Windows、macOS、Linux 一样。

## 写作

在 `content/posts/` 放一个 `.md` 文件：

```markdown
---
title: 我的第一篇
date: 2026-10-30
category: 随笔
tags: [开始]
---

正文用 Markdown 写。
```

刷新页面就发布了。`draft: true` 是草稿，前台和 RSS 都不显示。不想开后台也行，直接用编辑器写文件拷上去。

更多后台操作、备份、常见问题见这篇：[素笺使用说明](/post/sujian-usage)。

## 部署要点

程序无状态，把目录传上去跑起来即可。生产环境建议加 systemd 守护和 Nginx 反代，反代记得传这两个头，否则后台 CSRF 校验和 RSS 链接会出错：

```nginx
proxy_set_header Host $host;
proxy_set_header X-Forwarded-Proto $scheme;
```

HTTPS 用 Let's Encrypt 就行，续期脚本记得带 `nginx -s reload`。

## 一些数字

十个 JS 文件，整站连内容带样式不到 300 KB，零运行时依赖，常驻内存约 60 MB。样式表只有一张 `public/style.css`，文件开头是令牌区（`--bg`、`--text`、`--faint`、`--border` 等），换配色改那里就够。

## 版本与来源

当前版本 **v1.1.0**（2026-10-30），主要变更：更名素笺、新增 `/about` 独立页面、底部栏支持 HTML、移动端表格与字号修复。

- GitHub：[liyinwaihe/Sujian](https://github.com/liyinwaihe/Sujian)
- GitCode：[liyinwaihe/sujian](https://gitcode.com/liyinwaihe/sujian)
- 许可：MIT（代码部分）

## 致谢

- [Bear Blog](https://bearblog.dev) — 极简博客的原始精神
- [霞鹜文楷](https://github.com/lxgw/LxgwWenKai) — 正文字体
