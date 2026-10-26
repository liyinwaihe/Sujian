'use strict';
// 认证与会话：HMAC 签名 Cookie，零依赖
// 密码来源：环境变量 ADMIN_PASSWORD 优先，否则 config.json 的 adminPassword
// 签名密钥来源：环境变量 SESSION_SECRET 优先 → data/secret.key → 随机生成
// （Serverless 只读文件系统：设 SESSION_SECRET 环境变量可跨实例保持登录态稳定）
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const SECRET_FILE = path.join(__dirname, '..', 'data', 'secret.key');
const SESSION_TTL_MS = 7 * 24 * 3600 * 1000;

function secret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  try {
    const s = fs.readFileSync(SECRET_FILE, 'utf8').trim();
    if (s) return s;
  } catch (e) { /* fallthrough */ }
  const s = crypto.randomBytes(32).toString('hex');
  try {
    fs.mkdirSync(path.dirname(SECRET_FILE), { recursive: true });
    fs.writeFileSync(SECRET_FILE, s + '\n', { mode: 0o600 });
  } catch (e) { /* 只读文件系统：退化为实例内随机密钥 */ }
  return s;
}

function adminPassword(config) {
  const p = process.env.ADMIN_PASSWORD || config.adminPassword || '';
  return String(p);
}

function sign(payload) {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

// token = expMs.sig(expMs)
function makeToken(now) {
  const exp = String(now + SESSION_TTL_MS);
  return `${exp}.${sign(exp)}`;
}

function verifyToken(token, now) {
  if (typeof token !== 'string') return false;
  const dot = token.lastIndexOf('.');
  if (dot < 1) return false;
  const exp = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expect = sign(exp);
  if (sig.length !== expect.length) return false;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return false;
  } catch (e) {
    return false;
  }
  const expMs = Number(exp);
  return Number.isFinite(expMs) && expMs > now;
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// ---- 登录限速：滑动窗口，5 次失败 / 10 分钟 ----
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILS = 5;
const fails = [];

function loginLockedNow() {
  const cutoff = Date.now() - WINDOW_MS;
  while (fails.length && fails[0] < cutoff) fails.shift();
  return fails.length >= MAX_FAILS;
}

function recordFail() {
  fails.push(Date.now());
}

function resetFails() {
  fails.length = 0;
}

function isAuthed(req, config, now) {
  const cookies = parseCookies(req);
  return verifyToken(cookies.dear_session, now || Date.now());
}

module.exports = { adminPassword, makeToken, verifyToken, parseCookies, isAuthed, safeEqual, loginLockedNow, recordFail, resetFails };
