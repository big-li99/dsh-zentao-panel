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

// ── 「插入对话」（2026-10-25 改版）：与「处理」同款弹层，但新建会话后自动跳转、只填草稿不发送 ──
let insSubmitted = 0, insReleased = 0, insOpened = null, insCreated = null, insSelected = null;
const insLog = [];
const insFacade = {
  draft: '',
  setDraft(t) { insLog.push('setDraft'); this.draft = t; },
  focus() {}, submit() { insSubmitted++; insLog.push('submit'); },
  addAttachments() { insLog.push('attach'); return true; },
};
const insConversation = {
  input: { for: () => insFacade },
  createDrafts(sid, files) { insLog.push('drafts'); return files.map((f, i) => ({ id: 'd' + (i + 1), kind: 'image' })); },
};
ctx.get = function (name) {
  if (name === 'sessions') return {
    list: { getSnapshot: () => ({ current: 's1', byId: { s1: { cwd: '/tmp/proj' } } }) },
    scope: () => ({}),
    create(opts) { insCreated = opts; return 's-ins'; },
    retain(id, opts) { return { sessionId: id, opts, release() { insReleased++; } }; },
  };
  if (name === 'conversation') return insConversation;
  if (name === 'uiWorkspace') return { openSession(id) { insOpened = id; insLog.push('open'); } };
  if (name === 'remote.session') return {
    selectModel: async (req) => { insSelected = req; return { ok: true, value: { selected: {} } }; },
  };
  return undefined;
};
const ir = await mod._test.insertToNewSession('## 卡片', images, {
  workspaceId: 'w2', model: { provider: 'custom', model: 'glm-4.6', reasoningEffort: 'mid' },
});
check('insertToNewSession 传所选工作区新建会话',
  insCreated && insCreated.workspaceId === 'w2' && !('cwd' in insCreated) && ir.ok && ir.sessionId === 's-ins');
check('insertToNewSession 自动跳转新会话（uiWorkspace.openSession）', ir.mode === 'jumped' && insOpened === 's-ins');
check('跳转前文本草稿已写入（setDraft 先于 open，跳过去不空白）',
  insLog.indexOf('setDraft') !== -1 && insLog.indexOf('setDraft') < insLog.indexOf('open'));
check('insertToNewSession 不自动发送（不 submit）', insSubmitted === 0);
check('跳转成功后释放后台 retain（mainView 接管保活）', insReleased === 1);
check('selectModel 照常按新会话设置（后台进行）',
  insSelected && insSelected.sessionId === 's-ins' && insSelected.provider === 'custom'
  && insSelected.model === 'glm-4.6' && insSelected.reasoningEffort === 'mid');
await new Promise((r) => setTimeout(r, 10));
check('图片附件照常注册（跳转不拦附件）', insLog.indexOf('drafts') !== -1 && insLog.indexOf('attach') !== -1);
check('新会话草稿文本就位', insFacade.draft === '## 卡片');

// uiWorkspace 缺失 → 跳不了：保留 retain（草稿还在后台会话里），draft 模式提示从会话列表打开
insReleased = 0; insOpened = null;
const insGetWithWs = ctx.get;
ctx.get = function (name) { return name === 'uiWorkspace' ? undefined : insGetWithWs(name); };
const ir2 = await mod._test.insertToNewSession('## 乙', [], {});
check('uiWorkspace 缺失 → 不跳转、不释放 retain（draft 模式，草稿保留）',
  ir2.ok && ir2.mode === 'draft' && ir2.sessionId === 's-ins' && insOpened === null
  && insReleased === 0 && ir2.message.includes('会话列表') && insFacade.draft === '## 乙');
ctx.get = insGetWithWs;

// conversation 缺失 → ok:false + 释放 retain（上层降级插入当前会话输入框）
let ins3Released = 0;
ctx.get = function (name) {
  if (name === 'sessions') return {
    list: { getSnapshot: () => ({ current: 's1', byId: { s1: { cwd: '/tmp' } } }) },
    create() { return 's-ins3'; },
    retain(id) { return { sessionId: id, release() { ins3Released++; } }; },
    scope: () => ({}),
  };
  if (name === 'uiWorkspace') return { openSession() {} };
  return undefined; // conversation / remote.session 都没有
};
const ir3 = await mod._test.insertToNewSession('## 丙', [], {});
check('conversation 服务缺失 → 返回 unavailable 供上层降级当前会话，并释放 retain',
  ir3.ok === false && ir3.mode === 'unavailable' && ir3.sessionId === 's-ins3' && ins3Released === 1);

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
// 预取必须真发 zentao.image RPC —— 先清图片缓存（前面向 file-read-1/2 的取图已入缓存）
mod._test.imageCache.clear();
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

// ── 处理进度持久化（states.v1）+ 陈旧关联清理 ──
// M6 活性状态来自内存 store：DSH 关闭期间会话跑完的完成事件会丢。
// states.v1 落盘 + liveOf 兜底 → 重启/重开面板后徽标可恢复处理进度；
// links.lastSeen + cleanupStaleLinks → 不在「指派给我」列表超宽限期的事项清理。
const SKEY = 'dsh-zentao-panel.states.v1';
const NOW = 1761000000000;
const H = 3600 * 1000;
const TT = mod._test;

lsBacking.set(SKEY, '{oops');
check('states.v1 存储损坏时读作空表不抛错（自愈）', typeof TT.readStateMap() === 'object');
lsBacking.delete(SKEY);

check('statusMapReady：Map 有条目 true / 空 Map false / null false',
  TT.statusMapReady(new Map([['s', {}]])) === true
  && TT.statusMapReady(new Map()) === false && TT.statusMapReady(null) === false);

// syncPersistedStates：落盘 / at 稳定 / 粘性 done / 瞬态删除 / 重启防护 / 会话删除
lsBacking.clear();
const sEnts = [{ key: 'acct1/bug-123', sessionId: 's1', kind: 'bug', id: 123, title: 'x' }];
const SOPT = { byId: { s1: {} }, byIdReady: true, statusReady: true };
TT.syncPersistedStates(sEnts, { s1: 'running' }, SOPT, NOW);
check('syncPersistedStates：running → 落盘 {sessionId, state, at}',
  JSON.stringify(TT.readStateMap()['acct1/bug-123']) === JSON.stringify({ sessionId: 's1', state: 'running', at: NOW }));
TT.syncPersistedStates(sEnts, { s1: 'running' }, SOPT, NOW + 5000);
check('syncPersistedStates：同状态不刷新 at（进度时间稳定）',
  TT.readStateMap()['acct1/bug-123'].at === NOW);
TT.syncPersistedStates(sEnts, { s1: 'done' }, SOPT, NOW + 9000);
check('syncPersistedStates：状态变化刷新 at', TT.readStateMap()['acct1/bug-123'].at === NOW + 9000);
TT.syncPersistedStates(sEnts, { s1: null }, SOPT, NOW + 10000);
check('syncPersistedStates：实时归零后 done 粘性保留（进度记录）',
  TT.readStateMap()['acct1/bug-123'].state === 'done');
TT.syncPersistedStates(sEnts, { s1: 'running' }, SOPT, NOW + 11000);
TT.syncPersistedStates(sEnts, { s1: null }, SOPT, NOW + 12000);
check('syncPersistedStates：running 归零且状态源就绪 → 升级为 done（真机坑：正看着的会话跑完 completionUnread 不置位，旧逻辑删记录漏成「无状态」）',
  TT.readStateMap()['acct1/bug-123'].state === 'done' && TT.readStateMap()['acct1/bug-123'].at === NOW + 12000);
TT.syncPersistedStates(sEnts, { s1: 'running' }, { byId: { s1: {} }, byIdReady: true, statusReady: false, sessionSeen: { s1: true } }, NOW + 12500);
TT.syncPersistedStates(sEnts, { s1: null }, { byId: { s1: {} }, byIdReady: true, statusReady: false, sessionSeen: { s1: true } }, NOW + 12700);
check('syncPersistedStates：状态源全空但该会话有行（真实 idle）→ 照常升级 done',
  TT.readStateMap()['acct1/bug-123'].state === 'done');
TT.syncPersistedStates(sEnts, { s1: 'running' }, { byId: { s1: {} }, byIdReady: true, statusReady: false }, NOW + 13000);
TT.syncPersistedStates(sEnts, { s1: null }, { byId: { s1: {} }, byIdReady: true, statusReady: false }, NOW + 14000);
check('syncPersistedStates：无结束信号（状态源空且无该会话行，DSH 刚启动）→ 不动（防重启风暴）',
  TT.readStateMap()['acct1/bug-123'].state === 'running');
TT.syncPersistedStates(sEnts, { s1: 'ask' }, SOPT, NOW + 14500);
TT.syncPersistedStates(sEnts, { s1: null }, SOPT, NOW + 15000);
check('syncPersistedStates：ask 归零且状态源就绪 → 删记录（用户已回应，非完成）',
  TT.readStateMap()['acct1/bug-123'] === undefined);
TT.syncPersistedStates(sEnts, { s1: 'done' }, { byId: { s1: {} }, byIdReady: true, statusReady: false }, NOW + 15500);
TT.syncPersistedStates(sEnts, { s1: null }, { byId: {}, byIdReady: true, statusReady: false }, NOW + 16000);
check('syncPersistedStates：会话被删 → done 也删（与 chip「会话已删除」语义一致）',
  TT.readStateMap()['acct1/bug-123'] === undefined);

// resolveLiveState：实时优先 + 持久化兜底（done 粘性 / 瞬态仅在监控未就绪时）
const R = TT.resolveLiveState;
check('resolveLiveState：实时命中优先（since 为 null）',
  R({ sessionId: 's1' }, { ready: true, states: { s1: 'running' } }, { state: 'done', at: 1 }).state === 'running'
  && R({ sessionId: 's1' }, { ready: true, states: { s1: 'running' } }, { state: 'done', at: 1 }).since === null);
check('resolveLiveState：实时归零 → 持久化 done 兜底（带 since 供徽标显示时间）',
  JSON.stringify(R({ sessionId: 's1' }, { ready: true, statusReady: true, states: { s1: null } }, { state: 'done', at: 123 }))
  === JSON.stringify({ state: 'done', since: 123 }));
check('resolveLiveState：监控未就绪 → 瞬态（running/ask）兜底显示（重启过渡期）',
  R({ sessionId: 's1' }, { ready: false }, { state: 'running', at: 5 }).state === 'running'
  && R({ sessionId: 's1' }, null, { state: 'ask', at: 5 }).state === 'ask');
check('resolveLiveState：监控就绪后瞬态不再兜底（重启前死掉的 turn 不显示「处理中」）',
  R({ sessionId: 's1' }, { ready: true, statusReady: true, states: {} }, { state: 'running', at: 5 }) === null
  && R({ sessionId: 's1' }, { ready: true, statusReady: true, states: {} }, { state: 'ask', at: 5 }) === null);
check('resolveLiveState：无关联 / 无持久化 → null',
  R(null, {}, null) === null && R({ sessionId: 's1' }, { ready: true, states: {} }, null) === null);

// cleanupStaleLinks：在线刷 lastSeen / 宽限期保留 / 超期删 / 他账号不动 / 孤儿清理 / 幂等
// （清理会 watchPoke → watchEval：byId 覆盖全部关联会话、状态源为空，模拟真实存活场景）
ctx.get = function (name) {
  if (name === 'uiSession') return {
    sessionStatus: { getSnapshot: () => new Map(), subscribe() { return () => {}; } },
  };
  if (name === 'sessions') return {
    list: { getSnapshot: () => ({ byId: { 's-1': {}, 's-2': {}, 's-3': {}, 's-9': {} } }), subscribe() { return () => {}; } },
  };
  return undefined;
};
lsBacking.clear();
const mkLink = (id, at, lastSeen) => ({ sessionId: 's-' + id, at, lastSeen, kind: 'bug', id, title: 't' + id });
lsBacking.set('dsh-zentao-panel.links.v1', JSON.stringify({
  'acct1/bug-1': mkLink(1, NOW - 100 * H, NOW - 100 * H), // 在线
  'acct1/bug-2': mkLink(2, NOW - 100 * H, NOW - 2 * H),   // 离线 2h（宽限期内）
  'acct1/bug-3': mkLink(3, NOW - 200 * H),                // 旧格式无 lastSeen，离线 200h
  'acct2/bug-9': mkLink(9, NOW - 200 * H),                // 其他账号
}));
lsBacking.set(SKEY, JSON.stringify({
  'acct1/bug-2': { sessionId: 's-2', state: 'done', at: NOW - 2 * H },
  'acct1/bug-3': { sessionId: 's-3', state: 'done', at: NOW - 200 * H },
  'acct2/bug-9': { sessionId: 's-9', state: 'done', at: NOW - 200 * H },
  'acct1/bug-7': { sessionId: 's-7', state: 'done', at: NOW - 200 * H }, // 孤儿（无 link）
}));
const mineCards = [{ kind: 'task', id: 500 }, { kind: 'bug', id: 1 }];
const cleaned1 = TT.cleanupStaleLinks('acct1', mineCards, NOW);
const lm2 = JSON.parse(lsBacking.get('dsh-zentao-panel.links.v1'));
const sm2 = JSON.parse(lsBacking.get(SKEY));
check('cleanupStaleLinks：超期离线删除（旧格式无 lastSeen 退回 at 计时），links 与进度一起删',
  lm2['acct1/bug-3'] === undefined && sm2['acct1/bug-3'] === undefined);
check('cleanupStaleLinks：宽限期内（2h < 72h）保留', lm2['acct1/bug-2'] !== undefined && sm2['acct1/bug-2'].state === 'done');
check('cleanupStaleLinks：其他账号条目不动', lm2['acct2/bug-9'] !== undefined && sm2['acct2/bug-9'] !== undefined);
check('cleanupStaleLinks：孤儿进度记录（无关联）同样清理', sm2['acct1/bug-7'] === undefined);
check('cleanupStaleLinks：在线条目刷新 lastSeen（计时基准重置）', lm2['acct1/bug-1'].lastSeen === NOW);
check('cleanupStaleLinks：有清理动作返回 true', cleaned1 === true);
check('cleanupStaleLinks：幂等（紧接着再跑无动作 → false，1h 内不重写 lastSeen）',
  TT.cleanupStaleLinks('acct1', mineCards, NOW + 1000) === false
  && JSON.parse(lsBacking.get('dsh-zentao-panel.links.v1'))['acct1/bug-1'].lastSeen === NOW);

// saveSessionLink 值带 lastSeen；再处理会清掉旧进度记录
lsBacking.clear();
const nl = TT.saveSessionLink('acct1', { kind: 'bug', id: 42, title: 'x' }, 's-42');
check('saveSessionLink 值带 lastSeen（清理计时基准）', Number(nl.lastSeen) > 0 && Number(nl.lastSeen) === Number(nl.at));
TT.syncPersistedStates([{ key: 'acct1/bug-42', sessionId: 's-42', kind: 'bug', id: 42, title: 'x' }],
  { 's-42': 'done' }, SOPT, NOW);
TT.saveSessionLink('acct1', { kind: 'bug', id: 42, title: 'x' }, 's-43');
check('saveSessionLink 换新会话 → 旧进度记录作废（防徽标显示旧会话陈旧状态）',
  TT.readStateMap()['acct1/bug-42'] === undefined);

// watchEval 联动：评估落盘 + 快照带 statusReady 闸门
lsBacking.clear();
ctx.get = function (name) {
  if (name === 'uiSession') return {
    sessionStatus: { getSnapshot: () => new Map([['s-w', { running: true }]]), subscribe() { return () => {}; } },
  };
  if (name === 'sessions') return {
    list: { getSnapshot: () => ({ byId: { 's-w': {} } }), subscribe() { return () => {}; } },
  };
  return undefined;
};
TT.paneCache.status = { activeId: 'acct1' };
TT.saveSessionLink('acct1', { kind: 'task', id: 77, title: 'y' }, 's-w');
TT.watchEval();
check('watchEval 联动：评估出的 running 状态落盘 states.v1',
  TT.readStateMap()['acct1/task-77'] && TT.readStateMap()['acct1/task-77'].state === 'running');
check('watchEval 快照带 statusReady（瞬态兜底显示的闸门）', TT.watchGetSnapshot().statusReady === true);

// 重启恢复场景：面板重开/DSH 重启 → 徽标从持久化进度恢复
const infoRestart = TT.resolveLiveState(
  { sessionId: 's-w' },
  { ready: false, activeId: 'acct1', states: {} },   // 新进程监控还没起来
  TT.readStateMap()['acct1/task-77']);
check('重启场景：监控未就绪 → 持久化 running 兜底显示',
  infoRestart && infoRestart.state === 'running' && infoRestart.since > 0);
TT.syncPersistedStates([{ key: 'acct1/task-77', sessionId: 's-w', kind: 'task', id: 77, title: 'y' }],
  { 's-w': 'done' }, { byId: { 's-w': {} }, byIdReady: true, statusReady: true }, NOW);
const infoDone = TT.resolveLiveState(
  { sessionId: 's-w' },
  { ready: true, statusReady: true, states: { 's-w': null } }, // 就绪但实时归零（重启期间跑完）
  TT.readStateMap()['acct1/task-77']);
check('重启场景：关闭期间跑完（完成事件已丢）→ 持久化 done 仍显示「已完成」',
  infoDone && infoDone.state === 'done' && infoDone.since === NOW);

// ── 列表搜索 + 排序 + 临期/逾期（2026-10-25 提案 1）──
// deadlineInfo 的解析基准是本地时区日期串，测试用本地零点作 now 保证与平台无关
const NOWD = Date.parse('2026-10-25T00:00:00');
const DI = (d) => TT.deadlineInfo(d, NOWD);
check('deadlineInfo：截止日已过 → overdue + 可算逾期天数',
  DI('2026-10-20').overdue === true && DI('2026-10-20').soon === false
  && TT.overdueDays(DI('2026-10-20')) === 5);
check('deadlineInfo：≤3 天 → soon（含边界）',
  DI('2026-10-25').soon === true && DI('2026-10-27').soon === true && DI('2026-10-28').soon === false);
check('deadlineInfo：远期 → 正常；空/坏值 → null',
  DI('2026-11-20').overdue === false && DI('2026-11-20').soon === false
  && TT.deadlineInfo(null, NOWD) === null && DI('乱写') === null);
check('isFinalCard：done/closed/cancel 终态 → true，进行中 → false',
  TT.isFinalCard({ status: 'done' }) === true && TT.isFinalCard({ status: 'closed' }) === true
  && TT.isFinalCard({ status: 'cancel' }) === true && TT.isFinalCard({ status: 'doing' }) === false
  && TT.isFinalCard(null) === false);

const sc = [
  { kind: 'bug', id: 5, title: '无截止', status: 'wait' },
  { kind: 'bug', id: 1, title: '已关闭', status: 'closed', deadline: '2026-10-20' },
  { kind: 'bug', id: 2, title: '逾期', status: 'doing', deadline: '2026-10-19' },
  { kind: 'bug', id: 3, title: '临期', status: 'doing', deadline: '2026-10-26' },
  { kind: 'bug', id: 4, title: '远期', status: 'doing', deadline: '2026-11-26' },
];
check('sortCards smart：逾期 > 临期 > 有截止 > 无截止，终态沉底',
  TT.sortCards(sc, 'smart', NOWD).map((c) => c.id).join(',') === '2,3,4,5,1');
const sc2 = [
  { id: 10, deadline: '2026-11-05', pri: 2 },
  { id: 11, deadline: '2026-11-01', pri: 3 },
  { id: 12, deadline: '2026-11-01', pri: 1 },
  { id: 9, deadline: '2026-11-01', pri: 1 },
];
check('sortCards smart 段内：截止↑ → 优先级↑ → id↓',
  TT.sortCards(sc2, 'smart', NOWD).map((c) => c.id).join(',') === '12,9,11,10');
check('sortCards deadline：截止↑，无截止最后，终态沉底',
  TT.sortCards([{ id: 1 }, { id: 2, deadline: '2026-11-01' }, { id: 3, status: 'done', deadline: '2026-10-01' }], 'deadline', NOWD)
    .map((c) => c.id).join(',') === '2,1,3');
check('sortCards pri：优先级↑，缺省沉底',
  TT.sortCards([{ id: 1, pri: 3 }, { id: 2, pri: 1 }, { id: 3 }], 'pri', NOWD)
    .map((c) => c.id).join(',') === '2,1,3');
check('sortCards origin：保持禅道返回顺序',
  TT.sortCards(sc, 'origin', NOWD).map((c) => c.id).join(',') === '5,1,2,3,4');
check('sortCards 未知 mode → 回落 smart', JSON.stringify(TT.sortCards(sc, 'garbage', NOWD)) === JSON.stringify(TT.sortCards(sc, 'smart', NOWD)));

// ── smart 排序融合实时状态：ask > running > 普通 > done > 终态（2026-10-25 提案 2）──
check('sortCards smart + liveOf：等你决策置顶（无截止的 ask 卡压过逾期卡）',
  TT.sortCards(sc, 'smart', NOWD, (c) => (c.id === 5 ? 'ask' : null)).map((c) => c.id).join(',') === '5,2,3,4,1');
check('sortCards smart + liveOf：ask > running > 普通 > done，终态沉底',
  TT.sortCards(sc, 'smart', NOWD, (c) => ({ 2: 'ask', 3: 'running', 4: 'done' }[c.id] || null))
    .map((c) => c.id).join(',') === '2,3,5,4,1');
check('sortCards smart + liveOf：终态仍最先沉底（live 也压不过终态）',
  TT.sortCards([{ kind: 'bug', id: 9, status: 'closed' }, { kind: 'bug', id: 8, status: 'doing' }], 'smart', NOWD,
    (c) => (c.id === 9 ? 'ask' : null)).map((c) => c.id).join(',') === '8,9');
check('sortCards smart + liveOf：done 沉到普通之后（已处理完但禅道未终态）',
  TT.sortCards([
    { kind: 'bug', id: 7, status: 'doing', deadline: '2026-11-26' }, // 远期 done
    { kind: 'bug', id: 6, status: 'doing', deadline: '2026-10-26' }, // 临期普通
  ], 'smart', NOWD, (c) => (c.id === 7 ? 'done' : null)).map((c) => c.id).join(',') === '6,7');
check('sortCards smart + liveOf：桶内仍按 截止↑ → 优先级↑ 排',
  TT.sortCards(sc2, 'smart', NOWD, () => 'running').map((c) => c.id).join(',') === '12,9,11,10');
check('sortCards smart + liveOf 传非函数 → 行为与原来一致',
  TT.sortCards(sc, 'smart', NOWD, undefined).map((c) => c.id).join(',') === '2,3,4,5,1');
check('sortCards deadline/pri 模式不受 liveOf 影响（用户显式选了维度）',
  JSON.stringify(TT.sortCards(sc, 'deadline', NOWD, (c) => (c.id === 2 ? 'ask' : null))) === JSON.stringify(TT.sortCards(sc, 'deadline', NOWD))
  && JSON.stringify(TT.sortCards(sc, 'pri', NOWD, (c) => (c.id === 2 ? 'ask' : null))) === JSON.stringify(TT.sortCards(sc, 'pri', NOWD)));

// ── 会话头部反向跳转（Idea 3，2026-10-25）：slot 注册 + links 反查 + 跳转编排 ──
const headerReg = slotRegs.find((r) => r.opts.name === 'conversation.session.header.actions');
check('slot: conversation.session.header.actions 已注册（id=zentao-card）',
  Boolean(headerReg) && headerReg.opts.id === 'zentao-card' && typeof headerReg.comp === 'function');
check('header inject(sessionId) → zentaoSessionId prop（scope:session 的 runInject 传参）',
  JSON.stringify(headerReg.opts.inject('sess-1')) === JSON.stringify({ zentaoSessionId: 'sess-1' }));

const hdrLinks = {
  'acct1/bug-101': { sessionId: 'sess-a', at: 1000, kind: 'bug', id: 101, title: '旧关联' },
  'acct1/task-9': { sessionId: 'sess-b', at: NOW, kind: 'task', id: 9, title: '修复登录' },
  'acct2/bug-101': { sessionId: 'sess-c', at: NOW + 1, kind: 'bug', id: 101, title: '另一个账号' },
};
check('findLinkBySession：命中返回 parsed（含账号/类型/id）',
  (() => { const f = TT.findLinkBySession(hdrLinks, 'sess-b'); return f && f.parsed.activeId === 'acct1' && f.parsed.kind === 'task' && String(f.parsed.id) === '9'; })());
check('findLinkBySession：同一 sessionId 多条 → at 最新',
  TT.findLinkBySession({ 'a/bug-1': { sessionId: 's', at: 1 }, 'a/bug-2': { sessionId: 's', at: 5 } }, 's').key === 'a/bug-2');
check('findLinkBySession：无关联 / 空 / __proto__ → null',
  TT.findLinkBySession(hdrLinks, 'sess-x') === null && TT.findLinkBySession(null, 's') === null
  && TT.findLinkBySession({ __proto__: { 'x/bug-1': { sessionId: 's', at: 1 } } }, 's') === null);
check('findFocusCard：kind+id 匹配（列表 id 数字 / focus id 字符串）',
  TT.findFocusCard([{ kind: 'bug', id: 101 }, { kind: 'task', id: 9 }], { kind: 'bug', id: '101' }).kind === 'bug'
  && TT.findFocusCard([{ kind: 'bug', id: 101 }], { kind: 'bug', id: '102' }) === null
  && TT.findFocusCard([{ kind: 'bug', id: 1 }], null) === null);

// 跳转编排（注入 rpc/selectPanel，重置 paneCache 单例字段）
const pc = TT.paneCache;
const resetPane = (activeId) => {
  pc.status = activeId ? { activeId, configured: true } : null;
  pc.tab = 'task'; pc.mine = { cards: [] }; pc.detailCard = { kind: 'bug', id: 1 }; pc.focus = null;
};
resetPane('acct1');
let selected = null; let switchCalls = [];
const jumpDeps = {
  selectPanel: (id) => { selected = id; },
  rpc: (ep, payload) => { switchCalls.push({ ep, payload }); return Promise.resolve({ ok: true, value: { activeId: payload.id, configured: true } }); },
};
// links.v1 写入 sess-b（acct1/task-9，与 paneCache.status.activeId 同账号）
window.localStorage.setItem('dsh-zentao-panel.links.v1', JSON.stringify({ 'acct1/task-9': hdrLinks['acct1/task-9'] }));
pc.tab = 'bug'; // 先偏离目标值，验证 jump 确实写了 tab
const rSame = await TT.jumpToZentaoCard('sess-b', jumpDeps);
check('jump：同账号 → 直接跳（不切账号），写 tab+focus，selectPanel 收到 zentao',
  rSame.ok === true && switchCalls.length === 0 && selected === 'zentao'
  && pc.tab === 'task' && pc.focus && pc.focus.kind === 'task' && String(pc.focus.id) === '9');
// 异账号：sess-c 属 acct2
resetPane('acct1'); selected = null; switchCalls = [];
window.localStorage.setItem('dsh-zentao-panel.links.v1', JSON.stringify({ 'acct2/bug-101': hdrLinks['acct2/bug-101'] }));
const rSwitch = await TT.jumpToZentaoCard('sess-c', jumpDeps);
check('jump：卡片属其他账号 → 先 zentao.switch 再跳，status 换新、旧 mine/detail 清空',
  rSwitch.ok === true && switchCalls.length === 1 && switchCalls[0].ep === 'zentao.switch'
  && switchCalls[0].payload.id === 'acct2' && pc.status.activeId === 'acct2'
  && pc.mine === null && pc.detailCard === null && selected === 'zentao'
  && pc.tab === 'bug' && pc.focus && pc.focus.kind === 'bug' && String(pc.focus.id) === '101');
// switch 被拒 → 不跳
resetPane('acct1'); selected = null;
const rSwFail = await TT.jumpToZentaoCard('sess-c', {
  selectPanel: jumpDeps.selectPanel,
  rpc: () => Promise.resolve({ ok: false, error: { message: 'no such account' } }),
});
check('jump：switch 被拒 → reason=switch，不调 selectPanel、不写 focus',
  rSwFail.ok === false && rSwFail.reason === 'switch' && selected === null && pc.focus === null);
// selectPanel 抛错 → 回滚（links.v1 当前是 acct2/bug-101=sess-c，重置回同账号）
resetPane('acct1'); pc.tab = 'bug';
window.localStorage.setItem('dsh-zentao-panel.links.v1', JSON.stringify({ 'acct1/task-9': hdrLinks['acct1/task-9'] }));
const rPanel = await TT.jumpToZentaoCard('sess-b', { selectPanel: () => { throw new Error('not registered'); } });
check('jump：selectPanel 抛错 → reason=panel，tab/focus 回滚',
  rPanel.ok === false && rPanel.reason === 'panel' && pc.focus === null && pc.tab === 'bug');
// 无关联
resetPane('acct1');
const rNo = await TT.jumpToZentaoCard('sess-none', jumpDeps);
check('jump：无关联会话 → reason=nolink', rNo.ok === false && rNo.reason === 'nolink');

// 默认分支（不注入 deps → lookupService('layout')）：selectPanel 是依赖 this 的实例方法，
// 必须以方法形式调用——抽成裸函数 this=undefined 直接 throw（dsh-pocket #117 同款坑，真机踩过）
resetPane('acct1'); pc.tab = 'bug';
window.localStorage.setItem('dsh-zentao-panel.links.v1', JSON.stringify({ 'acct1/task-9': hdrLinks['acct1/task-9'] }));
const layoutSvc = {
  bound: false,
  // 模拟真实 layout.selectPanel：内部依赖实例状态（this.panels），this 丢失即 throw
  selectPanel(id) {
    if (this !== layoutSvc || !Object.prototype.hasOwnProperty.call(layoutSvc, 'bound')) throw new Error('this lost');
    this.bound = true; this._id = id;
  },
};
const origGet = ctx.get;
ctx.get = (name) => (name === 'layout' ? layoutSvc : undefined);
const rDefault = await TT.jumpToZentaoCard('sess-b', {});
ctx.get = origGet;
check('jump：默认分支走 lookupService → layout.selectPanel 以方法形式调用（this 正确绑定）',
  rDefault.ok === true && layoutSvc.bound === true && layoutSvc._id === 'zentao'
  && pc.tab === 'task' && pc.focus && pc.focus.kind === 'task');
layoutSvc.bound = false;
pc.focus = null; pc.tab = 'bug'; // 重置：回滚断言期望恢复到点击前的空 focus
ctx.get = (name) => (name === 'layout' ? { selectPanel: layoutSvc.selectPanel } : undefined); // 换宿主对象调用 → this 丢失
const rDetach = await TT.jumpToZentaoCard('sess-b', {});
ctx.get = origGet;
check('jump：this 丢失的调用形态被兜住 → reason=panel 且回滚，不静默炸',
  rDetach.ok === false && rDetach.reason === 'panel' && rDetach.message.includes('this lost')
  && pc.focus === null && pc.tab === 'bug' && layoutSvc.bound === false);

// header 按钮组件渲染（leftWired 已在 apply 注册左侧栏时置 true；links.v1 当前指 sess-b）
const btnNode = TT.ZentaoHeaderAction({ zentaoSessionId: 'sess-b' });
check('ZentaoHeaderAction：有关联 → 渲染 ztp-hbtn 按钮（图标 + 「禅道」）',
  btnNode && btnNode.type === 'button' && btnNode.props.className === 'ztp-hbtn'
  && btnNode.props.title.includes('回到禅道面板') && Array.isArray(btnNode.children) && btnNode.children.length === 2);
check('ZentaoHeaderAction：无关联 / 无 sessionId → 不渲染',
  TT.ZentaoHeaderAction({ zentaoSessionId: 'sess-x' }) === null && TT.ZentaoHeaderAction({}) === null);
window.localStorage.removeItem('dsh-zentao-panel.links.v1');

const mcard = { kind: 'bug', id: 123, title: '登录页报错', status: 'active', openedBy: '张三' };
check('matchSearch：标题 / 裸 id / #id / 状态名 / 创建人命中',
  TT.matchSearch(mcard, '登录') === true && TT.matchSearch(mcard, '123') === true
  && TT.matchSearch(mcard, '#123') === true && TT.matchSearch({ ...mcard, status: 'doing' }, '进行中') === true
  && TT.matchSearch(mcard, '张三') === true);
check('matchSearch：未命中词 → false（大小写不敏感在英文下成立）',
  TT.matchSearch(mcard, '已解决') === false
  && TT.matchSearch({ kind: 'bug', id: 1, title: 'login page' }, 'LOGIN') === true);
check('matchSearch：多词 AND（全命中才显示）/ 空查询恒 true',
  TT.matchSearch(mcard, '登录 123') === true && TT.matchSearch(mcard, '登录 456') === false
  && TT.matchSearch(mcard, '') === true && TT.matchSearch(mcard, '   ') === true);

// ── 列表快照持久化 mine.v1（2026-10-25 提案 2）：重启秒开 + 离线兜底 ──
const MKEY = 'dsh-zentao-panel.mine.v1';
lsBacking.set(MKEY, '{oops');
check('mine.v1 存储损坏时读作空（自愈）', TT.readMineSnapshot('a1') === null);
lsBacking.delete(MKEY);
TT.writeMineSnapshot('a1', { cards: [{ kind: 'bug', id: 1, title: 'x' }], at: 123 });
const msnap = TT.readMineSnapshot('a1');
check('writeMineSnapshot → readMineSnapshot 往返（cached:true 供页脚显示缓存时间）',
  msnap && msnap.cached === true && msnap.at === 123 && Array.isArray(msnap.cards) && msnap.cards[0].id === 1);
check('readMineSnapshot：其它账号 / 空 activeId → null',
  TT.readMineSnapshot('a2') === null && TT.readMineSnapshot(null) === null);
TT.writeMineSnapshot('a2', { cards: Array.from({ length: 500 }, (_, i) => ({ kind: 'bug', id: i })), at: 1 });
check('快照卡片数截断到上限（防配额爆）', TT.readMineSnapshot('a2').cards.length === 400);
for (const a of ['a3', 'a4', 'a5', 'a6']) TT.writeMineSnapshot(a, { cards: [], at: 1 });
check('快照最多保留 4 个账号（按 savedAt 淘汰最旧）',
  Object.keys(JSON.parse(lsBacking.get(MKEY))).length === 4
  && !('a1' in JSON.parse(lsBacking.get(MKEY))) && TT.readMineSnapshot('a6') !== null);
TT.removeMineSnapshot('a6');
check('removeMineSnapshot 清指定账号（账号移除时用）',
  TT.readMineSnapshot('a6') === null && TT.readMineSnapshot('a3') !== null);
lsBacking.delete(MKEY);

// ── 处理结果摘要回读（replies.v1 + 事件窗口，2026-10-25 提案 3）──
const RKEY = 'dsh-zentao-panel.replies.v1';
lsBacking.set(RKEY, '{oops');
check('replies.v1 存储损坏时读作空表（自愈）', typeof TT.readReplyMap() === 'object' && TT.readReplyMap() !== null);
lsBacking.delete(RKEY);

const mkMsg = (seq, blocks) => ({ event: { seq, type: 'assistant/message', data: { message: { content: blocks } } } });
check('assistantEntryText：拼接 text 块（跳过 reasoning/工具块，块内 trim）',
  TT.assistantEntryText(mkMsg(1, [{ type: 'text', text: '第一步' }, { type: 'reasoning', text: '内心' }, { type: 'text', text: '  第二步 ' }])) === '第一步\n\n第二步');
check('assistantEntryText：只有 reasoning/空 content → null（无可展示文本）',
  TT.assistantEntryText(mkMsg(1, [{ type: 'reasoning', text: 'x' }])) === null
  && TT.assistantEntryText(mkMsg(1, [])) === null);
check('assistantEntryText：非 assistant/message / 坏结构 → null',
  TT.assistantEntryText({ event: { type: 'user/message', data: {} } }) === null
  && TT.assistantEntryText(null) === null);
check('lastAssistantText：从尾往头取最后一条有文本的',
  TT.lastAssistantText([mkMsg(1, [{ type: 'text', text: '早' }]), { event: { type: 'tool/result' } },
    mkMsg(3, [{ type: 'reasoning', text: 'r' }]), mkMsg(4, [{ type: 'text', text: '晚' }])]) === '晚');
check('lastAssistantText：空 / 全无文本 → null',
  TT.lastAssistantText([]) === null && TT.lastAssistantText(null) === null);

// fetchLastReply：retain → binding.eventSource 窗口 → 取文本 → release
let replyReleased = 0;
let replyEntries = [mkMsg(7, [{ type: 'text', text: '马上就好' }])];
let replySub = null;
ctx.get = function (name) {
  if (name === 'sessions') return {
    retain(id, o) { return { sessionId: id, opts: o, release() { replyReleased++; } }; },
    binding() {
      return { eventSource: {
        getSnapshot: () => ({ entries: replyEntries, hasMore: false, revision: 1 }),
        subscribe(cb) { replySub = cb; return () => {}; },
      } };
    },
  };
  return undefined;
};
replyReleased = 0;
const fr1 = await TT.fetchLastReply('s-r1', 1000);
check('fetchLastReply：窗口已就绪 → 取到回复并释放 retain',
  fr1.ok === true && fr1.text === '马上就好' && replyReleased === 1);

replyEntries = [];
replyReleased = 0;
const fr2P = TT.fetchLastReply('s-r2', 2000);
await sleep(10);
replyEntries = [mkMsg(9, [{ type: 'text', text: '后台到的' }])];
if (replySub) replySub();
const fr2 = await fr2P;
check('fetchLastReply：窗口异步回放（retain 自动开事件流）→ subscribe 唤醒后取到',
  fr2.ok === true && fr2.text === '后台到的' && replyReleased === 1);

replyEntries = [];
replyReleased = 0;
const fr3 = await TT.fetchLastReply('s-r3', 30);
check('fetchLastReply：窗口一直没内容 → 超时失败且释放 retain',
  fr3.ok === false && fr3.reason === 'timeout' && replyReleased === 1);

ctx.get = function () { return undefined; };
check('fetchLastReply：sessions 服务缺失 → unsupported（不抛错）',
  (await TT.fetchLastReply('s-x', 10)).reason === 'unsupported');
ctx.get = function (name) {
  if (name === 'sessions') return { retain() { throw new Error('no'); }, binding() { return {}; } };
  return undefined;
};
check('fetchLastReply：retain 抛错 → reason retain', (await TT.fetchLastReply('s-x', 10)).reason === 'retain');
ctx.get = function (name) {
  if (name === 'sessions') return {
    retain() { return { release() { replyReleased++; } }; },
    binding() { return {}; }, // 无 eventSource（旧版 DSH）
  };
  return undefined;
};
replyReleased = 0;
check('fetchLastReply：binding 无 eventSource → unsupported 且释放 retain',
  (await TT.fetchLastReply('s-x', 10)).reason === 'unsupported' && replyReleased === 1);

// replies.v1 存取 + 生命周期联动
const rcard = { kind: 'bug', id: 321, title: 't' };
TT.saveReply('acct1', rcard, 's1', '短回复');
check('saveReply/getReply 往返（带账号隔离）',
  TT.getReply('acct1', rcard).sessionId === 's1' && TT.getReply('acct1', rcard).text === '短回复'
  && TT.getReply('acct2', rcard) === null);
TT.saveReply('acct1', rcard, 's1', 'x'.repeat(600));
check('saveReply 正常长度存完整文本（full:true，不截断）',
  TT.getReply('acct1', rcard).text === 'x'.repeat(600) && TT.getReply('acct1', rcard).full === true);
TT.saveReply('acct1', rcard, 's1', 'y'.repeat(TT.REPLY_MAX_CHARS + 5));
check('saveReply 超防炸上限截断 + 省略号（full:false）',
  TT.getReply('acct1', rcard).text.length === TT.REPLY_MAX_CHARS + 1
  && TT.getReply('acct1', rcard).full === false);
TT.removeReply('acct1', rcard);
check('removeReply 清除指定条目', TT.getReply('acct1', rcard) === null);

lsBacking.clear();
ctx.get = function (name) {
  if (name === 'uiSession') return {
    sessionStatus: { getSnapshot: () => new Map(), subscribe() { return () => {}; } },
  };
  if (name === 'sessions') return {
    list: { getSnapshot: () => ({ byId: { 's-old': {}, 's-new': {}, 's-g': {} } }), subscribe() { return () => {}; } },
  };
  return undefined;
};
TT.saveSessionLink('acct1', rcard, 's-old');
TT.saveReply('acct1', rcard, 's-old', '旧会话的回复');
TT.saveSessionLink('acct1', rcard, 's-new');
check('再处理换会话 → 旧结果摘要作废（同 states 语义）', TT.getReply('acct1', rcard) === null);
TT.saveReply('acct1', rcard, 's-new', '新回复');
TT.saveSessionLink('acct1', rcard, 's-new');
check('同会话重复保存关联 → 已有摘要保留', TT.getReply('acct1', rcard) !== null);

const rcard2 = { kind: 'bug', id: 322, title: 't2' };
TT.saveSessionLink('acct1', rcard2, 's-g');
TT.saveReply('acct1', rcard2, 's-g', '会被连带清理的回复');
const SGONE = [{ key: 'acct1/bug-322', sessionId: 's-g', kind: 'bug', id: 322, title: 't2' }];
TT.syncPersistedStates(SGONE, { 's-g': 'done' }, { byId: { 's-g': {} }, byIdReady: true, statusReady: true }, NOW);
TT.syncPersistedStates(SGONE, { 's-g': null }, { byId: {}, byIdReady: true, statusReady: true }, NOW);
check('syncPersistedStates：会话被删 → 结果摘要一起清', TT.getReply('acct1', rcard2) === null);

// cleanupStaleLinks 连带清 replies（超期离线 + 孤儿）
lsBacking.clear();
lsBacking.set('dsh-zentao-panel.links.v1', JSON.stringify({
  'acct1/bug-1': { sessionId: 's-1', at: NOW - 100 * H, lastSeen: NOW - 100 * H, kind: 'bug', id: 1, title: 'a' },
  'acct1/bug-2': { sessionId: 's-2', at: NOW - 200 * H, lastSeen: NOW - 200 * H, kind: 'bug', id: 2, title: 'b' },
}));
lsBacking.set(RKEY, JSON.stringify({
  'acct1/bug-2': { sessionId: 's-2', text: 'x', at: NOW - 200 * H },
  'acct1/bug-8': { sessionId: 's-8', text: '孤儿', at: NOW - 300 * H },
}));
TT.cleanupStaleLinks('acct1', [{ kind: 'bug', id: 1 }], NOW);
const rmAfter = JSON.parse(lsBacking.get(RKEY));
check('cleanupStaleLinks：超期事项的结果摘要一起删 / 孤儿摘要同样清理',
  rmAfter['acct1/bug-2'] === undefined && rmAfter['acct1/bug-8'] === undefined);

// ── Markdown 子集渲染 + 摘要限高滚动（2026-10-25 用户要求）──
check('CSS：处理结果限高滚动 + markdown 排版样式已注入',
  appended[0].textContent.includes('max-height:360px') && appended[0].textContent.includes('.ztp-md table'));

const MD = TT.mdToBlocks('## 结论\n\n已修复 **登录超时** 与 `cookie` 问题。\n详情见 [禅道](http://z/bug-view-1.html)。');
check('mdToBlocks：标题 + 段落',
  MD.length === 2 && MD[0].type === 'h' && MD[0].level === 2 && MD[0].text === '结论'
  && MD[1].type === 'p' && MD[1].text.includes('登录超时'));

const mdCode = TT.mdToBlocks('前文\n```js\nvar a = 1;\nvar b = 2;\n```\n后文');
check('mdToBlocks：围栏代码块（带语言，前后段落切分）',
  mdCode.length === 3 && mdCode[1].type === 'code' && mdCode[1].lang === 'js'
  && mdCode[1].text === 'var a = 1;\nvar b = 2;' && mdCode[2].text === '后文');

const mdq = TT.mdToBlocks('> 引用一行\n> 引用二行\n\n正文');
check('mdToBlocks：引用块递归解析（内含段落）',
  mdq[0].type === 'quote' && mdq[0].blocks.length === 1 && mdq[0].blocks[0].type === 'p'
  && mdq[0].blocks[0].text === '引用一行\n引用二行' && mdq[1].type === 'p');

const mdl = TT.mdToBlocks('- a\n- b\n  - b1\n  - b2\n1. one\n2. two');
check('mdToBlocks：列表（无序 + 缩进子级 + 有序混排）',
  mdl.length === 1 && mdl[0].type === 'list' && mdl[0].items.length === 6
  && mdl[0].items[2].depth === 1 && mdl[0].items[2].text === 'b1'
  && mdl[0].items[4].ordered === true);

const mdt = TT.mdToBlocks('| 列1 | 列2 |\n|---|---|\n| a | b |\n| c | d |');
check('mdToBlocks：GFM 表格（表头 + 分隔行 + 数据行）',
  mdt.length === 1 && mdt[0].type === 'table' && JSON.stringify(mdt[0].head) === '["列1","列2"]'
  && mdt[0].rows.length === 2 && mdt[0].rows[1][0] === 'c');

check('mdToBlocks：分隔线 / 未闭合代码块到 EOF / 空文本不抛错',
  TT.mdToBlocks('---')[0].type === 'hr'
  && TT.mdToBlocks('```\ncode')[0].type === 'code' && TT.mdToBlocks('```\ncode')[0].text === 'code'
  && TT.mdToBlocks('')[0] === undefined && TT.mdToBlocks(null)[0] === undefined);

const nodes = TT.mdInlineNodes('前 **粗** 中 *斜* 后 `code` 尾 [禅道](http://z) 完', 'k');
const types = nodes.filter((x) => x && x.type).map((x) => x.type);
check('mdInlineNodes：粗体/斜体/行内代码/链接 → strong/em/code/a',
  types.join(',') === 'strong,em,code,a'
  && nodes.find((x) => x && x.type === 'strong').children[0] === '粗'
  && nodes.find((x) => x && x.type === 'a').props.href === 'http://z');
check('mdInlineNodes：纯文本返回单字符串数组 / 空文本不抛错',
  JSON.stringify(TT.mdInlineNodes('纯文本', 'k')) === '["纯文本"]'
  && TT.mdInlineNodes('', 'k').length === 1);

const tree = TT.mdListTree([
  { depth: 0, ordered: false, text: 'a' },
  { depth: 1, ordered: false, text: 'a1' },
  { depth: 0, ordered: false, text: 'b' },
]);
check('mdListTree：缩进子级挂到上一项 children',
  tree.length === 2 && tree[0].children.length === 1 && tree[0].children[0].text === 'a1'
  && tree[1].text === 'b' && tree[1].children.length === 0);

// ── 最近动态时间线（v1 actions，2026-10-25 提案 2；fake useState 恒折叠态）──
check('fmtActDate：今年 → "MM-DD HH:mm"，往年带年份，非法原样',
  TT.fmtActDate('2026-09-22 09:09:16') === '09-22 09:09'
  && TT.fmtActDate('2021-09-22 09:09:16') === '2021-09-22'
  && TT.fmtActDate('') === '' && TT.fmtActDate('abc') === 'abc');

const mkAct = (i) => ({
  actor: 'actor' + i, action: 'edited', date: '2026-09-' + String(9 + i).padStart(2, '0') + ' 09:00:00',
  desc: '第' + i + '条动态', comment: i === 8 ? '备注正文[图片：1.png]' : '',
  images: i === 8 ? [{ url: 'http://z/file-read-1.png', name: '1.png' }] : [],
  history: i === 10 ? [{ field: '指派给', old: 'zhang', new: 'li' }] : [],
});
const acts10 = Array.from({ length: 10 }, (_, i) => mkAct(i + 1));
const tl = TT.ActionTimeline({ actions: acts10 });
// fake createElement 不展平数组 children（真 React 会），先 flat 再找节点
const tlAll = tl.children.flat(2).filter(Boolean);
const tlItems = tlAll.filter((x) => x.type === 'div' && x.props.className === 'ztp-act');
const tlToggle = tlAll.find((x) => x.type === 'button');
check('ActionTimeline：10 条 → 折叠只渲染最近 5 条 + 展开按钮',
  tl && tl.type === 'div' && tl.props.className === 'ztp-actions'
  && tlItems.length === 5 && tlToggle && tlToggle.children[0] === '展开全部（10 条）');
check('ActionTimeline：折叠露的是尾部最新（第 6 条在最上）+ desc/紧凑日期渲染',
  tlItems[0].children[0].children[0].children[0] === '第6条动态'
  && tlItems[0].children[0].children[1].children[0] === '09-15 09:00');
const cmNode = tlItems[2].children.find((x) => x && x.props && x.props.className === 'ztp-act-comment');
const imNode = tlItems[2].children.find((x) => x && typeof x.type === 'function');
const histNode = tlItems[4].children.find((x) => x && x.props && x.props.className === 'ztp-act-hist');
check('ActionTimeline：备注去图片占位符 + 图片复用 DetailImages（函数组件）+ 变更明细文案',
  cmNode && cmNode.children[0] === '备注正文'
  && imNode && imNode.props.images.length === 1
  && histNode && histNode.children.flat(2)[0].children[0] === '指派给：zhang → li');
const tl3 = TT.ActionTimeline({ actions: acts10.slice(0, 3) });
const tl3All = tl3.children.flat(2).filter(Boolean);
check('ActionTimeline：≤ 折叠数 → 全显示、无展开按钮',
  tl3All.filter((x) => x.type === 'div' && x.props.className === 'ztp-act').length === 3
  && !tl3All.some((x) => x.type === 'button'));
check('ActionTimeline：空数组 / 全空条目 → 整块不渲染',
  TT.ActionTimeline({ actions: [] }) === null
  && TT.ActionTimeline({ actions: [{ desc: '', comment: '', history: [] }, null] }) === null);

// ── 自动轮询 + 在线/离线状态 + 新指派检测（Idea 1，2026-10-25）──
check('POLL_INTERVAL_MS：3~10 分钟之间（host 60s 缓存之上、离线检测之下）',
  TT.POLL_INTERVAL_MS >= 3 * 60 * 1000 && TT.POLL_INTERVAL_MS <= 10 * 60 * 1000);

check('cardKeyMap：卡片列表 → kind-id 键集合 / 空输入不抛错',
  JSON.stringify(TT.cardKeyMap([{ kind: 'bug', id: 1 }, { kind: 'task', id: 2 }])) === '{"bug-1":true,"task-2":true}'
  && JSON.stringify(TT.cardKeyMap(null)) === '{}');

check('diffNewCards：首次（基线 null）只建基线不报新增',
  TT.diffNewCards(null, [{ kind: 'bug', id: 1 }]).count === 0);
check('diffNewCards：与基线比对 → 新增按类型计数；老卡片不算',
  JSON.stringify(TT.diffNewCards({ 'bug-1': true }, [
    { kind: 'bug', id: 1 }, { kind: 'bug', id: 2 }, { kind: 'task', id: 3 },
  ]).byKind) === '{"bug":1,"task":1}'
  && TT.diffNewCards({}, [{ kind: 'story', id: 9 }]).count === 1
  && TT.diffNewCards({ 'bug-1': true }, [{ kind: 'bug', id: 1 }]).count === 0);

check('newAssignedText：类型明细按 任务→Bug→需求 排列 / 无新增为空串',
  TT.newAssignedText({ count: 2, byKind: { bug: 1, task: 1 } }) === '禅道新指派 2 条（任务×1 · Bug×1）'
  && TT.newAssignedText({ count: 3, byKind: { bug: 2, story: 1 } }) === '禅道新指派 3 条（Bug×2 · 需求×1）'
  && TT.newAssignedText({ count: 0, byKind: {} }) === '');

let obRetryHit = false;
const obAt = TT.OfflineBar({ at: 1761000000000, onRetry: () => { obRetryHit = true; } });
const obNoAt = TT.OfflineBar({ at: 0, onRetry: () => {} });
check('OfflineBar：不可达文案 + 缓存时间说明 + 重试按钮；无数据时间不提缓存',
  obAt.props.className === 'ztp-offline' && obAt.props.role === 'alert'
  && obAt.children[0].children[0].includes('禅道当前不可达')
  && obAt.children[0].children[0].includes('的缓存数据')
  && !obNoAt.children[0].children[0].includes('的缓存数据')
  && obAt.children[1].children[0] === '重试');
obAt.children[1].props.onClick();
check('OfflineBar：重试按钮绑定 onRetry', obRetryHit);

// ── 批量下发（Idea 2，2026-10-25）：多选合并为一份任务背景 ──
const bc1 = { kind: 'bug', id: 1, title: '登录报错', descBrief: '步骤A' };
const bc2 = { kind: 'bug', id: 2, title: '导出失败', descBrief: '步骤B' };
const bc3 = { kind: 'task', id: 3, title: '联调支持' };
const bmd = TT.batchToMarkdown([bc1, bc2, bc3]);
check('batchToMarkdown：总述句 + 每卡一节（节格式与单卡一致）/ 空列表为空串',
  bmd.startsWith('共 3 项指派给我的禅道事项，请逐项分析处理：')
  && bmd.includes('## 禅道Bug #1：登录报错') && bmd.includes('### 重现步骤/描述')
  && bmd.includes('## 禅道Bug #2：导出失败') && bmd.includes('## 禅道任务 #3：联调支持')
  && (bmd.match(/^## /gm) || []).length === 3
  && TT.batchToMarkdown([]) === '' && TT.batchToMarkdown(null) === '');

check('batchSummary：count/label 按任务→Bug→需求顺序列非零项',
  (() => {
    const s = TT.batchSummary([bc1, bc2, bc3]);
    return s.count === 3 && s.label === '任务×1 · Bug×2'
      && s.byKind.bug === 2 && s.byKind.task === 1 && s.byKind.story === 0;
  })()
  && TT.batchSummary([]).label === '');

const imgCard = (id, n) => ({
  kind: 'bug', id, title: 't' + id,
  images: Array.from({ length: n }, (_, j) => ({ url: `http://z/${id}-${j}.png`, name: `${id}-${j}.png` })),
});
check('mergeCardImages：按卡顺序合并 + DSH 单消息 20 张上限截断',
  TT.mergeCardImages([imgCard(1, 2), imgCard(2, 2)]).length === 4
  && TT.mergeCardImages([imgCard(1, 2), imgCard(2, 2)]).every(Boolean)
  && TT.mergeCardImages(Array.from({ length: 12 }, (_, i) => imgCard(i + 1, 2))).length === 20);

// 卡片多选渲染（fake createElement 不展平 children，直接按槽位断言）
let toggled = null;
const selNode = TT.CardItem({
  card: bc1, selectable: true, selected: true, live: null,
  onToggleSel: (c) => { toggled = c; }, onOpen: () => { throw new Error('不应打开详情'); },
});
const normNode = TT.CardItem({
  card: bc1, live: null, linkView: null,
  onOpen: (c) => { toggled = c; },
});
const selCheck = selNode.children[0].children[0];
check('CardItem 多选模式：选中描边 + 圆形勾选框 + 无动作行/不可拖拽 + 点击=勾选',
  selNode.props.className.split(' ').includes('sel')
  && selCheck.props.className === 'ztp-check on' && typeof selCheck.children[0] === 'object'
  && !selNode.children.some((x) => x && x.props && x.props.className === 'ztp-acts')
  && selNode.props.draggable === false
  && selNode.props.title === '点击选中/取消选中'
  && (selNode.props.onClick(), toggled === bc1));
check('CardItem 普通模式回归：无勾选框 + 动作行仍在 + 可拖拽 + 点击=打开详情',
  normNode.children[0].children.every((x) => !(x && x.props && String(x.props.className).startsWith('ztp-check')))
  && normNode.children.some((x) => x && x.props && x.props.className === 'ztp-acts')
  && normNode.props.draggable === true
  && (toggled = null, normNode.props.onClick(), toggled === bc1));

// 批量弹层标题（fake useState 恒初值：下拉区显示「正在读取…」属预期，只断言标题/副标题）
const ddBatch = TT.DispatchDialog({
  card: bc1, cards: [bc1, bc2, bc3], batch: TT.batchSummary([bc1, bc2, bc3]),
  images: [], md: bmd, intent: 'dispatch', activeAcct: 'a',
  onSend: () => {}, onClose: () => {},
});
const ddPop = ddBatch.children[0];
check('DispatchDialog 批量模式：标题「批量处理：N 项」+ 类型摘要副标题',
  ddPop.children[0].children[0] === '批量处理：3 项'
  && ddPop.children[1].children[0] === '任务×1 · Bug×2，将合并为一份任务背景');
const ddSingle = TT.DispatchDialog({
  card: bc1, images: [], md: 'x', intent: 'dispatch', activeAcct: 'a',
  onSend: () => {}, onClose: () => {},
});
check('DispatchDialog 单卡模式回归：标题仍为「处理 Bug #id」',
  ddSingle.children[0].children[0].children[0] === '处理 Bug #1');

// 批量会话关联：N 卡指向同一会话，反查（会话头部「禅道」按钮用）能命中
TT.saveSessionLink('acctB', bc1, 's-batch');
TT.saveSessionLink('acctB', bc2, 's-batch');
TT.saveSessionLink('acctB', bc3, 's-batch');
const lmBatch = TT.readLinkMap();
check('批量下发后逐卡关联同一会话 + findLinkBySession 反查命中',
  lmBatch['acctB/bug-1'] && lmBatch['acctB/bug-1'].sessionId === 's-batch'
  && lmBatch['acctB/bug-2'] && lmBatch['acctB/bug-2'].sessionId === 's-batch'
  && lmBatch['acctB/task-3'] && lmBatch['acctB/task-3'].sessionId === 's-batch'
  && TT.findLinkBySession(lmBatch, 's-batch') !== null);

// ── 账号别名（2026-10-25）──────────────────────────────────────
check('acctDisplayName：别名优先，无别名退回账号，空安全',
  TT.acctDisplayName({ account: 'zhangsan', alias: '公司禅道 · 张三' }) === '公司禅道 · 张三'
  && TT.acctDisplayName({ account: 'zhangsan', alias: '' }) === 'zhangsan'
  && TT.acctDisplayName({ account: 'zhangsan' }) === 'zhangsan'
  && TT.acctDisplayName({ account: 'lisi', alias: '   ' }) === 'lisi'
  && TT.acctDisplayName({ alias: '纯别名' }) === '纯别名'
  && TT.acctDisplayName(null) === '');

// AccountSwitcher 展示路径（fake useState 恒 null → 只渲染非编辑分支；
// 行内编辑/确认交互由真实 React 承担，RPC 链路在 multi/host 测试覆盖）
let pickedAcct = null;
const swNode = TT.AccountSwitcher({
  accounts: [
    { id: 'a1', account: 'zhangsan', alias: '公司 · 张三', baseUrl: 'http://z1.example.com:8090/', loggedIn: true },
    { id: 'a2', account: 'lisi', baseUrl: 'http://z2.example.com:8090/', loggedIn: false },
  ],
  activeId: 'a1',
  onPick: (a) => { pickedAcct = a; }, onRename: () => {}, onRemove: () => {}, onAdd: () => {}, onClose: () => {},
});
// fake createElement 不展平 children：pop.children = [[row1,row2], addButton]
const swRows = swNode.children[0].children[0];
const rowMain = (row) => row.children[0][0]; // [main, edit, dot, del] 打包成单个数组 child
check('账号菜单：主名显示别名、原账号+主机名下沉副行',
  rowMain(swRows[0]).children[0].children[0] === '公司 · 张三'
  && rowMain(swRows[0]).children[1].children[0] === 'zhangsan · z1.example.com:8090');
check('账号菜单：无别名行主名=账号、副行=主机名',
  rowMain(swRows[1]).children[0].children[0] === 'lisi'
  && rowMain(swRows[1]).children[1].children[0] === 'z2.example.com:8090');
check('账号菜单：激活行高亮 + 铅笔改名按钮 + 登录点/移除按钮齐备',
  swRows[0].props.className.split(' ').includes('on') && !swRows[1].props.className.includes('on')
  && swRows[0].children[0][1].props.className === 'ztp-acct-edit-btn'
  && swRows[0].children[0][2].props.title === '已登录'
  && swRows[0].children[0][3].props.className === 'ztp-acct-del');
let editStopProp = false;
swRows[0].children[0][1].props.onClick({ stopPropagation: () => { editStopProp = true; } });
(swRows[0].props.onClick(), undefined);
check('账号菜单：点行切换账号、点改名不冒泡（stopPropagation）',
  ((() => { swRows[1].props.onClick(); return pickedAcct && pickedAcct.id === 'a2'; })())
  && editStopProp === true);

// ── 图片内存缓存（url → dataURL，模块级；面板重挂/重开详情秒出，2026-10-25）──
TT.imageCache.clear();

check('imageDataUrlParts：dataURL → mediaType/base64；非 dataURL / 空 → null',
  (() => { const p = TT.imageDataUrlParts('data:image/png;base64,QUJD'); return p && p.mediaType === 'image/png' && p.base64 === 'QUJD'; })()
  && TT.imageDataUrlParts('http://z/1.png') === null
  && TT.imageDataUrlParts('data:text/plain,hello') === null
  && TT.imageDataUrlParts('') === null && TT.imageDataUrlParts(null) === null);

TT.rememberImageSrc('http://z/a.png', 'data:image/png;base64,QQ');
TT.rememberImageSrc('http://z/a.png', 'data:image/png;base64,QQ==');
check('rememberImageSrc 写入 / 覆盖更新 / cachedImageSrc 读回',
  TT.cachedImageSrc('http://z/a.png') === 'data:image/png;base64,QQ=='
  && TT.cachedImageSrc('http://z/never.png') === null
  && (TT.rememberImageSrc('http://z/bad.png', ''), TT.cachedImageSrc('http://z/bad.png') === null) /* 空值不写 */);

// 张数淘汰：塞满 MAX+1 张 → 最旧的被淘汰、最新的保留
TT.imageCache.clear();
for (let i = 0; i < TT.IMAGE_CACHE_MAX + 1; i++) TT.rememberImageSrc(`http://z/n${i}.png`, `data:image/png;base64,${i}`);
check(`张数淘汰：上限 ${TT.IMAGE_CACHE_MAX} 张，最旧先出`,
  TT.imageCache.size === TT.IMAGE_CACHE_MAX
  && TT.cachedImageSrc('http://z/n0.png') === null
  && TT.cachedImageSrc(`http://z/n${TT.IMAGE_CACHE_MAX}.png`) !== null);

// 字节淘汰：单条超预算可独占缓存（保至少 1 张），再来一条把超大的挤出去
TT.imageCache.clear();
TT.rememberImageSrc('http://z/big.png', 'data:image/png;base64,' + 'A'.repeat(TT.IMAGE_CACHE_MAX_BYTES + 10));
TT.rememberImageSrc('http://z/small.png', 'data:image/png;base64,QQ');
check('字节淘汰：总量超预算时最旧先出，最新保留', TT.imageCache.size === 1
  && TT.cachedImageSrc('http://z/big.png') === null
  && TT.cachedImageSrc('http://z/small.png') === 'data:image/png;base64,QQ');

// loadDetailImages（DetailImages 取图内核）：未命中走 RPC 并回写缓存；命中同步回填不再 RPC
TT.imageCache.clear();
let imgRpcN = 0;
ctx.connection.rpc.call = async (channel, endpoint) => {
  if (endpoint !== 'zentao.image') return { ok: false, error: { message: 'unexpected ' + endpoint } };
  imgRpcN++;
  return { ok: true, value: { name: '1.png', mediaType: 'image/png', base64: 'QUJD', bytes: 3 } };
};
let marks1 = [];
TT.loadDetailImages(['http://z/la-1.png'], (i, url, patch) => marks1.push({ i, url, patch }));
await new Promise((r) => setTimeout(r, 5));
check('loadDetailImages 首次：走 RPC，成功 mark src 并回写缓存',
  imgRpcN === 1 && marks1.length === 1 && marks1[0].patch.src === 'data:image/png;base64,QUJD'
  && TT.cachedImageSrc('http://z/la-1.png') === 'data:image/png;base64,QUJD');
let marks2 = [];
TT.loadDetailImages(['http://z/la-1.png'], (i, url, patch) => marks2.push({ i, url, patch }));
check('loadDetailImages 缓存命中：同步回填、不再发 RPC', imgRpcN === 1
  && marks2.length === 1 && marks2[0].patch.src === 'data:image/png;base64,QUJD');

// 失败不缓存（下次挂载重试）
ctx.connection.rpc.call = async () => ({ ok: false, error: { message: 'boom' } });
let marks3 = [];
TT.loadDetailImages(['http://z/la-2.png'], (i, url, patch) => marks3.push({ i, url, patch }));
await new Promise((r) => setTimeout(r, 5));
check('loadDetailImages 失败：mark failed、不写缓存', marks3.length === 1 && marks3[0].patch.failed === true
  && TT.cachedImageSrc('http://z/la-2.png') === null);

// cancel 后迟到的 RPC 回调作废
let lateResolve = null;
ctx.connection.rpc.call = () => new Promise((res) => { lateResolve = res; });
let marks4 = [];
const cancel4 = TT.loadDetailImages(['http://z/la-3.png'], (i, url, patch) => marks4.push({ i, url, patch }));
cancel4();
lateResolve({ ok: true, value: { name: '1.png', mediaType: 'image/png', base64: 'QUJD', bytes: 3 } });
await new Promise((r) => setTimeout(r, 5));
check('loadDetailImages cancel：卸载后迟到回调作废', marks4.length === 0);

// 预取 / 附件管线复用同一缓存：已看过的图下发时不重拉
TT.imageCache.clear();
imgRpcN = 0;
ctx.connection.rpc.call = async (channel, endpoint) => {
  if (endpoint !== 'zentao.image') return { ok: false, error: { message: 'unexpected ' + endpoint } };
  imgRpcN++;
  return { ok: true, value: { name: 'x.png', mediaType: 'image/png', base64: base64Png, bytes: 10 } };
};
const pcImgs = [{ url: 'http://z/pc-1.png', name: 'pc1.png' }, { url: 'http://z/pc-2.png', name: 'pc2.png' }];
const pc1 = await TT.prefetchImageBytes(pcImgs);
check('prefetchImageBytes 首次逐张走 RPC（并回写缓存）',
  imgRpcN === 2 && pc1.length === 2 && pc1.every(Boolean));
const pc2 = await TT.prefetchImageBytes(pcImgs);
check('prefetchImageBytes 二次命中缓存：0 RPC，name 取自图片引用',
  imgRpcN === 2 && pc2.length === 2 && pc2[0].name === 'pc1.png' && pc2[0].mediaType === 'image/png');
const attCached = await TT.attachImagesToDraft(pcImgs, { sessionId: 's-c', facade: evFacade, conversation: evConversation });
check('attachImagesToDraft 缓存命中：不发 RPC 照常建附件',
  imgRpcN === 2 && attCached.ok === true && attCached.count === 2);

console.log(failures ? `\n${failures} 项失败` : '\n全部通过');
process.exit(failures ? 1 : 0);
