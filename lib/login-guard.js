'use strict';
// 登录防爆破：按客户端 IP 计数 + 递增封禁 + 落盘持久化
// 与 auth.js 的分工：auth 管会话，这里只管"谁能试密码、能试几次"
const fs = require('node:fs');
const path = require('node:path');

const WINDOW_MS = 10 * 60 * 1000; // 统计窗口：10 分钟
const MAX_FAILS = 5; // 窗口内失败上限
const LOCK_STEPS = [10 * 60, 30 * 60, 2 * 3600, 24 * 3600]; // 秒：10min → 30min → 2h → 24h
const STRIKES_TTL_MS = 24 * 3600 * 1000; // 封禁等级保留 24 小时
const IDLE_TTL_MS = 48 * 3600 * 1000; // 记录闲置 48 小时后清理
const GLOBAL_FAIL_LIMIT = 200; // 全局失败总量（窗口内）超过则附加延迟，防分布式慢速试探
const GLOBAL_DELAY_MS = 1200;

const STORE_FILE = path.join(__dirname, '..', 'data', 'login-attempts.json');

// ip -> { fails: [ts], lockUntil: ts, strikes: n, lastSeen: ts }
let store = Object.create(null);
let loaded = false;
let persistBroken = false;

function load() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    if (raw && typeof raw === 'object') store = raw;
  } catch (e) {
    store = Object.create(null); // 首次运行或文件损坏：从空开始
  }
}

function prune(now) {
  for (const ip of Object.keys(store)) {
    const rec = store[ip];
    if (!rec || typeof rec !== 'object') {
      delete store[ip];
      continue;
    }
    rec.fails = Array.isArray(rec.fails) ? rec.fails.filter((t) => now - t < WINDOW_MS) : [];
    if (rec.lockUntil && rec.lockUntil <= now) rec.lockUntil = 0;
    if (rec.strikesAt && now - rec.strikesAt > STRIKES_TTL_MS) rec.strikes = 0;
    const idle = now - (rec.lastSeen || 0);
    if (!rec.lockUntil && !rec.fails.length && idle > IDLE_TTL_MS) delete store[ip];
  }
}

function persist() {
  if (persistBroken) return;
  try {
    fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
    fs.writeFileSync(STORE_FILE, JSON.stringify(store), { mode: 0o600 });
  } catch (e) {
    persistBroken = true; // 只读文件系统：退化为纯内存，不影响功能
  }
}

function trusted(ip) {
  const list = String(process.env.LOGIN_TRUSTED_IPS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.includes(ip);
}

// 取客户端 IP：仅当直连方是回环（即前面的 nginx）时才信任 X-Real-IP，避免直连 3000 端口伪造
function clientIp(req) {
  const sock = (req.socket && req.socket.remoteAddress) || 'unknown';
  const loopback = sock === '127.0.0.1' || sock === '::1' || sock === '::ffff:127.0.0.1';
  if (loopback) {
    const real = String(req.headers['x-real-ip'] || '').trim();
    if (real) return real;
    const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (xff) return xff;
  }
  return sock.replace(/^::ffff:/, '');
}

function globalFails(now) {
  let n = 0;
  for (const ip of Object.keys(store)) {
    const rec = store[ip];
    if (rec && Array.isArray(rec.fails)) n += rec.fails.filter((t) => now - t < WINDOW_MS).length;
  }
  return n;
}

// 返回 { locked, retryAfter(秒), fails, delayMs }
function check(req, now) {
  load();
  const t = typeof now === 'number' ? now : Date.now();
  prune(t);
  const ip = typeof req === 'string' ? req : clientIp(req);
  const rec = store[ip];
  if (rec && rec.lockUntil && rec.lockUntil > t) {
    return {
      ip,
      locked: true,
      retryAfter: Math.ceil((rec.lockUntil - t) / 1000),
      fails: (rec.fails || []).length,
      delayMs: 0,
    };
  }
  const delayMs = globalFails(t) >= GLOBAL_FAIL_LIMIT ? GLOBAL_DELAY_MS : 0;
  return { ip, locked: false, retryAfter: 0, fails: rec ? (rec.fails || []).length : 0, delayMs };
}

function fail(req, now) {
  load();
  const t = typeof now === 'number' ? now : Date.now();
  const ip = typeof req === 'string' ? req : clientIp(req);
  const rec = store[ip] || (store[ip] = { fails: [], lockUntil: 0, strikes: 0, lastSeen: t });
  rec.fails = (rec.fails || []).filter((x) => t - x < WINDOW_MS);
  rec.fails.push(t);
  rec.lastSeen = t;
  let locked = false;
  if (rec.fails.length >= MAX_FAILS && !trusted(ip)) {
    const idx = Math.min(rec.strikes || 0, LOCK_STEPS.length - 1);
    rec.lockUntil = t + LOCK_STEPS[idx] * 1000;
    rec.strikes = (rec.strikes || 0) + 1;
    rec.strikesAt = t;
    rec.fails = []; // 封禁后重新计数，避免解锁瞬间继续累加
    locked = true;
    console.warn(
      `[sujian] 登录已锁定 ip=${ip} 时长=${LOCK_STEPS[idx] / 60}min 第${rec.strikes}次封禁`
    );
  } else {
    console.warn(`[sujian] 登录失败 ip=${ip} 窗口内第${rec.fails.length}次`);
  }
  prune(t);
  persist();
  return { ip, locked, fails: rec.fails.length, retryAfter: locked ? LOCK_STEPS[Math.min((rec.strikes || 1) - 1, LOCK_STEPS.length - 1)] : 0 };
}

function success(req) {
  load();
  const ip = typeof req === 'string' ? req : clientIp(req);
  const rec = store[ip];
  if (rec) {
    rec.fails = [];
    rec.lockUntil = 0;
    rec.strikes = 0;
    rec.lastSeen = Date.now();
    prune(Date.now());
    persist();
  }
}

// 供运维/测试：清空全部记录
function resetAll() {
  store = Object.create(null);
  persist();
}

module.exports = { check, fail, success, resetAll, clientIp, WINDOW_MS, MAX_FAILS, LOCK_STEPS };
