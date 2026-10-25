// 多账号测试：mock 禅道 client（不打网络），验证 store 迁移 + service 多账号会话。
// 覆盖：旧单账号格式迁移 / upsert / 切换 / 每账号缓存隔离 / 按账号移除 / 凭据落盘。
// 用法：node test/multi.mjs（自动用临时 DSH_HOME，不碰 ~/.dsh/zentao-panel）
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'zt-multi-'));

const { createZentaoService } = await import('../lib/service.mjs');
const store = await import('../lib/store.mjs');

let failures = 0;
function check(name, cond, extra = '') {
  console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) failures++;
}
const quiet = { info() {}, warn() {}, error() {} };

// ── mock 禅道 client：数据按 baseUrl 区分，用于验证账号隔离 ──
let loginCount = 0;
const fakeCreateClient = ({ baseUrl }) => {
  const myWorkCalls = { task: 0, bug: 0, story: 0, logins: 0 };
  let cookies = {};
  return {
    myWorkCalls,
    loggedIn: () => Boolean(cookies.za && cookies.zp),
    restore(c) { cookies = { ...(c ?? {}) }; },
    exportCookies: () => ({ ...cookies }),
    async login(account, password) {
      myWorkCalls.logins = (myWorkCalls.logins ?? 0) + 1;
      loginCount++;
      if (password === 'wrong') throw new Error('禅道登录失败：密码错误');
      cookies = { za: account, zp: `hash-${baseUrl}`, keepLogin: 'on' };
      return { ok: true, keepLogin: true };
    },
    async fetchMyWork(kind) {
      if (!cookies.za) { const e = new Error('禅道会话失效'); e.code = 'SESSION_EXPIRED'; throw e; }
      myWorkCalls[kind]++;
      return [{ id: String(baseUrl.length * 7 + kind.length), name: `${baseUrl} 的 ${kind}` }];
    },
    async fetchDetail() { return { id: 1, name: 'd' }; },
    async fetchFile() { return { status: 200, contentType: 'image/png', bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) }; },
  };
};

const svc = (opts = {}) => createZentaoService({ logger: quiet, cacheTtlMs: 60_000, createClient: fakeCreateClient, ...opts });

// ── 1. 旧单账号配置 → 自动迁移 ─────────────────────────────
console.log('== 迁移 ==');
const cfgPath = join(process.env.DSH_HOME, 'zentao-panel', 'config.json');
mkdirSync(join(process.env.DSH_HOME, 'zentao-panel'), { recursive: true });
{
  const legacy = {
    baseUrl: 'http://a.zentao:8090',
    account: 'alice',
    password: Buffer.from('pw-a', 'utf8').toString('base64'),
    cookies: { za: { value: 'alice' }, zp: { value: 'zpa' } },
    savedAt: 1,
  };
  writeFileSync(cfgPath, JSON.stringify(legacy));
}
const cfg1 = store.readConfig();
check('旧格式读取 → 1 个账号', cfg1.accounts.length === 1 && cfg1.accounts[0].account === 'alice');
check('旧格式兼容字段（baseUrl/account/password）', cfg1.baseUrl === 'http://a.zentao:8090' && cfg1.account === 'alice' && cfg1.password === 'pw-a');
check('迁移后 activeId 指向该账号', cfg1.activeId === cfg1.accounts[0].id && Boolean(cfg1.activeId));
check('旧格式账号别名默认空', cfg1.accounts[0].alias === '' && cfg1.alias === '');

const s1 = svc();
const boot1 = s1.init();
check('init 恢复迁移账号', boot1.configured === true && boot1.account === 'alice' && boot1.count === 1);
const st1 = s1.status();
check('status 带账号列表', st1.configured === true && st1.accounts.length === 1 && st1.accounts[0].account === 'alice' && st1.activeId === st1.accounts[0].id);
check('旧 cookie 恢复后即为登录态', st1.loggedIn === true);

// cookie 直接可用 → 拉数据不触发登录
const mineA1 = await s1.fetchMine();
check('迁移账号免登拉数', mineA1.cards.length === 3 && mineA1.cards[0].title === 'http://a.zentao:8090 的 task');

// ── 2. 添加第二个账号（不同实例）──────────────────────────
console.log('== 添加/切换 ==');
s1.configure({ baseUrl: 'http://b.zentao:8090/', account: 'bob', password: 'pw-b' });
await s1.ensureLogin();
const st2 = s1.status();
check('添加后 2 个账号且新账号激活', st2.accounts.length === 2 && st2.account === 'bob' && st2.activeId === st2.accounts.find((a) => a.account === 'bob').id);
check('新账号已登录', st2.loggedIn === true);
const mineB1 = await s1.fetchMine();
check('激活账号数据来自 b', mineB1.cards[0].title === 'http://b.zentao:8090 的 task');

// 切回 alice：不重新登录、直接用持久化 cookie，且各自缓存隔离
const aliceId = st2.accounts.find((a) => a.account === 'alice').id;
const bobId = st2.activeId;
const loginCountBefore = loginCount;
s1.switch(aliceId);
check('switch 后激活 alice', s1.status().account === 'alice');
const mineA2 = await s1.fetchMine();
check('切回后数据来自 a（缓存）', mineA2.cards[0].title === 'http://a.zentao:8090 的 task' && mineA2.cached === true);
check('切换未触发重新登录', loginCount === loginCountBefore);
s1.switch(bobId);
const mineB2 = await s1.fetchMine();
check('再切回 b 命中自己的缓存', mineB2.cards[0].title === 'http://b.zentao:8090 的 task' && mineB2.cached === true);

// ── 3. upsert：同地址同账号重复登录 = 更新，不是新增 ────────
console.log('== upsert ==');
s1.configure({ baseUrl: 'http://b.zentao:8090', account: 'bob', password: 'pw-b2' });
await s1.ensureLogin();
check('重复登录仍 2 个账号', s1.status().accounts.length === 2 && s1.status().account === 'bob');

// ── 3.5 别名：设置 / 清除 / upsert 保留 / 未知 id ──────────
console.log('== 别名 ==');
check('normAlias：trim + 30 字截断 + 空安全',
  store.normAlias('  ' + '甲'.repeat(40) + ' ') === '甲'.repeat(30)
  && store.normAlias('  生产 · bob ') === '生产 · bob'
  && store.normAlias(null) === '' && store.normAlias(undefined) === '');
s1.rename(bobId, '  测试环境 · bob  ');
check('rename 设置别名（trim 后）', s1.status().accounts.find((a) => a.id === bobId).alias === '测试环境 · bob');
check('status 顶层 alias 取激活账号', s1.status().alias === '测试环境 · bob');
s1.configure({ baseUrl: 'http://b.zentao:8090', account: 'bob', password: 'pw-b2' }); // 重新登录不带 alias
await s1.ensureLogin();
check('重新登录（不带 alias）保留别名', s1.status().accounts.find((a) => a.id === bobId).alias === '测试环境 · bob');
s1.rename(bobId, '   ');
check('rename 空白串清除别名', s1.status().accounts.find((a) => a.id === bobId).alias === '');
s1.rename(bobId, 'bob 备注');
let noSuchRename = null;
try { s1.rename('deadbeef', 'x'); } catch (e) { noSuchRename = e; }
check('rename 未知 id 抛 NO_SUCH_ACCOUNT', noSuchRename && noSuchRename.code === 'NO_SUCH_ACCOUNT');
check('改名不影响激活账号与登录态', s1.status().account === 'bob' && s1.status().loggedIn === true);

// ── 4. 切换/移除的边界 ─────────────────────────────────────
console.log('== 移除 ==');
let noSuch = null;
try { s1.switch('deadbeef'); } catch (e) { noSuch = e; }
check('switch 未知 id 抛错', noSuch && noSuch.code === 'NO_SUCH_ACCOUNT');

s1.logout(bobId); // 移除非激活？bob 是激活账号 → 移除后自动切到剩余第一个
const st3 = s1.status();
check('移除激活账号 → 自动切到剩余账号', st3.configured === true && st3.accounts.length === 1 && st3.account === 'alice');
s1.logout(); // 不传 id = 移除当前激活
const st4 = s1.status();
check('最后一个账号移除 → 未配置', st4.configured === false && st4.accounts.length === 0);
const cfgEnd = JSON.parse(readFileSync(cfgPath, 'utf8'));
check('全部移除后配置清空', Array.isArray(cfgEnd.accounts) && cfgEnd.accounts.length === 0);

// ── 5. 落盘往返：密码 base64、cookie 保留、activeId 保留 ────
console.log('== 落盘 ==');
const s2 = svc();
s2.configure({ baseUrl: 'http://a.zentao:8090', account: 'alice', password: 'pw-a2' });
// 登录时带别名（rpc 层语义：trim 后非空才传给 configure）
s2.configure({ baseUrl: 'http://b.zentao:8090', account: 'bob', password: 'pw-b', alias: '  生产 · bob ' });
await s2.ensureLogin();
s2.switch((await (async () => s2.status())()).accounts.find((a) => a.account === 'alice').id);
const cfgRt = store.readConfig();
check('落盘往返 2 个账号', cfgRt.accounts.length === 2);
check('密码 base64 往返还原', cfgRt.accounts.every((a) => /^pw-/.test(a.password)));
check('bob 登录 cookie 已落盘', cfgRt.accounts.find((a) => a.account === 'bob').cookies.za === 'bob');
check('别名落盘往返（trim）', cfgRt.accounts.find((a) => a.account === 'bob').alias === '生产 · bob');
check('activeId 落盘且有效', cfgRt.activeId === cfgRt.accounts.find((a) => a.account === 'alice').id);

// 重启模拟：新 service init 后仍 2 个账号、激活 alice、bob 免登
const s3 = svc();
const boot3 = s3.init();
const st5 = s3.status();
check('重启恢复 2 个账号 + 激活状态', boot3.configured === true && boot3.count === 2 && st5.account === 'alice');
check('重启后 bob 仍登录态', st5.accounts.find((a) => a.account === 'bob').loggedIn === true);
check('重启恢复别名', st5.accounts.find((a) => a.account === 'bob').alias === '生产 · bob');

// ── 6. fetchImage 内存缓存（10min TTL + 容量淘汰；client 半边另有 dataURL 缓存）──
console.log('== fetchImage 缓存 ==');
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// mock client：fetchFile 按 path 计数；cookies 放 counters 里方便测试直接踢掉（验缓存命中免登录）
const makeImgClient = (c, { size = 100 } = {}) => ({
  loggedIn: () => Boolean(c.cookies && c.cookies.za && c.cookies.zp),
  restore() { c.cookies = {}; },
  exportCookies: () => ({ ...(c.cookies ?? {}) }),
  async login() { c.logins++; c.cookies = { za: 'x', zp: 'y' }; return { ok: true }; },
  async fetchMyWork() { c.probes++; return []; },
  async fetchDetail() { return {}; },
  async fetchFile({ path }) {
    c.byPath[path] = (c.byPath[path] ?? 0) + 1;
    return { status: 200, contentType: 'image/png', bytes: Buffer.concat([PNG_MAGIC, Buffer.alloc(size)]) };
  },
});
const imgSvc = (c, opts = {}) => createZentaoService({
  logger: quiet, cacheTtlMs: 60_000, createClient: () => makeImgClient(c), ...opts,
});
const IU1 = 'http://c.zentao:8090/file-read-1.png';
const IU2 = 'http://c.zentao:8090/file-read-2.png';

// 命中：TTL 内同 URL 只打一次禅道；踢掉 cookie 后缓存命中连登录/探活都不触发
{
  const c = { byPath: {}, logins: 0, probes: 0 };
  const s = imgSvc(c);
  s.configure({ baseUrl: 'http://c.zentao:8090', account: 'carol', password: 'pw' });
  const img1 = await s.fetchImage(IU1);
  check('fetchImage 首次：真实下载，name/mediaType 归一',
    c.byPath['/file-read-1.png'] === 1 && img1.name === '1.png' && img1.mediaType === 'image/png' && img1.bytes === 108);
  const img2 = await s.fetchImage(IU1);
  check('fetchImage TTL 内命中缓存：不重打禅道，返回同值',
    c.byPath['/file-read-1.png'] === 1 && img2.base64 === img1.base64 && img2.bytes === 108);
  const { logins, probes } = c;
  c.cookies = {}; // 模拟登录态失效——命中路径在 ensureLogin 之前返回，不该触发重登
  const img3 = await s.fetchImage(IU1);
  check('fetchImage 缓存命中绕过登录/探活（踢掉 cookie 也不重登）',
    c.byPath['/file-read-1.png'] === 1 && c.logins === logins && c.probes === probes && img3.bytes === 108);
}

// TTL 过期：同 URL 重新下载
{
  const c = { byPath: {}, logins: 0, probes: 0 };
  const s = imgSvc(c, { imageCacheTtlMs: 0 });
  s.configure({ baseUrl: 'http://c.zentao:8090', account: 'carol', password: 'pw' });
  await s.fetchImage(IU1);
  await s.fetchImage(IU1);
  check('fetchImage TTL 过期后重新下载（ttl=0 每次都 miss）', c.byPath['/file-read-1.png'] === 2);
}

// 容量淘汰：总字节超上限时最旧先出，腾位置给新图
{
  const c = { byPath: {}, logins: 0, probes: 0 };
  const s = imgSvc(c, { imageCacheMaxBytes: 150 }); // 单图 108B：两张即超
  s.configure({ baseUrl: 'http://c.zentao:8090', account: 'carol', password: 'pw' });
  await s.fetchImage(IU1);
  await s.fetchImage(IU2);   // 108+108 > 150 → 淘汰 IU1
  await s.fetchImage(IU1);   // miss → 重新下载（IU2 反被挤出去）
  check('fetchImage 容量淘汰：超限最旧先出，被淘汰的重新下载',
    c.byPath['/file-read-1.png'] === 2 && c.byPath['/file-read-2.png'] === 1);
}

// 单图超过容量上限：不入缓存，每次真实下载（返回值照常）
{
  const c = { byPath: {}, logins: 0, probes: 0 };
  const s = imgSvc(c, { imageCacheMaxBytes: 50 }); // 单图 108B > 上限
  s.configure({ baseUrl: 'http://c.zentao:8090', account: 'carol', password: 'pw' });
  const a = await s.fetchImage(IU1);
  const b = await s.fetchImage(IU1);
  check('fetchImage 单图超容量上限不入缓存（每次重拉，返回值不受影响）',
    c.byPath['/file-read-1.png'] === 2 && a.bytes === 108 && b.bytes === 108);
}

console.log(failures === 0 ? '\n全部通过 ✅' : `\n${failures} 项失败 ❌`);
process.exit(failures === 0 ? 0 : 1);
