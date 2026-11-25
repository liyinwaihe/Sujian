'use strict';
// CI 冒烟测试：启动 server.js 后逐条请求核心路由，全部 200 才算通过
// 用法：node scripts/ci-smoke.js [baseUrl]   （默认 http://127.0.0.1:3000）
const base = process.argv[2] || 'http://127.0.0.1:3000';

const PATHS = ['/', '/about', '/archive', '/tags', '/search', '/feed.xml', '/admin/login'];
const NEED_BODY = [
  ['/', '素笺'],
  ['/feed.xml', '<rss'],
];

async function waitReady(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await fetch(base + '/');
      return true;
    } catch (e) {
      if (Date.now() > deadline) return false;
      await new Promise((r) => setTimeout(r, 300));
    }
  }
}

(async () => {
  if (!(await waitReady())) {
    console.error(`服务在 15 秒内没有起来：${base}`);
    process.exit(1);
  }

  let failed = 0;
  for (const p of PATHS) {
    const res = await fetch(base + p, { redirect: 'manual' });
    const ok = res.status === 200;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${String(res.status).padEnd(4)} ${p}`);
    if (!ok) failed++;
  }

  for (const [p, needle] of NEED_BODY) {
    const html = await (await fetch(base + p)).text();
    const ok = html.includes(needle);
    console.log(`${ok ? 'PASS' : 'FAIL'}  内容   ${p} 含 "${needle}"`);
    if (!ok) failed++;
  }

  if (failed) {
    console.error(`\n${failed} 项未通过`);
    process.exit(1);
  }
  console.log('\n全部通过');
})();
