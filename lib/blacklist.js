'use strict';
// 黑名单：后台可视化维护手工封禁 + 展示外部共享情报同步状态
// 拦截动作在 nginx 层完成（deny 规则），不进入 Node 进程，命中即 403
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const STORE = process.env.BLACKLIST_STORE || path.join(ROOT, 'data', 'blacklist.json');

// 以下路径对应本站的 nginx 部署约定，换机器时用环境变量覆盖
const CONF_DIR = process.env.BLACKLIST_CONF_DIR || '/www/server/panel/vhost/nginx/ip-block';
const MANUAL_CONF = path.join(CONF_DIR, 'sujian-manual-deny.conf');
const AUTO_CONF = path.join(CONF_DIR, 'sujian-deny.conf');
const SYNC_STATE = process.env.WAF_SYNC_STATE || '/var/lib/waf-ip-sync.state';
const SYNC_SCRIPT = process.env.WAF_SYNC_SCRIPT || '/usr/local/bin/waf-ip-sync.sh';
const NGINX_BIN = process.env.NGINX_BIN || 'nginx';

const FEED_URL = 'https://www.bufanz.com/usr/plugins/WafShare/data/shared-list.txt';
const MAX_ENTRIES = 2000;
const IPV4_RE = /^([0-9]{1,3}\.){3}[0-9]{1,3}(\/([0-9]|[12][0-9]|3[0-2]))?$/;

const DURATIONS = [
  { key: '1d', label: '1 天', days: 1 },
  { key: '7d', label: '7 天', days: 7 },
  { key: '30d', label: '30 天', days: 30 },
  { key: 'forever', label: '永久', days: 0 },
];

function now() {
  return Date.now();
}

function emptyStore() {
  return { enabled: true, entries: [] };
}

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(STORE, 'utf8'));
    if (!raw || typeof raw !== 'object') return emptyStore();
    return {
      enabled: raw.enabled !== false,
      entries: Array.isArray(raw.entries) ? raw.entries.filter((e) => e && e.ip) : [],
    };
  } catch (e) {
    return emptyStore();
  }
}

function save(store) {
  try {
    fs.mkdirSync(path.dirname(STORE), { recursive: true });
    fs.writeFileSync(STORE, JSON.stringify(store, null, 2) + '\n', { mode: 0o600 });
  } catch (e) {
    throw new Error('黑名单写入失败：' + e.message);
  }
}

// 有效条目：未过期
function activeEntries(store, t) {
  const at = typeof t === 'number' ? t : now();
  return store.entries.filter((e) => !e.expiresAt || e.expiresAt > at);
}

function buildConf(store, t) {
  const at = typeof t === 'number' ? t : now();
  const lines = [
    '# 由素笺后台「黑名单」页面生成，请勿手工编辑',
    '# 手工封禁条目 + 拦截开关都在后台管理；外部共享名单在 sujian-deny.conf',
    '# 生成时间：' + new Date(at).toISOString(),
  ];
  if (!store.enabled) {
    lines.push('# 拦截开关：已关闭（本文件不产生任何 deny 规则）');
    return lines.join('\n') + '\n';
  }
  const active = activeEntries(store, at);
  lines.push('# 生效条目：' + active.length + ' 条');
  for (const e of active) lines.push(`deny ${e.ip};`);
  return lines.join('\n') + '\n';
}

function readAutoStatus() {
  let count = 0;
  try {
    const txt = fs.readFileSync(AUTO_CONF, 'utf8');
    count = txt.split('\n').filter((l) => /^deny\s/.test(l)).length;
  } catch (e) {
    count = -1;
  }
  let updatedAt = '';
  try {
    updatedAt = fs.readFileSync(SYNC_STATE, 'utf8').trim();
  } catch (e) {
    updatedAt = '';
  }
  return { count, updatedAt, url: FEED_URL };
}

// 写配置 → nginx -t → reload；校验失败回滚，保证不会因为后台点一下把站点搞挂
function apply(store) {
  const conf = buildConf(store);
  let backup = null;
  try {
    fs.mkdirSync(CONF_DIR, { recursive: true });
    if (fs.existsSync(MANUAL_CONF)) backup = fs.readFileSync(MANUAL_CONF, 'utf8');
    fs.writeFileSync(MANUAL_CONF, conf, { mode: 0o600 });
  } catch (e) {
    return { ok: false, error: '写入 nginx 配置失败：' + e.message };
  }
  return new Promise((resolve) => {
    execFile(NGINX_BIN, ['-t'], { timeout: 15000 }, (errTest) => {
      if (errTest) {
        if (backup !== null) fs.writeFileSync(MANUAL_CONF, backup, { mode: 0o600 });
        else fs.unlinkSync(MANUAL_CONF);
        return resolve({ ok: false, error: 'nginx 配置校验未通过，已回滚（未重启）' });
      }
      execFile(NGINX_BIN, ['-s', 'reload'], { timeout: 15000 }, (errReload) => {
        if (errReload) return resolve({ ok: false, error: 'nginx 重载失败：' + errReload.message });
        resolve({ ok: true });
      });
    });
  });
}

function normalizeIp(input) {
  const v = String(input || '').trim().toLowerCase();
  if (!IPV4_RE.test(v)) return '';
  const [addr, mask] = v.split('/');
  const nums = addr.split('.').map(Number);
  if (nums.some((n) => n < 0 || n > 255)) return '';
  return mask === undefined ? addr : `${addr}/${mask}`;
}

async function add(rawIp, note, durationKey) {
  const ip = normalizeIp(rawIp);
  if (!ip) return { ok: false, error: 'IP 格式不对，只支持 IPv4 或 CIDR（如 1.2.3.4、1.2.3.0/24）' };
  const store = load();
  if (store.entries.some((e) => e.ip === ip)) return { ok: false, error: `${ip} 已经在名单里了` };
  if (store.entries.length >= MAX_ENTRIES) return { ok: false, error: `手工名单最多 ${MAX_ENTRIES} 条` };
  const dur = DURATIONS.find((d) => d.key === durationKey) || DURATIONS[0];
  const t = now();
  store.entries.unshift({
    ip,
    note: String(note || '').trim().slice(0, 60),
    createdAt: t,
    expiresAt: dur.days ? t + dur.days * 86400000 : 0,
  });
  save(store);
  const res = await apply(store);
  return res.ok ? { ok: true, ip } : { ok: false, error: res.error };
}

async function remove(ip) {
  const store = load();
  const before = store.entries.length;
  store.entries = store.entries.filter((e) => e.ip !== String(ip || '').trim());
  if (store.entries.length === before) return { ok: false, error: '没找到这条记录' };
  save(store);
  const res = await apply(store);
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

async function setEnabled(enabled) {
  const store = load();
  store.enabled = !!enabled;
  save(store);
  const res = await apply(store);
  return res.ok ? { ok: true, enabled: store.enabled } : { ok: false, error: res.error };
}

// 手动触发一次外部名单同步（调用运维脚本）
function syncNow() {
  return new Promise((resolve) => {
    execFile(SYNC_SCRIPT, [], { timeout: 60000 }, (err) => {
      const st = readAutoStatus();
      if (err) return resolve({ ok: false, error: '同步脚本执行失败：' + err.message, status: st });
      resolve({ ok: true, status: st });
    });
  });
}

function overview(t) {
  const store = load();
  const at = typeof t === 'number' ? t : now();
  const entries = store.entries.map((e) => ({
    ...e,
    expired: !!e.expiresAt && e.expiresAt <= at,
    expiresText: e.expiresAt ? '' : '永久',
  }));
  return {
    enabled: store.enabled,
    entries,
    activeCount: activeEntries(store, at).length,
    auto: readAutoStatus(),
    confPath: MANUAL_CONF,
  };
}

module.exports = {
  overview,
  add,
  remove,
  setEnabled,
  syncNow,
  buildConf,
  apply,
  load,
  save,
  normalizeIp,
  DURATIONS,
  FEED_URL,
};
