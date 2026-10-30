'use strict';
// 后台业务：登录/登出、文章增删改、设置、关于、预览 API
// 前置约定：进入本模块的请求均已通过 auth.isAuthed（登录页除外）
const fs = require('node:fs');
const path = require('node:path');
const site = require('./site');
const { render } = require('./markdown');
const auth = require('./auth');
const tpl = require('./admin-templates');
const { send } = require('./send');

const POSTS_DIR = path.join(__dirname, '..', 'content', 'posts');
const ABOUT_FILE = path.join(__dirname, '..', 'content', 'about.md');
const CONFIG_FILE = path.join(__dirname, '..', 'config.json');
const PREVIEW_MAX = 100 * 1024;
const UPLOAD_MAX = 2 * 1024 * 1024;
const SLUG_RE = /^[a-z0-9][a-z0-9._-]{0,79}$/;

// 底部栏允许写 HTML（只有管理员能改），但去掉脚本类标签与事件属性，防止误粘贴把页面带崩
function sanitizeFooter(html) {
  return html
    .replace(/<\s*(script|style|iframe|object|embed)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed)\b[^>]*\/?>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');
}

function readBodyRaw(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function readBody(req, limit) {
  return readBodyRaw(req, limit).then((buf) => buf.toString('utf8'));
}

function parseForm(raw) {
  const out = {};
  for (const [k, v] of new URLSearchParams(raw)) out[k] = v;
  return out;
}

function sameOrigin(req) {
  const host = req.headers.host;
  const origin = req.headers.origin;
  if (!origin) return true; // 同源表单常规提交可无 Origin
  try {
    return new URL(origin).host === host;
  } catch (e) {
    return false;
  }
}

function writePostFile(slug, p) {
  const tags = Array.isArray(p.tags) && p.tags.length ? `[${p.tags.join(', ')}]` : '[]';
  const front = [
    '---',
    `title: ${p.title}`,
    `date: ${p.date}`,
    `category: ${p.category}`,
    `tags: ${tags}`,
    p.draft ? 'draft: true' : null,
    '---',
    '',
  ].filter((l) => l !== null);
  fs.mkdirSync(POSTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(POSTS_DIR, `${slug}.md`), front.join('\n') + p.body.replace(/\r\n/g, '\n'), 'utf8');
}

function formToPost(form, existing) {
  const tags = String(form.tags || '')
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(form.date || '')) ? form.date : existing ? existing.date : new Date().toISOString().slice(0, 10);
  return {
    title: String(form.title || '').trim().slice(0, 120) || (existing ? existing.title : '无题'),
    date,
    category: String(form.category || '').trim().slice(0, 40) || '未分类',
    tags,
    draft: form.draft === 'true',
    body: String(form.body || ''),
  };
}

function slugify(form, existingSlug) {
  const explicit = String(form.slug || '').trim().toLowerCase();
  if (explicit) {
    return SLUG_RE.test(explicit) ? explicit : null;
  }
  const source = String(form.title || '').trim().toLowerCase();
  const ascii = source.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  if (ascii) return ascii;
  // 中文标题：用日期兜底，保证 slug 存在且合法
  return `post-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
}

// ---- 登录 / 登出 ----
async function login(req, res, query, config) {
  const locked = auth.loginLockedNow();
  if (req.method === 'GET') {
    if (auth.isAuthed(req, config)) return send(res, 302, '', { Location: '/admin', 'Content-Type': 'text/plain' });
    return send(res, 200, tpl.loginPage({ locked: auth.loginLockedNow() }));
  }
  if (locked) {
    return send(res, 429, tpl.loginPage({ locked: true }));
  }
  if (!sameOrigin(req)) return send(res, 403, tpl.loginPage({ error: true }));
  const raw = await readBody(req, 16 * 1024);
  const form = parseForm(raw);
  if (!auth.safeEqual(String(form.password || ''), auth.adminPassword(config))) {
    auth.recordFail();
    return send(res, 401, tpl.loginPage({ error: true, locked: auth.loginLockedNow() }));
  }
  auth.resetFails();
  const token = auth.makeToken(Date.now());
  return send(res, 303, '', {
    Location: '/admin',
    'Set-Cookie': `dear_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}`,
    'Content-Type': 'text/plain',
  });
}

function logout(req, res) {
  return send(res, 303, '', {
    Location: '/admin/login',
    'Set-Cookie': 'dear_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
    'Content-Type': 'text/plain',
  });
}

// ---- 文章 ----
async function saveNew(req, res) {
  if (!sameOrigin(req)) return send(res, 403, '<p>来源校验失败</p>');
  const raw = await readBody(req, PREVIEW_MAX);
  const form = parseForm(raw);
  const slug = slugify(form);
  if (!slug) return send(res, 400, tpl.editorPage({ mode: 'new', form, flash: { error: true, text: '标识符只能是字母、数字、点、连字符' } }));
  if (site.bySlug(slug)) {
    return send(res, 409, tpl.editorPage({ mode: 'new', form, flash: { error: true, text: '已有同名文章，换一个标识符或标题' } }));
  }
  writePostFile(slug, formToPost(form));
  return send(res, 303, '', { Location: '/admin', 'Content-Type': 'text/plain' });
}

function editor(req, res, slugRaw) {
  let slug;
  try {
    slug = decodeURIComponent(slugRaw);
  } catch (e) {
    return send(res, 404, '<p>404</p>');
  }
  const p = site.bySlug(slug);
  if (!p) return send(res, 404, tpl.dashboard({ posts: site.posts(), flash: { error: true, text: '文章不存在' } }));
  const form = { title: p.title, date: p.date, category: p.category, tags: p.tags, draft: p.draft, body: p.raw };
  return send(res, 200, tpl.editorPage({ mode: 'edit', slug, form }));
}

async function saveExisting(req, res, slugRaw) {
  if (!sameOrigin(req)) return send(res, 403, '<p>来源校验失败</p>');
  let slug;
  try {
    slug = decodeURIComponent(slugRaw);
  } catch (e) {
    return send(res, 404, '<p>404</p>');
  }
  const p = site.bySlug(slug);
  if (!p) return send(res, 404, '<p>404</p>');
  const raw = await readBody(req, PREVIEW_MAX);
  const form = parseForm(raw);
  const updated = formToPost(form, p);
  const newSlug = String(form.slug || '').trim() && form.slug !== slug ? slugify(form, slug) : slug;
  if (!newSlug) return send(res, 400, tpl.editorPage({ mode: 'edit', slug, form, flash: { error: true, text: '标识符只能是字母、数字、点、连字符' } }));
  if (newSlug !== slug && site.bySlug(newSlug)) {
    return send(res, 409, tpl.editorPage({ mode: 'edit', slug, form, flash: { error: true, text: '目标标识符已被占用' } }));
  }
  writePostFile(newSlug, updated);
  if (newSlug !== slug) fs.unlinkSync(path.join(POSTS_DIR, `${slug}.md`));
  return send(res, 303, '', { Location: '/admin', 'Content-Type': 'text/plain' });
}

function deletePost(req, res, slugRaw) {
  if (!sameOrigin(req)) return send(res, 403, '<p>来源校验失败</p>');
  let slug;
  try {
    slug = decodeURIComponent(slugRaw);
  } catch (e) {
    return send(res, 404, '<p>404</p>');
  }
  const file = path.resolve(POSTS_DIR, `${slug}.md`);
  const root = path.resolve(POSTS_DIR) + path.sep;
  // 不再限制文件名必须是纯 ASCII（中文/大写文件名的文章也要能删），只做目录逃逸与文件存在性校验
  const safe =
    !!slug && !slug.includes('/') && !slug.includes('\\') && !slug.startsWith('.') && file.startsWith(root);
  if (!safe || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return send(res, 404, tpl.dashboard({ posts: site.posts(), flash: { error: true, text: '这篇文章已经不在了，可能刚被删过。' } }));
  }
  const gone = site.bySlug(slug);
  fs.unlinkSync(file);
  const tip = gone ? `已删除《${gone.title}》` : '已删除';
  return send(res, 303, '', { Location: `/admin?deleted=${encodeURIComponent(tip)}`, 'Content-Type': 'text/plain' });
}

// ---- .md 上传：零依赖 multipart/form-data 解析 ----
// 解析 multipart 请求体，返回 { files: [{filename, data(Buffer)}] }
function parseMultipart(buf, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!m) return { files: [] };
  const boundary = '--' + (m[1] || m[2]).trim();
  const files = [];
  const parts = [];
  let start = buf.indexOf(boundary);
  while (start !== -1) {
    const next = buf.indexOf(boundary, start + boundary.length);
    if (next === -1) break;
    parts.push(buf.subarray(start + boundary.length, next));
    start = next;
  }
  for (const part of parts) {
    // 每段结构：\r\nheaders\r\n\r\ncontent\r\n
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;
    const headerText = part.subarray(0, headerEnd).toString('utf8');
    const content = part.subarray(headerEnd + 4, part.length - 2); // 去尾部 \r\n
    if (!/name="files"/i.test(headerText)) continue;
    const fn = /filename="([^"]*)"/i.exec(headerText);
    if (!fn || !fn[1]) continue;
    files.push({ filename: fn[1], data: content });
  }
  return { files };
}

function uniqueSlug(base) {
  if (!site.bySlug(base)) return base;
  let i = 2;
  while (site.bySlug(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

function slugFromFilename(filename) {
  const stem = path.basename(filename).replace(/\.(md|markdown)$/i, '');
  const ascii = stem.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return ascii || `post-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
}

function importMarkdownFile(file, asDraft) {
  const text = file.data.toString('utf8').replace(/^\uFEFF/, '');
  const { meta, body } = (() => {
    const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
    if (!fm) return { meta: {}, body: text };
    const meta = {};
    for (const line of fm[1].split(/\r?\n/)) {
      const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line.trim());
      if (!kv) continue;
      let val = kv[2].trim();
      if (/^\[.*\]$/.test(val)) {
        val = val.slice(1, -1).split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
      } else if (/^['"].*['"]$/.test(val)) {
        val = val.slice(1, -1);
      }
      meta[kv[1].toLowerCase()] = val;
    }
    return { meta, body: text.slice(fm[0].length) };
  })();

  if (!body.trim()) return { ok: false, reason: '文件为空' };

  const title = String(meta.title || '').trim().slice(0, 120) || path.basename(file.filename).replace(/\.(md|markdown)$/i, '');
  const date = /^\d{4}-\d{2}-\d{2}/.test(String(meta.date || '')) ? String(meta.date).slice(0, 10) : new Date().toISOString().slice(0, 10);
  const tags = Array.isArray(meta.tags) ? meta.tags.slice(0, 8) : (meta.tags ? [String(meta.tags)].slice(0, 8) : []);
  const draft = asDraft ? true : (meta.draft === true || meta.draft === 'true');
  const category = String(meta.category || '未分类').trim().slice(0, 40) || '未分类';
  const slug = uniqueSlug(slugFromFilename(file.filename));

  writePostFile(slug, { title, date, category, tags, draft, body });
  return { ok: true, slug, draft };
}

async function upload(req, res) {
  if (req.method === 'GET') {
    return send(res, 200, tpl.uploadPage());
  }
  if (!sameOrigin(req)) return send(res, 403, tpl.uploadPage());
  let buf;
  try {
    buf = await readBodyRaw(req, UPLOAD_MAX);
  } catch (e) {
    return send(res, 413, tpl.uploadPage({ result: { items: [{ ok: false, file: '-', reason: '文件过大（单个上传请求上限 2MB）' }] } }));
  }
  const { files } = parseMultipart(buf, req.headers['content-type']);
  const mdFiles = files.filter((f) => /\.(md|markdown)$/i.test(f.filename) || /^text\/(markdown|plain)/.test(f.data.toString('utf8', 0, 0) || ''));
  if (!files.length || !mdFiles.length) {
    return send(res, 400, tpl.uploadPage({ result: { items: [{ ok: false, file: '-', reason: '没有选择 .md 文件' }] } }));
  }
  const asDraft = !!(files.length && /name="asDraft"/.test(buf.toString('utf8', 0, Math.min(buf.length, 4096))) && /value="true"/.test(buf.toString('utf8', 0, Math.min(buf.length, 4096))));
  const items = mdFiles.slice(0, 20).map((f) => {
    try {
      const r = importMarkdownFile(f, asDraft);
      return { ok: r.ok, file: f.filename, slug: r.slug, reason: r.reason };
    } catch (err) {
      return { ok: false, file: f.filename, reason: '导入异常' };
    }
  });
  return send(res, 200, tpl.uploadPage({ result: { items } }));
}

// ---- 设置 ----
function settings(req, res) {
  return send(res, 200, tpl.settingsPage({ form: { ...site.config, nav: site.config.nav || [] } }));
}

async function saveSettings(req, res) {
  if (!sameOrigin(req)) return send(res, 403, '<p>来源校验失败</p>');
  const raw = await readBody(req, 256 * 1024);
  const form = parseForm(raw);
  const next = { ...site.config };
  next.title = String(form.title || '').trim().slice(0, 60) || next.title;
  next.subtitle = String(form.subtitle || '').trim().slice(0, 120);
  next.author = String(form.author || '').trim().slice(0, 40) || next.author;
  const per = parseInt(form.postsPerPage, 10);
  next.postsPerPage = Number.isFinite(per) && per >= 1 && per <= 50 ? per : next.postsPerPage;
  next.footer = sanitizeFooter(String(form.footer || '').trim()).slice(0, 500);
  next.nav = String(form.nav || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const bar = l.lastIndexOf('|');
      if (bar < 0) return { label: l.slice(0, 30), href: '/' };
      return { label: l.slice(0, bar).trim().slice(0, 30) || '首页', href: l.slice(bar + 1).trim().slice(0, 200) || '/' };
    });
  if (form.adminPassword) {
    next.adminPassword = String(form.adminPassword).slice(0, 128);
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2) + '\n', 'utf8');
  site.reloadConfig(next);
  return send(res, 303, '', { Location: '/admin/settings', 'Content-Type': 'text/plain' });
}

// ---- 关于 ----
function aboutPage(req, res) {
  return send(res, 200, tpl.aboutPage({ body: site.aboutRaw() }));
}

async function saveAbout(req, res) {
  if (!sameOrigin(req)) return send(res, 403, '<p>来源校验失败</p>');
  const raw = await readBody(req, PREVIEW_MAX);
  const form = parseForm(raw);
  const body = String(form.body || '').replace(/\r\n/g, '\n').slice(0, PREVIEW_MAX);
  fs.writeFileSync(ABOUT_FILE, `---\ntitle: 关于本站\n---\n\n${body}`, 'utf8');
  return send(res, 303, '', { Location: '/admin/about', 'Content-Type': 'text/plain' });
}

// ---- 预览 API：返回渲染后的 HTML 片段 ----
async function preview(req, res) {
  if (!sameOrigin(req)) return send(res, 403, '<p>403</p>', { 'Content-Type': 'text/plain' });
  const raw = await readBody(req, PREVIEW_MAX);
  const form = parseForm(raw);
  const html = render(String(form.body || '').slice(0, PREVIEW_MAX));
  return send(res, 200, html, 'text/html; charset=utf-8');
}

module.exports = { login, logout, saveNew, editor, saveExisting, deletePost, settings, saveSettings, aboutPage, saveAbout, preview, upload };
