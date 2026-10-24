// dsh-zentao-panel — client 半边（右侧栏 tab + 起始页引导卡片）
//
// 入口形态参照 dsh-context 的「上下文」：注册到右侧栏的 sidebarRightTabs，
// 在「开始」引导页里呈现为一张卡片，点开后在右侧栏里作为 tab 打开（可停靠/浮窗/分屏）。
//
// 主题：DSH 用 body[data-ds-dark-theme] 切暗色，颜色全部来自 --dsw-alias-* 语义 token，
// 所以日间/夜间无需任何 JS 判断，自动跟随。
// （旧版用的 --dsw-alias-border-subtle / --dsw-alias-bg-canvas-subtle 等变量在 0.2.1-rc.2
//   并不存在，回落到 #fff 兜底色，正是夜间模式错色的根源。）
//
// 装载方式（参照 dsh-notify-me）：dsh.client 声明 → dsh-client-modules 以
// /plugins/dsh-zentao-panel/client.js 提供 → window.__ModuleLoader__.load 执行。
// 数据通道：ctx.connection.rpc.call('/dsh-zentao-panel', endpoint, payload) → host 半边的 loopback RPC。
(function (root) {
  if (!root || !root.__ModuleLoader__ || typeof root.__ModuleLoader__.load !== 'function') return;

  root.__ModuleLoader__.load({
    id: 'dsh-zentao-panel',
    factory: (require) => {
      var module = { exports: {} };
      var exports = module.exports;
      Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

      var React = null;
      try { React = require('react'); } catch (e) { React = null; }
      if (!React || typeof React.createElement !== 'function') return module.exports;
      var h = React.createElement;
      var useState = React.useState, useEffect = React.useEffect, useMemo = React.useMemo, useCallback = React.useCallback;

      var CHANNEL = '/dsh-zentao-panel';
      var TAB_ID = 'dsh-zentao-panel';
      var TAB_KIND = 'zentao';

      // ───────────────────────── 样式 ─────────────────────────
      // 只用 DSH 的语义 token：bg-layer-1/2、border-l1..l4、label-primary/secondary/tertiary、
      // state-error/success/warn/business、interactive-bg-hover(-solid)、toast-bg… 全部随主题翻转。
      var CSS = [
        // 根容器：右侧栏 tab body 是 flex 列，自身不画背景，吃面板底色
        '.ztp-root{height:100%;min-height:0;display:flex;flex-direction:column;flex:auto;color:var(--dsw-alias-label-primary);font-size:var(--dsh-content-font-size-secondary,13px);line-height:1.5;}',

        // 头部（38px，与 DSH 各面板保持一致）
        '.ztp-head{flex:none;display:flex;align-items:center;gap:2px;height:38px;padding:0 6px 0 10px;border-bottom:.5px solid var(--dsw-alias-border-l3);box-sizing:border-box;}',
        '.ztp-head-title{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary);padding-left:4px;}',
        '.ztp-seg{display:flex;align-items:center;gap:2px;min-width:0;overflow-x:auto;scrollbar-width:none;}',
        '.ztp-seg::-webkit-scrollbar{display:none;}',
        '.ztp-seg-btn{appearance:none;border:0;background:transparent;font:inherit;font-size:12.5px;line-height:1;color:var(--dsw-alias-label-secondary);height:26px;padding:0 10px;border-radius:999px;display:inline-flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap;}',
        '.ztp-seg-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);}',
        '.ztp-seg-btn[aria-selected="true"]{background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-primary);font-weight:600;}',
        '.ztp-num{font-size:11px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-tertiary);font-weight:400;}',
        '.ztp-seg-btn[aria-selected="true"] .ztp-num{color:var(--dsw-alias-label-secondary);}',
        '.ztp-grow{flex:1;min-width:6px;}',

        // 图标按钮
        '.ztp-tool{width:28px;height:28px;flex:none;display:inline-flex;align-items:center;justify-content:center;padding:6px;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;line-height:1;box-sizing:border-box;}',
        '.ztp-tool:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);}',
        '.ztp-tool svg{width:15px;height:15px;}',
        '.ztp-spin{width:14px;height:14px;border-radius:50%;border:1.5px solid var(--dsw-alias-border-l4);border-top-color:var(--dsw-alias-label-secondary);animation:ztp-rot .8s linear infinite;box-sizing:border-box;}',
        '@keyframes ztp-rot{to{transform:rotate(360deg)}}',

        // 滚动区
        '.ztp-scroll{flex:1;min-height:0;overflow:auto;scrollbar-gutter:stable;padding:8px 10px 14px;box-sizing:border-box;}',

        // 卡片
        '.ztp-card{position:relative;display:block;width:100%;box-sizing:border-box;text-align:left;font:inherit;color:inherit;background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-lg);padding:10px 12px 10px 14px;margin:0 0 8px;cursor:pointer;transition:background .12s ease,border-color .12s ease;}',
        '.ztp-card:hover{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l4);}',
        '.ztp-card:active{background:var(--dsw-alias-interactive-bg-active);}',
        '.ztp-card:before{content:"";position:absolute;left:0;top:14px;bottom:14px;width:2px;border-radius:0 2px 2px 0;background:var(--ztp-c,transparent);opacity:.7;}',
        '.ztp-k-task{--ztp-c:var(--dsw-alias-state-business-primary);}',
        '.ztp-k-bug{--ztp-c:var(--dsw-alias-state-error-primary);}',
        '.ztp-k-story{--ztp-c:var(--dsw-alias-state-success-primary);}',
        '.ztp-row{display:flex;align-items:center;gap:6px;min-width:0;}',
        '.ztp-id{font-size:11px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;flex:none;}',
        '.ztp-card-title{margin-top:4px;font-size:13px;line-height:1.45;color:var(--dsw-alias-label-primary);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word;}',

        // 类型标签
        '.ztp-tag{display:inline-flex;align-items:center;height:18px;padding:0 7px;border-radius:999px;font-size:11px;font-weight:500;flex:none;line-height:18px;}',
        '.ztp-tag.task{color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 14%,transparent);}',
        '.ztp-tag.bug{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 14%,transparent);}',
        '.ztp-tag.story{color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 14%,transparent);}',

        // 元信息
        '.ztp-meta{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;margin-top:6px;font-size:11.5px;color:var(--dsw-alias-label-tertiary);}',
        '.ztp-st{display:inline-flex;align-items:center;gap:5px;color:var(--dsw-alias-label-secondary);}',
        '.ztp-dot{width:6px;height:6px;border-radius:50%;background:currentColor;flex:none;}',
        '.ztp-st-active{color:var(--dsw-alias-state-business-primary);}',
        '.ztp-st-done{color:var(--dsw-alias-state-success-primary);}',
        '.ztp-st-warn{color:var(--dsw-alias-state-warn-primary);}',
        '.ztp-st-idle{color:var(--dsw-alias-label-tertiary);}',
        '.ztp-pri{font-weight:500;color:var(--dsw-alias-label-secondary);}',
        '.ztp-pri.p1{color:var(--dsw-alias-state-error-primary);}',
        '.ztp-pri.p2{color:var(--dsw-alias-state-warn-primary);}',
        '.ztp-warn{color:var(--dsw-alias-state-warn-primary);}',

        // 按钮
        '.ztp-acts{display:flex;justify-content:flex-end;gap:6px;margin-top:8px;}',
        '.ztp-btn{appearance:none;font:inherit;font-size:12px;line-height:1;height:26px;padding:0 10px;border-radius:var(--dsw-radius-sm);border:.5px solid var(--dsw-alias-border-l3);background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;box-sizing:border-box;}',
        '.ztp-btn:hover{background:var(--dsw-alias-interactive-bg-hover);}',
        '.ztp-btn.primary{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground);border-color:transparent;}',
        '.ztp-btn.primary:hover{background:var(--dsw-alias-button-primary-hover);}',
        '.ztp-btn:disabled{opacity:.45;cursor:default;}',
        '.ztp-btn svg{width:13px;height:13px;}',

        // 空态 / 骨架 / 错误
        '.ztp-empty{padding:44px 16px;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:12.5px;line-height:1.7;}',
        '.ztp-skel{height:76px;border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-skeleton);border:.5px solid var(--dsw-alias-border-l1);margin-bottom:8px;animation:ztp-pulse 1.5s ease-in-out infinite;}',
        '@keyframes ztp-pulse{0%,100%{opacity:.5}50%{opacity:.95}}',
        '.ztp-err{margin:8px 0;padding:8px 10px;border-radius:var(--dsw-radius-md);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent);color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:1.55;}',
        '.ztp-err-row{display:flex;align-items:center;gap:8px;justify-content:space-between;}',
        '.ztp-err-retry{appearance:none;border:.5px solid currentColor;background:transparent;color:inherit;font:inherit;font-size:11.5px;height:22px;padding:0 8px;border-radius:var(--dsw-radius-sm);cursor:pointer;flex:none;}',

        // 页脚
        '.ztp-foot{flex:none;display:flex;align-items:center;gap:8px;height:28px;padding:0 12px;border-top:.5px solid var(--dsw-alias-border-l1);font-size:11px;color:var(--dsw-alias-label-tertiary);box-sizing:border-box;overflow:hidden;white-space:nowrap;}',
        '.ztp-foot-dim{opacity:.75;}',

        // 详情
        '.ztp-detail-bar{display:flex;align-items:center;gap:8px;margin:0 0 8px;}',
        '.ztp-back{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;height:24px;padding:0 6px 0 2px;border-radius:var(--dsw-radius-sm);cursor:pointer;display:inline-flex;align-items:center;gap:3px;}',
        '.ztp-back:hover{color:var(--dsw-alias-label-primary);}',
        '.ztp-back svg{width:13px;height:13px;}',
        '.ztp-link{margin-left:auto;color:var(--dsw-alias-link);text-decoration:none;font-size:12px;display:inline-flex;align-items:center;gap:3px;}',
        '.ztp-link:hover{text-decoration:underline;}',
        '.ztp-link svg{width:12px;height:12px;}',
        '.ztp-panel-card{border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1);padding:12px;}',
        '.ztp-detail-title{margin-top:6px;font-size:14px;line-height:1.5;font-weight:600;color:var(--dsw-alias-label-primary);word-break:break-word;}',
        '.ztp-kv{display:grid;grid-template-columns:auto 1fr;gap:3px 12px;margin-top:10px;font-size:12px;color:var(--dsw-alias-label-secondary);}',
        '.ztp-kv dt{color:var(--dsw-alias-label-tertiary);white-space:nowrap;}',
        '.ztp-kv dd{margin:0;word-break:break-word;}',
        '.ztp-desc{margin-top:10px;padding:10px 12px;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);font-size:12.5px;line-height:1.7;white-space:pre-wrap;word-break:break-word;}',
        '.ztp-section{font-size:11.5px;color:var(--dsw-alias-label-tertiary);margin:14px 2px 6px;}',
        '.ztp-hint{margin:8px 0 0;font-size:11.5px;line-height:1.55;color:var(--dsw-alias-label-tertiary);}',

        // 登录
        '.ztp-fill{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;}',
        '.ztp-login{flex:1;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;padding:24px 20px;}',        '.ztp-login-mark{width:44px;height:44px;border-radius:var(--dsw-radius-md);display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 12%,transparent);color:var(--dsw-alias-state-business-primary);margin-bottom:14px;}',
        '.ztp-login-title{font-size:15px;font-weight:600;color:var(--dsw-alias-label-primary);}',
        '.ztp-login-sub{margin:6px 0 16px;font-size:12px;line-height:1.7;color:var(--dsw-alias-label-tertiary);}',
        '.ztp-label{display:block;font-size:12px;color:var(--dsw-alias-label-secondary);margin:12px 0 5px;}',
        '.ztp-input{width:100%;height:32px;box-sizing:border-box;padding:0 10px;border-radius:var(--dsw-radius-md);border:.5px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;outline:none;}',
        '.ztp-input::placeholder{color:var(--dsw-alias-label-caption);}',
        '.ztp-input:focus{border-color:var(--dsw-alias-border-l4);box-shadow:0 0 0 1px var(--dsw-alias-border-l4);}',

        // 轻提示
        '.ztp-toast{position:fixed;left:50%;bottom:44px;transform:translateX(-50%);z-index:2147483000;max-width:min(420px,80vw);background:var(--dsw-alias-toast-bg);color:var(--dsw-alias-toast-label);border-radius:var(--dsw-radius-md);padding:8px 14px;font-size:12.5px;line-height:1.5;box-shadow:var(--dsw-shadow-lv3);}',

        // 多账号：头部账号 chip + 账号管理弹出层
        '.ztp-acct{display:inline-flex;align-items:center;gap:4px;height:26px;padding:0 8px;border-radius:999px;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer;max-width:150px;flex:none;}',
        '.ztp-acct:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);}',
        '.ztp-acct-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
        '.ztp-acct svg{width:11px;height:11px;flex:none;opacity:.7;}',
        '.ztp-acct-layer{position:fixed;inset:0;z-index:2147482000;}',
        '.ztp-acct-pop{position:absolute;right:8px;top:44px;z-index:2147482001;min-width:230px;max-width:300px;padding:6px;border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l3);box-shadow:var(--dsw-shadow-lv3);}',
        '.ztp-acct-row{display:flex;align-items:center;gap:8px;width:100%;box-sizing:border-box;padding:7px 8px;border-radius:var(--dsw-radius-md);border:0;background:transparent;font:inherit;text-align:left;cursor:pointer;color:var(--dsw-alias-label-primary);}',
        '.ztp-acct-row:hover{background:var(--dsw-alias-interactive-bg-hover);}',
        '.ztp-acct-row.on{background:var(--dsw-alias-interactive-bg-hover-solid);}',
        '.ztp-acct-main{flex:1;min-width:0;}',
        '.ztp-acct-name{display:block;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
        '.ztp-acct-host{display:block;font-size:11px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
        '.ztp-acct-del{width:22px;height:22px;flex:none;display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;}',
        '.ztp-acct-del:hover{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent);color:var(--dsw-alias-state-error-primary);}',
        '.ztp-acct-del svg{width:12px;height:12px;}',
        '.ztp-acct-add{display:flex;align-items:center;gap:6px;width:100%;box-sizing:border-box;margin-top:3px;padding:7px 8px;border-radius:var(--dsw-radius-md);border:0;border-top:.5px solid var(--dsw-alias-border-l1);background:transparent;font:inherit;font-size:12.5px;color:var(--dsw-alias-label-secondary);cursor:pointer;}',
        '.ztp-acct-add:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);}',
        '.ztp-acct-add svg{width:13px;height:13px;}',

        // 「处理」确认弹层：先选工作区与模型，再新建会话下发
        '.ztp-disp-layer{position:fixed;inset:0;z-index:2147482000;display:flex;align-items:center;justify-content:center;background:var(--dsw-alias-bg-mask-2);}',
        '.ztp-disp-pop{width:min(360px,92vw);box-sizing:border-box;padding:16px;border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l3);box-shadow:var(--dsw-shadow-lv3);animation:ztp-pop .14s ease-out;}',
        '@keyframes ztp-pop{from{transform:scale(.97);opacity:.6}to{transform:none;opacity:1}}',
        '.ztp-disp-title{font-size:13.5px;font-weight:600;color:var(--dsw-alias-label-primary);}',
        '.ztp-disp-sub{margin:5px 0 2px;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-tertiary);word-break:break-word;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}',
        '.ztp-disp-acts{display:flex;gap:8px;margin-top:16px;}',
        '.ztp-disp-acts .ztp-btn{flex:1;height:30px;justify-content:center;}',
        '.ztp-disp-note{margin-top:10px;font-size:11px;color:var(--dsw-alias-label-caption);line-height:1.6;}',

        // 兜底：没有 sidebarRightTabs 的旧版 DSH 用悬浮入口
        '.ztp-fab{position:fixed;right:0;top:50%;transform:translateY(-50%);z-index:9000;display:flex;align-items:center;justify-content:center;height:44px;padding:0 7px;border:.5px solid var(--dsw-alias-border-l3);border-right:none;border-radius:var(--dsw-radius-md) 0 0 var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);box-shadow:var(--dsw-shadow-lv2);cursor:pointer;}',
        '.ztp-fab:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);}',
        '.ztp-fab svg{width:18px;height:18px;}',
        '.ztp-mask{position:fixed;inset:0;z-index:9000;background:var(--dsw-alias-bg-mask-2);}',
        '.ztp-flyout{position:fixed;top:0;right:0;bottom:0;z-index:9001;width:min(420px,92vw);display:flex;flex-direction:column;background:var(--dsw-alias-bg-base);border-left:.5px solid var(--dsw-alias-border-l3);box-shadow:var(--dsw-shadow-lv3);animation:ztp-slide .16s ease-out;}',
        '@keyframes ztp-slide{from{transform:translateX(24px);opacity:.5}to{transform:none;opacity:1}}',
      ].join('\n');

      var cssInjected = false;
      function injectCss() {
        if (cssInjected || typeof document === 'undefined') return;
        cssInjected = true;
        var el = document.createElement('style');
        el.setAttribute('data-dsh-zentao-panel', '1');
        el.textContent = CSS;
        document.head.appendChild(el);
      }

      // ───────────────────────── 图标 ─────────────────────────
      /** 禅道标记：卡片 + 清单勾，与 DSH 16px 线性图标同语言。 */
      function ZentaoGlyph(props) {
        var size = (props && props.size) || 16;
        return h('svg', {
          width: size, height: size, viewBox: '0 0 16 16', fill: 'none',
          'aria-hidden': 'true', className: props && props.className,
        },
          h('rect', { x: 2.3, y: 3.3, width: 11.4, height: 9.4, rx: 2.2, stroke: 'currentColor', strokeWidth: 1.1 }),
          h('path', { d: 'M4.9 6.4h2.7M4.9 9.5h2.2', stroke: 'currentColor', strokeWidth: 1.1, strokeLinecap: 'round' }),
          h('path', { d: 'M9.3 9.3l1.1 1.1 2.1-2.3', stroke: 'currentColor', strokeWidth: 1.1, strokeLinecap: 'round', strokeLinejoin: 'round' }),
        );
      }
      function RefreshIcon() {
        return h('svg', { viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
          h('path', { d: 'M13.1 8a5.1 5.1 0 1 1-1.55-3.67', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round' }),
          h('path', { d: 'M13.3 2.9v2.6h-2.6', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round', strokeLinejoin: 'round' }),
        );
      }
      function LogoutIcon() {
        return h('svg', { viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
          h('path', { d: 'M6.5 2.9H3.9c-.66 0-1.2.54-1.2 1.2v7.8c0 .66.54 1.2 1.2 1.2h2.6', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round' }),
          h('path', { d: 'M10.4 5.3L13.1 8l-2.7 2.7M12.8 8H6.6', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round', strokeLinejoin: 'round' }),
        );
      }
      function BackIcon() {
        return h('svg', { viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
          h('path', { d: 'M9.8 3.6L5.4 8l4.4 4.4', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round' }),
        );
      }
      function CloseIcon() {
        return h('svg', { viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
          h('path', { d: 'M4.4 4.4l7.2 7.2M11.6 4.4l-7.2 7.2', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round' }),
        );
      }
      function LinkIcon() {
        return h('svg', { viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
          h('path', { d: 'M6.4 9.6l3.2-3.2', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round' }),
          h('path', { d: 'M7.2 4.6l1-1a2.6 2.6 0 0 1 3.7 3.7l-1 1M8.8 11.4l-1 1a2.6 2.6 0 0 1-3.7-3.7l1-1', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round' }),
        );
      }
      function ChevronDownIcon() {
        return h('svg', { viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
          h('path', { d: 'M4.2 6.2L8 10l3.8-3.8', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round' }),
        );
      }
      function PlusIcon() {
        return h('svg', { viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
          h('path', { d: 'M8 3.4v9.2M3.4 8h9.2', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' }),
        );
      }
      function TrashIcon() {
        return h('svg', { viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
          h('path', { d: 'M3 4.6h10M6.4 4.6V3.4h3.2v1.2M4.4 4.6l.5 8c.03.5.45.8.95.8h4.3c.5 0 .92-.3.95-.8l.5-8', stroke: 'currentColor', strokeWidth: 1.1, strokeLinecap: 'round', strokeLinejoin: 'round' }),
        );
      }

      // ───────────────────────── 数据/文案工具 ─────────────────────────
      var KIND_LABEL = { task: '任务', bug: 'Bug', story: '需求' };
      var KIND_ORDER = ['task', 'bug', 'story'];
      var STATUS_LABEL = {
        wait: '未开始', doing: '进行中', done: '已完成', closed: '已关闭', cancel: '已取消', pause: '已暂停',
        active: '激活', resolved: '已解决', reviewing: '评审中', draft: '草稿', changed: '已变更', postponed: '已延期',
      };
      // 状态语义色：doing/active 蓝、done/closed 绿、pause/postponed 黄、其余灰
      var STATUS_TONE = {
        wait: 'idle', doing: 'active', done: 'done', closed: 'idle', cancel: 'idle', pause: 'warn',
        active: 'active', resolved: 'done', reviewing: 'active', draft: 'idle', changed: 'active', postponed: 'warn',
      };

      function statusLabel(s) { return STATUS_LABEL[s] ?? s ?? ''; }
      function statusTone(s) { return STATUS_TONE[s] ?? 'idle'; }
      function fmtDate(d) { return d ? String(d).slice(0, 10) : ''; }

      /** 下拉里的目录缩短显示：保留首段 + 尾两段。 */
      function shortenPath(p) {
        p = String(p || '');
        if (p.length <= 38) return p;
        var parts = p.split('/');
        if (parts.length <= 3) return p;
        return parts[0] + '/…/' + parts.slice(-2).join('/');
      }
      /** 禅道地址 → 短主机名（账号列表里区分不同实例用）。 */
      function hostOf(baseUrl) {
        try { return new URL(baseUrl).host; } catch (e) {
          return String(baseUrl || '').replace(/^https?:\/\//, '').split('/')[0];
        }
      }
      /** 距截止 ≤3 天标黄。 */
      function isUrgent(d) {
        if (!d) return false;
        var t = Date.parse(String(d).slice(0, 10) + 'T23:59:59');
        if (!Number.isFinite(t)) return false;
        var days = (t - Date.now()) / 86400000;
        return days >= 0 && days <= 3;
      }

      /**
       * 描述文本里去掉图片占位标记（`[图片：35861.png]` / `[图片]`）。
       * 图片本身会作为真实附件插入，文本里不再保留占位符。
       */
      function stripImageMarkers(text) {
        return String(text ?? '')
          .replace(/[ \t]*\[图片(?:[：:][^\]\n]*)?\][ \t]*/g, '')
          .replace(/[ \t]+\n/g, '\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
      }

      /** 卡片 → 精简 Markdown（M3：插入输入框 / 新会话用；标题 + 描述/重现步骤，图片走真实附件） */
      function cardToMarkdown(card, detail) {
        var lines = [];
        lines.push('## 禅道' + (KIND_LABEL[card.kind] || card.kind) + ' #' + card.id + '：' + card.title);
        var desc = stripImageMarkers((detail && detail.desc) || card.descBrief || '');
        if (desc) {
          lines.push('');
          lines.push(card.kind === 'bug' ? '### 重现步骤/描述' : '### 描述');
          lines.push(desc);
        }
        return lines.join('\n');
      }

      // ───────────────────────── composer 写入（M3）─────────────────────────
      // DSH 的 composer 是 contenteditable（Lexical 受控），稳定挂点是 [data-composer-input]。
      // 必须走 execCommand insertText（或 textContent + input 事件），直接改 DOM 不会同步内部状态。
      function fillComposerEditable(text) {
        var editable = document.querySelector('[data-composer-input]');
        if (!editable) return false;
        try { editable.focus(); } catch (e) { /* 忽略 */ }
        var selection = typeof document.getSelection === 'function' ? document.getSelection() : null;
        if (selection) {
          try {
            var range = document.createRange();
            range.selectNodeContents(editable);
            selection.removeAllRanges();
            selection.addRange(range);
          } catch (e) { /* 忽略 */ }
        }
        var ok = false;
        try { ok = document.execCommand('insertText', false, text); } catch (e) { ok = false; }
        if (ok) return true;
        editable.textContent = text;
        editable.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }
      function tryInsertIntoComposer(md) {
        if (fillComposerEditable(md)) return true;
        // 兜底：旧版 textarea composer（原生 value setter + input 事件）
        var ta = document.querySelector('textarea[placeholder], form textarea');
        if (ta && !ta.readOnly && !ta.disabled) {
          var start = ta.selectionStart ?? ta.value.length;
          var end = ta.selectionEnd ?? ta.value.length;
          var v = ta.value.slice(0, start) + md + ta.value.slice(end);
          var setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
          setter.call(ta, v);
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          try { ta.focus(); } catch (e) { /* 忽略 */ }
          return true;
        }
        return false;
      }

      // ─────────────── 服务懒查找（dsh-notify-me lookupService 模式）───────────────
      // cordis inject 是硬门槛（服务不就绪插件就不激活），这里用 ctx.get() 懒解析：
      // 服务缺失时面板照常工作，只有「处理」降级。
      function lookupService(name) {
        var svc = null;
        try { if (appCtx && typeof appCtx.get === 'function') svc = appCtx.get(name) || null; } catch (e) { svc = null; }
        if (svc) return svc;
        try { if (appCtx && appCtx.reflect && typeof appCtx.reflect.get === 'function') svc = appCtx.reflect.get(name) || null; } catch (e) { svc = null; }
        if (svc) return svc;
        try { if (appCtx && name in appCtx) svc = appCtx[name] || null; } catch (e) { svc = null; }
        return svc;
      }

      // 当前主视图会话 id（dsh-notify-me currentSessionId 模式：st.current 或 mainView retain）
      function currentSessionId(sessions) {
        try {
          var st = sessions.list.getSnapshot();
          if (st && typeof st.current === 'string' && st.current) return st.current;
          var byId = (st && st.byId) || {};
          for (var id in byId) {
            var row = byId[id];
            if (row && row.retainedBy && (row.retainedBy.mainView || 0) > 0) return id;
          }
        } catch (e) { /* 忽略 */ }
        return null;
      }

      /** host RPC（模块级，方便附件辅助函数复用）。 */
      function rpcCall(endpoint, payload) {
        if (!appCtx || !appCtx.connection || !appCtx.connection.rpc || typeof appCtx.connection.rpc.call !== 'function') {
          return Promise.reject(new Error('RPC unavailable'));
        }
        return appCtx.connection.rpc.call(CHANNEL, endpoint, payload || {});
      }

      /** 当前会话的输入目标：{sessionId, scope, facade, conversation}；不可用时 null。 */
      function currentInputTarget() {
        try {
          var sessions = lookupService('sessions');
          var conversation = lookupService('conversation');
          if (!sessions || !conversation || !conversation.input) return null;
          var cur = currentSessionId(sessions);
          if (!cur) return null;
          var scope = null;
          try { scope = sessions.scope(cur); } catch (e) { scope = null; }
          if (!scope) return null;
          var facade = null;
          try { facade = conversation.input.for(scope); } catch (e) { facade = null; }
          if (!facade) return null;
          return { sessionId: cur, scope: scope, facade: facade, conversation: conversation };
        } catch (e) { return null; }
      }

      /** base64 → Uint8Array（浏览器 atob；不依赖 Buffer）。 */
      function bytesFromBase64(b64) {
        var bin = atob(b64);
        var len = bin.length;
        var out = new Uint8Array(len);
        for (var i = 0; i < len; i++) out[i] = bin.charCodeAt(i);
        return out;
      }

      /** 卡片/详情里的图片引用（host 已把禅道 HTML 里的 <img> 归一成可下载地址）。 */
      function imagesOf(card, detail) {
        var list = (detail && detail.images) || (card && card.images) || [];
        if (!Array.isArray(list)) return [];
        return list.filter(function (x) { return x && typeof x.url === 'string' && x.url; });
      }

      /** DSH 附件上限（dsh-attachment-local 默认）：单边 ≤8192、总像素 ≤64MP、单图 ≤20MB。 */
      var IMAGE_MAX_DIMENSION = 8192;
      var IMAGE_MAX_PIXELS = 64000000;
      var IMAGE_MAX_BYTES = 20 * 1024 * 1024;

      /**
       * 超大截图先缩到 2048 长边（DSH 入库本来就会归一化到 ≤2048）。
       * 不做这步时超限图会让整条 prompt 被宿主拒绝（IMAGE_DIMENSION_TOO_LARGE / IMAGE_TOO_MANY_PIXELS）。
       */
      function normalizeImageFile(file) {
        if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return Promise.resolve(file);
        return Promise.resolve(createImageBitmap(file)).then(function (bmp) {
          var w = bmp.width, h = bmp.height;
          var oversized = w > IMAGE_MAX_DIMENSION || h > IMAGE_MAX_DIMENSION
            || (w * h) > IMAGE_MAX_PIXELS || (file.size || 0) > IMAGE_MAX_BYTES;
          if (!oversized) {
            try { if (typeof bmp.close === 'function') bmp.close(); } catch (e) { /* 忽略 */ }
            return file;
          }
          var scale = Math.min(2048 / Math.max(w, h), 1);
          var cw = Math.max(1, Math.round(w * scale));
          var ch = Math.max(1, Math.round(h * scale));
          try {
            var canvas = document.createElement('canvas');
            canvas.width = cw; canvas.height = ch;
            var g = canvas.getContext('2d');
            g.drawImage(bmp, 0, 0, cw, ch);
            try { if (typeof bmp.close === 'function') bmp.close(); } catch (e) { /* 忽略 */ }
            return new Promise(function (resolve) {
              try {
                canvas.toBlob(function (blob) {
                  if (!blob) { resolve(file); return; }
                  var baseName = String(file.name || 'image').replace(/\.[^.]+$/, '');
                  resolve(new File([blob], baseName + '.png', { type: 'image/png' }));
                }, 'image/png');
              } catch (e) { resolve(file); }
            });
          } catch (e) { return file; }
        }, function () { return file; });
      }

      /**
       * 真实图片附件：禅道图片 bytes → 浏览器 File → DSH 草稿附件 → addAttachments。
       * DSH 0.2.1-rc.2 的会话服务契约（app.asar 源码确认）：
       *   conversation.createDrafts(sessionId, File[]) → [{id, kind:'image', previewUrl}]
       *   conversation.input.for(scope).addAttachments(ids) → 挂到当前草稿（发送后成为模型可见图片）
       * 任意一环不可用（旧版 DSH / 无 conversation 服务）就返回 {ok:false}，文本仍已插入。
       */
      function attachImagesToDraft(images, target) {
        if (!images || !images.length || !target || !target.conversation || !target.facade) {
          return Promise.resolve({ ok: false, reason: 'unavailable', count: 0 });
        }
        var conversation = target.conversation;
        var facade = target.facade;
        if (typeof conversation.createDrafts !== 'function' || typeof facade.addAttachments !== 'function'
          || typeof File !== 'function' || typeof atob !== 'function') {
          return Promise.resolve({ ok: false, reason: 'unsupported', count: 0 });
        }
        var picked = images.slice(0, 20);
        return Promise.all(picked.map(function (img) {
          return rpcCall('zentao.image', { url: img.url }).then(function (r) {
            if (!r || !r.ok || !r.value || !r.value.base64) return null;
            return r.value;
          }, function () { return null; });
        })).then(function (values) {
          var files = [];
          for (var i = 0; i < values.length; i++) {
            var v = values[i];
            if (!v) continue;
            try {
              var name = v.name || picked[i].name || ('image-' + (i + 1) + '.png');
              files.push(new File([bytesFromBase64(v.base64)], name, { type: v.mediaType || 'image/png' }));
            } catch (e) { /* 单张失败不影响其它 */ }
          }
          if (!files.length) return { ok: false, reason: 'download', count: 0 };
          return Promise.all(files.map(normalizeImageFile)).then(function (prepared) {
            var drafts = null;
            try { drafts = conversation.createDrafts(target.sessionId, prepared); } catch (e) { drafts = null; }
            var ids = (drafts || []).map(function (d) { return d.id; }).filter(Boolean);
            if (!ids.length) return { ok: false, reason: 'drafts', count: 0 };
            var added = false;
            try { added = facade.addAttachments(ids) !== false; } catch (e) { added = false; }
            if (!added) {
              // 草稿处于 adjudicating/submitting 时 DSH 拒绝追加，释放草稿避免泄漏 objectURL
              try { if (typeof conversation.releaseDraftAttachments === 'function') conversation.releaseDraftAttachments(drafts); } catch (e) { /* 忽略 */ }
              return { ok: false, reason: 'busy', count: 0 };
            }
            return { ok: true, count: ids.length };
          });
        });
      }

      /**
       * 插入当前会话：服务级 setDraft（优先，可带图片附件）→ DOM composer → 剪贴板。
       * @returns {Promise<{mode:'service'|'dom'|'clipboard', attached:number, failed?:boolean}>}
       */
      function insertToCurrentChat(md, images) {
        var target = currentInputTarget();
        var mode = null;
        if (target && target.facade && typeof target.facade.setDraft === 'function') {
          try {
            target.facade.setDraft(md);
            try { if (typeof target.facade.focus === 'function') target.facade.focus(); } catch (e) { /* 忽略 */ }
            mode = 'service';
          } catch (e) { mode = null; }
        }
        if (!mode) {
          var domOk = false;
          try { domOk = tryInsertIntoComposer(md); } catch (e) { domOk = false; }
          if (domOk) mode = 'dom';
        }
        if (!mode) {
          try {
            return Promise.resolve(root.navigator.clipboard.writeText(md)).then(
              function () { return { mode: 'clipboard', attached: 0 }; },
              function () { return { mode: 'clipboard', attached: 0, failed: true }; });
          } catch (e) { return Promise.resolve({ mode: 'clipboard', attached: 0, failed: true }); }
        }
        if (!images.length || !target) return Promise.resolve({ mode: mode, attached: 0 });
        return attachImagesToDraft(images, target).then(function (r) {
          return { mode: mode, attached: r && r.ok ? r.count : 0, imageError: r && !r.ok ? r.reason : null };
        });
      }

      /**
       * 「处理」弹层的上下文：工作区列表（workspaces 服务）+ 模型预设列表
       * （remote.agentPresets）+ 当前会话的归属/目录/模型（作为下拉默认值）。
       * 全部懒查找，任何服务缺失都只是对应列表为空，不抛错。
       */
      function collectDispatchContext() {
        var out = { workspaces: [], presets: [], currentWorkspaceId: null, currentPreset: null, cwd: null };
        try {
          var sessions = lookupService('sessions');
          var cur = sessions ? currentSessionId(sessions) : null;
          if (cur) {
            var row = sessions.list.getSnapshot().byId[cur];
            if (row && row.cwd) out.cwd = row.cwd;
            // 官方 preset UI 同款读法：byId[id].projectionValues.agentPreset
            var pv = row && row.projectionValues;
            if (pv && typeof pv.agentPreset === 'string' && pv.agentPreset) out.currentPreset = pv.agentPreset;
          }
          var workspaces = lookupService('workspaces');
          if (workspaces && workspaces.list && typeof workspaces.list.getSnapshot === 'function') {
            var snap = workspaces.list.getSnapshot();
            var items = (snap && snap.items) || [];
            for (var i = 0; i < items.length; i++) {
              var w = items[i];
              if (!w || !w.workspaceId) continue;
              out.workspaces.push({ id: w.workspaceId, title: w.title || w.path || w.workspaceId, path: w.path || '' });
              if (cur && (w.sessionIds || []).indexOf(cur) >= 0) out.currentWorkspaceId = w.workspaceId;
            }
          }
        } catch (e) { /* 忽略：上下文收集失败就走默认 */ }

        // 模型预设：官方用法 ctx.remote.agentPresets.list()（RemoteResult 包装 {ok, value:{presets}}）
        var listP = null;
        try {
          var remote = lookupService('remote');
          if (remote && remote.agentPresets && typeof remote.agentPresets.list === 'function') listP = remote.agentPresets.list();
        } catch (e) { /* 忽略 */ }
        if (!listP) {
          try {
            var ap = lookupService('remote.agentPresets') || lookupService('agentPresets');
            if (ap && typeof ap.list === 'function') listP = ap.list();
          } catch (e) { /* 忽略 */ }
        }
        return Promise.resolve(listP)
          .then(function (r) {
            // 兼容 RemoteResult 包装与裸 roster 两种形态；ok:false / gateway 不可用都视为空表
            var roster = null;
            if (r && r.ok === false) roster = null;
            else if (r && r.value && Array.isArray(r.value.presets)) roster = r.value.presets;
            else if (r && Array.isArray(r.presets)) roster = r.presets;
            if (roster) {
              out.presets = roster.map(function (p) {
                return { id: p.id, name: p.name || p.id, isDefault: Boolean(p.isDefault), broken: p.broken || null };
              });
            }
            return out;
          })
          .catch(function () { return out; });
      }

      /**
       * M3「处理」：新会话自动下发。
       *   sessions.create({workspaceId|cwd, agentPreset}) → uiWorkspace.openSession(id)
       *   → conversation.input.for(scope).setDraft/submit
       * choice 由「处理」弹层给出：{workspaceId?|cwd?, agentPreset?}；缺省时继承当前会话目录。
       * 任一环失败 → 降级插入当前会话 composer；再失败 → 剪贴板。
       */
      function dispatchToNewSession(md, images, choice) {
        var sessions = lookupService('sessions');
        var ws = lookupService('uiWorkspace');
        var conversation = lookupService('conversation');
        if (!sessions || typeof sessions.create !== 'function') {
          return Promise.resolve({ ok: false, mode: 'unavailable', message: 'sessions 服务不可用（DSH 版本过旧？）' });
        }
        var opts = {};
        if (choice && choice.workspaceId) opts.workspaceId = choice.workspaceId;
        else if (choice && choice.cwd) opts.cwd = choice.cwd;
        else {
          // 未指定位置 → 继承当前会话工作目录（旧版行为）
          try {
            var cur = currentSessionId(sessions);
            if (cur) {
              var row = sessions.list.getSnapshot().byId[cur];
              if (row && row.cwd) opts = { cwd: row.cwd };
            }
          } catch (e) { /* 忽略 */ }
        }
        if (choice && choice.agentPreset) opts.agentPreset = choice.agentPreset;

        return Promise.resolve()
          .then(function () { return sessions.create(opts); })
          .then(function (sessionId) {
            if (!sessionId) throw new Error('session.create 未返回会话 id');
            if (ws && typeof ws.openSession === 'function') {
              try { ws.openSession(sessionId); } catch (e) { /* 打开失败也继续尝试填草稿 */ }
            }
            var scope = null;
            try { scope = sessions.scope(sessionId); } catch (e) { scope = null; }
            if (conversation && conversation.input && scope) {
              var facade = null;
              try { facade = conversation.input.for(scope); } catch (e) { facade = null; }
              if (facade && typeof facade.setDraft === 'function') {
                var target = { sessionId: sessionId, scope: scope, facade: facade, conversation: conversation };
                // 先把真实图片挂成草稿附件，再填文本并发送（图片下载失败也照常发送）
                return attachImagesToDraft(images, target).then(function (att) {
                  facade.setDraft(md);
                  try { facade.focus(); } catch (e) { /* 忽略 */ }
                  setTimeout(function () {
                    try { if (typeof facade.submit === 'function') facade.submit(); } catch (e) { /* 已填草稿，发送交给用户 */ }
                  }, 250);
                  var suffix = att && att.ok ? '（含 ' + att.count + ' 张图片）' : '';
                  return { ok: true, mode: 'dispatched', message: '已在新会话发送任务背景' + suffix, sessionId: sessionId };
                });
              }
            }
            setTimeout(function () {
              try { fillComposerEditable(md); } catch (e) { /* 忽略 */ }
            }, 250);
            return { ok: true, mode: 'draft', message: '已新建会话并填入输入框，请确认发送', sessionId: sessionId };
          })
          .catch(function (err) {
            return { ok: false, mode: 'failed', message: '新会话创建失败：' + (err && err.message ? err.message : String(err)) };
          });
      }

      // ───────────────────────── 组件 ─────────────────────────
      function KindTag(props) {
        return h('span', { className: 'ztp-tag ' + props.kind }, KIND_LABEL[props.kind] || props.kind);
      }

      function StatusChip(props) {
        return h('span', { className: 'ztp-st ztp-st-' + statusTone(props.status) },
          h('i', { className: 'ztp-dot' }),
          statusLabel(props.status));
      }

      function CardItem(props) {
        var c = props.card;
        var urgent = isUrgent(c.deadline);
        return h('div', {
          className: 'ztp-card ztp-k-' + c.kind,
          draggable: true,
          title: '点击查看详情，可拖拽到对话输入框',
          onDragStart: function (e) {
            try {
              e.dataTransfer.setData('text/plain', cardToMarkdown(c));
              e.dataTransfer.effectAllowed = 'copy';
            } catch (err) { /* 忽略 */ }
          },
          onClick: function () { props.onOpen(c); },
        },
          h('div', { className: 'ztp-row' },
            h(KindTag, { kind: c.kind }),
            h('span', { className: 'ztp-id' }, '#' + c.id)),
          h('div', { className: 'ztp-card-title' }, c.title || ''),
          h('div', { className: 'ztp-meta' },
            h(StatusChip, { status: c.status }),
            c.pri != null ? h('span', { className: 'ztp-pri p' + c.pri }, 'P' + c.pri) : null,
            c.severity != null ? h('span', null, '严重 ' + c.severity) : null,
            c.deadline ? h('span', { className: urgent ? 'ztp-warn' : '' }, '截止 ' + fmtDate(c.deadline)) : null,
            c.openedBy ? h('span', null, c.openedBy + ' 创建') : null),
          h('div', { className: 'ztp-acts' },
            h('button', {
              className: 'ztp-btn', type: 'button',
              onClick: function (e) { e.stopPropagation(); props.onInsert(c, null); },
            }, '插入对话'),
            h('button', {
              className: 'ztp-btn primary', type: 'button',
              title: '选择工作区与模型，新建会话发送任务背景',
              onClick: function (e) { e.stopPropagation(); props.onDispatch(c, null); },
            }, '处理')),
        );
      }

      function DetailView(props) {
        var card = props.card;
        var detail = useState(null), err = useState(null);
        useEffect(function () {
          var alive = true;
          detail[1](null); err[1](null);
          Promise.resolve(props.rpc('zentao.detail', { kind: card.kind, id: card.id }))
            .then(function (r) {
              if (!alive) return;
              if (r && r.ok) detail[1](r.value);
              else err[1]((r && r.error && r.error.message) || '详情加载失败');
            })
            .catch(function (e) { if (alive) err[1](String((e && e.message) || e)); });
          return function () { alive = false; };
        }, [card.kind, card.id]);

        var d = detail[0] || {};
        var urgent = isUrgent(card.deadline || d.deadline);
        var desc = d.desc || card.descBrief || '';
        return h('div', null,
          h('div', { className: 'ztp-detail-bar' },
            h('button', { className: 'ztp-back', type: 'button', onClick: props.onBack }, h(BackIcon), '返回'),
            h('a', { className: 'ztp-link', href: card.url, target: '_blank', rel: 'noreferrer' },
              '在禅道打开', h(LinkIcon))),

          h('div', { className: 'ztp-panel-card ztp-k-' + card.kind },
            h('div', { className: 'ztp-row' },
              h(KindTag, { kind: card.kind }),
              h('span', { className: 'ztp-id' }, '#' + card.id)),
            h('div', { className: 'ztp-detail-title' }, card.title || ''),
            h('div', { className: 'ztp-meta' },
              h(StatusChip, { status: card.status }),
              card.pri != null ? h('span', { className: 'ztp-pri p' + card.pri }, 'P' + card.pri) : null,
              card.severity != null ? h('span', null, '严重 ' + card.severity) : null,
              (card.deadline || d.deadline) ? h('span', { className: urgent ? 'ztp-warn' : '' }, '截止 ' + fmtDate(card.deadline || d.deadline)) : null),

            h('dl', { className: 'ztp-kv' },
              h('dt', null, '指派给'), h('dd', null, card.assignedTo || '—'),
              h('dt', null, '创建人'), h('dd', null, card.openedBy || '—'),
              d.type ? h('dt', null, '类型') : null, d.type ? h('dd', null, String(d.type)) : null,
              d.stage ? h('dt', null, '阶段') : null, d.stage ? h('dd', null, String(d.stage)) : null,
              d.estStarted ? h('dt', null, '预计开始') : null, d.estStarted ? h('dd', null, fmtDate(d.estStarted)) : null,
              d.resolvedBuild ? h('dt', null, '解决版本') : null, d.resolvedBuild ? h('dd', null, String(d.resolvedBuild)) : null),

            h('div', { className: 'ztp-acts', style: { marginTop: '12px' } },
              h('button', { className: 'ztp-btn', type: 'button', onClick: function () { props.onInsert(card, detail[0]); } }, '插入对话'),
              h('button', { className: 'ztp-btn primary', type: 'button', title: '选择工作区与模型，新建会话发送任务背景', onClick: function () { props.onDispatch(card, detail[0]); } }, '处理'))),

          err[0] ? h('div', { className: 'ztp-err' }, err[0]) : null,

          (d.images && d.images.length)
            ? h('div', { className: 'ztp-hint' }, '描述含 ' + d.images.length + ' 张图片，插入对话时会作为真实图片附件一并带上')
            : null,

          h('div', { className: 'ztp-section' }, card.kind === 'bug' ? '重现步骤 / 描述' : '描述'),
          desc
            ? h('div', { className: 'ztp-desc' }, desc)
            : h('div', { className: 'ztp-desc', style: { color: 'var(--dsw-alias-label-tertiary)' } }, detail[0] ? '无描述' : '加载中…'),
        );
      }

      /** 多账号：账号管理弹出层（切换 / 添加 / 按账号移除）。 */
      function AccountSwitcher(props) {
        var accounts = props.accounts || [];
        return h('div', { className: 'ztp-acct-layer', onClick: props.onClose },
          h('div', { className: 'ztp-acct-pop', onClick: function (e) { e.stopPropagation(); } },
            accounts.map(function (a) {
              return h('div', {
                key: a.id,
                className: 'ztp-acct-row' + (a.id === props.activeId ? ' on' : ''),
                role: 'button', tabIndex: 0,
                onClick: function () { props.onPick(a); },
                onKeyDown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); props.onPick(a); } },
              },
                h('span', { className: 'ztp-acct-main' },
                  h('span', { className: 'ztp-acct-name' }, a.account || '（未命名）'),
                  h('span', { className: 'ztp-acct-host' }, hostOf(a.baseUrl))),
                h('i', {
                  className: 'ztp-dot',
                  title: a.loggedIn ? '已登录' : '未登录',
                  style: { color: a.loggedIn ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-label-caption)', flex: 'none' },
                }),
                h('button', {
                  className: 'ztp-acct-del', type: 'button', title: '移除此账号（清除本机凭据）',
                  onClick: function (e) { e.stopPropagation(); props.onRemove(a); },
                }, h(TrashIcon)));
            }),
            h('button', { className: 'ztp-acct-add', type: 'button', onClick: props.onAdd },
              h(PlusIcon), '添加账号…')));
      }

      /**
       * 「处理」确认弹层：先选工作区与模型，再新建会话自动下发。
       * 服务不可用/列表为空时对应下拉退化为单项说明，仍可直接发送（走默认）。
       */
      function DispatchDialog(props) {
        var card = props.card;
        var ctx0 = useState(null);   // collectDispatchContext 结果
        var wsSel = useState(null);  // 选中 workspaceId | '__cwd__' | null
        var modelSel = useState(null); // 选中 preset id | null
        var busy = useState(false);

        useEffect(function () {
          var alive = true;
          collectDispatchContext().then(function (o) {
            if (!alive) return;
            ctx0[1](o);
            // 工作区默认：当前会话归属 → 继承当前目录 → 第一个工作区
            wsSel[1](o.currentWorkspaceId
              || (o.cwd ? '__cwd__' : null)
              || (o.workspaces[0] ? o.workspaces[0].id : null));
            // 模型默认：当前会话在用的 → 默认预设 → 第一个可用
            var def = null, first = null;
            for (var i = 0; i < o.presets.length; i++) {
              var p = o.presets[i];
              if (p.broken) continue;
              if (first === null) first = p.id;
              if (p.isDefault) def = p.id;
            }
            modelSel[1](o.currentPreset || def || first);
          });
          return function () { alive = false; };
        }, []);

        useEffect(function () {
          var onKey = function (e) { if (e.key === 'Escape' && !busy[0]) props.onClose(); };
          document.addEventListener('keydown', onKey);
          return function () { document.removeEventListener('keydown', onKey); };
        }, [busy[0]]);

        var close = function () { if (!busy[0]) props.onClose(); };
        var send = function () {
          if (busy[0]) return;
          busy[1](true);
          var o = ctx0[0] || {};
          var choice = {};
          if (wsSel[0] && wsSel[0] !== '__cwd__') choice.workspaceId = wsSel[0];
          else if (wsSel[0] === '__cwd__' && o.cwd) choice.cwd = o.cwd;
          if (modelSel[0]) choice.agentPreset = modelSel[0];
          props.onSend(choice);
        };

        var o = ctx0[0];
        var wsOptions = o ? o.workspaces : [];
        var models = o ? o.presets : [];

        return h('div', { className: 'ztp-disp-layer', onClick: close },
          h('div', { className: 'ztp-disp-pop', onClick: function (e) { e.stopPropagation(); } },
            h('div', { className: 'ztp-disp-title' },
              '处理 ' + (KIND_LABEL[card.kind] || card.kind) + ' #' + card.id),
            h('div', { className: 'ztp-disp-sub' }, card.title || ''),

            h('label', { className: 'ztp-label' }, '工作区'),
            h('select', {
              className: 'ztp-input', value: wsSel[0] || '', disabled: busy[0],
              onChange: function (e) { wsSel[1](e.target.value); },
            },
              o === null
                ? h('option', { value: '' }, '正在读取工作区…')
                : (wsOptions.length || (o && o.cwd)
                  ? (o && o.cwd && !o.currentWorkspaceId
                    ? h('option', { value: '__cwd__' }, '继承当前目录（' + shortenPath(o.cwd) + '）')
                    : null)
                  : h('option', { value: '' }, '默认位置')),
              wsOptions.map(function (w) {
                return h('option', { key: w.id, value: w.id },
                  w.title + (o && o.currentWorkspaceId === w.id ? '（当前）' : ''));
              })),

            h('label', { className: 'ztp-label' }, '模型'),
            h('select', {
              className: 'ztp-input', value: modelSel[0] || '', disabled: busy[0],
              onChange: function (e) { modelSel[1](e.target.value); },
            },
              o === null
                ? h('option', { value: '' }, '正在读取模型…')
                : (models.length
                  ? models.map(function (p) {
                    return h('option', {
                      key: p.id, value: p.id, disabled: Boolean(p.broken),
                    }, p.name + (p.isDefault ? '（默认）' : '') + (p.broken ? '（不可用）' : ''));
                  })
                  : h('option', { value: '' }, '默认模型'))),

            h('div', { className: 'ztp-disp-note' },
              '将在新会话发送任务背景' + (props.images && props.images.length ? '，含 ' + props.images.length + ' 张图片附件' : '') + '。'),

            h('div', { className: 'ztp-disp-acts' },
              h('button', { className: 'ztp-btn', type: 'button', disabled: busy[0], onClick: close }, '取消'),
              h('button', { className: 'ztp-btn primary', type: 'button', disabled: busy[0], onClick: send },
                busy[0] ? '创建中…' : '发送'))));
      }

      function LoginView(props) {
        var isAdd = props.mode === 'add';
        var baseUrl = useState(props.init.baseUrl && /^https?:\/\//.test(props.init.baseUrl) ? props.init.baseUrl : 'http://');
        var account = useState(props.init.account || '');
        var password = useState('');
        var busy = useState(false), err = useState(null);

        var submit = useCallback(function () {
          if (busy[0]) return;
          busy[1](true); err[1](null);
          Promise.resolve(props.rpc('zentao.login', {
            baseUrl: baseUrl[0].trim(), account: account[0].trim(), password: password[0],
          }))
            .then(function (r) {
              busy[1](false);
              if (r && r.ok) props.onDone(r.value);
              else err[1]((r && r.error && r.error.message) || '登录失败');
            })
            .catch(function (e) { busy[1](false); err[1](String((e && e.message) || e)); });
        }, [baseUrl[0], account[0], password[0], busy[0]]);

        return h('div', { className: 'ztp-login' },
          h('div', { className: 'ztp-login-mark' }, h(ZentaoGlyph, { size: 24 })),
          h('div', { className: 'ztp-login-title' }, isAdd ? '添加禅道账号' : '连接禅道'),
          h('div', { className: 'ztp-login-sub' }, isAdd
            ? '登录另一个禅道账号（同一台禅道换账号，或另一台禅道实例均可）；凭据只保存在本机，随时可在账号菜单里切换。'
            : '账号密码只保存在本机（~/.dsh/zentao-panel），换一次 30 天免登 cookie，不会上传。支持保存多个账号、随时切换。'),
          err[0] ? h('div', { className: 'ztp-err' }, err[0]) : null,

          h('label', { className: 'ztp-label' }, '禅道地址'),
          h('input', {
            className: 'ztp-input', value: baseUrl[0], spellCheck: false,
            placeholder: 'http://zentao.example.com:8090',
            onChange: function (e) { baseUrl[1](e.target.value); },
          }),
          h('label', { className: 'ztp-label' }, '账号'),
          h('input', {
            className: 'ztp-input', value: account[0], spellCheck: false, autoFocus: true,
            placeholder: '禅道登录账号',
            onChange: function (e) { account[1](e.target.value); },
          }),
          h('label', { className: 'ztp-label' }, '密码'),
          h('input', {
            className: 'ztp-input', type: 'password', value: password[0],
            onChange: function (e) { password[1](e.target.value); },
            onKeyDown: function (e) { if (e.key === 'Enter') submit(); },
          }),
          h('button', {
            className: 'ztp-btn primary', type: 'button', disabled: busy[0],
            style: { width: '100%', height: '32px', marginTop: '18px', justifyContent: 'center' },
            onClick: submit,
          }, busy[0] ? '登录中…' : (isAdd ? '添加并登录' : '登录')),
          isAdd && props.onCancel ? h('button', {
            className: 'ztp-btn', type: 'button',
            style: { width: '100%', height: '30px', marginTop: '8px', justifyContent: 'center' },
            onClick: props.onCancel,
          }, '取消') : null,
        );
      }

      // ───────────────────────── 主面板（右侧栏 tab body）─────────────────────────
      function ZentaoPane(props) {
        props = props || {};
        var tab = useState('task');
        var status = useState(null);   // {configured, account, baseUrl, loggedIn, cacheAt, activeId, accounts[]}
        var mine = useState(null);     // {cards, cached, at}
        var loading = useState(false);
        var err = useState(null);
        var detailCard = useState(null);
        var toast = useState(null);
        var acctOpen = useState(false);  // 账号管理弹出层
        var adding = useState(false);    // 已有账号时再添加一个（LoginView 复用）
        var dispatch = useState(null);   // 「处理」确认弹层：{card, md, images}

        var rpc = useCallback(function (endpoint, payload) {
          return appCtx.connection.rpc.call(CHANNEL, endpoint, payload || {});
        }, []);

        useEffect(injectCss, []);

        useEffect(function () {
          if (!toast[0]) return;
          var t = setTimeout(function () { toast[1](null); }, 2200);
          return function () { clearTimeout(t); };
        }, [toast[0]]);

        var loadStatus = useCallback(function () {
          Promise.resolve(rpc('zentao.status'))
            .then(function (r) { if (r && r.ok) status[1](r.value); })
            .catch(function () { /* host 未就绪 */ });
        }, [rpc]);

        var loadMine = useCallback(function (refresh) {
          loading[1](true); err[1](null);
          Promise.resolve(rpc('zentao.mine', refresh ? { refresh: true } : {}))
            .then(function (r) {
              loading[1](false);
              if (r && r.ok) {
                mine[1](r.value);
                status[1](function (s) { return s ? Object.assign({}, s, { cacheAt: r.value.at }) : s; });
              } else {
                var m = (r && r.error && r.error.message) || '数据加载失败';
                err[1](m); toast[1](m);
              }
            })
            .catch(function (e) {
              loading[1](false);
              var m = String((e && e.message) || e);
              err[1](m); toast[1](m);
            });
        }, [rpc]);

        useEffect(function () { loadStatus(); }, [loadStatus]);
        // 激活账号变化（登录/切换/移除）→ 清旧数据重新拉取
        useEffect(function () {
          if (status[0] && status[0].configured) loadMine(false);
        }, [status[0] && status[0].configured, status[0] && status[0].activeId]);

        // 插入到输入框：服务级 setDraft（+ 真实图片附件）→ DOM composer → 剪贴板
        var insertToChat = useCallback(function (card, detail) {
          var md = cardToMarkdown(card, detail);
          var images = imagesOf(card, detail);
          insertToCurrentChat(md, images).then(function (r) {
            if (r.mode === 'clipboard') {
              toast[1](r.failed ? '复制失败，请手动复制' : '已复制 Markdown，可粘贴到输入框');
            } else if (r.attached) {
              toast[1]('已插入对话输入框（含 ' + r.attached + ' 张图片）');
            } else if (images.length) {
              toast[1]('已插入对话输入框（图片未能附加，可在禅道查看）');
            } else {
              toast[1]('已插入对话输入框');
            }
          });
        }, []);

        // 「处理」：先弹确认层选工作区与模型，确认后新建会话下发（失败降级插入当前会话 → 剪贴板）
        var dispatchCard = useCallback(function (card, detail) {
          dispatch[1]({ card: card, md: cardToMarkdown(card, detail), images: imagesOf(card, detail) });
        }, []);

        // 弹层「发送」：按所选工作区/模型建会话（choice 见 dispatchToNewSession）
        var sendDispatch = useCallback(function (choice) {
          var d = dispatch[0];
          if (!d) return;
          dispatch[1](null);
          Promise.resolve(dispatchToNewSession(d.md, d.images, choice)).then(function (r) {
            if (r && r.ok) { toast[1](r.message); return; }
            var msg = r && r.message ? r.message + '，已改为插入当前会话' : '新会话不可用，已改为插入当前会话';
            insertToCurrentChat(d.md, d.images).then(function (x) {
              if (x.mode === 'clipboard') {
                toast[1](msg + (x.failed ? '（复制失败，请手动复制）' : '（已复制到剪贴板）'));
              } else {
                toast[1](msg + (x.attached ? '（含 ' + x.attached + ' 张图片）' : ''));
              }
            });
          }).catch(function (e) { toast[1]('下发失败：' + String((e && e.message) || e)); });
        }, []);

        var logout = useCallback(function () {
          Promise.resolve(rpc('zentao.logout')).then(function () {
            mine[1](null); detailCard[1](null); status[1](null); adding[1](false); acctOpen[1](false);
            loadStatus();
          });
        }, [rpc, loadStatus]);

        // 切换激活账号：cookie 已持久化在 host 侧，切换即时生效
        var switchAccount = useCallback(function (id) {
          acctOpen[1](false);
          mine[1](null); detailCard[1](null); err[1](null);
          Promise.resolve(rpc('zentao.switch', { id: id }))
            .then(function (r) { if (r && r.ok) status[1](r.value); })
            .catch(function () { /* host 未就绪 */ });
        }, [rpc]);

        // 移除指定账号（登出该账号、清它的本机凭据）
        var removeAccount = useCallback(function (a) {
          acctOpen[1](false);
          mine[1](null); detailCard[1](null); err[1](null); adding[1](false);
          Promise.resolve(rpc('zentao.logout', { id: a.id }))
            .then(function (r) { if (r && r.ok) status[1](r.value); })
            .catch(function () { loadStatus(); });
        }, [rpc, loadStatus]);

        var st = status[0];
        var configured = Boolean(st && st.configured);
        var cards = mine[0] ? mine[0].cards : [];
        var filtered = useMemo(function () {
          return cards.filter(function (c) { return c.kind === tab[0]; });
        }, [cards, tab[0]]);
        var counts = useMemo(function () {
          var m = { task: 0, bug: 0, story: 0 };
          for (var i = 0; i < cards.length; i++) m[cards[i].kind] = (m[cards[i].kind] || 0) + 1;
          return m;
        }, [cards]);

        /** 状态未知时先占位，避免登录表单闪一下。 */
        function renderLoading() {
          return h('div', { className: 'ztp-empty' }, h('span', { className: 'ztp-spin', style: { display: 'inline-block' } }));
        }

        function renderBody() {
          if (detailCard[0]) {
            return h(DetailView, {
              key: detailCard[0].kind + '-' + detailCard[0].id,
              rpc: rpc, card: detailCard[0],
              onBack: function () { detailCard[1](null); },
              onInsert: insertToChat, onDispatch: dispatchCard,
            });
          }
          if (loading[0] && !mine[0]) {
            return h('div', null,
              h('div', { className: 'ztp-skel' }),
              h('div', { className: 'ztp-skel', style: { height: '62px' } }),
              h('div', { className: 'ztp-skel' }));
          }
          // 有错误且没有可展示的数据（含空列表）→ 显示错误视图；
          // 之前 err 只在 mine 为空时展示，刷新失败会被旧空列表掩盖成「没有指派给你」
          if (err[0] && (!mine[0] || !(mine[0].cards || []).length)) {
            return h('div', { className: 'ztp-err' },
              h('div', { className: 'ztp-err-row' },
                h('span', null, err[0]),
                h('button', { className: 'ztp-err-retry', type: 'button', onClick: function () { loadMine(true); } }, '重试')));
          }
          if (!filtered.length) {
            return h('div', { className: 'ztp-empty' },
              '没有指派给你的' + (KIND_LABEL[tab[0]] || '内容'),
              h('br'),
              h('span', { className: 'ztp-foot-dim' }, '可点右上角 ⟳ 重新拉取'));
          }
          return h('div', null, filtered.map(function (c) {
            return h(CardItem, {
              key: c.kind + '-' + c.id, card: c,
              onOpen: function (x) { detailCard[1](x); },
              onInsert: insertToChat, onDispatch: dispatchCard,
            });
          }));
        }

        // 中段：登录态未知占位 / 未配置或正在添加账号 → 登录 / 已配置 → 列表·详情
        var middle = !st
          ? h('div', { className: 'ztp-fill' }, renderLoading())
          : (!configured || adding[0]
            ? h('div', { className: 'ztp-fill' }, h(LoginView, {
              rpc: rpc,
              mode: configured ? 'add' : 'first',
              init: { baseUrl: st.baseUrl || '', account: '' },
              onDone: function (s) { adding[1](false); status[1](s); }, // 新账号自动激活，由 effect 触发拉取
              onCancel: configured ? function () { adding[1](false); } : null,
            }))
            : h('div', { className: 'ztp-scroll' }, renderBody()));

        return h('div', { className: 'ztp-root' },
          h('div', { className: 'ztp-head' },
            configured
              ? h('div', { className: 'ztp-seg', role: 'tablist' }, KIND_ORDER.map(function (k) {
                return h('button', {
                  key: k, type: 'button', role: 'tab',
                  'aria-selected': tab[0] === k ? 'true' : 'false',
                  className: 'ztp-seg-btn',
                  onClick: function () { tab[1](k); detailCard[1](null); },
                }, KIND_LABEL[k], counts[k] ? h('span', { className: 'ztp-num' }, counts[k]) : null);
              }))
              : h('div', { className: 'ztp-head-title' }, '禅道'),
            h('div', { className: 'ztp-grow' }),
            configured ? h('button', {
              className: 'ztp-acct', type: 'button',
              title: '当前账号：' + (st.account || '') + ' @ ' + hostOf(st.baseUrl) + '（点击切换/管理账号）',
              onClick: function () { acctOpen[1](!acctOpen[0]); },
            }, h('span', { className: 'ztp-acct-label' }, st.account || '未命名'), h(ChevronDownIcon)) : null,
            loading[0]
              ? h('span', { className: 'ztp-tool', 'aria-hidden': 'true' }, h('span', { className: 'ztp-spin' }))
              : (configured ? h('button', {
                className: 'ztp-tool', type: 'button', title: '重新拉取',
                onClick: function () { loadMine(true); },
              }, h(RefreshIcon)) : null),
            configured ? h('button', {
              className: 'ztp-tool', type: 'button', title: '退出当前账号（清除本机凭据）',
              onClick: logout,
            }, h(LogoutIcon)) : null,
            props.onClose ? h('button', {
              className: 'ztp-tool', type: 'button', title: '关闭', onClick: props.onClose,
            }, h(CloseIcon)) : null),

          middle,

          configured && mine[0] ? h('div', { className: 'ztp-foot' },
            h('span', null, '共 ' + cards.length + ' 条'),
            h('span', { className: 'ztp-foot-dim' }, '·'),
            h('span', { className: 'ztp-foot-dim' },
              mine[0].cached ? new Date(mine[0].at).toLocaleTimeString() + ' 缓存' : '刚刚拉取'),
            st && st.account ? h('span', { className: 'ztp-foot-dim', style: { marginLeft: 'auto' } },
              (st.accounts || []).length > 1 ? st.account + ' @ ' + hostOf(st.baseUrl) : st.account) : null) : null,

          acctOpen[0] && st && (st.accounts || []).length ? h(AccountSwitcher, {
            accounts: st.accounts,
            activeId: st.activeId,
            onPick: function (a) { if (a.id !== st.activeId) switchAccount(a.id); else acctOpen[1](false); },
            onRemove: removeAccount,
            onAdd: function () { acctOpen[1](false); adding[1](true); },
          }) : null,

          dispatch[0] ? h(DispatchDialog, {
            card: dispatch[0].card,
            images: dispatch[0].images,
            onSend: sendDispatch,
            onClose: function () { dispatch[1](null); },
          }) : null,

          toast[0] ? h('div', { className: 'ztp-toast', role: 'status' }, toast[0]) : null,
        );
      }

      /** 右侧栏 tab 标题（tab chip 上的图标 + 文字）。 */
      function ZentaoTabTitle() {
        return h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '5px' } },
          h(ZentaoGlyph, { size: 14 }), '禅道');
      }

      // ───────────────────────── 兜底：悬浮入口（旧版 DSH 没有 sidebarRightTabs）─────────────────────────
      function ZentaoOverlay() {
        var open = useState(false);
        useEffect(injectCss, []);
        useEffect(function () {
          var onKey = function (e) { if (e.key === 'Escape') open[1](false); };
          document.addEventListener('keydown', onKey);
          return function () { document.removeEventListener('keydown', onKey); };
        }, []);
        return h('div', null,
          open[0] ? h('div', null,
            h('div', { className: 'ztp-mask', onClick: function () { open[1](false); } }),
            h('div', { className: 'ztp-flyout' }, h(ZentaoPane, { onClose: function () { open[1](false); } }))) : null,
          h('div', {
            className: 'ztp-fab', role: 'button', title: '禅道工作台',
            onClick: function () { open[1](true); },
          }, h(ZentaoGlyph, { size: 18 })));
      }

      // ───────────────────────── 装载 ─────────────────────────
      var appCtx = null; // apply() 时注入

      /** 注册右侧栏 tab 类型 + 引导卡片 + tab body/title 三个挂点。 */
      function registerRightSidebar(scope) {
        var tabs = scope.sidebarRightTabs;
        var slots = scope.slots || appCtx.slots;
        var locale = null;
        try { locale = appCtx.get('locale') || null; } catch (e) { locale = null; }

        var registerTab = function () {
          var dispose = tabs.register({
            id: TAB_ID,
            kind: TAB_KIND,
            title: function () { return '禅道'; },
            guide: [{
              id: TAB_KIND,
              order: 30,
              title: function () { return '禅道'; },
              description: function () { return '指派给我的任务、Bug 与需求'; },
              icon: ZentaoGlyph,
            }],
          });
          return function () { try { dispose(); } catch (e) { /* 忽略 */ } };
        };
        // 优先挂到我们的 effect 上（插件卸载时自动反注册）；scope 无 effect 时直接注册
        if (typeof scope.effect === 'function') scope.effect(registerTab, 'dsh-zentao-panel: tab type');
        else registerTab();

        // 注意：sidebar-right 用 tab 类型的 id（不是 kind）做 slot 的 entryKey
        // （TabSlot 里 entryKey = definition.id ?? tab.kind），dsh-context 里两者同名所以无感。
        slots.inject('sidebar.right.pane.tab', function () {
          return slots.register({ name: 'sidebar.right.pane.tab', key: TAB_ID, locale: locale || undefined }, function () {
            return h(ZentaoPane, {});
          });
        });
        slots.inject('sidebar.right.pane.tab.title', function () {
          return slots.register({ name: 'sidebar.right.pane.tab.title', key: TAB_ID, locale: locale || undefined }, function () {
            return h(ZentaoTabTitle, {});
          });
        });
      }

      /** 旧版 DSH：shell.overlay 悬浮按钮 + 侧滑面板。 */
      function registerOverlay() {
        // 右侧栏入口已经起来（例如服务晚于 2.5s 就绪）就不重复挂
        if (lookupService('sidebarRightTabs')) return;
        try {
          appCtx.slots.inject('shell.overlay', function () {
            return appCtx.slots.register({
              name: 'shell.overlay', id: TAB_ID, order: 20,
            }, function () { return h(ZentaoOverlay, {}); });
          });
        } catch (e) {
          try { console.error('[dsh-zentao-panel] overlay slot unavailable', e); } catch (e2) { /* 忽略 */ }
        }
      }

      var inject = ['slots', 'connection'];

      function apply(ctx) {
        appCtx = ctx;
        injectCss();

        var wired = false;
        try {
          ctx.inject(['sidebarRightTabs'], function (scope) {
            wired = true;
            try {
              registerRightSidebar(scope);
            } catch (e) {
              wired = false;
              try { console.error('[dsh-zentao-panel] register right-sidebar tab failed', e); } catch (e2) { /* 忽略 */ }
            }
          });
        } catch (e) {
          try { console.error('[dsh-zentao-panel] sidebarRightTabs unavailable', e); } catch (e2) { /* 忽略 */ }
        }

        // 2.5s 内拿不到 sidebarRightTabs（旧版 DSH）→ 退回悬浮入口
        setTimeout(function () {
          if (!wired) registerOverlay();
        }, 2500);
      }

      exports.name = 'dsh-zentao-panel';
      exports.inject = inject;
      exports.apply = apply;
      exports.cardToMarkdown = cardToMarkdown; // 测试用
      exports._test = {
        fillComposerEditable: fillComposerEditable,
        tryInsertIntoComposer: tryInsertIntoComposer,
        insertToCurrentChat: insertToCurrentChat,
        attachImagesToDraft: attachImagesToDraft,
        imagesOf: imagesOf,
        bytesFromBase64: bytesFromBase64,
        collectDispatchContext: collectDispatchContext,
        dispatchToNewSession: dispatchToNewSession,
      };
      return module.exports;
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
