'use strict';
// 内置 Markdown 渲染器：覆盖博客常用语法，零依赖
// 支持：标题/引用/无序有序列表/代码块/表格/分割线/段落
// 行内：粗体、斜体、行内代码、删除线、链接、图片
const { escapeHtml } = require('./site');

function inline(s) {
  let out = escapeHtml(s);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, src) =>
    /^(https?:\/\/|\/\/|\/)/.test(src) ? `<img src="${src}" alt="${alt}" loading="lazy">` : m
  );
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, href) =>
    /^(https?:\/\/|\/\/|\/|#|mailto:)/.test(href) ? `<a href="${href}" rel="noopener">${text}</a>` : m
  );
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  out = out.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  return out;
}

function render(md) {
  const lines = String(md).replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let i = 0;
  let para = [];

  const flushPara = () => {
    if (para.length) {
      html.push(`<p>${inline(para.join(' '))}</p>`);
      para = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    if (/^```/.test(line)) {
      flushPara();
      const lang = line.slice(3).trim();
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++; // skip closing fence
      const cls = lang ? ` class="lang-${escapeHtml(lang)}"` : '';
      html.push(`<pre><code${cls}>${escapeHtml(buf.join('\n'))}</code></pre>`);
      continue;
    }

    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flushPara();
      const lv = h[1].length;
      html.push(`<h${lv}>${inline(h[2])}</h${lv}>`);
      i++;
      continue;
    }

    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) {
      flushPara();
      html.push('<hr>');
      i++;
      continue;
    }

    if (/^>\s?/.test(line)) {
      flushPara();
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      html.push(`<blockquote><p>${inline(buf.join(' '))}</p></blockquote>`);
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      flushPara();
      const buf = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) buf.push(lines[i++].replace(/^[-*]\s+/, ''));
      html.push(`<ul>${buf.map((t) => `<li>${inline(t)}</li>`).join('')}</ul>`);
      continue;
    }

    if (/^\d+[.)]\s+/.test(line)) {
      flushPara();
      const buf = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i])) buf.push(lines[i++].replace(/^\d+[.)]\s+/, ''));
      html.push(`<ol>${buf.map((t) => `<li>${inline(t)}</li>`).join('')}</ol>`);
      continue;
    }

    // 表格：| a | b | 分隔行含 ---
    if (/^\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\|[\s:-]+\|/.test(lines[i + 1])) {
      flushPara();
      const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
      html.push(
        '<table><thead><tr>' + head.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>' +
        rows.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') +
        '</tbody></table>'
      );
      continue;
    }

    if (!line.trim()) {
      flushPara();
      i++;
      continue;
    }

    para.push(line.trim());
    i++;
  }
  flushPara();
  return html.join('\n');
}

module.exports = { render };
