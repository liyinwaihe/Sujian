'use strict';
// Vercel Serverless 入口：同一份业务代码（lib/）的适配层
// Vercel 将本文件包装为一个 Vercel Function（Fluid compute），
// require.cache 在实例存续期内保持热状态，lib/site.js 的文章缓存照常工作。
const { handle } = require('../lib/router');

module.exports = async (req, res) => {
  try {
    handle(req, res);
  } catch (err) {
    console.error('[dear-blog] unhandled error:', err && err.message);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
    }
    res.end('<!doctype html><meta charset="utf-8"><title>500</title><p>服务器开小差了，请稍后再试。</p>');
  }
};

// 本地直接 node api/index.js 也能跑（与 server.js 等效）
if (require.main === module) {
  const PORT = Number(process.env.PORT) || 3000;
  require('node:http').createServer((rq, rs) => module.exports(rq, rs)).listen(PORT, () => {
    console.log('[dear-blog] running at http://localhost:' + PORT);
  });
}
