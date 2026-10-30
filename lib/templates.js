'use strict';
// 极简页面模板：layout 统一页头页脚与主题引导脚本
const fs = require('node:fs');
const path = require('node:path');
const { config, escapeHtml } = require('./site');

const CSS_FILE = path.join(__dirname, '..', 'public', 'style.css');

// 样式表版本号取文件 mtime：改样式后 URL 自动变化，避免浏览器沿用旧缓存
function cssVersion() {
  try {
    return Math.floor(fs.statSync(CSS_FILE).mtimeMs).toString(36);
  } catch (e) {
    return '1';
  }
}

const SUN_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7"/></svg>';
const MOON_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.2 13.6A8.2 8.2 0 0 1 10.4 3.8a8.2 8.2 0 1 0 9.8 9.8Z"/></svg>';

function nav(current) {
  const items = (config.nav || [])
    .map((n) => {
      const cur = n.href === '/' ? current === '/' : current === n.href;
      return `<a href="${escapeHtml(n.href)}"${cur ? ' class="current"' : ''}>${escapeHtml(n.label)}</a>`;
    })
    .join('');
  return `<nav><p>${items}</p></nav>`;
}

function layout({ title, current = '', content, head = '', admin = false }) {
  const fullTitle = title ? `${title} - ${config.title}` : config.title;
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(fullTitle)}</title>
<meta name="description" content="${escapeHtml(config.subtitle || config.title)}">
${head}
<link rel="alternate" type="application/rss+xml" title="${escapeHtml(config.title)}" href="/feed.xml">
<link rel="stylesheet" href="/style.css?v=${cssVersion()}">
<script>(function(){var d=document.documentElement;var s=null;try{s=localStorage.getItem('theme')}catch(e){}if(s==='dark'||(s!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches))d.classList.add('dark');})();</script>
</head>
<body${admin ? ' class="admin"' : ''}>
<header>
<a class="title" href="/"><h1>${escapeHtml(config.title)}</h1></a>
${nav(current)}
</header>
<main>
${content}
</main>
<footer>
${config.footer ? `<p>${escapeHtml(config.footer)}</p>` : ''}
<button class="theme-toggle" id="themeToggle" type="button" aria-label="切换主题"><span class="icon-sun">${SUN_ICON}</span><span class="icon-moon">${MOON_ICON}</span></button>
</footer>
<script>
(function(){var b=document.getElementById('themeToggle');if(!b)return;b.addEventListener('click',function(){var d=document.documentElement;var dark=d.classList.toggle('dark');try{localStorage.setItem('theme',dark?'dark':'light')}catch(e){}});})();
</script>
</body>
</html>`;
}

// 首页/归档共用的文章列表：日期列 + 主体（Dear 结构）
function postList(items, opts) {
  const showCategory = !opts || opts.showCategory !== false;
  const lis = items
    .map((p) => {
      const body = showCategory
        ? `<div>${escapeHtml(p.category)}&nbsp;·&nbsp;<a href="/post/${encodeURIComponent(p.slug)}">${escapeHtml(p.title)}</a></div>`
        : `<div><a href="/post/${encodeURIComponent(p.slug)}">${escapeHtml(p.title)}</a></div>`;
      return `<li><span><time datetime="${p.date}">${p.date}</time></span>${body}</li>`;
    })
    .join('\n');
  return `<ul class="posts">${lis}</ul>`;
}

module.exports = { layout, postList };
