// dsh-zentao-panel — 禅道 API 客户端（host 半边）
//
// 实测协议（ZenTao 18.13 开源版，详见仓库《计划书.md》附录 A）：
//   - RESTful API v2 在该实例不可用（入口类未部署）；
//   - 网页登录协议：GET user-login.html 种 session → GET user-refreshRandom.html
//     取 verifyRand → 密码 md5(md5(pw)+rand) → POST user-login.html（必须带一组
//     jQuery 风格请求头，缺一不可：X-Requested-With / 带 charset 的
//     Content-Type / Accept json / Referer / Origin / UA）；
//   - 成功后获得长期 cookie：za（账号）、zp（免密 hash）、keepLogin=on（30 天）；
//   - 数据主通道（登录态 cookie）：GET /my-work-{task,bug,story}.json，
//     双层 JSON（外层 data 是字符串需二次解析）；
//   - 详情接口：GET /api.php/v1/{tasks,bugs,stories}/{id}（v1 Token 或 cookie 均可）；
//   - 该实例登录无验证码。

import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const md5 = (s) => createHash('md5').update(s, 'utf8').digest('hex');

/** 模拟浏览器的一组固定请求头——实测缺任何一个都会被登录接口忽略（直接渲染回登录页 HTML）。 */
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  Accept: 'application/json, text/javascript, */*; q=0.01',
  'Accept-Language': 'zh-CN,zh;q=0.9',
};

/** 请求体大小上限：防止异常响应把内存打爆（对齐 dsh 插件惯例）。 */
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

/**
 * 轻量 cookie jar（不做通用实现，只覆盖禅道实际会用到的字段）。
 * 格式：Map<name, {value, expires?}>，序列化为 Cookie 头字符串。
 */
export function createCookieJar(initial = {}) {
  const jar = new Map(Object.entries(initial).map(([k, v]) => [k, typeof v === 'string' ? { value: v } : v]));
  return {
    header() {
      return [...jar.entries()].map(([k, c]) => `${k}=${c.value}`).join('; ');
    },
    get(name) {
      return jar.get(name)?.value ?? null;
    },
    has(name) {
      return jar.has(name);
    },
    /** 从 Set-Cookie 头解析并合并（后者覆盖前者）。 */
    absorb(setCookieValues) {
      for (const raw of setCookieValues) {
        if (!raw) continue;
        const parts = String(raw).split(';');
        const [pair, ...attrs] = parts;
        const eq = pair.indexOf('=');
        if (eq <= 0) continue;
        const name = pair.slice(0, eq).trim();
        const value = pair.slice(eq + 1).trim();
        if (value === 'deleted') { jar.delete(name); continue; }
        const cookie = { value };
        for (const attr of attrs) {
          const m = /^\s*expires\s*=\s*(.+)$/i.exec(attr);
          if (m) {
            const t = Date.parse(m[1]);
            if (Number.isFinite(t)) cookie.expires = t;
          }
        }
        jar.set(name, cookie);
      }
    },
    /** 未过期的全部 cookie（用于持久化）。 */
    toJSON() {
      const now = Date.now();
      const out = {};
      for (const [k, c] of jar) {
        if (c.expires !== undefined && c.expires <= now) continue;
        out[k] = { value: c.value, ...(c.expires !== undefined ? { expires: c.expires } : {}) };
      }
      return out;
    },
  };
}

/** 带超时与大小上限的 GET/POST（Node 22+ 原生 fetch）。 */
async function httpRequest(url, { method = 'GET', headers = {}, body = null, signal, timeoutMs = 15000, maxBytes = MAX_RESPONSE_BYTES } = {}) {
  const controller = signal ? null : new AbortController();
  const timer = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : setTimeout(() => { /* signal 由调用方管理 */ }, 0);
  if (timer && !controller) clearTimeout(timer);
  try {
    const init = { method, headers, signal, redirect: 'manual' };
    if (body !== null) init.body = body;
    const res = await fetch(url, init);
    // 流式读，防止超大响应
    const len = Number(res.headers.get('content-length') ?? 0);
    if (len > maxBytes) throw new Error(`禅道响应过大（${len} bytes）`);
    const buf = await readCapped(res, maxBytes);
    return { status: res.status, headers: res.headers, text: () => buf.toString('utf8'), bytes: () => buf };
  } finally {
    if (controller) clearTimeout(timer);
  }
}

async function readCapped(res, cap) {
  const chunks = [];
  let received = 0;
  for await (const chunk of res.body ?? []) {
    received += chunk.length;
    if (received > cap) throw new Error(`禅道响应超过 ${cap} bytes 上限`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** 从外层信封 {status:'success', data:'<json字符串>'} 解出内层对象。 */
function unwrapEnvelope(text) {
  const outer = JSON.parse(text);
  if (outer && typeof outer === 'object' && typeof outer.data === 'string') {
    return JSON.parse(outer.data);
  }
  return outer;
}

/**
 * 创建禅道客户端。
 * @param {{baseUrl:string, logger?:object}} options
 */
export function createZentaoClient({ baseUrl, logger = console }) {
  const base = baseUrl.replace(/\/+$/, '');
  const log = logger;
  let jar = createCookieJar();

  /** 已登录（有 za/zp 长期 cookie 或 session cookie）且未过期。 */
  function loggedIn() {
    if (jar.has('za') && jar.has('zp')) return true;
    return jar.has('zentaosid');
  }

  function cookieHeader() {
    return jar.header();
  }

  /** 单次请求（带 cookie，吸收 Set-Cookie）。 */
  async function request(path, { method = 'GET', headers = {}, body = null, ajax = false, referer = null, maxBytes } = {}) {
    const h = {
      ...BROWSER_HEADERS,
      ...(cookieHeader() ? { Cookie: cookieHeader() } : {}),
      ...(ajax ? { 'X-Requested-With': 'XMLHttpRequest' } : {}),
      ...(referer ? { Referer: referer } : {}),
      ...headers,
    };
    const res = await httpRequest(`${base}${path}`, { method, headers: h, body, maxBytes });
    const setCookies = [];
    try {
      // node fetch: getSetCookie()（undici >= 5.19 / Node 18.14+）
      if (typeof res.headers.getSetCookie === 'function') setCookies.push(...res.headers.getSetCookie());
      else if (res.headers.get('set-cookie')) setCookies.push(res.headers.get('set-cookie'));
    } catch { /* 忽略 */ }
    jar.absorb(setCookies);
    return res;
  }

  /**
   * 网页登录（M0 实测协议）。密码仅在此处使用，不落日志。
   * @returns {Promise<{ok:true, keepLogin:boolean}>} 或抛错
   */
  async function login(account, password) {
    // 1) 种 session
    await request('/user-login.html');
    // 2) 取 verifyRand
    const randRes = await request('/user-refreshRandom.html', { ajax: true });
    const rand = (await randRes.text()).trim();
    if (!/^\d+$/.test(rand)) throw new Error('获取 verifyRand 失败（禅道返回非数字）');
    // 3) 加密密码并 POST（jQuery 风格头，缺一不可）
    const form = new URLSearchParams({
      account,
      password: md5(md5(password) + rand),
      passwordStrength: '1',
      referer: '/',
      verifyRand: rand,
      keepLogin: '1',
      captcha: '',
    });
    const res = await request('/user-login.html', {
      method: 'POST',
      ajax: true,
      referer: `${base}/user-login.html`,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Origin: base,
      },
      body: form.toString(),
    });
    const text = await res.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = null; }
    if (parsed && parsed.result === 'success') {
      log.info?.('dsh-zentao-panel: 禅道登录成功');
      return { ok: true, keepLogin: jar.has('za') && jar.has('zp') };
    }
    const msg = parsed?.message ?? (text.includes('用户登录') ? '登录被拒（返回登录页）' : '登录失败');
    throw new Error(`禅道登录失败：${msg}`);
  }

  /** 用持久化 cookie 恢复。 */
  function restore(cookies) {
    jar = createCookieJar(cookies ?? {});
  }

  /** 导出可持久化的 cookie 快照。 */
  function exportCookies() {
    return jar.toJSON();
  }

  /** 换 v1 Token（详情接口备用鉴权）。 */
  async function fetchV1Token(account, password) {
    const res = await httpRequest(`${base}/api.php/v1/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account, password }),
    });
    if (res.status !== 201) throw new Error(`v1 token 获取失败（HTTP ${res.status}）`);
    const d = JSON.parse(await res.text());
    return d.token;
  }

  /** 会话失效错误（service 层据此触发自动重登）。 */
  function sessionExpired(message = '禅道会话失效') {
    const err = new Error(message);
    err.code = 'SESSION_EXPIRED';
    return err;
  }

  /** my-work 三接口（登录态 cookie，一次拿全量「指派给我」）。 */
  async function fetchMyWork(kind) {
    const res = await request(`/my-work-${kind}.json`, { ajax: true, referer: `${base}/my.html` });
    const text = await res.text();
    // 会话失效形态一：响应体被重定向到 user-login
    if (text.includes('user-login')) throw sessionExpired();
    const d = unwrapEnvelope(text);
    // 会话失效形态二（2026-10-24 真机实测）：HTTP 200 + 失败信封
    //   {"result":false,"message":"登录已超时，请重新登入!"}
    //   不带 user-login 字样，之前没识别 → 被当成空列表，面板静默空白且刷新无效。
    //   仅在期望的数据键缺席时才判失败，避免误伤正常载荷里恰有 result 字段的情况。
    if ((d.result === false || d.result === 'fail') && d[`${kind}s`] === undefined && d.stories === undefined) {
      const msg = String(d.message ?? '禅道接口返回失败');
      if (/登录|登入|超时|未登|login/i.test(msg)) throw sessionExpired();
      throw new Error(`禅道接口返回失败：${msg}`);
    }
    // task/bug 列表是数组；story 是 dict（按 id 索引）
    if (kind === 'story') return Object.values(d.stories ?? {});
    return d[`${kind}s`] ?? [];
  }

  /** v1 详情路径的复数映射（story → stories，不是 storys——2026-10-25 实测坑：
   *  之前简单加 s 拼成 storys，story 详情从 M3 起一直 404「不存在」，被误判成各种玄学）。 */
  const V1_KIND_PATHS = { task: 'tasks', bug: 'bugs', story: 'stories' };

  /** v1 详情接口（cookie 鉴权，通用）。 */
  async function fetchDetail(kind, id) {
    const res = await request(`/api.php/v1/${V1_KIND_PATHS[kind] ?? `${kind}s`}/${id}`);
    if (res.status === 404) throw new Error(`禅道${kind} #${id} 不存在`);
    if (res.status !== 200) throw new Error(`禅道详情请求失败（HTTP ${res.status}）`);
    return JSON.parse(await res.text());
  }

  /**
   * 下载禅道登录态文件（图片附件）的原始字节。
   * 只接受 baseUrl 内的相对路径（由 service 层做同源/前缀校验），不跟随 3xx。
   * @param {{path:string, referer?:string, maxBytes?:number}} options
   * @returns {Promise<{status:number, contentType:string, bytes:Buffer}>}
   */
  async function fetchFile({ path, referer = `${base}/my.html`, maxBytes = 20 * 1024 * 1024 } = {}) {
    const res = await request(path, { referer, maxBytes });
    return {
      status: res.status,
      contentType: String(res.headers.get('content-type') ?? ''),
      bytes: res.bytes(),
    };
  }

  return { login, restore, exportCookies, loggedIn, cookieHeader, fetchMyWork, fetchDetail, fetchV1Token, fetchFile, request, _jar: () => jar };
}
