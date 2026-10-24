// client 半边免渲染测试：验证 bundle 能被 __ModuleLoader__ 加载、apply() 把
//   左侧栏全局面板（sidebar.panellist 图标行 + main keyed 面板，dsh-mnemon 同款）注册上。
// 不依赖 DSH / 浏览器：用最小 window/document/React 替身执行真实 bundle。
// 用法：node test/client.mjs
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8');

let failures = 0;
function check(name, cond, extra = '') {
  console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) failures++;
}

// ── 最小浏览器环境 ────────────────────────────────────────────
const appended = [];
const document = {
  head: { appendChild(el) { appended.push(el); } },
  createElement() {
    return { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, textContent: '' };
  },
  querySelector() { return null; },
  addEventListener() {},
  removeEventListener() {},
  getSelection() { return null; },
};
const window = { __ModuleLoader__: { load(def) { window.__def = def; } } };
window.window = window;
window.document = document;
window.navigator = { clipboard: { writeText: () => Promise.resolve() } };
// localStorage 替身（会话关联存储用）
const lsBacking = new Map();
window.localStorage = {
  getItem: (k) => (lsBacking.has(k) ? lsBacking.get(k) : null),
  setItem: (k, v) => lsBacking.set(k, String(v)),
  removeItem: (k) => lsBacking.delete(k),
};

const React = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: (v) => [v, () => {}],
  useEffect: () => {},
  useMemo: (f) => f(),
  useCallback: (f) => f,
};

const sandbox = {
  window, document, console, setTimeout, clearTimeout, setInterval, clearInterval, Symbol, Object, Array, String, Number, Date, JSON, Math, Promise,
  Event: class Event {}, HTMLTextAreaElement: class HTMLTextAreaElement {},
  // 真实图片附件管线用到的 Web API（Node vm 上下文里没有，需要显式提供）
  atob: (s) => Buffer.from(String(s), 'base64').toString('binary'),
  File: class File {
    constructor(parts, name, opts) {
      this.parts = parts;
      this.name = name;
      this.type = (opts && opts.type) || '';
      this.size = parts.reduce((n, p) => n + (p.byteLength || p.length || 0), 0);
    }
  },
};
sandbox.globalThis = sandbox;
vm.runInContext(src, vm.createContext(sandbox));

check('bundle 调用 __ModuleLoader__.load', Boolean(window.__def));
check('bundle id = dsh-zentao-panel', window.__def && window.__def.id === 'dsh-zentao-panel');

const mod = window.__def.factory((name) => (name === 'react' ? React : undefined));

// ── 假 ctx / 服务 ─────────────────────────────────────────────
const slotRegs = [];
const slotInjects = [];
const fakeSlots = {
  inject(name, cb) { slotInjects.push(name); return cb(); },
  register(opts, comp) { slotRegs.push({ opts, comp }); return () => {}; },
};
const ctx = {
  slots: fakeSlots,
  connection: { rpc: { call: async () => ({ ok: true, value: {} }) } },
  get(name) { return undefined; },
};

mod.apply(ctx);

check('apply 通知 CSS 已注入', appended.length === 1 && appended[0].attrs['data-dsh-zentao-panel'] === '1');

// ── 左侧栏全局面板（main keyed slot + sidebar.panellist 图标行）──
const mainReg = slotRegs.find((r) => r.opts.name === 'main');
const iconReg = slotRegs.find((r) => r.opts.name === 'sidebar.panellist');
check('slot: main 已声明注入', slotInjects.includes('main'));
check('slot: sidebar.panellist 已声明注入', slotInjects.includes('sidebar.panellist'));
check('main 面板已注册，key = zentao（activePanelId 寻址）', mainReg && mainReg.opts.key === 'zentao');
check('左侧栏图标行已注册，id = zentao（与 main key 同值，sidebar 契约）',
  iconReg && iconReg.opts.id === 'zentao');
check('图标 label() = 禅道（展开文字/无障碍名/收起 tooltip）', iconReg && iconReg.opts.label() === '禅道');
check('图标排列在 dsh-mnemon（order 30 记忆 / 31 技能）之后', iconReg && iconReg.opts.order > 31);
check('面板/图标组件可实例化', typeof mainReg.comp === 'function' && typeof iconReg.comp === 'function');
check('左侧栏入口挂上后不挂悬浮兜底（shell.overlay）', !slotInjects.includes('shell.overlay'));

// ── 卡片 → Markdown（精简模板：标题 + 描述/重现步骤，图片走真实附件）──
const md = mod.cardToMarkdown({
  kind: 'bug', id: 123, title: '登录页报错', status: 'active', pri: 2, severity: 1,
  openedBy: '张三', deadline: '2026-10-30', url: 'http://z/bug-view-123.html', descBrief: '步骤…',
});
check('cardToMarkdown 含标题行', md.includes('## 禅道Bug #123：登录页报错'));
check('cardToMarkdown 用「重现步骤/描述」小节', md.includes('### 重现步骤/描述'));
check('cardToMarkdown 不含元信息（类型/状态/优先级/截止）',
  !md.includes('**类型**') && !md.includes('**状态**') && !md.includes('**优先级**') && !md.includes('**截止**'));
check('cardToMarkdown 不含原地址', !md.includes('bug-view-123.html'));
check('cardToMarkdown 不含插件页脚', !md.includes('来自 dsh-zentao-panel'));
check('cardToMarkdown 去掉 [图片：xxx] 文本占位符',
  !mod.cardToMarkdown({ kind: 'bug', id: 1, title: 't' }, { desc: '取消该限制。\n[图片：35861.png]' }).includes('[图片'));
check('cardToMarkdown 描述为空时只有标题行',
  mod.cardToMarkdown({ kind: 'bug', id: 1, title: 't' }, null) === '## 禅道Bug #1：t');

// ── 真实图片附件管线（conversation.createDrafts + facade.addAttachments）──
const base64Png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]).toString('base64');
const images = mod._test.imagesOf(
  { kind: 'bug', id: 1 },
  { images: [{ url: 'http://z/file-read-1.png', name: '1.png' }, { url: 'http://z/file-read-2.png', name: '2.png' }] },
);
check('imagesOf 读取详情 images', images.length === 2 && images[0].url.includes('file-read-1.png'));
check('imagesOf 无图时返回空数组', mod._test.imagesOf({ kind: 'bug', id: 1 }, {}).length === 0);
check('bytesFromBase64 还原字节', Array.from(mod._test.bytesFromBase64(base64Png)).slice(0, 4).join(',') === '137,80,78,71');

const draftsCreated = [];
const addedIds = [];
const fakeFacade = {
  draft: '',
  setDraft(t) { this.draft = t; },
  focus() {}, submit() {},
  addAttachments(ids) { addedIds.push(...ids); return true; },
};
const fakeConversation = {
  input: { for: () => fakeFacade },
  createDrafts(sessionId, files) {
    draftsCreated.push({ sessionId, files });
    return files.map((f, i) => ({ id: 'draft-' + (i + 1), kind: 'image', name: f.name }));
  },
};
ctx.connection.rpc.call = async (channel, endpoint) => (endpoint === 'zentao.image'
  ? { ok: true, value: { name: '1.png', mediaType: 'image/png', base64: base64Png, bytes: 10 } }
  : { ok: false, error: { message: 'unexpected endpoint ' + endpoint } });

const att = await mod._test.attachImagesToDraft(images, { sessionId: 's1', facade: fakeFacade, conversation: fakeConversation });
check('attachImagesToDraft 走 createDrafts + addAttachments',
  att.ok === true && att.count === 2 && draftsCreated.length === 1 && draftsCreated[0].sessionId === 's1' && addedIds.length === 2);
check('图片以 File(image/png) 交给 DSH', draftsCreated[0].files.every((f) => f.type === 'image/png' && f.size === 10));

const attOld = await mod._test.attachImagesToDraft(images, { sessionId: 's1', facade: {}, conversation: {} });
check('旧版 DSH 无 createDrafts 时降级不报错', attOld.ok === false && attOld.reason === 'unsupported');

// insertToCurrentChat：服务级 setDraft + 图片附件（经 ctx.get 懒查找 sessions/conversation）
ctx.get = function (name) {
  if (name === 'sessions') return {
    list: { getSnapshot: () => ({ current: 's1', byId: { s1: { cwd: '/tmp' } } }) },
    scope: () => ({}),
  };
  if (name === 'conversation') return fakeConversation;
  return undefined;
};
const ins = await mod._test.insertToCurrentChat('## 卡片', images);
check('insertToCurrentChat 服务级插入 + 图片附件',
  ins.mode === 'service' && ins.attached === 2 && fakeFacade.draft === '## 卡片');

// ── 「处理」弹层：工作区/模型上下文收集（懒查找，缺服务不抛错）──
// 先回到「无 sessions/workspaces/remote」的环境验证兜底
ctx.get = function (name) { return undefined; };
const bare = await mod._test.collectDispatchContext();
check('collectDispatchContext 服务缺失时返回空结构且不抛错',
  bare.workspaces.length === 0 && bare.modelGroups.length === 0
  && bare.currentWorkspaceId === null && bare.currentModel === null && bare.cwd === null);

const fakeCatalog = {
  ok: true,
  value: {
    default: { provider: 'official', model: 'deepseek-chat', reasoningEffort: 'high' },
    groups: [
      { id: 'official', name: '官方', models: [
        { id: 'deepseek-chat', name: 'DeepSeek Chat', reasoning: { efforts: [{ id: 'low', name: '低' }, { id: 'high', name: '高' }], defaultEffort: 'high' } },
        { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner' },
      ] },
      { id: 'custom', name: '自定义接入', models: [
        { id: 'glm-4.6', name: 'GLM 4.6', reasoning: { efforts: [{ id: 'mid', name: '中' }] } },
      ] },
    ],
  },
};
ctx.get = function (name) {
  if (name === 'sessions') return {
    list: { getSnapshot: () => ({ current: 's1', byId: { s1: { cwd: '/tmp/proj' } } }) },
    scope: () => ({}),
  };
  if (name === 'conversation') return fakeConversation;
  if (name === 'workspaces') return {
    list: { getSnapshot: () => ({ items: [
      { workspaceId: 'w1', title: '业财中台', path: '/Users/x/yewu', sessionIds: ['s1'] },
      { workspaceId: 'w2', title: '电子档案', path: '/Users/x/archive', sessionIds: [] },
    ] }) },
  };
  if (name === 'modelDirectories') return {
    directoryFor: () => ({ load: async () => ({ current: { provider: 'custom', model: 'glm-4.6', reasoningEffort: 'mid' } }) }),
  };
  // 真机形态：ctx.get('remote') 是 ClientRemoteService 裸实例（没有 .session 属性）；
  // 命名空间方法是独立 cordis 服务 remote.session（官方 ModelDirectoryResolver inject 的同一名字）
  if (name === 'remote') return { namespaces: new Map() };
  if (name === 'remote.session') return {
    modelCatalog: async () => fakeCatalog, selectModel: async () => ({ ok: true, value: { selected: {} } }),
  };
  return undefined;
};
const dc = await mod._test.collectDispatchContext();
check('collectDispatchContext 收集工作区列表', dc.workspaces.length === 2 && dc.workspaces[0].title === '业财中台');
check('collectDispatchContext 识别当前会话归属的工作区', dc.currentWorkspaceId === 'w1');
check('collectDispatchContext 读当前会话目录', dc.cwd === '/tmp/proj');
check('collectDispatchContext 解析模型目录（provider 分组 + efforts/defaultEffort）',
  dc.modelGroups.length === 2 && dc.modelGroups[0].name === '官方'
  && dc.modelGroups[0].models[0].efforts.length === 2 && dc.modelGroups[0].models[0].defaultEffort === 'high'
  && dc.modelGroups[1].models[0].id === 'glm-4.6'
  && dc.modelGroups[0].models[1].efforts.length === 0);
check('collectDispatchContext 读全局默认与当前会话在用模型',
  dc.modelDefault && dc.modelDefault.model === 'deepseek-chat'
  && dc.currentModel && dc.currentModel.provider === 'custom' && dc.currentModel.reasoningEffort === 'mid');
check('mock 复现真机形态：ctx.get("remote") 裸实例上没有 .session 属性（2026-10-24 真机 bug 的前提）',
  ctx.get('remote').session === undefined);

// ── 「处理」下发：create 传所选工作区；selectModel 按会话设置所选模型/思考强度 ──
// 2026-10-24 用户要求「处理后不自动跳转新会话」：dispatch 只 retain（后台保活供
// facade 填草稿/发送），绝不调 uiWorkspace.openSession（跳转来源，open 被调用即违规）
let created = null, opened = null, retained = null, selectedModel = null;
let selectModelResult = { ok: true, value: { selected: {} } };
ctx.get = function (name) {
  if (name === 'sessions') return {
    list: { getSnapshot: () => ({ current: 's1', byId: { s1: { cwd: '/tmp/proj' } } }) },
    scope: () => ({}),
    create(opts) { created = opts; return 's-new'; },
    retain(id, opts) { retained = { id, opts }; return { sessionId: id, release() {} }; },
  };
  if (name === 'conversation') return fakeConversation;
  if (name === 'uiWorkspace') return { openSession(id) { opened = id; } };
  if (name === 'remote') return { namespaces: new Map() };
  if (name === 'remote.session') return {
    modelCatalog: async () => fakeCatalog,
    selectModel: async (req) => { selectedModel = req; return selectModelResult; },
  };
  return undefined;
};
let dr = await mod._test.dispatchToNewSession('## 卡片', [], {
  workspaceId: 'w2',
  model: { provider: 'custom', model: 'glm-4.6', reasoningEffort: 'mid' },
});
check('dispatchToNewSession 传所选工作区（不掺 cwd）',
  created && created.workspaceId === 'w2' && !('cwd' in created));
check('dispatchToNewSession 按新会话 selectModel（provider/model/思考强度）',
  selectedModel && selectedModel.sessionId === 's-new' && selectedModel.provider === 'custom'
  && selectedModel.model === 'glm-4.6' && selectedModel.reasoningEffort === 'mid');
check('dispatchToNewSession 不跳转：只 retain（zentao-panel 来源）不调 uiWorkspace.openSession',
  retained && retained.id === 's-new' && retained.opts.source === 'zentao-panel' && opened === null);
check('dispatchToNewSession 模型设置成功后自动发送',
  opened === null && dr.ok && dr.mode === 'dispatched' && dr.sessionId === 's-new' && fakeFacade.draft === '## 卡片');

selectModelResult = { ok: false, error: { code: 'session/model-unavailable', message: 'model not routable' } };
selectedModel = null;
dr = await mod._test.dispatchToNewSession('## 卡片', [], { model: { provider: 'custom', model: 'glm-4.6' } });
check('dispatchToNewSession 模型被拒时填草稿但不自动发送',
  selectedModel && !('reasoningEffort' in selectedModel)
  && dr.ok && dr.mode === 'draft' && dr.message.includes('模型设置失败') && fakeFacade.draft === '## 卡片');

// conversation 服务缺失（facade 拿不到）→ 不自动发，返回 ok:false 让上层降级插入当前会话，
// 且必须释放后台 retain（新会话是空的，不能留悬挂连接）
let released = 0;
const savedGet = ctx.get;
ctx.get = function (name) {
  if (name === 'sessions') return {
    list: { getSnapshot: () => ({ current: 's1', byId: { s1: { cwd: '/tmp/proj' } } }) },
    create() { return 's-empty'; },
    retain(id) { return { sessionId: id, release() { released++; } }; },
    scope: () => ({}),
  };
  return undefined; // conversation / remote.session 都没有
};
dr = await mod._test.dispatchToNewSession('## 卡片', [], {});
check('conversation 服务缺失 → 不自动发、返回 unavailable 供上层降级当前会话',
  dr && dr.ok === false && dr.mode === 'unavailable' && dr.sessionId === 's-empty');
check('降级路径立即释放后台 retain（不留悬挂连接）', released === 1);
ctx.get = savedGet;

dr = await mod._test.dispatchToNewSession('## 卡片', [], { cwd: '/other/dir' });
check('dispatchToNewSession 选「继承目录」时只传 cwd',
  created && created.cwd === '/other/dir' && !('workspaceId' in created));

created = null; selectedModel = null;
dr = await mod._test.dispatchToNewSession('## 卡片', []);
check('dispatchToNewSession 未选择时保持旧行为（继承当前 cwd、不动模型）',
  created && created.cwd === '/tmp/proj' && selectedModel === null && dr.mode === 'dispatched');

// ── 会话关联：「处理」成功后卡片上显示关联会话，可一键跳转 ──
const card123 = { kind: 'bug', id: 123, title: '登录页报错' };
check('sessionLinkKey 带账号前缀 + kind-id（不同禅道账号互不混卡）',
  mod._test.sessionLinkKey('acct1', card123) === 'acct1/bug-123');
check('sessionLinkKey 无账号时用 anon 前缀', mod._test.sessionLinkKey(null, card123) === 'anon/bug-123');

let link = mod._test.saveSessionLink('acct1', card123, 's-new');
check('saveSessionLink 记录 sessionId 与处理时间', link.sessionId === 's-new' && typeof link.at === 'number');
check('getSessionLink 读回关联', mod._test.getSessionLink('acct1', card123).sessionId === 's-new');
mod._test.saveSessionLink('acct1', card123, 's-newer');
check('同卡片再次处理 → 覆盖为最新会话', mod._test.getSessionLink('acct1', card123).sessionId === 's-newer');
check('其它账号的卡片不受影响', mod._test.getSessionLink('acct2', card123) === null);
mod._test.saveSessionLink('acct2', card123, 's-acct2');
check('两个账号各自保留关联',
  mod._test.getSessionLink('acct1', card123).sessionId === 's-newer'
  && mod._test.getSessionLink('acct2', card123).sessionId === 's-acct2');
mod._test.removeSessionLink('acct2', card123);
check('removeSessionLink 只清对应账号',
  mod._test.getSessionLink('acct2', card123) === null && mod._test.getSessionLink('acct1', card123) !== null);

lsBacking.set('dsh-zentao-panel.links.v1', '{oops');
check('存储损坏时读作空表不抛错', typeof mod._test.readLinkMap() === 'object');
check('坏数据下关联读为空（自愈）', mod._test.getSessionLink('acct1', card123) === null);
lsBacking.delete('dsh-zentao-panel.links.v1');

check('fmtLinkAt 输出「M月d日 HH:mm」', /^\d+月\d+日 \d{2}:\d{2}$/.test(mod._test.fmtLinkAt(Date.now())));
check('fmtLinkAt 无效时间为空串', mod._test.fmtLinkAt(NaN) === '' && mod._test.fmtLinkAt(undefined) === '');

check('sessionLinkView 无关联 → null', mod._test.sessionLinkView(null, {}) === null);
const vLive = mod._test.sessionLinkView(
  { sessionId: 's-x', at: 1 }, { 's-x': { displayTitle: '处理 Bug #123', cwd: '/p' } });
check('sessionLinkView 会话存在 → live + displayTitle', vLive.state === 'live' && vLive.title === '处理 Bug #123');
const vDead = mod._test.sessionLinkView({ sessionId: 's-gone', at: 1 }, { 's-other': {} });
check('sessionLinkView 会话已删（byId 非空无该行）→ dead', vDead.state === 'dead');
check('sessionLinkView 无快照 / 列表未就绪 → unknown（显示处理时间）',
  mod._test.sessionLinkView({ sessionId: 's', at: 1 }, null).state === 'unknown'
  && mod._test.sessionLinkView({ sessionId: 's', at: 1 }, {}).state === 'unknown'
  && mod._test.sessionLinkView({ sessionId: 's', at: 1 }, null).title.includes('已处理'));

// openSessionLink：跳转 / 会话已删自动清 / 列表未就绪不误删 / 服务缺失降级
let openedLink = null;
ctx.get = function (name) {
  if (name === 'sessions') return {
    list: { getSnapshot: () => ({ current: 's1', byId: { 's-newer': { displayTitle: '处理 Bug #123' }, s1: { cwd: '/tmp' } } }) },
  };
  if (name === 'uiWorkspace') return { openSession(id) { openedLink = id; } };
  return undefined;
};
mod._test.saveSessionLink('acct1', card123, 's-newer');
let rLink = mod._test.openSessionLink('acct1', card123);
check('openSessionLink 跳到关联会话（uiWorkspace.openSession）', rLink.ok === true && openedLink === 's-newer');

mod._test.saveSessionLink('acct1', card123, 's-gone');
rLink = mod._test.openSessionLink('acct1', card123);
check('会话已不存在 → 返回 missing 并清除关联',
  rLink.ok === false && rLink.reason === 'missing' && mod._test.getSessionLink('acct1', card123) === null);

mod._test.saveSessionLink('acct1', card123, 's-any');
ctx.get = function (name) {
  if (name === 'sessions') return { list: { getSnapshot: () => ({ current: null, byId: {} }) } };
  if (name === 'uiWorkspace') return { openSession(id) { openedLink = id; } };
  return undefined;
};
rLink = mod._test.openSessionLink('acct1', card123);
check('列表未就绪（byId 空）时不误删关联、照常打开',
  rLink.ok === true && openedLink === 's-any' && mod._test.getSessionLink('acct1', card123) !== null);

ctx.get = function (name) {
  if (name === 'sessions') return { list: { getSnapshot: () => ({ byId: { 's-any': {} } }) } };
  return undefined;
};
rLink = mod._test.openSessionLink('acct1', card123);
check('uiWorkspace 服务缺失 → unsupported（不清关联）',
  rLink.ok === false && rLink.reason === 'unsupported' && mod._test.getSessionLink('acct1', card123) !== null);

rLink = mod._test.openSessionLink('acct1', { kind: 'task', id: 999 });
check('无关联卡片 → nolink', rLink.ok === false && rLink.reason === 'nolink');

// ── 面板跳转：openSessionLink 成功即 uiWorkspace.openSession ──
// （左侧栏全局面板入口下，openSession 内部 replaceMain("reveal") → selectPanel(null)
//   自动切回会话视图，插件无需再跟面板——原右侧栏 per-session 的 follow 逻辑已删）
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
openedLink = null;
ctx.get = function (name) {
  if (name === 'sessions') return {
    list: { getSnapshot: () => ({ current: 's1', byId: { 's-live': { displayTitle: 'T' }, s1: { cwd: '/tmp' } } }) },
  };
  if (name === 'uiWorkspace') return { openSession(id) { openedLink = id; } };
  return undefined;
};
mod._test.saveSessionLink('acct1', card123, 's-live');
rLink = mod._test.openSessionLink('acct1', card123);
await sleep(10);
check('openSessionLink 跳转成功（uiWorkspace.openSession）',
  rLink.ok === true && openedLink === 's-live');

// ── 「处理」时序优化：图片预取与建会话并行；切视图后草稿立即写入；模型/附件互不阻塞 ──
const evLog = [];
const evFacade = {
  draft: '',
  setDraft(t) { evLog.push('setDraft'); this.draft = t; },
  focus() {}, submit() {},
  addAttachments() { evLog.push('attach'); return true; },
};
const evConversation = {
  input: { for: () => evFacade },
  createDrafts(sid, files) { evLog.push('drafts'); return files.map((f, i) => ({ id: 'd' + (i + 1), kind: 'image' })); },
};
const order = [];
let slowSelectResolve = null;
ctx.connection.rpc.call = async (channel, endpoint) => {
  order.push(endpoint);
  if (endpoint === 'zentao.image') {
    return { ok: true, value: { name: '1.png', mediaType: 'image/png', base64: base64Png, bytes: 10 } };
  }
  return { ok: false, error: { message: 'unexpected ' + endpoint } };
};
ctx.get = function (name) {
  if (name === 'sessions') return {
    list: { getSnapshot: () => ({ current: 's1', byId: { s1: { cwd: '/tmp' } } }) },
    scope: () => ({}),
    create() { order.push('create'); return 's-xy'; },
    retain(id) { order.push('retain'); return { sessionId: id, release() {} }; },
  };
  if (name === 'conversation') return evConversation;
  if (name === 'uiWorkspace') return { openSession() { order.push('open'); } };
  if (name === 'remote.session') return {
    selectModel: () => new Promise((res) => { slowSelectResolve = res; order.push('selectModel'); }),
  };
  return undefined;
};
const imgs2 = [{ url: 'http://z/file-read-1.png' }, { url: 'http://z/file-read-2.png' }];
const drSlow = mod._test.dispatchToNewSession('## 快', imgs2, { model: { provider: 'p', model: 'm' } });
await sleep(8);
check('图片字节预取在 sessions.create 之前发起（与建会话并行）',
  order.indexOf('zentao.image') !== -1 && order.indexOf('zentao.image') < order.indexOf('create'));
check('不跳转：retain（非 openSession）后文本草稿立即写入（setDraft 先于附件注册）',
  order.indexOf('retain') !== -1 && order.indexOf('open') === -1
  && evLog.indexOf('setDraft') !== -1 && evLog.indexOf('setDraft') < evLog.indexOf('drafts'));
check('selectModel 未完成时附件照常注册（并行不互等）',
  evLog.indexOf('drafts') !== -1 && evLog.indexOf('attach') !== -1 && slowSelectResolve !== null);
slowSelectResolve({ ok: true, value: { selected: {} } });
const rSlow = await drSlow;
check('并行等待全部完成后走自动发送路径',
  rSlow.ok && rSlow.mode === 'dispatched' && rSlow.sessionId === 's-xy'
  && rSlow.message.includes('2 张图片') && evFacade.draft === '## 快');

const rpcBefore = order.filter((e) => e === 'zentao.image').length;
const attPre = await mod._test.attachImagesToDraft(imgs2, { sessionId: 's', facade: evFacade, conversation: evConversation },
  imgs2.map(() => ({ name: 'p.png', mediaType: 'image/png', base64: base64Png })));
const rpcAfter = order.filter((e) => e === 'zentao.image').length;
check('attachImagesToDraft 带预取结果时跳过 zentao.image RPC',
  attPre.ok === true && attPre.count === 2 && rpcAfter === rpcBefore);

// ── M6 处理中任务的实时状态：单面板（办公室面板已按用户要求移除）+ 常驻监控 ──
const allMainRegs = slotRegs.filter((r) => r.opts.name === 'main');
const allIconRegs = slotRegs.filter((r) => r.opts.name === 'sidebar.panellist');
check('左侧栏只注册禅道一个面板（办公室面板已移除）',
  allMainRegs.length === 1 && allIconRegs.length === 1
  && allMainRegs[0].opts.key === 'zentao' && allIconRegs[0].opts.id === 'zentao');

// link key 解析（监控从 key 还原账号/类型/id，旧值结构没有卡片信息也能工作）
check('parseLinkKey 解析账号前缀 + kind + 数字 id',
  JSON.stringify(mod._test.parseLinkKey('acct1/bug-123')) === JSON.stringify({ activeId: 'acct1', kind: 'bug', id: 123 }));
check('parseLinkKey anon 前缀也可解析', mod._test.parseLinkKey('anon/task-7').kind === 'task');
check('parseLinkKey 坏 key → null',
  mod._test.parseLinkKey('随便') === null && mod._test.parseLinkKey('') === null && mod._test.parseLinkKey('a/feat-1') === null);

// saveSessionLink 值结构（M6：补 kind/id/title 供提醒文案取名）
lsBacking.clear();
const savedLink = mod._test.saveSessionLink('acct1', { kind: 'bug', id: 123, title: '登录页报错' }, 's-live');
check('saveSessionLink 值里带卡片 kind/id/title',
  savedLink.kind === 'bug' && savedLink.id === 123 && savedLink.title === '登录页报错');

// 活性推导：ask > done > running；idle / 会话已删 → null（「已处理」由 chip 表达）
const D = mod._test.deriveLiveState;
check('deriveLiveState：决策最优先（ask 盖过 done/running）',
  D({ running: true, pendingInteraction: 'question', completionUnread: true }, true) === 'ask');
check('deriveLiveState：完成未读 → done',
  D({ running: false, pendingInteraction: null, completionUnread: true }, true) === 'done');
check('deriveLiveState：running → running（处理中）',
  D({ running: true, pendingInteraction: null, completionUnread: false }, true) === 'running');
check('deriveLiveState：idle / 无状态 / 会话已删 → null（不叠徽标）',
  D({ running: false, pendingInteraction: null, completionUnread: false }, true) === null
  && D(null, true) === null && D({ running: true }, false) === null);

// 边沿事件：同帧 done+decision 只报 decision（行动需求已覆盖）
const E = (p, n) => mod._test.watchEdges(p, n);
check('watchEdges：完成未读置位 → done',
  JSON.stringify(E({ running: true, pendingInteraction: null, completionUnread: false },
    { running: false, pendingInteraction: null, completionUnread: true })) === '["done"]');
check('watchEdges：出现决策（question）→ decision',
  E({ running: true, pendingInteraction: null, completionUnread: false },
    { running: true, pendingInteraction: 'question', completionUnread: false })[0] === 'decision');
check('watchEdges：决策类型变化（question→approval）也算新决策',
  E({ running: true, pendingInteraction: 'question', completionUnread: false },
    { running: true, pendingInteraction: 'approval', completionUnread: false }).length === 1);
check('watchEdges：done+decision 同帧 → 只 decision',
  E({ running: true, pendingInteraction: null, completionUnread: false },
    { running: false, pendingInteraction: 'plan-review', completionUnread: true }).join() === 'decision');
check('watchEdges：无变化 / 完成未读被清除（看过了）→ 不产生事件',
  E({ running: true, pendingInteraction: null, completionUnread: false },
    { running: true, pendingInteraction: null, completionUnread: false }).length === 0
  && E({ running: false, pendingInteraction: null, completionUnread: true },
    { running: false, pendingInteraction: null, completionUnread: false }).length === 0);

// 提醒文案：中性文案（无角色梗），区分完成/决策与交互类型
const evDone = { type: 'done', sessionId: 's-live', interaction: null, entry: { kind: 'bug', id: 123, title: '登录页报错' } };
const evAsk = { type: 'decision', sessionId: 's-live', interaction: 'question', entry: { kind: 'bug', id: 123, title: '登录页报错' } };
const ttDone = mod._test.watchToastText(evDone);
const ttAsk = mod._test.watchToastText(evAsk);
check('watchToastText（完成）：标题含「任务完成」、正文含卡标识',
  ttDone.title.includes('任务完成') && ttDone.body.includes('#123') && ttDone.body.includes('登录页报错'));
check('watchToastText（决策）：区分交互类型（提问/审批/方案确认）',
  ttAsk.title.includes('决策') && ttAsk.body.includes('提问')
  && mod._test.watchToastText({ ...evAsk, interaction: 'approval' }).body.includes('审批')
  && mod._test.watchToastText({ ...evAsk, interaction: 'plan-review' }).body.includes('方案确认'));

// 监控集成：绑定 fake 服务 → 活性快照 → 边沿驱动状态翻转 → 卡片查询
let statusMap = new Map([
  ['s-live', { running: true, pendingInteraction: null, completionUnread: false }],
  ['s-task', { running: true, pendingInteraction: null, completionUnread: false }],
]);
const statusCbs = [];
ctx.get = function (name) {
  if (name === 'uiSession') return {
    sessionStatus: {
      getSnapshot: () => statusMap,
      subscribe(cb) { statusCbs.push(cb); return () => {}; },
    },
  };
  if (name === 'sessions') return {
    list: {
      getSnapshot: () => ({ byId: { 's-live': { displayTitle: '会话A' }, 's-task': { displayTitle: '会话B' } } }),
      subscribe() { return () => {}; },
    },
  };
  if (name === 'uiWorkspace') return { openSession() {} };
  return undefined;
};
mod._test.watchTryBind();
check('监控绑定 uiSession.sessionStatus（订阅生效）', mod._test.watch.bound === true && statusCbs.length >= 1);

mod._test.paneCache.status = { activeId: 'acct1' };
mod._test.saveSessionLink('acct1', { kind: 'task', id: 55, title: '写周报' }, 's-task');
mod._test.watchEval();
let wsnap = mod._test.watchGetSnapshot();
check('活性快照：两个处理中的会话都是 running',
  wsnap.ready === true && wsnap.states['s-live'] === 'running' && wsnap.states['s-task'] === 'running');
check('watchStateForCard：已关联卡片查到 running',
  mod._test.watchStateForCard('acct1', { kind: 'bug', id: 123 }) === 'running');
check('watchStateForCard：未关联卡片 → null',
  mod._test.watchStateForCard('acct1', { kind: 'bug', id: 999 }) === null);

// 多账号：其它账号的 link 不进当前监控
mod._test.saveSessionLink('acct2', { kind: 'bug', id: 9, title: '别人的' }, 's-task');
mod._test.watchEval();
wsnap = mod._test.watchGetSnapshot();
check('切换账号视角：只看当前激活账号的关联（acct2 不混入）',
  wsnap.states['s-task'] === 'running' && mod._test.watchStateForCard('acct2', { kind: 'bug', id: 9 }) === null);

// 状态边沿：后台跑完 → done；agent 提问 → ask；看过+idle → null
statusMap.set('s-live', { running: false, pendingInteraction: null, completionUnread: true });
statusCbs.forEach((cb) => cb());
wsnap = mod._test.watchGetSnapshot();
check('后台跑完 → 卡片活性变 done（绿色对勾徽标）',
  wsnap.states['s-live'] === 'done' && mod._test.watchStateForCard('acct1', { kind: 'bug', id: 123 }) === 'done');
statusMap.set('s-live', { running: false, pendingInteraction: 'question', completionUnread: false });
statusCbs.forEach((cb) => cb());
wsnap = mod._test.watchGetSnapshot();
check('agent 提问 → 卡片活性变 ask（琥珀呼吸徽标）',
  wsnap.states['s-live'] === 'ask' && mod._test.watchStateForCard('acct1', { kind: 'bug', id: 123 }) === 'ask');
statusMap.set('s-live', { running: false, pendingInteraction: null, completionUnread: false });
statusCbs.forEach((cb) => cb());
wsnap = mod._test.watchGetSnapshot();
check('看过且 idle → 活性归零（只剩会话 chip，不叠徽标）',
  wsnap.states['s-live'] === null && mod._test.watchStateForCard('acct1', { kind: 'bug', id: 123 }) === null);

// 会话删除 → 活性清零（chip 侧由 sessionLinkView 判 dead）
ctx.get = function (name) {
  if (name === 'uiSession') return {
    sessionStatus: { getSnapshot: () => statusMap, subscribe(cb) { return () => {}; } },
  };
  if (name === 'sessions') return {
    list: {
      getSnapshot: () => ({ byId: { 's-live': { displayTitle: '会话A' } } }), // s-task 没了
      subscribe() { return () => {}; },
    },
  };
  return undefined;
};
mod._test.watchEval();
wsnap = mod._test.watchGetSnapshot();
check('关联会话被删 → 活性清零（不亮徽标）', wsnap.states['s-task'] === null);

console.log(failures ? `\n${failures} 项失败` : '\n全部通过');
process.exit(failures ? 1 : 0);
