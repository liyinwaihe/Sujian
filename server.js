'use strict';
// 入口文件：只做装配，零业务逻辑
const http = require('node:http');
const router = require('./lib/router');

const PORT = Number(process.env.PORT) || 3000;

const server = http.createServer((req, res) => {
  try {
    router.handle(req, res);
  } catch (err) {
    console.error('[sujian] unhandled error:', err && err.message);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
    }
    res.end('<!doctype html><meta charset="utf-8"><title>500</title><p>服务器开小差了，请稍后再试。</p>');
  }
});

server.listen(PORT, () => {
  console.log('[sujian] running at http://localhost:' + PORT);
});
