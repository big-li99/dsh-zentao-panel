// dsh-zentao-panel — 配置与凭据持久化（多账号，schema v2）
//
// 位置：$DSH_HOME/zentao-panel/config.json（默认 ~/.dsh/zentao-panel/）
// 内容：accounts[]（每条含 baseUrl、account、密码（base64 混淆，非加密——本机文件已 0600）、
//       登录态 cookie 快照（za/zp/keepLogin，30 天免登））+ activeId（当前激活账号）。
// 兼容：旧单账号格式（顶层 baseUrl/account/password/cookies）读取时自动迁移为一个账号记录，
//       下次落盘写成 v2；不在读取时改写文件。
// 安全边界：仅本机；文件权限 0600；不进 git；卸载后可手动删除该目录。

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

function panelDir() {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh');
  return join(home, 'zentao-panel');
}

function configPath() {
  return join(panelDir(), 'config.json');
}

/** 账号记录的稳定 id：同地址同账号重复登录 = 更新该记录而非新增。 */
export function accountId(baseUrl, account) {
  const key = `${String(baseUrl ?? '').replace(/\/+$/, '')}\n${String(account ?? '')}`;
  return createHash('sha1').update(key, 'utf8').digest('hex').slice(0, 12);
}

function normRecord(raw) {
  const baseUrl = typeof raw?.baseUrl === 'string' ? raw.baseUrl : '';
  const account = typeof raw?.account === 'string' ? raw.account : '';
  return {
    id: typeof raw?.id === 'string' && raw.id ? raw.id : accountId(baseUrl, account),
    baseUrl,
    account,
    password: typeof raw?.password === 'string' ? Buffer.from(raw.password, 'base64').toString('utf8') : '',
    cookies: (raw?.cookies && typeof raw.cookies === 'object') ? raw.cookies : {},
    savedAt: typeof raw?.savedAt === 'number' ? raw.savedAt : 0,
  };
}

const EMPTY = { version: 2, accounts: [], activeId: '', baseUrl: '', account: '', password: '', cookies: {}, savedAt: 0 };

export function readConfig() {
  try {
    const d = JSON.parse(readFileSync(configPath(), 'utf8'));
    let accounts;
    if (Array.isArray(d.accounts)) {
      accounts = d.accounts.filter((a) => a && typeof a.baseUrl === 'string' && a.baseUrl).map(normRecord);
    } else if (typeof d.baseUrl === 'string' && d.baseUrl) {
      accounts = [normRecord(d)]; // 旧单账号格式 → 迁移
    } else {
      return { ...EMPTY };
    }
    const activeId = (typeof d.activeId === 'string' && d.activeId && accounts.some((a) => a.id === d.activeId))
      ? d.activeId
      : (accounts[0]?.id ?? '');
    const cur = accounts.find((a) => a.id === activeId) ?? accounts[0];
    return {
      version: 2,
      accounts,
      activeId,
      // 兼容字段（旧调用方直接读 baseUrl/account/password/cookies），取激活账号
      baseUrl: cur?.baseUrl ?? '',
      account: cur?.account ?? '',
      password: cur?.password ?? '',
      cookies: cur?.cookies ?? {},
      savedAt: cur?.savedAt ?? 0,
    };
  } catch {
    return { ...EMPTY };
  }
}

/**
 * 落盘多账号配置。accounts 内 password 为明文（此处 base64 混淆后写入，真正的保护是 0600 + 本机边界）。
 * @param {{accounts:Array<{id:string,baseUrl:string,account:string,password:string,cookies:object,savedAt?:number}>, activeId?:string}} state
 */
export function writeConfig({ accounts, activeId }) {
  mkdirSync(panelDir(), { recursive: true });
  const list = (accounts ?? []).map((a) => ({
    id: a.id,
    baseUrl: a.baseUrl,
    account: a.account,
    password: Buffer.from(a.password ?? '', 'utf8').toString('base64'),
    cookies: a.cookies ?? {},
    savedAt: a.savedAt ?? Date.now(),
  }));
  const payload = { version: 2, accounts: list, activeId: activeId ?? list[0]?.id ?? '' };
  writeFileSync(configPath(), JSON.stringify(payload, null, 2) + '\n', { mode: 0o600 });
}

/** 清除全部本地凭据（最后一个账号也被移除时用）。 */
export function clearConfig() {
  try {
    if (existsSync(configPath())) writeFileSync(configPath(), JSON.stringify({ version: 2, accounts: [], savedAt: Date.now() }) + '\n', { mode: 0o600 });
  } catch { /* 忽略 */ }
}
