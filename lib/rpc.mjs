// dsh-zentao-panel — RPC 通道（client ⇄ host，loopback-only）
//
// 参照 dsh-pocket 的 web-rpc.js 模式（该模式在本机 DSH Desktop 0.2.1-rc.2 已验证）：
//   优先把 `/dsh-zentao-panel` 通道直接挂到本插件 inject 的 webServer 服务上，
//   复刻 dsh-client-connection 的 /api 传输语义（client-request 信封 → server-response）；
//   信任栅栏：ctx.connection.requestRejection（401/403），无该服务时兜底只放行 loopback。
//   回退路径：ctx.connection.rpc.handle（旧版 dsh / headless）。

const CHANNEL = '/dsh-zentao-panel';
const RPC_BODY_MAX = 8 * 1024 * 1024;
const ENDPOINT_SEGMENT_PATTERN = /^[A-Za-z0-9_$.-]+$/;
const INVALID_REQUEST_RPC_ID = 'invalid-request';
const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '::1']);

const ENDPOINTS = Object.freeze({
  status: 'zentao.status',
  login: 'zentao.login',
  logout: 'zentao.logout',
  mine: 'zentao.mine',
  detail: 'zentao.detail',
  image: 'zentao.image',
});

function ok(value) { return { ok: true, value }; }
function fail(code, message) {
  if (code === 'cancelled') return { ok: false, error: { code: 'cancelled', message, details: {} } };
  return { ok: false, error: { code: 'bad-request', message, details: { issues: [{ message }] } } };
}

function endpointFromPath(pathname) {
  if (!pathname.startsWith(`${CHANNEL}/`)) return undefined;
  const endpoint = pathname.slice(CHANNEL.length + 1);
  if (endpoint.split('/').some((seg) => seg === '' || seg === '.' || seg === '..' || !ENDPOINT_SEGMENT_PATTERN.test(seg))) {
    return undefined;
  }
  return endpoint;
}

function serverResponseJson(rpcId, result) {
  return JSON.stringify({ type: 'server-response', rpcId, result });
}

/** 旧版兜底：仅 loopback Host + 同源。 */
function isTrustedLoopbackRequest(req) {
  const host = req.headers?.host;
  if (!host) return false;
  const hostName = host.split(':')[0];
  if (!LOOPBACK_HOSTNAMES.has(hostName)) return false;
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  const origin = req.headers.origin;
  if (origin === undefined) return true;
  try { return new URL(origin).host === host; } catch { return false; }
}

/** RPC handler → fetch-shaped handler（复刻 dsh-client-connection wire 协议）。 */
function fetchHandler(handler, log) {
  return {
    async fetch(request) {
      const endpoint = endpointFromPath(new URL(request.url).pathname);
      if (request.method !== 'POST' || endpoint === undefined) {
        return new Response('not found', { status: 404 });
      }
      const mediaType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
      if (mediaType !== 'application/json') {
        return new Response('content type must be application/json', { status: 415 });
      }
      let body;
      try { body = await request.json(); } catch {
        return new Response('body is not JSON', { status: 400 });
      }
      const rpcId = body && typeof body.rpcId === 'string' ? body.rpcId : INVALID_REQUEST_RPC_ID;
      const method = body && typeof body.method === 'string' ? body.method : null;
      if (rpcId === INVALID_REQUEST_RPC_ID || method === null) {
        return new Response(
          serverResponseJson(INVALID_REQUEST_RPC_ID, {
            ok: false,
            error: { code: 'bad-request', message: 'invalid client-request message', details: { issues: [] } },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (method !== endpoint) {
        return new Response(
          serverResponseJson(rpcId, {
            ok: false,
            error: {
              code: 'bad-request',
              message: `method ${JSON.stringify(method)} does not match endpoint ${JSON.stringify(endpoint)}`,
              details: { issues: [] },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      try {
        const result = await handler(endpoint, body.payload, request.signal);
        return new Response(serverResponseJson(rpcId, result), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      } catch (err) {
        log.error?.('dsh-zentao-panel: rpc %s failed: %s', endpoint, err?.message ?? err);
        return new Response(`handler failure: ${String(err)}`, { status: 500 });
      }
    },
  };
}

/** node:http 请求 → fetch handler → node:http 响应桥接（流式，带背压与体积上限）。 */
async function httpBridge(req, res, fetchFn, maxBodyBytes) {
  const abort = new AbortController();
  res.on('close', () => { if (!res.writableEnded) abort.abort(); });

  const declaredLen = req.headers['content-length'];
  if (declaredLen !== undefined && Number(declaredLen) > maxBodyBytes) {
    res.writeHead(413, { connection: 'close' });
    res.end();
    req.destroy();
    return;
  }
  const chunks = [];
  let received = 0;
  let tooLarge = false;
  for await (const chunk of req) {
    received += chunk.length;
    if (received > maxBodyBytes) { tooLarge = true; break; }
    chunks.push(chunk);
  }
  if (tooLarge) {
    res.writeHead(413, { connection: 'close' });
    res.end();
    req.destroy();
    return;
  }

  const url = `http://${req.headers.host ?? '127.0.0.1'}${req.url}`;
  const init = {
    method: req.method ?? 'GET',
    headers: Object.fromEntries(Object.entries(req.headers).filter(([, v]) => typeof v === 'string')),
    signal: abort.signal,
  };
  if (chunks.length > 0) init.body = Buffer.concat(chunks);
  const request = new Request(url, init);

  const response = await fetchFn.fetch(request);
  const headers = Object.fromEntries(response.headers.entries());
  res.writeHead(response.status, headers);
  if (response.body === null) { res.end(); return; }
  for await (const chunk of response.body) {
    if (!res.write(chunk)) {
      await new Promise((resolve) => {
        const done = () => { res.off('drain', done); res.off('close', done); resolve(); };
        res.once('drain', done);
        res.once('close', done);
      });
    }
    if (res.writableEnded) break;
  }
  res.end();
}

/** 把 CHANNEL 挂到 webServer（返回清理函数；无 webServer 返回 null）。 */
function mountWebRoute(ctx, { handler, log }) {
  const webServer = ctx?.webServer;
  if (!webServer || typeof webServer.register !== 'function') return null;
  // requestRejection 必须以方法形式调用（内部读 this.trustedHosts / this.browserAuth）
  const connection = ctx?.connection;
  const fetchFn = fetchHandler(handler, log);
  const route = {
    kind: 'prefix',
    path: CHANNEL,
    handler: async (req, res) => {
      let rejection;
      if (typeof connection?.requestRejection === 'function') {
        try { rejection = connection.requestRejection(req); } catch { rejection = 403; }
      } else if (!isTrustedLoopbackRequest(req)) {
        rejection = 403;
      }
      if (rejection !== undefined) {
        res.writeHead(rejection, { 'content-type': 'text/plain; charset=utf-8' });
        res.end(rejection === 401 ? 'unauthorized' : 'forbidden');
        return;
      }
      await httpBridge(req, res, fetchFn, RPC_BODY_MAX);
    },
  };
  const registered = webServer.register(route);
  const cleanup = typeof registered === 'function'
    ? () => { try { registered(); } catch { /* 已清理 */ } }
    : (registered && typeof registered.then === 'function')
      ? (() => { let done = false; return async () => { if (done) return; done = true; try { const d = await registered; if (typeof d === 'function') d(); } catch { /* 已清理 */ } }; })()
      : () => {};
  return cleanup;
}

/**
 * 注册 RPC 通道。返回 disposer。
 * @param {import('cordis').Context} ctx host cordis context（需 inject webServer / connection）
 * @param {{service:object, log?:object}} deps
 */
export function installZentaoRpc(ctx, { service, log = console }) {
  const handler = async (endpoint, payload = {}, signal) => {
    if (signal?.aborted) return fail('cancelled', 'The request was cancelled.');
    try {
      if (endpoint === ENDPOINTS.status) {
        return ok(service.status());
      }
      if (endpoint === ENDPOINTS.login) {
        const baseUrl = String(payload?.baseUrl ?? '').trim();
        const account = String(payload?.account ?? '').trim();
        const password = String(payload?.password ?? '');
        if (!/^https?:\/\/.+/.test(baseUrl)) return fail('bad-request', '禅道地址必须以 http:// 或 https:// 开头');
        if (!account || !password) return fail('bad-request', '账号和密码不能为空');
        service.configure({ baseUrl, account, password });
        await service.ensureLogin();
        return ok(service.status());
      }
      if (endpoint === ENDPOINTS.logout) {
        service.logout();
        return ok(service.status());
      }
      if (endpoint === ENDPOINTS.mine) {
        const data = await service.fetchMine({ refresh: payload?.refresh === true });
        return ok(data);
      }
      if (endpoint === ENDPOINTS.detail) {
        const kind = ['task', 'bug', 'story'].includes(payload?.kind) ? payload.kind : null;
        const id = Number(payload?.id);
        if (!kind || !Number.isInteger(id) || id <= 0) return fail('bad-request', '参数非法（kind + id 必填）');
        return ok(await service.fetchDetail(kind, id));
      }
      if (endpoint === ENDPOINTS.image) {
        const url = typeof payload?.url === 'string' ? payload.url.trim() : '';
        if (!url || url.length > 2048) return fail('bad-request', '参数非法（url 必填）');
        return ok(await service.fetchImage(url));
      }
      return fail('bad-request', `Unknown endpoint: ${endpoint}`);
    } catch (err) {
      if (err?.code === 'NEED_LOGIN') {
        return fail('bad-request', '禅道会话失效且本地无凭据，请重新登录 | ZenTao session expired, please log in again');
      }
      log.error?.('dsh-zentao-panel: rpc %s failed: %s', endpoint, err?.message ?? err);
      return fail('bad-request', err?.message ?? String(err));
    }
  };

  const directMount = mountWebRoute(ctx, { handler, log });
  if (directMount) return directMount;

  if (!ctx?.connection?.rpc?.handle) {
    log.warn?.('dsh-zentao-panel: Host RPC unavailable — panel disabled | 无可用 RPC 通道，面板不可用');
    return () => {};
  }
  return ctx.connection.rpc.handle(CHANNEL, handler, { authority: 'loopback' });
}

export { CHANNEL, ENDPOINTS };
