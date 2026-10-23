// 冒烟测试：不启动 DSH，直接验证 zentao-client + service 真实拉数据。
// 凭据来源（按优先级）：环境变量 ZENTAO_BASE/ZENTAO_ACCOUNT/ZENTAO_PASSWORD
//   → 运行时配置 ~/.dsh/zentao-panel/config.json（面板登录后落盘的）。
//   两者都没有则报错退出——凭据永不进 git。
// 用法：DSH_HOME=/tmp/zt-smoke node test/smoke.mjs
import { createZentaoClient } from '../lib/zentao-client.mjs';
import { createZentaoService } from '../lib/service.mjs';
import { writeConfig, readConfig } from '../lib/store.mjs';

const fallback = readConfig();
const BASE = process.env.ZENTAO_BASE || fallback.baseUrl || '';
const ACCOUNT = process.env.ZENTAO_ACCOUNT || fallback.account || '';
const PASSWORD = process.env.ZENTAO_PASSWORD || fallback.password || '';
if (!BASE || !ACCOUNT || !PASSWORD) {
  console.error('缺少禅道凭据：请设置 ZENTAO_BASE/ZENTAO_ACCOUNT/ZENTAO_PASSWORD 环境变量，');
  console.error('或先在面板里登录一次（~/.dsh/zentao-panel/config.json 会落盘凭据）。');
  process.exit(2);
}

const quietLogger = { info() {}, warn() {}, error(...a) { console.error('[err]', ...a); } };

let failures = 0;
function check(name, cond, extra = '') {
  console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) failures++;
}

// ── 1. zentao-client：登录 + my-work ─────────────────────────────
console.log('== zentao-client ==');
const client = createZentaoClient({ baseUrl: BASE, logger: quietLogger });
const loginRes = await client.login(ACCOUNT, PASSWORD);
check('login', loginRes.ok, `keepLogin=${loginRes.keepLogin}`);
const cookies = client.exportCookies();
check('long-term cookies (za/zp)', Boolean(cookies.za && cookies.zp));
console.log('  cookies:', Object.keys(cookies).join(','));

const tasks = await client.fetchMyWork('task');
const bugs = await client.fetchMyWork('bug');
const stories = await client.fetchMyWork('story');
check('my tasks', Array.isArray(tasks) && tasks.length >= 1, `${tasks.length} 条`);
check('my bugs', Array.isArray(bugs) && bugs.length >= 1, `${bugs.length} 条`);
check('my stories', Array.isArray(stories) && stories.length >= 1, `${stories.length} 条`);
if (tasks[0]) console.log('  任务示例:', tasks[0].id, String(tasks[0].name).slice(0, 40));

// ── 2. cookie 恢复（新 client 实例，不重新登录）────────────────
console.log('== cookie 恢复 ==');
const client2 = createZentaoClient({ baseUrl: BASE, logger: quietLogger });
client2.restore(cookies);
const tasks2 = await client2.fetchMyWork('task');
check('restore + fetch without relogin', Array.isArray(tasks2) && tasks2.length === tasks.length);

// ── 3. v1 详情 ───────────────────────────────────────────────────
console.log('== v1 详情 ==');
if (tasks[0]) {
  const detail = await client2.fetchDetail('task', Number(tasks[0].id));
  check('task detail', Number(detail.id) === Number(tasks[0].id) && typeof detail.desc === 'string', `pri=${detail.pri} deadline=${detail.deadline}`);
}
if (bugs[0]) {
  const detail = await client2.fetchDetail('bug', Number(bugs[0].id));
  check('bug detail', Number(detail.id) === Number(bugs[0].id), `severity=${detail.severity}`);
}

// ── 4. service 聚合层（含持久化 + 缓存）────────────────────────
console.log('== service 层 ==');
const service = createZentaoService({ logger: quietLogger, cacheTtlMs: 60_000 });
service.configure({ baseUrl: BASE, account: ACCOUNT, password: PASSWORD });
await service.ensureLogin();
const mine1 = await service.fetchMine();
const mine2 = await service.fetchMine();
check('service fetchMine', mine1.cards.length === tasks.length + bugs.length + stories.length, `${mine1.cards.length} 张卡片`);
check('cache 生效', mine2.cached === true);
const cfg = readConfig();
check('config 落盘且带 cookie', Boolean(cfg.baseUrl && cfg.cookies?.za));
if (mine1.cards[0]) {
  const d = await service.fetchDetail(mine1.cards[0].kind, mine1.cards[0].id);
  check('service fetchDetail', d.id === mine1.cards[0].id, `kind=${d.kind} desc长度=${d.desc.length}`);
  console.log('  卡片 url 示例:', d.url);
}

// ── 5. htmlToText / 图片引用 ─────────────────────────────────────
console.log('== htmlToText / images ==');
const { htmlToText, extractImageRefs, normalizeImageUrl, sniffImageMediaType } = await import('../lib/service.mjs');
const sample = '<p>第一段</p><p>第二段&nbsp;&amp;转义</p><ol><li>步骤1</li><li>步骤2</li></ol><img src="http://x/y.png" onload="evil">';
const text = htmlToText(sample);
check('html→text', text.includes('第一段') && text.includes('• 步骤1') && text.includes('[图片：y.png]') && !text.includes('<'), JSON.stringify(text));
check('htmlToText 不把 data: 图片内联进文本', !htmlToText('<img src="data:image/png;base64,AAAA">').includes('base64'));

const baseNoSlash = BASE.replace(/\/+$/, '');
const absRefs = extractImageRefs('<p><img src="http://zentao.example.com:8090/file-read-35861.png" /></p>', BASE);
check('extractImageRefs 绝对地址', absRefs.length === 1 && absRefs[0].url.includes('/file-read-35861.png') && absRefs[0].name === '35861.png', JSON.stringify(absRefs));
const braceRefs = extractImageRefs('<p><img src="{35861.png}" alt="" /></p>', BASE);
check('extractImageRefs 列表占位符 → /file-read-', braceRefs.length === 1 && braceRefs[0].url === `${baseNoSlash}/file-read-35861.png`, braceRefs[0]?.url);
check('normalizeImageUrl 拒绝 data:/javascript:', normalizeImageUrl('data:image/png;base64,AAA', BASE) === null && normalizeImageUrl('javascript:alert(1)', BASE) === null);
check('sniffImageMediaType png/gif', sniffImageMediaType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) === 'image/png'
  && sniffImageMediaType(Buffer.from('GIF89a', 'ascii')) === 'image/gif'
  && sniffImageMediaType(Buffer.from('<html>')) === null);
check('mine 卡片带 images 字段', mine1.cards.every((c) => Array.isArray(c.images)), `${mine1.cards.filter((c) => c.images.length).length} 张卡片带图`);

// ── 6. 真实图片下载（RPC zentao.image 的 host 半边）───────────────
console.log('== fetchImage ==');
const withImage = mine1.cards.find((c) => c.images.length > 0);
if (withImage) {
  const img = await service.fetchImage(withImage.images[0].url);
  const bytes = Buffer.from(img.base64, 'base64');
  check('service.fetchImage 下载真实图片', /^image\/(png|jpeg|webp|gif)$/.test(img.mediaType) && bytes.length === img.bytes && bytes.length > 100,
    `${withImage.kind}#${withImage.id} ${img.mediaType} ${img.bytes} bytes ${img.name}`);
} else {
  check('service.fetchImage 下载真实图片', false, '当前账号没有带内联图片的卡片');
}
let ssrf = null;
try { await service.fetchImage('http://evil.example.com/file-read-1.png'); } catch (e) { ssrf = e; }
check('fetchImage 拒绝非同源地址（SSRF）', ssrf && ssrf.code === 'BAD_IMAGE_URL', ssrf?.message);

console.log(failures === 0 ? '\n全部通过 ✅' : `\n${failures} 项失败 ❌`);
process.exit(failures === 0 ? 0 : 1);
