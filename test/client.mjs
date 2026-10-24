// client 半边免渲染测试：验证 bundle 能被 __ModuleLoader__ 加载、apply() 把
//   sidebarRightTabs 类型（含引导卡片）+ sidebar.right.pane.tab(.title) 挂点都注册上。
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
  window, document, console, setTimeout, clearTimeout, Symbol, Object, Array, String, Number, Date, JSON, Math, Promise,
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
const tabDefs = [];
const slotRegs = [];
const slotInjects = [];
const injectCalls = [];
const fakeSlots = {
  inject(name, cb) { slotInjects.push(name); return cb(); },
  register(opts, comp) { slotRegs.push({ opts, comp }); return () => {}; },
};
const fakeTabs = {
  register(def) { tabDefs.push(def); return () => {}; },
};
const effects = [];
const scope = {
  slots: fakeSlots,
  sidebarRightTabs: fakeTabs,
  effect(fn, label) { effects.push(label); return fn(); },
};
const ctx = {
  slots: fakeSlots,
  connection: { rpc: { call: async () => ({ ok: true, value: {} }) } },
  get(name) { return name === 'sidebarRightTabs' ? fakeTabs : undefined; },
  inject(deps, cb) { injectCalls.push(deps); cb(scope); return () => {}; },
};

mod.apply(ctx);

check('apply 通知 CSS 已注入', appended.length === 1 && appended[0].attrs['data-dsh-zentao-panel'] === '1');
check('ctx.inject 请求 sidebarRightTabs', injectCalls.some((d) => d.includes('sidebarRightTabs')));

// ── 右侧栏 tab 类型 / 引导卡片 ──────────────────────────────────
const def = tabDefs[0];
check('注册了一个右侧栏 tab 类型', tabDefs.length === 1);
check('tab id = dsh-zentao-panel', def && def.id === 'dsh-zentao-panel');
check('tab kind = zentao', def && def.kind === 'zentao');
check('tab title() = 禅道', def && def.title() === '禅道');
const guide = def && def.guide && def.guide[0];
check('引导卡片存在', Boolean(guide));
check('卡片标题 = 禅道', guide && guide.title() === '禅道');
check('卡片描述非空', guide && typeof guide.description() === 'string' && guide.description().length > 0, guide && guide.description());
check('卡片带图标组件', guide && typeof guide.icon === 'function');
check('卡片排列在「上下文」(order 20) 之后', guide && guide.order > 20);
check('tab 类型注册挂在 effect 上（可随插件卸载）', effects.some((l) => String(l).includes('tab type')));

// ── tab body / title 挂点 ─────────────────────────────────────
const bodyReg = slotRegs.find((r) => r.opts.name === 'sidebar.right.pane.tab');
const titleReg = slotRegs.find((r) => r.opts.name === 'sidebar.right.pane.tab.title');
check('slot: sidebar.right.pane.tab 已注册', Boolean(bodyReg));
check('slot: sidebar.right.pane.tab.title 已注册', Boolean(titleReg));
check('两个挂点 key 用 tab 类型 id（sidebar-right 的 entryKey 契约）',
  bodyReg && titleReg && bodyReg.opts.key === 'dsh-zentao-panel' && titleReg.opts.key === 'dsh-zentao-panel');
check('挂点通过 slots.inject 注册（keyed slot 契约）',
  slotInjects.includes('sidebar.right.pane.tab') && slotInjects.includes('sidebar.right.pane.tab.title'));
check('slot 组件可实例化', typeof bodyReg.comp === 'function' && typeof titleReg.comp === 'function');

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
  if (name === 'sidebarRightTabs') return fakeTabs;
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
ctx.get = function (name) { return name === 'sidebarRightTabs' ? fakeTabs : undefined; };
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
  if (name === 'sidebarRightTabs') return fakeTabs;
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
let created = null, opened = null, selectedModel = null;
let selectModelResult = { ok: true, value: { selected: {} } };
ctx.get = function (name) {
  if (name === 'sidebarRightTabs') return fakeTabs;
  if (name === 'sessions') return {
    list: { getSnapshot: () => ({ current: 's1', byId: { s1: { cwd: '/tmp/proj' } } }) },
    scope: () => ({}),
    create(opts) { created = opts; return 's-new'; },
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
check('dispatchToNewSession 模型设置成功后自动发送',
  opened === 's-new' && dr.ok && dr.mode === 'dispatched' && dr.sessionId === 's-new' && fakeFacade.draft === '## 卡片');

selectModelResult = { ok: false, error: { code: 'session/model-unavailable', message: 'model not routable' } };
selectedModel = null;
dr = await mod._test.dispatchToNewSession('## 卡片', [], { model: { provider: 'custom', model: 'glm-4.6' } });
check('dispatchToNewSession 模型被拒时填草稿但不自动发送',
  selectedModel && !('reasoningEffort' in selectedModel)
  && dr.ok && dr.mode === 'draft' && dr.message.includes('模型设置失败') && fakeFacade.draft === '## 卡片');

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
  if (name === 'sidebarRightTabs') return fakeTabs;
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

// ── 面板跟随：跳转/处理后把禅道 tab 开到目标（屏幕）会话的右侧栏 ──
// DSH 右侧栏 per-session（store.bySession[sessionId]），不跟会被新会话空 sidebar 换掉
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let srOpened = null;
ctx.get = function (name) {
  if (name === 'sidebarRightTabs') return fakeTabs;
  if (name === 'sidebarRight') return {
    openTab(kind, opts) { srOpened = { kind, opts }; },
    tabsIn: () => [{ id: 't1', kind: 'guide' }],
  };
  return undefined;
};
mod._test.followZentaoTabTo('s-target');
await sleep(10);
check('followZentaoTabTo：目标会话无禅道 tab → openTab(replaceTab)（替换 guide）',
  srOpened && srOpened.kind === 'zentao' && srOpened.opts && srOpened.opts.replaceTab === true);

srOpened = null;
ctx.get = function (name) {
  if (name === 'sidebarRight') return {
    openTab(kind, opts) { srOpened = { kind, opts }; },
    tabsIn: () => [{ id: 't1', kind: 'context' }, { id: 't2', kind: 'zentao' }],
  };
  return undefined;
};
mod._test.followZentaoTabTo('s-target');
await sleep(10);
check('followZentaoTabTo：已有禅道 tab → 幂等 reveal（不带 replaceTab，不误关别的 tab）',
  srOpened && srOpened.kind === 'zentao' && (!srOpened.opts || srOpened.opts.replaceTab === undefined));

srOpened = null;
ctx.get = function (name) { return name === 'sidebarRightTabs' ? fakeTabs : undefined; };
mod._test.followZentaoTabTo('s-target');
await sleep(10);
check('followZentaoTabTo：无 sidebarRight 服务（旧版 DSH）不抛错', srOpened === null);

// openSessionLink 跳转成功时顺带 follow（面板跟到目标会话）
srOpened = null; openedLink = null;
ctx.get = function (name) {
  if (name === 'sessions') return {
    list: { getSnapshot: () => ({ current: 's1', byId: { 's-live': { displayTitle: 'T' }, s1: { cwd: '/tmp' } } }) },
  };
  if (name === 'uiWorkspace') return { openSession(id) { openedLink = id; } };
  if (name === 'sidebarRight') return {
    openTab(kind, opts) { srOpened = { kind, opts }; },
    tabsIn: () => [],
  };
  return undefined;
};
mod._test.saveSessionLink('acct1', card123, 's-live');
rLink = mod._test.openSessionLink('acct1', card123);
await sleep(10);
check('openSessionLink 跳转成功后面板跟随（openSession + sidebarRight.openTab）',
  rLink.ok === true && openedLink === 's-live' && srOpened && srOpened.kind === 'zentao');

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
  if (name === 'sidebarRightTabs') return fakeTabs;
  if (name === 'sessions') return {
    list: { getSnapshot: () => ({ current: 's1', byId: { s1: { cwd: '/tmp' } } }) },
    scope: () => ({}),
    create() { order.push('create'); return 's-xy'; },
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
check('视图切换后文本草稿立即写入（setDraft 先于附件注册，不空白等待）',
  evLog.indexOf('setDraft') !== -1 && evLog.indexOf('setDraft') < evLog.indexOf('drafts'));
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

console.log(failures ? `\n${failures} 项失败` : '\n全部通过');
process.exit(failures ? 1 : 0);
