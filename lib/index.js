// dsh-zentao-panel — host 插件入口
//
// 单包单插件（参照 dsh-pocket 模式）：
//   host 半边：本文件（登录/取数/缓存 + loopback RPC 通道）；
//   client 半边：client/client.js（悬浮按钮 + 侧滑面板，dsh.client 声明装载）。
// 数据协议见《计划书.md》附录 A（ZenTao 18.13 实测）。

import { createZentaoService } from './service.mjs';
import { installZentaoRpc } from './rpc.mjs';

const name = 'dsh-zentao-panel';
const inject = ['webServer', 'connection'];

export function apply(ctx, config = {}) {
  const logger = ctx.logger?.(name) ?? console;
  const service = createZentaoService({
    logger,
    cacheTtlMs: config.cacheTtlMs ?? 60_000,
  });

  // 启动即从本机配置恢复登录态（~/.dsh/zentao-panel/config.json）
  const boot = service.init();
  if (boot.configured) {
    logger.info(`dsh-zentao-panel: 恢复禅道配置（${boot.baseUrl}，账号 ${boot.account}）`);
  } else {
    logger.info('dsh-zentao-panel: 尚未配置禅道，等待面板内登录');
  }

  const disposeRpc = installZentaoRpc(ctx, { service, log: logger });

  return () => {
    try { disposeRpc?.(); } catch { /* 已清理 */ }
  };
}

export { name, inject };
