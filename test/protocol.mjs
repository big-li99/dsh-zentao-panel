// dsh-zentao-panel — 禅道响应信封协议回归测试（stub fetch，不打网络）
//
// 背景（2026-10-24 真机踩坑）：会话过期时禅道对 /my-work-*.json 返回
//   HTTP 200 + {"result":false,"message":"登录已超时，请重新登入!"}，
//   既不重定向 user-login，body 里也没有 user-login 字样。fetchMyWork
//   必须把它识别成 SESSION_EXPIRED（service 层才会自动重登），否则会被
//   当成空列表 → 面板静默显示「没有指派给你的任务」，点刷新也无效。
// 用法：node test/protocol.mjs（无需 DSH / 禅道 / 网络）
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createZentaoClient } from '../lib/zentao-client.mjs';
import { createZentaoService, toActions } from '../lib/service.mjs';

let failures = 0;
function check(name, cond, extra = '') {
  console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) failures++;
}

const md5 = (s) => createHash('md5').update(s, 'utf8').digest('hex');
const BASE = 'http://zentao.test';
const ACCOUNT = 'dev';
const PASSWORD = 'pw-123456';
const RAND = '654321';

// ── stub 禅道服务器（替换 globalThis.fetch）────────────────────────
// alive=false 时 task 接口回「登录已超时」信封；POST user-login 校验
// jQuery 风格头 + md5(md5(pw)+rand) 密码后置 alive=true。
let alive = false;
let myWorkMode = 'ok'; // 'ok' | 'expired' | 'redirect' | 'denied'
const calls = [];

function jsonResponse(obj, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status: 200,
    headers: { 'content-type': 'text/html; Language=UTF-8;charset=UTF-8', ...headers },
  });
}

// v1 story 详情载荷（2026-10-25 实测坑：v1 路径复数是 stories；此前 client 把
// story 简单加 s 拼成 storys，story 详情从 M3 起一直 404「不存在」）
const v1StoryPayload = {
  id: 8, title: '需求C', spec: 'x', status: 'reviewing',
  actions: [
    { actor: '张三', action: 'opened', date: '2026-10-24 17:35:00',
      desc: '2026-10-24 17:35:00, 由 <strong>张三</strong> 创建。\n', comment: '', history: [] },
    { actor: '李四', action: 'commented', date: '2026-10-25 10:00:00',
      desc: '2026-10-25 10:00:00, 由 李四 添加备注。',
      comment: '<p>先等后端</p><img src="http://zentao.test/file-read-36123.png" />', history: [] },
  ],
};

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  const method = String(init.method ?? 'GET').toUpperCase();
  calls.push(`${method} ${u.pathname}`);
  if (u.pathname === '/my-work-task.json') {
    if (myWorkMode === 'redirect') return new Response('<html><title>用户登录</title>跳转 user-login</html>', { status: 200 });
    if (myWorkMode === 'denied') return jsonResponse({ result: 'fail', message: '您没有权限执行该操作' });
    if (myWorkMode === 'expired' || !alive) return jsonResponse({ result: false, message: '登录已超时，请重新登入!' });
    return jsonResponse({ status: 'success', data: JSON.stringify({ tasks: [{ id: '101', name: '任务A', status: 'wait', assignedTo: { account: ACCOUNT } }] }) });
  }
  if (u.pathname === '/my-work-bug.json') {
    return jsonResponse({ status: 'success', data: JSON.stringify({ bugs: [{ id: '202', title: 'BugB', severity: 2 }] }) });
  }
  if (u.pathname === '/my-work-story.json') {
    return jsonResponse({ status: 'success', data: JSON.stringify({ stories: { 8: { id: '8', title: '需求C' } } }) });
  }
  // v1 story 详情路由
if (u.pathname === '/api.php/v1/stories/8') return jsonResponse(v1StoryPayload);
if (u.pathname === '/api.php/v1/stories/999') {
  return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
}
if (u.pathname === '/user-login.html' && method === 'GET') {
    return new Response('<html>user-login</html>', { status: 200, headers: { 'set-cookie': 'zentaosid=stub; path=/' } });
  }
  if (u.pathname === '/user-refreshRandom.html') {
    return new Response(RAND, { status: 200 });
  }
  if (u.pathname === '/user-login.html' && method === 'POST') {
    const h = new Headers(init.headers ?? {});
    const headersOk = h.get('x-requested-with') === 'XMLHttpRequest'
      && /application\/x-www-form-urlencoded;\s*charset=UTF-8/.test(h.get('content-type') ?? '')
      && h.get('referer') === `${BASE}/user-login.html`
      && h.get('origin') === BASE;
    const form = new URLSearchParams(String(init.body ?? ''));
    const bodyOk = form.get('account') === ACCOUNT
      && form.get('password') === md5(md5(PASSWORD) + RAND)
      && form.get('verifyRand') === RAND;
    if (!headersOk || !bodyOk) return jsonResponse({ result: 'fail', message: '登录被拒（返回登录页）' });
    alive = true;
    return jsonResponse({ result: 'success', locate: '/' }, { 'set-cookie': 'za=stub; path=/' });
  }
  return new Response('not found', { status: 404 });
};

// ── 1. fetchMyWork 信封识别（client 层单元）────────────────────────
const client = createZentaoClient({ baseUrl: BASE, logger: { info() {}, warn() {}, error() {} } });
client.restore({ za: 'dev', zp: 'stale' }); // 有 za/zp 但服务端会话已死

let err = null;
myWorkMode = 'expired'; alive = true;
try { await client.fetchMyWork('task'); } catch (e) { err = e; }
check('超时信封（result:false + 登录已超时）→ SESSION_EXPIRED', err?.code === 'SESSION_EXPIRED', err?.message ?? '');

err = null;
myWorkMode = 'redirect'; alive = true;
try { await client.fetchMyWork('task'); } catch (e) { err = e; }
check('user-login 重定向形态 → SESSION_EXPIRED', err?.code === 'SESSION_EXPIRED');

err = null; let deniedMsg = '';
myWorkMode = 'denied'; alive = true;
try { await client.fetchMyWork('task'); } catch (e) { err = e; deniedMsg = e.message; }
check('其他 fail 信封 → 普通 Error（不误判成会话失效）', err instanceof Error && err.code !== 'SESSION_EXPIRED', deniedMsg);

myWorkMode = 'ok'; alive = true;
const tasks = await client.fetchMyWork('task');
check('成功双层 JSON → tasks 数组', Array.isArray(tasks) && tasks.length === 1 && tasks[0].id === '101');
const stories = await client.fetchMyWork('story');
check('story 是 dict → 解包成数组', Array.isArray(stories) && stories.length === 1 && String(stories[0].id) === '8');

// ── 2. service 自动重登（离线端到端，复刻真机场景）─────────────────
// 旧格式配置（带已死 cookie + 密码）→ fetchMine 探活发现超时 → 自动重登 → 拿到数据
const home = await mkdtemp(join(tmpdir(), 'zt-protocol-'));
process.env.DSH_HOME = home;
await mkdir(join(home, 'zentao-panel'), { recursive: true });
await writeFile(join(home, 'zentao-panel', 'config.json'), JSON.stringify({
  baseUrl: BASE,
  account: ACCOUNT,
  password: Buffer.from(PASSWORD, 'utf8').toString('base64'),
  cookies: { zentaosid: 'dead', za: 'dev', zp: 'stale', keepLogin: 'on' },
  savedAt: Date.now(),
}));

myWorkMode = 'ok'; alive = false;
calls.length = 0;
const service = createZentaoService({ logger: { info() {}, warn() {}, error() {} } });
const st = service.init();
check('init 旧格式配置迁移', st.configured === true && st.account === ACCOUNT && st.count === 1);

const mine = await service.fetchMine();
check('会话超时后 fetchMine 自动重登并返回数据', Array.isArray(mine.cards) && mine.cards.length === 3,
  `${mine.cards?.length} 张（task/bug/story 各 1）`);
check('重登走了登录协议（GET login + refreshRandom + POST login）',
  calls.includes('GET /user-login.html') && calls.includes('GET /user-refreshRandom.html') && calls.includes('POST /user-login.html'));
const again = await service.fetchMine();
check('重登后缓存命中（不再重登）', again.cached === true && calls.filter((c) => c === 'POST /user-login.html').length === 1);

// ── 3. v1 详情路径复数 + actions 精简映射（2026-10-25 提案 2）──
calls.length = 0;
const s8 = await client.fetchDetail('story', 8);
check('story 详情走 stories（不是 storys）→ 成功',
  s8?.id === 8 && calls.includes('GET /api.php/v1/stories/8') && !calls.includes('GET /api.php/v1/storys/8'));

err = null;
try { await client.fetchDetail('story', 999); } catch (e) { err = e; }
check('story 真 404 → 抛「不存在」',
  err?.message.includes('不存在') === true && calls.filter((c) => c === 'GET /api.php/v1/stories/999').length === 1);

// toActions 精简映射（service 层纯函数）
const mapped = toActions(v1StoryPayload.actions, BASE);
check('toActions：desc 去时间前缀 + 去 HTML / comment 保占位符并提图片',
  mapped.length === 2
  && mapped[0].desc === '由 张三 创建。'
  && mapped[1].desc === '由 李四 添加备注。'
  && mapped[1].comment === '先等后端\n[图片：36123.png]'
  && mapped[1].images.length === 1 && mapped[1].images[0].url === 'http://zentao.test/file-read-36123.png');

const mappedHist = toActions([{ actor: '李四', action: 'edited', date: '2026-09-23 09:54:36', desc: '由 李四 编辑。', comment: '', history: [
  { field: 'assignedTo', fieldName: '指派给', old: 'zhangsan', new: 'lisi' },
  { field: 'desc', fieldName: '任务描述', old: `<p>${'x'.repeat(200)}</p>`, new: '' },
] }], BASE);
check('toActions：history 取中文 fieldName，长 HTML 值转文本截断（80+…）',
  mappedHist[0].history.length === 2
  && mappedHist[0].history[0].field === '指派给' && mappedHist[0].history[0].old === 'zhangsan' && mappedHist[0].history[0].new === 'lisi'
  && mappedHist[0].history[1].old.length === 81 && mappedHist[0].history[1].old.endsWith('…'));

check('toActions：desc/comment/history 全空的条目被滤掉 / 非数组入参 → []',
  toActions([{ actor: 'x', comment: '', history: [] }, null], BASE).length === 0
  && toActions(undefined, BASE).length === 0);

globalThis.fetch = realFetch;
console.log(failures === 0 ? '\n全部通过 ✅' : `\n${failures} 项失败 ❌`);
process.exit(failures === 0 ? 0 : 1);
