'use strict';
// 路由：前台仅读站点（GET）；/admin 后台委派给 admin 模块
const fs = require('node:fs');
const path = require('node:path');
const site = require('./site');
const md = require('./markdown');
const { layout, postList } = require('./templates');
const auth = require('./auth');
const admin = require('./admin');
const { send } = require('./send');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// send 统一来自 lib/send.js：opts 支持字符串(Content-Type)或 headers 对象

// ---- 首页导航补充「后台」入口 ----
function notFound(res) {
  const content = '<h1>404</h1><p>这里什么都没有，也许它从来就不存在。</p><p><a href="/">回首页看看</a></p>';
  send(res, 404, layout({ title: '404', content }));
}

function methodNotAllowed(res) {
  send(res, 405, '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>405</title><p>本站只读，不接受这个请求方法。</p>');
}

// ---- 首页：about 外露 + 近期文章 + 分页 ----
function home(req, res, query) {
  const all = site.posts();
  const per = Math.max(1, Number(site.config.postsPerPage) || 8);
  let page = parseInt(query.get('page') || '1', 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  const totalPages = Math.max(1, Math.ceil(all.length / per));
  if (page > totalPages) page = totalPages;
  const items = all.slice((page - 1) * per, page * per);

  const aboutHtml = md.render(site.aboutRaw());
  const parts = [];
  if (aboutHtml) parts.push(aboutHtml);
  parts.push('<h3>近期文章</h3>');
  parts.push(postList(items));
  if (page < totalPages) {
    parts.push(`<p class="pager"><a href="/?page=${page + 1}">较早的文章 &rarr;</a></p>`);
  }
  if (page > 1) {
    const prev = page - 1 === 1 ? '/' : `/?page=${page - 1}`;
    parts.unshift(`<p class="pager"><a href="${prev}">&larr; 较新的文章</a></p>`);
  }
  send(res, 200, layout({ current: '/', content: parts.join('\n') }));
}

// ---- 关于页 ----
function about(req, res) {
  const html = md.render(site.aboutRaw());
  const body = html || '<p class="intro">关于还没写，去后台「编辑关于」写一段吧。</p>';
  send(res, 200, layout({ title: '关于', current: '/about', content: `<h1>关于</h1>\n${body}` }));
}

// ---- 文章页 ----
function post(req, res, slugRaw) {
  let slug;
  try {
    slug = decodeURIComponent(slugRaw);
  } catch (e) {
    return notFound(res);
  }
  if (slug.includes('..') || slug.includes('/') || slug.includes('\\')) return notFound(res);
  const p = site.bySlug(slug);
  if (!p) return notFound(res);

  const tagLine = p.tags.length
    ? `<p class="tags">${p.tags.map((t) => `<a href="/tag/${encodeURIComponent(t)}">#${site.escapeHtml(t)}</a>`).join(' ')}</p>`
    : '';
  const content = `
<h1>${site.escapeHtml(p.title)}</h1>
<p>${site.escapeHtml(p.category)} · <time datetime="${p.date}">${p.date}</time></p>
<div class="post-body">${md.render(p.raw)}</div>
${tagLine}
<p class="pager"><a href="/">&larr; 回首页</a></p>`;
  send(res, 200, layout({ title: p.title, content, head: `<meta property="og:title" content="${site.escapeHtml(p.title)}">` }));
}

// ---- 归档：按年月分组 ----
function archive(req, res) {
  const groups = [];
  let curKey = '';
  for (const p of site.posts()) {
    const key = p.date.slice(0, 7);
    if (key !== curKey) {
      curKey = key;
      groups.push({ year: key.slice(0, 4), mon: key.slice(5, 7), items: [] });
    }
    groups[groups.length - 1].items.push(p);
  }
  const parts = ['<h1>归档</h1><p class="intro">全部文章，按年月分组。</p>'];
  for (const g of groups) {
    parts.push(`<h3>${g.year} 年 ${g.mon} 月</h3>`);
    parts.push(postList(g.items, { showCategory: false }));
  }
  send(res, 200, layout({ title: '归档', current: '/archive', content: parts.join('\n') }));
}

// ---- 标签总览：全部标签 + 计数 ----
function tags(req, res) {
  const counts = new Map();
  for (const p of site.posts()) {
    for (const t of p.tags) {
      counts.set(t, (counts.get(t) || 0) + 1);
    }
  }
  const sorted = [...counts.entries()].sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0], 'zh-CN'));
  let content;
  if (!sorted.length) {
    content = '<h1>标签</h1><p class="intro">还没有任何标签，写文章时在 front-matter 里加上 tags 就会出现。</p>';
  } else {
    const chips = sorted
      .map(([t, n]) => `<a class="tag-chip" href="/tag/${encodeURIComponent(t)}">${site.escapeHtml(t)}<span class="tag-count">${n}</span></a>`)
      .join('\n');
    content = `<h1>标签</h1><p class="intro">共 ${sorted.length} 个标签。</p><div class="tag-cloud">${chips}</div>`;
  }
  send(res, 200, layout({ title: '标签', current: '/tags', content }));
}

// ---- 单标签文章列表 ----
function tagPosts(req, res, nameRaw) {
  let name;
  try {
    name = decodeURIComponent(nameRaw);
  } catch (e) {
    return notFound(res);
  }
  if (!name || name.includes('..') || name.includes('/') || name.includes('\\')) return notFound(res);
  const items = site.posts().filter((p) => p.tags.includes(name));
  const content = `
<h1>标签：${site.escapeHtml(name)}</h1>
<p class="intro">${items.length ? `共 ${items.length} 篇文章。` : '这个标签下还没有文章。'}</p>
${items.length ? postList(items, { showCategory: true }) : ''}
<p class="pager"><a href="/tags">&larr; 全部标签</a></p>`;
  send(res, 200, layout({ title: `标签：${name}`, current: '/tags', content }));
}

// ---- 搜索 ----
function search(req, res, query) {
  const q = (query.get('q') || '').trim();
  let results = [];
  if (q) {
    const kw = q.toLowerCase();
    results = site.posts().filter((p) => {
      const inMeta = p.title.toLowerCase().includes(kw) || p.tags.some((t) => t.toLowerCase().includes(kw)) || p.category.toLowerCase().includes(kw);
      return inMeta || p.raw.toLowerCase().includes(kw);
    });
  }
  const parts = ['<h1>搜索</h1>'];
  parts.push(`<form action="/search" method="get" class="search-form">
<input type="search" name="q" value="${site.escapeHtml(q)}" placeholder="输入关键词，回车搜索" aria-label="搜索关键词">
<button type="submit">搜索</button>
</form>`);
  if (q) {
    if (results.length) {
      parts.push(`<p class="intro">找到 ${results.length} 篇与「${site.escapeHtml(q)}」相关的文章。</p>`);
      parts.push(postList(results, { showCategory: false }));
    } else {
      parts.push(`<p class="intro empty-note">没有找到与「${site.escapeHtml(q)}」相关的文章，换个词试试。</p>`);
    }
  } else {
    parts.push('<p class="intro">输入关键词，按标题、标签与正文搜索。</p>');
  }
  send(res, 200, layout({ title: '搜索', current: '/search', content: parts.join('\n') }));
}

// ---- RSS ----
function feed(req, res) {
  // 协议跟随反代传回的 X-Forwarded-Proto（nginx 已设），直连时按 socket 加密状态兜底
  const proto = String(
    req.headers['x-forwarded-proto'] || (req.socket && req.socket.encrypted ? 'https' : 'http')
  ).split(',')[0].trim();
  const base = `${proto}://${req.headers.host || 'localhost'}`;
  const items = site.posts()
    .slice(0, 20)
    .map((p) => `    <item>
      <title>${site.escapeXml(p.title)}</title>
      <link>${base}/post/${site.escapeXml(p.slug)}</link>
      <guid>${base}/post/${site.escapeXml(p.slug)}</guid>
      <pubDate>${new Date(p.date + 'T00:00:00+08:00').toUTCString()}</pubDate>
      <category>${site.escapeXml(p.category)}</category>
      <description>${site.escapeXml(md.render(p.raw).replace(/<[^>]+>/g, '').slice(0, 300))}</description>
    </item>`)
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${site.escapeXml(site.config.title)}</title>
    <link>${base}/</link>
    <description>${site.escapeXml(site.config.subtitle || site.config.title)}</description>
    <language>zh-CN</language>
${items}
  </channel>
</rss>`;
  send(res, 200, xml, 'application/rss+xml; charset=utf-8');
}

// ---- 静态文件：仅 public 目录白名单 ----
function serveStatic(res, name) {
  const safe = path.normalize(name).replace(/^([.][.][/\\])+/, '');
  const full = path.join(PUBLIC_DIR, safe);
  if (!full.startsWith(PUBLIC_DIR) || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
    return notFound(res);
  }
  const ext = path.extname(full).toLowerCase();
  const types = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };
  send(res, 200, fs.readFileSync(full), types[ext] || 'application/octet-stream');
}

// ---- 后台路由：/admin 前缀统一进入 ----
async function handleAdmin(req, res, pathname, query) {
  const sub = pathname.replace(/^\/admin\/?/, '');

  if (sub === 'login') return admin.login(req, res, query, site.config);
  if (sub === 'logout') return admin.logout(req, res);

  // 以下全部需要已登录
  if (!auth.isAuthed(req, site.config)) {
    return send(res, 302, '', { Location: '/admin/login', 'Content-Type': 'text/plain' });
  }

  if (sub === '' || sub === '/') {
    const done = query.get('deleted');
    return send(
      res,
      200,
      require('./admin-templates').dashboard({ posts: site.posts(), flash: done ? { text: done } : null })
    );
  }
  if (sub === 'new') {
    if (req.method === 'GET') return send(res, 200, require('./admin-templates').editorPage({ mode: 'new' }));
    if (req.method === 'POST') return admin.saveNew(req, res);
    return send(res, 405, '<p>405</p>', { 'Content-Type': 'text/plain' });
  }
  if (sub === 'settings') {
    if (req.method === 'GET') return admin.settings(req, res);
    if (req.method === 'POST') return admin.saveSettings(req, res);
    return send(res, 405, '<p>405</p>', { 'Content-Type': 'text/plain' });
  }
  if (sub === 'about') {
    if (req.method === 'GET') return admin.aboutPage(req, res);
    if (req.method === 'POST') return admin.saveAbout(req, res);
    return send(res, 405, '<p>405</p>', { 'Content-Type': 'text/plain' });
  }
  if (sub === 'preview' && req.method === 'POST') return admin.preview(req, res);
  if (sub === 'upload') {
    if (req.method === 'GET') return admin.upload(req, res);
    if (req.method === 'POST') return admin.upload(req, res);
    return send(res, 405, '<p>405</p>', { 'Content-Type': 'text/plain' });
  }

  const m = /^post\/([^/]+?)(\/delete)?$/.exec(sub);
  if (m) {
    const slugRaw = m[1];
    if (m[2]) {
      if (req.method !== 'POST') return send(res, 405, '<p>405</p>', { 'Content-Type': 'text/plain' });
      return admin.deletePost(req, res, slugRaw);
    }
    if (req.method === 'GET') return admin.editor(req, res, slugRaw);
    if (req.method === 'POST') return admin.saveExisting(req, res, slugRaw);
    return send(res, 405, '<p>405</p>', { 'Content-Type': 'text/plain' });
  }
  return notFound(res);
}

function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  const query = url.searchParams;

  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    Promise.resolve(handleAdmin(req, res, pathname, query)).catch((err) => {
      console.error('[sujian] admin error:', err && err.message);
      if (!res.headersSent) send(res, 500, '<p>服务器开小差了</p>', { 'Content-Type': 'text/plain; charset=utf-8' });
      else res.end();
    });
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') return methodNotAllowed(res);

  if (pathname === '/') return home(req, res, query);
  if (pathname === '/style.css') return serveStatic(res, 'style.css');
  if (pathname === '/feed.xml') return feed(req, res);
  if (pathname === '/archive') return archive(req, res);
  if (pathname === '/about') return about(req, res);
  if (pathname === '/tags') return tags(req, res);
  if (pathname.startsWith('/tag/')) return tagPosts(req, res, pathname.slice('/tag/'.length));
  if (pathname === '/search') return search(req, res, query);
  if (pathname.startsWith('/post/')) return post(req, res, pathname.slice('/post/'.length));
  if (pathname === '/favicon.ico') {
    res.writeHead(204);
    return res.end();
  }
  return notFound(res);
}

module.exports = { handle };
