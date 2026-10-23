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

// ── 卡片 → Markdown ──────────────────────────────────────────
const md = mod.cardToMarkdown({
  kind: 'bug', id: 123, title: '登录页报错', status: 'active', pri: 2, severity: 1,
  openedBy: '张三', deadline: '2026-10-30', url: 'http://z/bug-view-123.html', descBrief: '步骤…',
});
check('cardToMarkdown 含标题行', md.includes('## 禅道Bug #123：登录页报错'));
check('cardToMarkdown 含原地址', md.includes('http://z/bug-view-123.html'));
check('cardToMarkdown 用「重现步骤/描述」小节', md.includes('### 重现步骤/描述'));

console.log(failures ? `\n${failures} 项失败` : '\n全部通过');
process.exit(failures ? 1 : 0);
