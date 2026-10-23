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
async function httpRequest(url, { method = 'GET', headers = {}, body = null, signal, timeoutMs = 15000 } = {}) {
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
    if (len > MAX_RESPONSE_BYTES) throw new Error(`禅道响应过大（${len} bytes）`);
    const buf = await readCapped(res, MAX_RESPONSE_BYTES);
    return { status: res.status, headers: res.headers, text: () => buf.toString('utf8') };
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
  async function request(path, { method = 'GET', headers = {}, body = null, ajax = false, referer = null } = {}) {
    const h = {
      ...BROWSER_HEADERS,
      ...(cookieHeader() ? { Cookie: cookieHeader() } : {}),
      ...(ajax ? { 'X-Requested-With': 'XMLHttpRequest' } : {}),
      ...(referer ? { Referer: referer } : {}),
      ...headers,
    };
    const res = await httpRequest(`${base}${path}`, { method, headers: h, body });
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

  /** my-work 三接口（登录态 cookie，一次拿全量「指派给我」）。 */
  async function fetchMyWork(kind) {
    const res = await request(`/my-work-${kind}.json`, { ajax: true, referer: `${base}/my.html` });
    const text = await res.text();
    if (text.includes('user-login')) {
      const err = new Error('禅道会话失效');
      err.code = 'SESSION_EXPIRED';
      throw err;
    }
    const d = unwrapEnvelope(text);
    // task/bug 列表是数组；story 是 dict（按 id 索引）
    if (kind === 'story') return Object.values(d.stories ?? {});
    return d[`${kind}s`] ?? [];
  }

  /** v1 详情接口（cookie 鉴权，通用）。 */
  async function fetchDetail(kind, id) {
    const res = await request(`/api.php/v1/${kind}s/${id}`);
    if (res.status === 404) throw new Error(`禅道${kind} #${id} 不存在`);
    if (res.status !== 200) throw new Error(`禅道详情请求失败（HTTP ${res.status}）`);
    return JSON.parse(await res.text());
  }

  return { login, restore, exportCookies, loggedIn, cookieHeader, fetchMyWork, fetchDetail, fetchV1Token, request, _jar: () => jar };
}
