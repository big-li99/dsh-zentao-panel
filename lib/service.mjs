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
/** 登录探活节流：短时间内连续取数（详情 + 多张图片）不再重复打 my-work。 */
const PROBE_TTL_MS = 30 * 1000;

/** 单张图片上限：与 DSH 附件存储默认单图上限（20 MiB）对齐。 */
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
/** 允许下载的禅道路径前缀（同源 + 前缀白名单 = 防 SSRF）。 */
const IMAGE_PATH_PREFIXES = ['/file-read-', '/data/upload/', '/index.php'];

/** 图片相关错误（带稳定 code，RPC 层只透传 message）。 */
function imageError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/** 从 <img> 标签里取 src 属性值（兼容单/双/无引号）。 */
function imgSrcOf(tag) {
  const m = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(String(tag));
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : '';
}

/** 图片展示名：`{35861.png}` / `http://host/file-read-35861.png` → `35861.png`。 */
export function imageDisplayName(src) {
  const raw = String(src ?? '').trim();
  if (!raw || /^data:/i.test(raw)) return '';
  let s = raw.replace(/^\{/, '').replace(/\}$/, '');
  try { s = decodeURIComponent(s); } catch { /* 保留原样 */ }
  const clean = s.split(/[?#]/)[0];
  // 禅道详情里的地址是 /file-read-35861.png，展示名去掉 file-read- 前缀
  const base = clean.slice(clean.lastIndexOf('/') + 1).replace(/[()[\]{}\s]/g, '').replace(/^file-read-/i, '');
  return base && base.length <= 120 ? base : '';
}

/**
 * 把禅道 HTML 里的图片 src 归一成可下载的绝对地址。
 * 实测禅道 18.13 两种形态：
 *   - 详情接口：http://<host>/file-read-35861.png（绝对地址）；
 *   - my-work 列表：{35861.png}（占位符）→ 同样映射到 /file-read-35861.png。
 */
export function normalizeImageUrl(src, baseUrl) {
  const raw = String(src ?? '').trim();
  const base = String(baseUrl ?? '').replace(/\/+$/, '');
  if (!raw || /^data:/i.test(raw)) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return null; // javascript: / file: 等一律拒绝
  if (raw.startsWith('//')) {
    try { return `${new URL(base).protocol}${raw}`; } catch { return null; }
  }
  const brace = /^\{([^{}]+)\}$/.exec(raw);
  if (brace) return `${base}/file-read-${brace[1]}`;
  if (raw.startsWith('/')) return `${base}${raw}`;
  return `${base}/${raw}`;
}

/**
 * 提取 HTML 里全部（去重、保序）图片引用。
 * @returns {Array<{url:string, name:string}>}
 */
export function extractImageRefs(html, baseUrl) {
  if (!html) return [];
  const out = [];
  const seen = new Set();
  const re = /<img\b[^>]*>/gi;
  let m;
  while ((m = re.exec(String(html))) !== null) {
    const src = imgSrcOf(m[0]);
    const url = normalizeImageUrl(src, baseUrl);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({ url, name: imageDisplayName(src) || 'image' });
  }
  return out;
}

/** 按文件头判定图片类型（只接受 DSH 附件支持的 png/jpeg/webp/gif）。 */
export function sniffImageMediaType(buf) {
  if (!buf || buf.length === 0) return null;
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
    && buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'image/gif';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** HTML → 纯文本（够用即可：去标签、解常见实体、压缩空白）。图片保留为 `[图片：文件名]`。 */
export function htmlToText(html) {
  if (!html) return '';
  let s = String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|ol|ul|tr|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<img\b[^>]*>/gi, (tag) => {
      const name = imageDisplayName(imgSrcOf(tag));
      return name ? `[图片：${name}]` : '[图片]';
    })
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
  const html = raw.desc ?? raw.steps ?? raw.spec ?? '';
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
    descBrief: html ? htmlToText(html).slice(0, 300) : '',
    // 描述里的内联图片（禅道原始 HTML → 可下载地址），插入对话时作为真实图片附件
    images: extractImageRefs(html, baseUrl),
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
  let lastProbeAt = 0; // 上次探活成功时间（节流用）

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
    lastProbeAt = 0;
  }

  /** 确保已登录：cookie 有效直接用；失效则用本机密码重登（无验证码，可全自动）。 */
  async function ensureLogin() {
    if (!client) throw new Error('未配置禅道（请先在面板登录）');
    if (client.loggedIn()) {
      // 30s 内探活过就不再打一次 my-work（插入带图卡片会连续调 detail + 多张 image）
      if (Date.now() - lastProbeAt < PROBE_TTL_MS) return true;
      // 快速探活：拉一次 my 页面判定 session 是否真的活着
      try {
        await client.fetchMyWork('task');
        lastProbeAt = Date.now();
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
        lastProbeAt = Date.now();
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

  /** 单条富详情（v1 接口，含完整描述/重现步骤 + 内联图片）。 */
  async function fetchDetail(kind, id) {
    await ensureLogin();
    const d = await client.fetchDetail(kind, id);
    const card = toCard(kind, d, baseUrl);
    const html = d.desc ?? d.steps ?? d.spec ?? '';
    return {
      ...card,
      desc: htmlToText(html),
      images: extractImageRefs(html, baseUrl),
      // 常用附加字段
      type: d.type ?? null,
      confirmed: kind === 'bug' ? d.confirmed ?? null : null,
      resolvedBuild: kind === 'bug' ? d.resolvedBuild ?? null : null,
      stage: kind === 'story' ? d.stage ?? null : null,
      estStarted: kind === 'task' ? d.estStarted ?? null : null,
      deadline: d.deadline ?? card.deadline,
    };
  }

  /** 校验图片地址：必须与禅道同源，且落在图片/文件路径白名单内（防 SSRF）。 */
  function parseImageUrl(url) {
    let target;
    try { target = new URL(String(url)); } catch { throw imageError('BAD_IMAGE_URL', '图片地址非法'); }
    if (target.protocol !== 'http:' && target.protocol !== 'https:') throw imageError('BAD_IMAGE_URL', '只支持 http(s) 图片');
    if (target.username || target.password) throw imageError('BAD_IMAGE_URL', '图片地址非法');
    let base;
    try { base = new URL(baseUrl); } catch { throw imageError('BAD_IMAGE_URL', '禅道地址未配置'); }
    if (target.origin !== base.origin) throw imageError('BAD_IMAGE_URL', '只允许下载禅道同源图片');
    if (!IMAGE_PATH_PREFIXES.some((p) => target.pathname.startsWith(p))) throw imageError('BAD_IMAGE_URL', '不支持的禅道文件路径');
    return target;
  }

  /**
   * 用登录态 cookie 下载禅道图片，返回可直接构造浏览器 File 的数据。
   * 供 client 半边通过 RPC 取图 → DSH 附件服务 → 真实图片附件。
   * @param {string} url 同源绝对地址（通常来自卡片的 images[]）
   * @returns {Promise<{name:string, mediaType:string, base64:string, bytes:number}>}
   */
  async function fetchImage(url) {
    await ensureLogin();
    const target = parseImageUrl(url);
    const res = await client.fetchFile({ path: `${target.pathname}${target.search}`, referer: `${baseUrl}/my.html`, maxBytes: MAX_IMAGE_BYTES });
    if (res.status !== 200) throw imageError('IMAGE_FETCH_FAILED', `图片下载失败（HTTP ${res.status}）`);
    const mediaType = sniffImageMediaType(res.bytes);
    if (!mediaType) throw imageError('UNSUPPORTED_IMAGE', '图片格式不支持（仅支持 png/jpeg/webp/gif）');
    if (res.bytes.length > MAX_IMAGE_BYTES) throw imageError('IMAGE_TOO_LARGE', `图片过大（${res.bytes.length} bytes）`);
    const ext = mediaType.split('/')[1].replace('jpeg', 'jpg');
    const name = imageDisplayName(target.pathname) || `image.${ext}`;
    return { name, mediaType, base64: res.bytes.toString('base64'), bytes: res.bytes.length };
  }

  /** 登出：清 cookie 清缓存清凭据。 */
  function logout() {
    client = null;
    cache = null;
    lastProbeAt = 0;
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

  return { init, configure, ensureLogin, fetchMine, fetchDetail, fetchImage, logout, status };
}
