// dsh-zentao-panel — 配置与凭据持久化
//
// 位置：$DSH_HOME/zentao-panel/config.json（默认 ~/.dsh/zentao-panel/）
// 内容：baseUrl、account、密码（base64 混淆，非加密——本机文件已 0600）、
//       登录态 cookie 快照（za/zp/keepLogin，30 天免登）。
// 安全边界：仅本机；文件权限 0600；不进 git；卸载后可手动删除该目录。

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

export function readConfig() {
  try {
    const raw = readFileSync(configPath(), 'utf8');
    const d = JSON.parse(raw);
    return {
      baseUrl: typeof d.baseUrl === 'string' ? d.baseUrl : '',
      account: typeof d.account === 'string' ? d.account : '',
      password: typeof d.password === 'string' ? Buffer.from(d.password, 'base64').toString('utf8') : '',
      cookies: (d.cookies && typeof d.cookies === 'object') ? d.cookies : {},
      savedAt: typeof d.savedAt === 'number' ? d.savedAt : 0,
    };
  } catch {
    return { baseUrl: '', account: '', password: '', cookies: {}, savedAt: 0 };
  }
}

export function writeConfig({ baseUrl, account, password, cookies }) {
  mkdirSync(panelDir(), { recursive: true });
  const payload = {
    baseUrl,
    account,
    // base64 只是避免明文密码直接出现在文件里；真正的保护是 0600 权限 + 本机边界
    password: Buffer.from(password ?? '', 'utf8').toString('base64'),
    cookies: cookies ?? {},
    savedAt: Date.now(),
  };
  writeFileSync(configPath(), JSON.stringify(payload, null, 2) + '\n', { mode: 0o600 });
}

/** 清除全部本地凭据（面板「登出」用）。 */
export function clearConfig() {
  try {
    if (existsSync(configPath())) writeFileSync(configPath(), JSON.stringify({ savedAt: Date.now() }) + '\n', { mode: 0o600 });
  } catch { /* 忽略 */ }
}
