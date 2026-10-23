// host 插件 apply() + RPC wire 协议端到端测试：
// 用 mock cordis ctx（真实 http server 充当 webServer.register），按 dsh-pocket
// 复刻的 /api 传输语义发 client-request 信封，验证 login/status/mine/detail/logout。
// 凭据来源（按优先级）：环境变量 ZENTAO_BASE/ZENTAO_ACCOUNT/ZENTAO_PASSWORD
//   → 运行时配置 ~/.dsh/zentao-panel/config.json。凭据永不进 git。
// 用法：DSH_HOME=/tmp/zt-host node test/host.mjs
import http from 'node:http';
import { readConfig } from '../lib/store.mjs';
import { apply } from '../lib/index.js';

const fallback = readConfig();
const BASE = process.env.ZENTAO_BASE || fallback.baseUrl || '';
const ACCOUNT = process.env.ZENTAO_ACCOUNT || fallback.account || '';
const PASSWORD = process.env.ZENTAO_PASSWORD || fallback.password || '';
if (!BASE || !ACCOUNT || !PASSWORD) {
  console.error('缺少禅道凭据：请设置 ZENTAO_BASE/ZENTAO_ACCOUNT/ZENTAO_PASSWORD 环境变量，');
  console.error('或先在面板里登录一次（~/.dsh/zentao-panel/config.json 会落盘凭据）。');
  process.exit(2);
}

let failures = 0;
function check(name, cond, extra = '') {
  console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) failures++;
}

// ── mock webServer：把 prefix 路由挂到真实 http server ──────────────
const routes = [];
const server = http.createServer((req, res) => {
  for (const r of routes) {
    if (r.kind === 'prefix' && req.url?.startsWith(r.path)) {
      r.handler(req, res);
      return;
    }
  }
  res.writeHead(404).end('not found');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;

const mockCtx = {
  logger: () => ({ info() {}, warn() {}, error(...a) { console.error('[host-err]', ...a); } }),
  webServer: {
    register(route) {
      routes.push(route);
      return () => { const i = routes.indexOf(route); if (i >= 0) routes.splice(i, 1); };
    },
  },
  // requestRejection 以方法形式调用（复刻真实语义：非信任源返回 403/401，信任源 undefined）
  connection: {
    requestRejection(req) {
      const host = (req.headers.host ?? '').split(':')[0];
      if (!['127.0.0.1', 'localhost', '::1'].includes(host)) return 403;
      if (req.headers.origin && (() => { try { return new URL(req.headers.origin).host !== req.headers.host; } catch { return true; } })()) return 403;
      return undefined;
    },
  },
};

// ── 加载插件 ─────────────────────────────────────────────────────
const dispose = apply(mockCtx, {});
check('apply() mounted rpc route', routes.length === 1 && routes[0].path === '/dsh-zentao-panel');

// ── RPC 客户端（按 wire 协议手写 fetch）──────────────────────────
let rpcSeq = 0;
async function rpc(endpoint, payload = {}) {
  const rpcId = `t-${++rpcSeq}`;
  const res = await fetch(`http://127.0.0.1:${port}/dsh-zentao-panel/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rpcId, method: endpoint, payload }),
  });
  const body = JSON.parse(await res.text());
  if (body.type !== 'server-response') throw new Error(`bad envelope: ${JSON.stringify(body).slice(0, 100)}`);
  return body.result;
}

// status（未配置）
const s0 = await rpc('zentao.status');
check('status before config', s0.ok === true && s0.value.configured === false);

// login
const s1 = await rpc('zentao.login', { baseUrl: BASE, account: ACCOUNT, password: PASSWORD });
check('login via rpc', s1.ok === true && s1.value.loggedIn === true, `account=${s1.value?.account}`);

// mine
const m = await rpc('zentao.mine', {});
check('mine via rpc', m.ok === true && Array.isArray(m.value.cards) && m.value.cards.length >= 3, `${m.value?.cards?.length} 张卡片`);
const kinds = {};
for (const c of m.value.cards) kinds[c.kind] = (kinds[c.kind] ?? 0) + 1;
console.log('  kinds:', JSON.stringify(kinds));

// 缓存
const m2 = await rpc('zentao.mine', {});
check('cache hit', m2.value.cached === true);
// 强刷
const m3 = await rpc('zentao.mine', { refresh: true });
check('refresh bypass cache', m3.value.cached === false);

// detail
const first = m.value.cards.find((c) => c.kind === 'bug') ?? m.value.cards[0];
const d = await rpc('zentao.detail', { kind: first.kind, id: first.id });
check('detail via rpc', d.ok === true && d.value.id === first.id && typeof d.value.desc === 'string', `${first.kind}#${first.id} desc=${d.value.desc.length}字`);
check('detail 带 images 数组', d.ok === true && Array.isArray(d.value.images));
console.log('  详情 url:', d.value.url);

// 图片：mine 卡片 → zentao.image RPC（真实图片附件的数据来源）
const withImage = m.value.cards.find((c) => Array.isArray(c.images) && c.images.length > 0);
check('mine 卡片带 images 字段', m.value.cards.every((c) => Array.isArray(c.images)), `${m.value.cards.filter((c) => c.images.length).length} 张带图`);
if (withImage) {
  const img = await rpc('zentao.image', { url: withImage.images[0].url });
  check('image via rpc', img.ok === true && /^image\/(png|jpeg|webp|gif)$/.test(img.value.mediaType) && img.value.base64.length > 100,
    `${withImage.kind}#${withImage.id} ${img.value?.mediaType} ${img.value?.bytes} bytes`);
} else {
  check('image via rpc', false, '当前账号没有带内联图片的卡片');
}
const badImg = await rpc('zentao.image', { url: 'http://evil.example.com/file-read-1.png' });
check('image RPC 拒绝非同源（SSRF）', badImg.ok === false, badImg.error?.message);
check('image RPC 拒绝空 url', (await rpc('zentao.image', {})).ok === false);

// 非法参数
const bad = await rpc('zentao.detail', { kind: 'exec', id: 1 });
check('invalid kind rejected', bad.ok === false);

// 信封协议错误路径
const wrongMethod = await fetch(`http://127.0.0.1:${port}/dsh-zentao-panel/zentao.mine`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ rpcId: 'x', method: 'zentao.detail', payload: {} }),
}).then((r) => r.json());
check('method/endpoint mismatch → rpc error envelope', wrongMethod.result?.ok === false);

// 非 loopback → 403（fetch 不允许覆盖 Host 头，用 http.request 伪造；
// requestRejection 恒 403 模拟信任栅栏拒绝）
const forbidden = await new Promise((resolve) => {
  const req = http.request(
    { host: '127.0.0.1', port, path: '/dsh-zentao-panel/zentao.status', method: 'POST', headers: { 'content-type': 'application/json', Host: 'evil.example.com' } },
    resolve,
  );
  req.end(JSON.stringify({ rpcId: 'y', method: 'zentao.status', payload: {} }));
});
check('cross-site origin rejected', forbidden.statusCode === 403, `HTTP ${forbidden.statusCode}`);

// logout
const s2 = await rpc('zentao.logout', {});
check('logout', s2.ok === true && s2.value.configured === false);

// dispose
dispose();
check('dispose removes route', routes.length === 0);

server.close();
console.log(failures === 0 ? '\n全部通过 ✅' : `\n${failures} 项失败 ❌`);
process.exit(failures === 0 ? 0 : 1);
