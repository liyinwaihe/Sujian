'use strict';
// 后台页面模板：与前台同一套设计令牌（style.css 后台区块）
const { escapeHtml } = require('./site');
const { layout } = require('./templates');

function adminLayout({ title, current, content, flash }) {
  const inner = `
<p class="admin-meta"><span>管理后台</span><a href="/" class="chip">查看站点</a><a href="/admin/logout" class="chip">退出登录</a></p>
${flash ? `<div class="flash${flash.error ? ' flash-error' : ''}">${escapeHtml(flash.text)}</div>` : ''}
${content}`;
  return layout({ title: title ? `后台 - ${title}` : '管理后台', current, content: inner, admin: true });
}

function loginPage({ error, locked }) {
  const content = `
<h1>登录</h1>
<p class="intro">仅博主本人可入。</p>
${locked ? '<p class="intro form-error">失败次数过多，请十分钟后重试。</p>' : ''}
${error && !locked ? '<p class="intro form-error">密码不对，再想想。</p>' : ''}
<form method="post" action="/admin/login" class="admin-form login-form">
<div class="form-row">
<label for="password">管理密码</label>
<input type="password" id="password" name="password" autofocus autocomplete="current-password">
</div>
<div class="admin-actions">
<button type="submit" class="btn btn-primary">进入后台</button>
<a class="btn" href="/">回首页</a>
</div>
</form>`;
  return layout({ title: '登录', content, admin: true });
}

function dashboard({ posts, flash }) {
  const rows = posts
    .map(
      (p) => `<tr>
<td class="cell-title"><a href="/post/${escapeHtml(p.slug)}">${escapeHtml(p.title)}</a></td>
<td><time datetime="${p.date}">${p.date}</time></td>
<td>${escapeHtml(p.category)}</td>
<td class="cell-actions">
  <a class="chip" href="/admin/post/${encodeURIComponent(p.slug)}">编辑</a>
  <form method="post" action="/admin/post/${encodeURIComponent(p.slug)}/delete" class="inline-form">
    <button type="submit" class="btn-danger">删除</button>
  </form>
</td>
</tr>`
    )
    .join('\n');
  const content = `
<div class="admin-head">
<h1>文章管理</h1>
<div class="admin-head-actions">
<a class="btn" href="/admin/upload">上传 .md</a>
<a class="btn btn-primary" href="/admin/new">新建文章</a>
</div>
</div>
<table class="admin-table">
<thead><tr><th>标题</th><th>日期</th><th>分类</th><th>操作</th></tr></thead>
<tbody>
${rows || '<tr><td colspan="4" class="intro">还没有文章，点右上角新建。</td></tr>'}
</tbody>
</table>
<div class="admin-links">
<a class="btn" href="/admin/settings">站点设置</a>
<a class="btn" href="/admin/about">编辑关于</a>
</div>`;
  return adminLayout({ title: '文章管理', current: '/admin', content, flash });
}

const DEFAULT_CSS = `---
title: （在此填写标题）
date: ${new Date().toISOString().slice(0, 10)}
category: 随笔
tags: [随笔]
draft: true
---

从这里开始写。`;

function uploadPage({ result } = {}) {
  const results = (result && result.items)
    ? result.items.map((r) => {
        const cls = r.ok ? '' : ' form-error';
        const icon = r.ok ? '已导入' : '失败';
        return `<li class="upload-result-item${cls}"><span>${icon}</span> ${escapeHtml(r.file)}${r.slug ? ` &rarr; <a href="/post/${encodeURIComponent(r.slug)}">${escapeHtml(r.slug)}</a>` : ''}${r.reason ? `：${escapeHtml(r.reason)}` : ''}</li>`;
      }).join('\n')
    : '';
  const summary = (result && result.items)
    ? `<p class="intro">共 ${result.items.length} 个文件：成功 ${result.items.filter((r) => r.ok).length} 个。</p>`
    : '';
  const content = `
<h1>上传 .md 文章</h1>
<p class="intro">选择一个或多个 .md 文件，将按 front-matter 的 title/date/category/tags/draft 导入；没有 front-matter 的文件会把文件名当标题、上传日期当日期。</p>
<form method="post" action="/admin/upload" enctype="multipart/form-data" class="admin-form">
<div class="form-row">
<label for="files">选择 .md 文件（可多选）</label>
<input type="file" id="files" name="files" accept=".md,.markdown,text/markdown,text/plain" multiple required>
</div>
<div class="form-row checkbox-row">
<input type="checkbox" id="as-draft" name="asDraft" value="true">
<label for="as-draft">全部导入为草稿（覆盖文件里的 draft 设置）</label>
</div>
<div class="admin-actions">
<button type="submit" class="btn btn-primary">开始导入</button>
<a class="btn" href="/admin">返回</a>
</div>
</form>
${summary}
${results ? `<ul class="upload-results">${results}</ul>` : ''}`;
  return adminLayout({ title: '上传', current: '/admin', content });
}

function editorPage({ mode, slug, form, flash }) {
  const isNew = mode === 'new';
  const action = isNew ? '/admin/new' : `/admin/post/${encodeURIComponent(slug)}`;
  const f = form || {};
  const content = `
<h1>${isNew ? '新建文章' : '编辑文章'}</h1>
<form method="post" action="${action}" class="admin-form">
<div class="form-row">
<label for="title">标题</label>
<input type="text" id="title" name="title" value="${escapeHtml(f.title || '')}" required>
</div>
<div class="form-grid">
<div class="form-row">
<label for="date">日期</label>
<input type="date" id="date" name="date" value="${escapeHtml(f.date || new Date().toISOString().slice(0, 10))}">
</div>
<div class="form-row">
<label for="category">分类</label>
<input type="text" id="category" name="category" value="${escapeHtml(f.category || '未分类')}">
</div>
</div>
<div class="form-row">
<label for="tags">标签（逗号分隔）</label>
<input type="text" id="tags" name="tags" value="${escapeHtml(Array.isArray(f.tags) ? f.tags.join(', ') : f.tags || '')}">
</div>
<div class="form-row checkbox-row">
<input type="checkbox" id="draft" name="draft" value="true"${f.draft ? ' checked' : ''}>
<label for="draft">草稿（勾选后前台不显示）</label>
</div>
<div class="form-row">
<label for="body">正文（Markdown）</label>
<textarea id="body" name="body" rows="18">${escapeHtml(f.body || DEFAULT_CSS)}</textarea>
</div>
<div class="admin-actions">
<button type="submit" class="btn btn-primary">${isNew ? '发布' : '保存'}</button>
<a class="btn" href="/admin">取消</a>
</div>
</form>`;
  return adminLayout({ title: isNew ? '新建' : '编辑', current: '/admin', content, flash });
}

function settingsPage({ form, flash }) {
  const f = form || {};
  const navLines = Array.isArray(f.nav)
    ? f.nav.map((n) => `${n.label} | ${n.href}`).join('\n')
    : '';
  const content = `
<h1>站点设置</h1>
<form method="post" action="/admin/settings" class="admin-form">
<div class="form-row">
<label for="set-title">站名</label>
<input type="text" id="set-title" name="title" value="${escapeHtml(f.title || '')}" required>
</div>
<div class="form-row">
<label for="set-subtitle">副标题 / 站点描述</label>
<input type="text" id="set-subtitle" name="subtitle" value="${escapeHtml(f.subtitle || '')}">
</div>
<div class="form-row">
<label for="set-author">作者名</label>
<input type="text" id="set-author" name="author" value="${escapeHtml(f.author || '')}">
</div>
<div class="form-row">
<label for="set-per">首页每页篇数</label>
<input type="number" id="set-per" name="postsPerPage" min="1" max="50" value="${escapeHtml(String(f.postsPerPage || 8))}">
</div>
<div class="form-row">
<label for="set-footer">底部栏文字</label>
<textarea id="set-footer" name="footer" rows="3">${escapeHtml(f.footer || '')}</textarea>
<p class="form-hint">显示在每页最底部，留空则不显示。支持 HTML，写链接可用 &lt;a href="…"&gt;文字&lt;/a&gt;；最多 500 字。</p>
</div>
<div class="form-row">
<label for="set-nav">导航（每行一项：名称 | 链接）</label>
<textarea id="set-nav" name="nav" rows="4">${escapeHtml(navLines)}</textarea>
</div>
<div class="form-row">
<label for="set-pass">新的管理密码（留空则不修改）</label>
<input type="password" id="set-pass" name="adminPassword" autocomplete="new-password">
</div>
<div class="admin-actions">
<button type="submit" class="btn btn-primary">保存设置</button>
<a class="btn" href="/admin/about">编辑关于</a>
<a class="btn" href="/admin">返回</a>
</div>
</form>`;
  return adminLayout({ title: '设置', current: '/admin', content, flash });
}

function aboutPage({ body, flash }) {
  const content = `
<h1>编辑关于</h1>
<p class="intro">这段内容会外露在首页顶部，同时也是独立页面 <a href="/about" target="_blank" rel="noopener">/about</a> 的内容。</p>
<form method="post" action="/admin/about" class="admin-form">
<div class="form-row">
<label for="about-body">关于内容（Markdown）</label>
<textarea id="about-body" name="body" rows="14">${escapeHtml(body)}</textarea>
</div>
<div class="admin-actions">
<button type="submit" class="btn btn-primary">保存</button>
<a class="btn" href="/about" target="_blank" rel="noopener">查看关于页</a>
<a class="btn" href="/admin">返回</a>
</div>
</form>`;
  return adminLayout({ title: '关于', current: '/admin', content, flash });
}

module.exports = { loginPage, dashboard, editorPage, settingsPage, aboutPage, uploadPage };
