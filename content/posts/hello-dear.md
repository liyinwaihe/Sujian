---
title: 你好，亲爱的
date: 2026-10-26
category: 随笔
tags: [开始, 极简]
---

这是一篇示例文章，用来展示 素笺 的正文排版。它不依赖 WordPress，也不依赖 Typecho——把 Markdown 文件放进 `content/posts/`，刷新页面，它就发布了。

## 为什么要做独立程序

大型博客系统给了你插件、主题和数据库，也给了你维护成本。这个程序只有一个目标：**写下来，发出去**。

- 没有数据库，文件就是数据
- 没有 npm install，零依赖
- 没有 JS 框架，页面安静得像纸

## 排版示例

> 简洁不是删到不能再删，而是留到刚好够用。

行内代码长这样：`node server.js`。代码块长这样：

```js
const http = require('node:http');
http.createServer((req, res) => {
  res.end('hello, dear');
}).listen(3000);
```

| 功能 | 状态 |
|------|------|
| 文章 | 可用 |
| 归档 | 可用 |
| 搜索 | 可用 |

写作者只需要记住一件事：**第一行 front-matter 里的 title，就是这篇文章的名字。**
