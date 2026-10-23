// dsh-zentao-panel — 数据聚合层
//
// 职责：
//   - 管理登录态（持久化 cookie → 失效时用本机密码静默重登）；
//   - my-work 三接口 → 统一卡片模型（列表用）；
//   - v1 详情接口 → 富详情（描述/重现步骤 HTML → 纯文本化）；
//   - 短缓存（默认 60s）避免面板每次展开都打禅道。

import { createZentaoClient } from './zentao-client.mjs';
import { readConfig, writeConfig, clearConfig } from './store.mjs';

const CACHE_TTL_MS = 60 * 1000;

/** HTML → 纯文本（够用即可：去标签、解常见实体、压缩空白）。 */
export function htmlToText(html) {
  if (!html) return '';
  let s = String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|ol|ul|tr|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<img[^>]*src="([^"]*)"[^>]*>/gi, '[图片] $1')
    .replace(/<[^>]+>/g, '');
  const entities = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&ldquo;': '“', '&rdquo;': '”', '&mdash;': '—', '&hellip;': '…' };
  s = s.replace(/&(nbsp|amp|lt|gt|quot|#39|ldquo|rdquo|mdash|hellip);/g, (m) => entities[m] ?? m);
  return s.replace(/\n{3,}/g, '\n\n').trim();
}

/** 禅道原始记录 → 统一卡片模型。 */
function toCard(kind, raw, baseUrl) {
  // my-work 列表接口的 id 是字符串，v1 详情是数字——统一成 number
  const id = Number(raw.id);
  const at = raw.assignedTo && typeof raw.assignedTo === 'object' ? raw.assignedTo : {};
  const ob = raw.openedBy && typeof raw.openedBy === 'object' ? raw.openedBy : {};
  const urlMap = { task: 'task-view', bug: 'bug-view', story: 'story-view' };
  return {
    kind, // 'task' | 'bug' | 'story'
    id,
    title: raw.name ?? raw.title ?? `#${id}`,
    status: raw.status ?? '',
    pri: raw.pri ?? null,
    severity: kind === 'bug' ? (raw.severity ?? null) : null,
    deadline: raw.deadline ?? null,
    assignedTo: at.realname ?? at.account ?? '',
    openedBy: ob.realname ?? ob.account ?? '',
    openedDate: raw.openedDate ?? null,
    execution: raw.execution ?? null,
    project: raw.project ?? null,
    product: raw.product ?? null,
    url: `${baseUrl.replace(/\/+$/, '')}/${urlMap[kind]}-${id}.html`,
    // 列表即带的概要（详情接口才有完整描述）
    descBrief: raw.desc || raw.steps || raw.spec ? htmlToText(raw.desc ?? raw.steps ?? raw.spec).slice(0, 300) : '',
  };
}

/**
 * 创建聚合服务。
 * @param {{logger?:object, cacheTtlMs?:number}} options
 */
export function createZentaoService({ logger = console, cacheTtlMs = CACHE_TTL_MS } = {}) {
  const log = logger;
  let client = null;
  let account = '';
  let password = '';
  let baseUrl = '';
  let cache = null; // { at, cards }
  let loginPromise = null; // 并发去重

  /** 从磁盘配置初始化（插件启动时调用）。 */
  function init() {
    const cfg = readConfig();
    baseUrl = cfg.baseUrl;
    account = cfg.account;
    password = cfg.password;
    if (!baseUrl) return { configured: false };
    client = createZentaoClient({ baseUrl, logger: log });
    client.restore(cfg.cookies);
    return { configured: true, account, baseUrl };
  }

  /** 保存/更新登录配置并落盘。 */
  function configure({ baseUrl: newBase, account: acct, password: pw }) {
    baseUrl = String(newBase ?? '').replace(/\/+$/, '');
    account = String(acct ?? '');
    password = String(pw ?? '');
    client = createZentaoClient({ baseUrl, logger: log });
    writeConfig({ baseUrl, account, password, cookies: {} });
    cache = null;
  }

  /** 确保已登录：cookie 有效直接用；失效则用本机密码重登（无验证码，可全自动）。 */
  async function ensureLogin() {
    if (!client) throw new Error('未配置禅道（请先在面板登录）');
    if (client.loggedIn()) {
      // 快速探活：拉一次 my 页面判定 session 是否真的活着
      try {
        await client.fetchMyWork('task');
        return true;
      } catch (err) {
        if (err.code !== 'SESSION_EXPIRED') throw err;
        log.info?.('dsh-zentao-panel: 禅道会话失效，自动重登');
      }
    }
    if (!account || !password) {
      const err = new Error('禅道会话失效且本地无凭据，请重新登录');
      err.code = 'NEED_LOGIN';
      throw err;
    }
    // 并发去重：多标签同时触发也只登一次
    loginPromise ??= (async () => {
      try {
        await client.login(account, password);
        writeConfig({ baseUrl, account, password, cookies: client.exportCookies() });
        return true;
      } finally {
        loginPromise = null;
      }
    })();
    return loginPromise;
  }

  /** 拉全量「指派给我」三件套（带缓存）。 */
  async function fetchMine({ refresh = false } = {}) {
    if (!refresh && cache && Date.now() - cache.at < cacheTtlMs) {
      return { ...cache, cached: true };
    }
    await ensureLogin();
    const [tasks, bugs, stories] = await Promise.all([
      client.fetchMyWork('task'),
      client.fetchMyWork('bug'),
      client.fetchMyWork('story'),
    ]);
    const cards = [
      ...tasks.map((t) => toCard('task', t, baseUrl)),
      ...bugs.map((b) => toCard('bug', b, baseUrl)),
      ...stories.map((s) => toCard('story', s, baseUrl)),
    ];
    cache = { at: Date.now(), cards };
    return { ...cache, cached: false };
  }

  /** 单条富详情（v1 接口，含完整描述/重现步骤）。 */
  async function fetchDetail(kind, id) {
    await ensureLogin();
    const d = await client.fetchDetail(kind, id);
    const card = toCard(kind, d, baseUrl);
    return {
      ...card,
      desc: htmlToText(d.desc ?? d.steps ?? d.spec ?? ''),
      // 常用附加字段
      type: d.type ?? null,
      confirmed: kind === 'bug' ? d.confirmed ?? null : null,
      resolvedBuild: kind === 'bug' ? d.resolvedBuild ?? null : null,
      stage: kind === 'story' ? d.stage ?? null : null,
      estStarted: kind === 'task' ? d.estStarted ?? null : null,
      deadline: d.deadline ?? card.deadline,
    };
  }

  /** 登出：清 cookie 清缓存清凭据。 */
  function logout() {
    client = null;
    cache = null;
    account = '';
    password = '';
    baseUrl = '';
    clearConfig();
  }

  function status() {
    const cfg = readConfig();
    return {
      configured: Boolean(baseUrl || cfg.baseUrl),
      baseUrl: baseUrl || cfg.baseUrl,
      account: account || cfg.account,
      loggedIn: Boolean(client?.loggedIn()),
      cacheAt: cache?.at ?? null,
    };
  }

  return { init, configure, ensureLogin, fetchMine, fetchDetail, logout, status };
}
