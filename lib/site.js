'use strict';
// 站点配置与全局状态：启动时读取一次，文章目录变更时自动重载
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'content');
const POSTS_DIR = path.join(CONTENT_DIR, 'posts');

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

const config = readJson(path.join(ROOT, 'config.json'), {
  title: '素笺',
  subtitle: '',
  author: 'Dear',
  postsPerPage: 8,
  nav: [{ label: '首页', href: '/' }],
  footer: '',
});

// ---- front-matter 解析：--- 包围的 key: value 块 ----
function parseFrontMatter(raw) {
  const meta = {};
  let body = raw;
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (m) {
    for (const line of m[1].split(/\r?\n/)) {
      const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line.trim());
      if (!kv) continue;
      const key = kv[1].toLowerCase();
      let val = kv[2].trim();
      if (/^\[.*\]$/.test(val)) {
        val = val.slice(1, -1).split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
      } else if (/^['"].*['"]$/.test(val)) {
        val = val.slice(1, -1);
      }
      meta[key] = val;
    }
    body = raw.slice(m[0].length);
  }
  return { meta, body };
}

function loadPost(file) {
  const full = path.join(POSTS_DIR, file);
  const raw = fs.readFileSync(full, 'utf8');
  const { meta, body } = parseFrontMatter(raw);
  const stat = fs.statSync(full);
  const date = typeof meta.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(meta.date)
    ? meta.date.slice(0, 10)
    : stat.mtime.toISOString().slice(0, 10);
  return {
    slug: file.replace(/\.md$/i, ''),
    title: String(meta.title || file.replace(/\.md$/i, '')),
    date,
    tags: Array.isArray(meta.tags) ? meta.tags : (meta.tags ? [String(meta.tags)] : []),
    category: String(meta.category || '未分类'),
    draft: meta.draft === true || meta.draft === 'true',
    raw: body,
  };
}

let cache = { posts: [], mtime: 0 };

function scanDir() {
  let latest = 0;
  try {
    for (const f of fs.readdirSync(POSTS_DIR)) latest = Math.max(latest, fs.statSync(path.join(POSTS_DIR, f)).mtimeMs);
  } catch (e) {
    return cache;
  }
  if (latest === cache.mtime) return cache;
  let posts = [];
  try {
    posts = fs.readdirSync(POSTS_DIR)
      .filter((f) => /\.md$/i.test(f))
      .map(loadPost)
      .filter((p) => !p.draft)
      .sort((a, b) => (a.date === b.date ? b.slug.localeCompare(a.slug) : b.date.localeCompare(a.date)));
  } catch (e) {
    posts = [];
  }
  cache = { posts, mtime: latest };
  return cache;
}

function posts() {
  return scanDir().posts;
}

function bySlug(slug) {
  return posts().find((p) => p.slug === slug) || null;
}

function aboutRaw() {
  try {
    const raw = fs.readFileSync(path.join(CONTENT_DIR, 'about.md'), 'utf8');
    return parseFrontMatter(raw).body;
  } catch (e) {
    return '';
  }
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeXml(s) {
  return escapeHtml(s).replace(/'/g, '&apos;');
}

function reloadConfig(next) {
  if (next && typeof next === 'object') {
    Object.assign(config, next);
  }
}

module.exports = { config, posts, bySlug, aboutRaw, escapeHtml, escapeXml, reloadConfig };
