// dsh-zentao-panel — client 半边（左侧栏全局面板）
//
// 入口形态参照 dsh-mnemon：在左侧栏的 sidebar.panellist 列表里注册一个图标行，
// 同 id 在根作用域 main keyed slot 里注册面板组件——点图标 = ctx.layout.selectPanel(id)，
// 禅道面板占据整个主区域（与「插件管理」页同一机制）。「处理」/会话 chip 跳转用的
// uiWorkspace.openSession 内部走 replaceMain(...,"reveal") → selectPanel(null)，
// 会自动切回会话视图，无需插件介入。
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
      // main keyed slot 的 key 与 sidebar.panellist 的 id 必须同值：
      // 选中态按这个 id 寻址 main 注册项（dsh-client-ui-sidebar README 契约）
      var PANEL_ID = 'zentao';
      var TAB_ID = 'dsh-zentao-panel'; // 悬浮兜底入口的 slot id

      // ───────────────────────── 样式 ─────────────────────────
      // 只用 DSH 的语义 token：bg-layer-1/2、border-l1..l4、label-primary/secondary/tertiary、
      // state-error/success/warn/business、interactive-bg-hover(-solid)、toast-bg… 全部随主题翻转。
      var CSS = [
        // 主面板容器（main slot 全局面板）：macOS 桌面让位隐藏交通灯（--dsh-frame-top-clearance，
        // Web 上为 0），顶部拖拽带承担窗口拖拽；内容限宽居中，超宽窗口里列表不至于拉满
        '.ztp-main{position:relative;height:100%;min-height:0;display:flex;flex-direction:column;flex:auto;box-sizing:border-box;padding-top:var(--dsh-frame-top-clearance,0px);}',
        '.ztp-dragband{position:absolute;left:0;right:0;top:0;height:var(--dsh-frame-top-clearance,0px);z-index:3;}',
        // 面板根容器：不画背景吃主区域底色；relative 作为账号弹层（ztp-acct-pop）的定位基准
        '.ztp-root{position:relative;height:100%;min-height:0;display:flex;flex-direction:column;flex:auto;color:var(--dsw-alias-label-primary);font-size:var(--dsh-content-font-size-secondary,13px);line-height:1.5;}',

        // mast（主面板标题行）：图标 + 「禅道」+ 实例主机名 + 账号/工具，对齐 dsh-mnemon 的页头形态
        '.ztp-mast{flex:none;display:flex;align-items:center;gap:8px;height:46px;padding:0 12px 0 16px;box-sizing:border-box;}',
        '.ztp-mast-mark{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:var(--dsw-radius-sm);background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 12%,transparent);color:var(--dsw-alias-state-business-primary);flex:none;}',
        '.ztp-mast-title{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary);letter-spacing:.2px;}',
        '.ztp-mast-sub{font-size:11.5px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;}',

        // 头部（分段 tab 行）
        '.ztp-head{flex:none;display:flex;align-items:center;gap:2px;min-height:38px;padding:0 8px 0 10px;border-bottom:.5px solid var(--dsw-alias-border-l3);box-sizing:border-box;}',
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

        // 主体：左列表 / 右详情 双栏（宽面板）；窄容器（悬浮兜底 <720px）详情覆盖列表
        '.ztp-body{flex:1;min-height:0;display:flex;align-items:stretch;}',
        '.ztp-list-col{flex:1.2;min-width:0;overflow:auto;scrollbar-gutter:stable;padding:14px 16px 20px;box-sizing:border-box;border-right:.5px solid var(--dsw-alias-border-l3);}',
        '.ztp-detail-col{flex:1;min-width:0;overflow:auto;scrollbar-gutter:stable;padding:14px 16px 20px;box-sizing:border-box;}',
        '.ztp-dph{padding:56px 16px;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:12.5px;line-height:1.8;}',
        '.ztp-dph svg{width:28px;height:28px;opacity:.5;display:block;margin:0 auto 8px;}',
        '.ztp-detail-col .ztp-back{display:none;}', // 双栏下详情常驻，无需返回
        '@media (max-width:719px){',
        '  .ztp-body{position:relative;display:block;}',
        '  .ztp-list-col{border-right:0;height:100%;}',
        '  .ztp-detail-col{position:absolute;inset:0;z-index:5;display:none;background:var(--dsw-alias-bg-base,transparent);}',
        '  .ztp-detail-col.has{display:block;}',
        '  .ztp-detail-col .ztp-back{display:inline-flex;}', // 覆盖模式下可返回列表
        '}',

        // 卡片
        '.ztp-card{position:relative;display:block;width:100%;box-sizing:border-box;text-align:left;font:inherit;color:inherit;background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-lg);padding:11px 14px 11px 16px;margin:0 0 10px;cursor:pointer;transition:background .12s ease,border-color .12s ease;}',
        '.ztp-card:hover{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l4);}',
        '.ztp-card:active{background:var(--dsw-alias-interactive-bg-active);}',
        '.ztp-card.on{background:var(--dsw-alias-interactive-bg-hover);border-color:color-mix(in srgb,var(--ztp-c,var(--dsw-alias-state-business-primary)) 55%,var(--dsw-alias-border-l3));}',
        '.ztp-card.on:before{opacity:1;}',
        '.ztp-card:before{content:"";position:absolute;left:0;top:14px;bottom:14px;width:2px;border-radius:0 2px 2px 0;background:var(--ztp-c,transparent);opacity:.7;}',
        '.ztp-k-task{--ztp-c:var(--dsw-alias-state-business-primary);}',
        '.ztp-k-bug{--ztp-c:var(--dsw-alias-state-error-primary);}',
        '.ztp-k-story{--ztp-c:var(--dsw-alias-state-success-primary);}',
        '.ztp-row{display:flex;align-items:center;gap:6px;min-width:0;}',
        // 顶行：tag + #id 左、状态/优先级/截止右（窄容器自动换行，右贴不变）
        '.ztp-top{display:flex;align-items:center;gap:4px 8px;min-width:0;flex-wrap:wrap;}',
        '.ztp-top-meta{margin-left:auto;display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:4px 10px;font-size:11.5px;color:var(--dsw-alias-label-tertiary);min-width:0;}',
        '.ztp-id{font-size:11px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;flex:none;}',
        // 详情页元信息行
        '.ztp-meta{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;margin-top:8px;font-size:11.5px;color:var(--dsw-alias-label-tertiary);}',
        '.ztp-card-title{margin-top:5px;font-size:13.5px;line-height:1.45;color:var(--dsw-alias-label-primary);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word;}',

        // 类型标签
        '.ztp-tag{display:inline-flex;align-items:center;height:18px;padding:0 7px;border-radius:999px;font-size:11px;font-weight:500;flex:none;line-height:18px;}',
        '.ztp-tag.task{color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 14%,transparent);}',
        '.ztp-tag.bug{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 14%,transparent);}',
        '.ztp-tag.story{color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 14%,transparent);}',

        // 元信息
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
        '.ztp-btn{appearance:none;font:inherit;font-size:12px;line-height:1;height:28px;padding:0 12px;border-radius:var(--dsw-radius-sm);border:.5px solid var(--dsw-alias-border-l3);background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;box-sizing:border-box;}',
        '.ztp-btn:hover{background:var(--dsw-alias-interactive-bg-hover);}',
        '.ztp-btn.primary{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground);border-color:transparent;}',
        '.ztp-btn.primary:hover{background:var(--dsw-alias-button-primary-hover);}',
        '.ztp-btn:disabled{opacity:.45;cursor:default;}',
        '.ztp-btn svg{width:13px;height:13px;}',

        // 关联会话 chip（「处理」过的卡片左侧显示会话标题，点击跳回该会话）
        '.ztp-slink{display:inline-flex;align-items:center;gap:4px;max-width:58%;height:22px;padding:0 8px;margin-right:auto;border-radius:999px;border:.5px solid var(--dsw-alias-border-l3);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;cursor:pointer;box-sizing:border-box;min-width:0;}',
        '.ztp-slink:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l4);}',
        '.ztp-slink svg{width:11px;height:11px;flex:none;opacity:.8;}',
        '.ztp-slink-t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
        '.ztp-slink.dead{color:var(--dsw-alias-label-caption);border-style:dashed;}',

        // 空态 / 骨架 / 错误
        '.ztp-empty{padding:48px 24px;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:12.5px;line-height:1.7;}',
        '.ztp-skel{height:92px;border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-skeleton);border:.5px solid var(--dsw-alias-border-l1);margin-bottom:8px;animation:ztp-pulse 1.5s ease-in-out infinite;}',
        '@keyframes ztp-pulse{0%,100%{opacity:.5}50%{opacity:.95}}',
        '.ztp-err{margin:8px 0;padding:8px 10px;border-radius:var(--dsw-radius-md);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent);color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:1.55;}',
        '.ztp-err-row{display:flex;align-items:center;gap:8px;justify-content:space-between;}',
        '.ztp-err-retry{appearance:none;border:.5px solid currentColor;background:transparent;color:inherit;font:inherit;font-size:11.5px;height:22px;padding:0 8px;border-radius:var(--dsw-radius-sm);cursor:pointer;flex:none;}',

        // 页脚
        '.ztp-foot{flex:none;display:flex;align-items:center;gap:8px;height:30px;padding:0 16px;border-top:.5px solid var(--dsw-alias-border-l1);font-size:11px;color:var(--dsw-alias-label-tertiary);box-sizing:border-box;overflow:hidden;white-space:nowrap;}',
        '.ztp-foot-dim{opacity:.75;}',

        // 详情
        '.ztp-detail-bar{display:flex;align-items:center;gap:8px;margin:0 0 8px;}',
        '.ztp-back{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;height:24px;padding:0 6px 0 2px;border-radius:var(--dsw-radius-sm);cursor:pointer;display:inline-flex;align-items:center;gap:3px;}',
        '.ztp-back:hover{color:var(--dsw-alias-label-primary);}',
        '.ztp-back svg{width:13px;height:13px;}',
        // 卡片 #id 旁的禅道外链小图标（详情里不再放链接/按钮，超链接迁到卡片上）
        '.ztp-zlink{display:inline-flex;align-items:center;justify-content:center;width:17px;height:17px;border-radius:var(--dsw-radius-sm);color:var(--dsw-alias-label-tertiary);flex:none;cursor:pointer;}',
        '.ztp-zlink:hover{color:var(--dsw-alias-link);background:var(--dsw-alias-interactive-bg-hover);}',
        '.ztp-zlink svg{width:10.5px;height:10.5px;}',
        '.ztp-panel-card{border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1);padding:14px 16px;}',
        '.ztp-detail-title{margin-top:6px;font-size:14px;line-height:1.5;font-weight:600;color:var(--dsw-alias-label-primary);word-break:break-word;}',
        '.ztp-kv{display:grid;grid-template-columns:auto 1fr;gap:3px 12px;margin-top:10px;font-size:12px;color:var(--dsw-alias-label-secondary);}',
        '.ztp-kv dt{color:var(--dsw-alias-label-tertiary);white-space:nowrap;}',
        '.ztp-kv dd{margin:0;word-break:break-word;}',
        '.ztp-desc{margin-top:10px;padding:10px 12px;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);font-size:12.5px;line-height:1.7;white-space:pre-wrap;word-break:break-word;}',
        '.ztp-section{font-size:11.5px;color:var(--dsw-alias-label-tertiary);margin:14px 2px 6px;}',
        // 详情截图画廊：host 归一后的图片引用 → zentao.image RPC 取字节 → data: URL 渲染
        // （DSH 会话 UI 渲染附件图片就是 data:/blob: 两手，无 CSP 拦截）；点击放大
        '.ztp-imgs{display:flex;flex-direction:column;gap:8px;}',
        '.ztp-img-fig{margin:0;}',
        '.ztp-img-fig img{display:block;max-width:100%;max-height:420px;width:auto;height:auto;border-radius:var(--dsw-radius-md);border:.5px solid var(--dsw-alias-border-l3);cursor:zoom-in;}',
        '.ztp-img-loading{height:120px;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-skeleton);border:.5px solid var(--dsw-alias-border-l1);display:flex;align-items:center;justify-content:center;}',
        '.ztp-img-failed{height:56px;border-radius:var(--dsw-radius-md);border:.5px dashed var(--dsw-alias-border-l3);display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-tertiary);font-size:11.5px;}',
        '.ztp-img-zoom{position:fixed;inset:0;z-index:2147482100;background:color-mix(in srgb,#000 72%,transparent);display:flex;align-items:center;justify-content:center;cursor:zoom-out;}',
        '.ztp-img-zoom img{max-width:94vw;max-height:94vh;border-radius:var(--dsw-radius-md);box-shadow:var(--dsw-shadow-lv3);}',

        // 登录
        '.ztp-fill{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;}',
        '.ztp-login{flex:1;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;padding:32px 28px;max-width:420px;width:100%;margin:0 auto;}',        '.ztp-login-mark{width:44px;height:44px;border-radius:var(--dsw-radius-md);display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 12%,transparent);color:var(--dsw-alias-state-business-primary);margin-bottom:14px;}',
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
        '.ztp-acct-pop{position:absolute;right:10px;top:48px;z-index:2147482001;min-width:230px;max-width:300px;padding:6px;border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l3);box-shadow:var(--dsw-shadow-lv3);}',
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

        // ───────────────── 处理中任务的实时状态（M6：卡片上的活性徽标 + 常驻提醒）─────────────────────────
        // 会话关联（§4.3）+ uiSession.sessionStatus（running/pendingInteraction/completionUnread）
        // → 卡片顶行一枚状态胶囊：处理中三点跳动 / 等决策琥珀呼吸 / 已完成绿色对勾。
        '.ztp-live{display:inline-flex;align-items:center;gap:5px;height:20px;padding:0 9px;border-radius:999px;font-size:11px;font-weight:500;line-height:1;flex:none;white-space:nowrap;}',
        '.ztp-live i{width:5px;height:5px;border-radius:50%;background:currentColor;flex:none;}',
        '.ztp-live.running{color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 13%,transparent);}',
        '.ztp-live.ask{color:var(--dsw-alias-state-warn-primary);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 15%,transparent);}',
        '.ztp-live.done{color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 14%,transparent);}',
        // 处理中：三点依次跳动
        '.ztp-live.running .ztp-dots{display:inline-flex;gap:2.5px;align-items:center;}',
        '.ztp-live.running .ztp-dots b{width:4px;height:4px;border-radius:50%;background:currentColor;animation:ztp-dot 1.05s ease-in-out infinite;}',
        '.ztp-live.running .ztp-dots b:nth-child(2){animation-delay:.18s;}',
        '.ztp-live.running .ztp-dots b:nth-child(3){animation-delay:.36s;}',
        '@keyframes ztp-dot{0%,60%,100%{transform:translateY(0);opacity:.45}30%{transform:translateY(-3px);opacity:1}}',
        // 等决策：胶囊整体呼吸 + 卡片暖色描边提醒
        '.ztp-live.ask{animation:ztp-breath 1.6s ease-in-out infinite;}',
        '.ztp-card.ztp-live-ask{border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 45%,var(--dsw-alias-border-l3));}',
        '.ztp-card.ztp-live-ask:before{background:var(--dsw-alias-state-warn-primary);}',
        '@keyframes ztp-breath{0%,100%{box-shadow:0 0 0 0 color-mix(in srgb,var(--dsw-alias-state-warn-primary) 0%,transparent)}50%{box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-state-warn-primary) 22%,transparent)}}',
        // 已完成：对勾一次弹入 + 卡片绿色微光
        '.ztp-live.done svg{width:11px;height:11px;flex:none;}',
        '.ztp-live.done .ztp-live-ok{animation:ztp-pop2 .3s ease-out;}',
        '.ztp-card.ztp-live-done{border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 40%,var(--dsw-alias-border-l3));}',
        '@keyframes ztp-pop2{from{transform:scale(.4);opacity:0}to{transform:scale(1);opacity:1}}',
        // 会话 chip 前的活性小点（有实时状态时随状态变色，处理中闪烁）
        '.ztp-slink .ztp-slink-dot{width:6px;height:6px;border-radius:50%;flex:none;background:var(--dsw-alias-label-caption);}',
        '.ztp-slink .ztp-slink-dot.running{background:var(--dsw-alias-state-business-primary);animation:ztp-blink 1.2s ease-in-out infinite;}',
        '.ztp-slink .ztp-slink-dot.ask{background:var(--dsw-alias-state-warn-primary);animation:ztp-blink 1.2s ease-in-out infinite;}',
        '.ztp-slink .ztp-slink-dot.done{background:var(--dsw-alias-state-success-primary);}',
        '@keyframes ztp-blink{0%,100%{opacity:1}50%{opacity:.35}}',

        // 常驻提醒 toast（监控驱动，面板关着也能弹）：带「去看看」一键跳回会话
        '.ztp-live-toasts{position:fixed;left:50%;bottom:44px;transform:translateX(-50%);z-index:2147483000;display:flex;flex-direction:column;gap:8px;align-items:stretch;max-width:min(440px,86vw);}',
        '.ztp-live-toast{display:flex;align-items:center;gap:10px;box-sizing:border-box;padding:9px 10px 9px 14px;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-toast-bg);color:var(--dsw-alias-toast-label);box-shadow:var(--dsw-shadow-lv3);font-size:12.5px;line-height:1.5;animation:ztp-pop2 .16s ease-out;}',
        '.ztp-live-toast-title{font-weight:600;font-size:12.5px;display:flex;align-items:center;gap:6px;}',
        '.ztp-live-toast-title i{width:7px;height:7px;border-radius:50%;flex:none;}',
        '.ztp-live-toast-title.done i{background:var(--dsw-alias-state-success-primary);}',
        '.ztp-live-toast-title.decision i{background:var(--dsw-alias-state-warn-primary);animation:ztp-blink 1.2s ease-in-out infinite;}',
        '.ztp-live-toast-text{color:var(--dsw-alias-label-secondary);font-size:11.5px;margin-top:1px;}',
        '.ztp-live-toast-go{appearance:none;font:inherit;font-size:12px;flex:none;height:26px;padding:0 12px;border-radius:999px;border:0;background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground);cursor:pointer;}',
        '.ztp-live-toast-go:hover{background:var(--dsw-alias-button-primary-hover);}',
        '.ztp-live-toast-x{appearance:none;font:inherit;font-size:14px;line-height:1;flex:none;width:24px;height:24px;border-radius:50%;border:0;background:transparent;color:var(--dsw-alias-toast-label);opacity:.7;cursor:pointer;}',
        '.ztp-live-toast-x:hover{opacity:1;}',

        // 兜底：没有 main/sidebar.panellist slot 的旧版 DSH 用悬浮入口
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
      function ChatIcon() {
        return h('svg', { viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
          h('path', { d: 'M3 4.3c0-.72.58-1.3 1.3-1.3h7.4c.72 0 1.3.58 1.3 1.3v5c0 .72-.58 1.3-1.3 1.3H7.8L5.2 13.2v-2.6h-.9C3.58 10.6 3 10.02 3 9.3z', stroke: 'currentColor', strokeWidth: 1.1, strokeLinejoin: 'round' }),
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
       * 预取禅道图片字节（host→禅道下载，通常是最慢的一环）。
       * 「处理」在点击发送的瞬间就发起，与 sessions.create 并行——等会话建好、
       * 视图切过去时字节多半已就绪，附件注册不再额外等待。单张失败得 null，不拦整体。
       */
      function prefetchImageBytes(images) {
        if (!images || !images.length) return null;
        return Promise.all(images.slice(0, 20).map(function (img) {
          if (!img || typeof img.url !== 'string' || !img.url) return Promise.resolve(null);
          return rpcCall('zentao.image', { url: img.url }).then(function (r) {
            return (r && r.ok && r.value && r.value.base64) ? r.value : null;
          }, function () { return null; });
        }));
      }

      /**
       * 真实图片附件：禅道图片 bytes → 浏览器 File → DSH 草稿附件 → addAttachments。
       * DSH 0.2.1-rc.2 的会话服务契约（app.asar 源码确认）：
       *   conversation.createDrafts(sessionId, File[]) → [{id, kind:'image', previewUrl}]
       *   conversation.input.for(scope).addAttachments(ids) → 挂到当前草稿（发送后成为模型可见图片）
       * prefetched 传入 prefetchImageBytes 的结果时跳过 RPC 直接用（「处理」路径已提前预取）。
       * 任意一环不可用（旧版 DSH / 无 conversation 服务）就返回 {ok:false}，文本仍已插入。
       */
      function attachImagesToDraft(images, target, prefetched) {
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
        var bytesP = prefetched ? Promise.resolve(prefetched) : Promise.all(picked.map(function (img) {
          return rpcCall('zentao.image', { url: img.url }).then(function (r) {
            if (!r || !r.ok || !r.value || !r.value.base64) return null;
            return r.value;
          }, function () { return null; });
        }));
        return bytesP.then(function (values) {
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
       * 「处理」弹层的上下文：工作区列表（workspaces 服务）+ 模型目录
       * （remote.session.modelCatalog：provider 分组 + 思考强度）+ 当前会话的
       * 归属工作区 / 目录 / 在用模型（模型经 modelDirectories.directoryFor 读取，
       * 与 composer 模型选择器同一数据源）。全部懒查找，任何服务缺失都只是
       * 对应列表为空，不抛错。
       */
      function collectDispatchContext() {
        var out = { workspaces: [], currentWorkspaceId: null, cwd: null,
                    modelGroups: [], modelDefault: null, currentModel: null };
        var cur = null;
        try {
          var sessions = lookupService('sessions');
          cur = sessions ? currentSessionId(sessions) : null;
          if (cur) {
            var row = sessions.list.getSnapshot().byId[cur];
            if (row && row.cwd) out.cwd = row.cwd;
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

        // 模型目录：命名空间服务 remote.session（⚠️ 不能写成 ctx.get('remote').session——
        // ClientRemoteService 实例上没有命名空间属性；ctx.remote.session 点链访问只在
        // ctx 代理上有效（cordis tracker.associate 转发成 ctx['remote.session']）。
        // 官方 ModelDirectoryResolver 也是 inject "remote.session" 拿的同一服务）
        var catalogP = null;
        try {
          var nsSession = lookupService('remote.session');
          if (nsSession && typeof nsSession.modelCatalog === 'function') {
            catalogP = Promise.resolve(nsSession.modelCatalog());
          }
        } catch (e) { /* 忽略 */ }

        // 当前会话在用模型：modelDirectories.directoryFor(cur).load() 的 current
        // （= 会话投影的模型选择，composer 选择器显示的就是它）；失败 → null（弹层回退全局默认）
        var currentP = Promise.resolve(null);
        if (cur) {
          try {
            var md = lookupService('modelDirectories');
            if (md && typeof md.directoryFor === 'function') {
              var dir = md.directoryFor(cur); // 会话未被 retain 时会 throw，catch 兜底
              if (dir && typeof dir.load === 'function') {
                currentP = Promise.resolve(dir.load())
                  .then(function (s) { return (s && s.current) || null; })
                  .catch(function () { return null; });
              }
            }
          } catch (e) { /* 忽略 */ }
        }

        return Promise.all([Promise.resolve(catalogP).catch(function () { return null; }), currentP])
          .then(function (rs) {
            out.currentModel = rs[1];
            var r = rs[0];
            // 兼容 RemoteResult 包装与裸 catalog 两种形态；ok:false 视为无目录
            var cat = null;
            if (r && r.ok === false) cat = null;
            else if (r && r.value && Array.isArray(r.value.groups)) cat = r.value;
            else if (r && Array.isArray(r.groups)) cat = r;
            if (cat) {
              out.modelDefault = cat.default || null;
              out.modelGroups = (cat.groups || []).map(function (g) {
                return {
                  id: g.id,
                  name: g.name || g.id,
                  models: (g.models || []).map(function (m) {
                    var reason = m.reasoning || {};
                    return {
                      id: m.id,
                      name: m.name || m.id,
                      efforts: reason.efforts || [],
                      defaultEffort: reason.defaultEffort != null ? reason.defaultEffort : null,
                    };
                  }),
                };
              });
            }
            return out;
          });
      }

      /**
       * 给（新建的）会话设置模型：命名空间服务 remote.session 的 selectModel
       * （{sessionId, provider, model, reasoningEffort?} → RemoteResult）。
       * 显式拒绝（ok:false）返回 {ok:false, message}；服务缺失/网络异常返回 {ok:true}
       * （模型走会话默认，不拦截下发）。
       */
      function selectModelFor(sessionId, model) {
        var ns = null;
        try { ns = lookupService('remote.session'); } catch (e) { ns = null; }
        if (!ns || typeof ns.selectModel !== 'function') {
          return Promise.resolve({ ok: true, soft: true });
        }
        var req = { sessionId: sessionId, provider: model.provider, model: model.model };
        if (model.reasoningEffort) req.reasoningEffort = model.reasoningEffort;
        return Promise.resolve()
          .then(function () { return ns.selectModel(req); })
          .then(function (r) {
            if (r && r.ok === false) {
              var err = (r && r.error) || {};
              return { ok: false, message: String(err.code || err.message || '未知错误') };
            }
            return { ok: true };
          })
          .catch(function () { return { ok: true, soft: true }; });
      }

      /**
       * 新会话公共前段（「处理」与「插入对话」共用，2026-10-25 抽出）：
       *   点击确认瞬间：prefetchImageBytes 与 sessions.create 并行（host 拉禅道图最慢，提前开始）
       *   → create 完成：sessions.retain 后台保活（不切视图）+ 立即 facade.setDraft。
       * 成功返回 {ok:true, sessionId, target, retainRef, prefetch}；失败返回
       * {ok:false, mode:'unavailable'|'failed', message}——facade 不可用时立即释放
       * retain（新会话是空的，不留悬挂连接），交上层降级插入当前会话 composer；
       * 再失败 → 剪贴板。selectModel/附件/submit 的时序两种流程不同，不在这一段做。
       * choice 由弹层给出：{workspaceId?|cwd?, model?: {provider, model, reasoningEffort?}}；
       * 缺省时继承当前会话目录、模型走默认。
       */
      function createDraftSession(md, images, choice) {
        var sessions = lookupService('sessions');
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

        // 图片字节预取：与建会话并行（字节只依赖卡片，不依赖会话）
        var prefetch = prefetchImageBytes(images);

        return Promise.resolve()
          .then(function () { return sessions.create(opts); })
          .then(function (sessionId) {
            if (!sessionId) throw new Error('session.create 未返回会话 id');
            var retainRef = null;
            try {
              // 只 retain 不切视图：scope(id) 依赖 retain 才有值；释放时机由调用方决定
              if (typeof sessions.retain === 'function') retainRef = sessions.retain(sessionId, { source: 'zentao-panel' });
            } catch (e) { retainRef = null; }
            var scope = null;
            try { scope = sessions.scope(sessionId); } catch (e) { scope = null; }
            if (conversation && conversation.input && scope) {
              var facade = null;
              try { facade = conversation.input.for(scope); } catch (e) { facade = null; }
              if (facade && typeof facade.setDraft === 'function') {
                var target = { sessionId: sessionId, scope: scope, facade: facade, conversation: conversation };
                facade.setDraft(md);
                return { ok: true, sessionId: sessionId, target: target, retainRef: retainRef, prefetch: prefetch };
              }
            }
            // facade 不可用（conversation 服务缺失 / retain 没拿到 scope）：新会话里什么都没填，
            // 立即释放后台 retain 不留悬挂连接，返回 ok:false 让 sendDispatch 走
            // insertToCurrentChat 降级（内容+图片进当前会话，文案也更准确）
            if (retainRef && typeof retainRef.release === 'function') {
              try { retainRef.release(); } catch (e) { /* 忽略 */ }
            }
            return { ok: false, mode: 'unavailable', sessionId: sessionId,
              message: '新会话输入接口不可用（conversation/sessions 服务缺失）' };
          })
          .catch(function (err) {
            return { ok: false, mode: 'failed', message: '新会话创建失败：' + (err && err.message ? err.message : String(err)) };
          });
      }

      /**
       * M3「处理」：新会话自动下发（2026-10-24 用户要求**不自动跳转**——不调
       * uiWorkspace.openSession，其内部 replaceMain + selectPanel(null) 是跳转来源；
       * 用户留在禅道面板，靠卡片会话 chip / 活性徽标（M6）跳回）。
       * createDraftSession 之后：selectModel 与附件注册并行等待（互不阻塞）→
       * 模型设置成功才 submit（留 250ms 等 composer 挂载）→ 3s 释放后台 retain；
       * 模型显式失败（ok:false）只填草稿不代发、保留 retain——release 会让 scope
       * retire，未发送的草稿 store 可能随之丢失。
       */
      function dispatchToNewSession(md, images, choice) {
        return createDraftSession(md, images, choice).then(function (p) {
          if (!p.ok) return p;
          var facade = p.target.facade;
          // 模型设置与附件注册并行等待（成功才自动发送；模型显式失败则只填草稿，交用户确认）
          var modelStep = (choice && choice.model)
            ? selectModelFor(p.sessionId, choice.model)
            : Promise.resolve({ ok: true });
          return Promise.all([modelStep, attachImagesToDraft(images, p.target, p.prefetch)]).then(function (rs) {
            var mres = rs[0], att = rs[1];
            if (mres && mres.ok === false) {
              // 只填了草稿、没 submit：保留 retain（release 会 retireScope，草稿/附件随之丢）
              return { ok: true, mode: 'draft', sessionId: p.sessionId,
                message: '已新建会话并填入草稿（模型设置失败：' + mres.message + '），点卡片标签跳回确认发送' };
            }
            setTimeout(function () {
              try { if (typeof facade.submit === 'function') facade.submit(); } catch (e) { /* 已填草稿，发送交给用户 */ }
              // turn 已交给宿主跑，3s 后释放后台 retain（draft 模式不释放，见上）
              setTimeout(function () {
                try { if (p.retainRef && typeof p.retainRef.release === 'function') p.retainRef.release(); } catch (e) { /* 已被释放 */ }
              }, 3000);
            }, 250);
            var suffix = att && att.ok ? '（含 ' + att.count + ' 张图片）' : '';
            return { ok: true, mode: 'dispatched', sessionId: p.sessionId,
              message: '已在后台新会话发送任务背景' + suffix + '，卡片标签可跳回' };
          });
        });
      }

      /**
       * 「插入对话」（2026-10-25 用户要求改版）：与「处理」同款弹层选好工作区/
       * 模型后走这里——新建会话、**自动跳转过去**（uiWorkspace.openSession），
       * 但只填草稿+图片附件，**不自动发送**。
       * 时序：createDraftSession（create 与图片预取并行、setDraft 先行，跳过去
       * 不空白）→ 发起 selectModel 与附件注册后立即 openSession 跳转（openSession
       * 内部 retain(mainView) 同步接管保活，随即释放自己的后台 retain）→ 附件在
       * 新会话里陆续落位。selectModelFor/attachImagesToDraft 均自带兜底不 reject。
       * 跳转失败（uiWorkspace 缺失/抛错）：草稿已填进新会话，保留 retain 返回
       * draft 模式（release 会让 scope retire、丢未发送草稿），从会话列表/卡片
       * chip 找回。前段失败 → ok:false 交上层降级插入当前会话输入框（旧版行为）。
       */
      function insertToNewSession(md, images, choice) {
        return createDraftSession(md, images, choice).then(function (p) {
          if (!p.ok) return p;
          // 模型与附件后台进行，不阻塞跳转（不自动发送，模型没生效也无代发风险）
          if (choice && choice.model) selectModelFor(p.sessionId, choice.model);
          attachImagesToDraft(images, p.target, p.prefetch);
          var ws = null;
          try { ws = lookupService('uiWorkspace'); } catch (e) { ws = null; }
          var jumped = Boolean(ws && typeof ws.openSession === 'function');
          if (jumped) {
            try { ws.openSession(p.sessionId); } catch (e) { jumped = false; }
          }
          if (jumped) {
            // mainView 已接管保活 → 释放自己的后台 retain
            try { if (p.retainRef && typeof p.retainRef.release === 'function') p.retainRef.release(); } catch (e) { /* 已被释放 */ }
            return { ok: true, mode: 'jumped', sessionId: p.sessionId,
              message: '已新建会话并跳转，草稿已填入（不自动发送）' };
          }
          return { ok: true, mode: 'draft', sessionId: p.sessionId,
            message: '已新建会话并填入草稿（未能自动跳转，可从会话列表打开确认发送）' };
        });
      }

      // ───────────────── 会话关联（「处理」后卡片可跳回该会话）─────────────────
      // 「处理」成功后把 禅道卡片 → DSH 会话 的映射存进 localStorage（DSH 会话
      // 本来就只在本机，跨设备无意义）。key 带禅道账号前缀：不同账号/实例下
      // 同一个 kind-id 不是同一张卡片。会话标题不落盘——每次渲染从 sessions.list
      // 快照读 byId[sessionId].displayTitle（源码确认已做好 标题→目录名→id 降级），
      // 会话被删后 byId 里没有该行也能当场发现。
      var LINKS_KEY = 'dsh-zentao-panel.links.v1';
      var linksFallback = null; // localStorage 不可用（测试替身/极端环境）时的进程内兜底

      function linkStorage() {
        try { return root.localStorage || null; } catch (e) { return null; }
      }
      function readLinkMap() {
        var s = linkStorage();
        if (s) {
          try {
            var v = s.getItem(LINKS_KEY) ? JSON.parse(s.getItem(LINKS_KEY)) : null;
            if (v && typeof v === 'object') return v;
          } catch (e) { /* 坏数据当空 */ }
          return {};
        }
        return linksFallback || (linksFallback = {});
      }
      function writeLinkMap(map) {
        var s = linkStorage();
        if (s) {
          try { s.setItem(LINKS_KEY, JSON.stringify(map)); return; } catch (e) { /* 配额满等 → 退内存 */ }
        }
        linksFallback = map;
      }

      function sessionLinkKey(activeId, card) {
        return String(activeId || 'anon') + '/' + card.kind + '-' + card.id;
      }
      /** link key → {activeId, kind, id}；办公室监控用（旧值结构里没有卡片信息，key 本身就是权威）。 */
      function parseLinkKey(key) {
        var m = /^([^/]+)\/(task|bug|story)-(\d+)$/.exec(String(key || ''));
        return m ? { activeId: m[1], kind: m[2], id: Number(m[3]) } : null;
      }
      function getSessionLink(activeId, card) {
        var v = readLinkMap()[sessionLinkKey(activeId, card)];
        return (v && typeof v.sessionId === 'string' && v.sessionId) ? v : null;
      }
      /** 「处理」成功时记录关联；同卡片再次处理 → 覆盖为最新会话。
       *  值里带 kind/id/title（M6 实时状态徽标取名用；旧值没有也能从 key 解析 kind/id）。 */
      function saveSessionLink(activeId, card, sessionId) {
        var key = sessionLinkKey(activeId, card);
        var link = { sessionId: String(sessionId), at: Date.now(), kind: card.kind, id: card.id, title: String(card.title || '') };
        var map = readLinkMap();
        map[key] = link;
        writeLinkMap(map);
        watchPoke(); // 监控立即跟进新关联
        return link;
      }
      function removeSessionLink(activeId, card) {
        var map = readLinkMap();
        delete map[sessionLinkKey(activeId, card)];
        writeLinkMap(map);
        watchPoke();
      }

      function fmtLinkAt(at) {
        var t = Number(at);
        if (!isFinite(t) || t <= 0) return '';
        var d = new Date(t);
        var now = new Date();
        var md = (d.getMonth() + 1) + '月' + d.getDate() + '日';
        var hm = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
        return (d.getFullYear() === now.getFullYear() ? '' : d.getFullYear() + '年') + md + ' ' + hm;
      }

      /**
       * 卡片上显示的关联状态：byId 有该行 → live（displayTitle）；
       * byId 非空但没有该行 → dead（会话已删，点击清除标记）；
       * 拿不到快照或 byId 为空（列表未就绪）→ unknown（显示处理时间，防误删）。
       */
      function sessionLinkView(link, byId) {
        if (!link) return null;
        if (byId) {
          var row = byId[link.sessionId];
          if (row) return { state: 'live', title: String(row.displayTitle || link.sessionId), at: link.at };
          var hasAny = false;
          for (var k in byId) { if (k !== '__proto__') { hasAny = true; break; } }
          if (hasAny) return { state: 'dead', title: '', at: link.at };
        }
        return { state: 'unknown', title: '已处理 · ' + fmtLinkAt(link.at), at: link.at };
      }

      /**
       * 跳转到卡片关联的会话（uiWorkspace.openSession：retain + replaceMain，
       * 与「处理」建会话后的打开路径一致）。会话已删（byId 非空且无该行）→
       * 清除关联并返回 missing；列表未就绪时不清除，直接尝试打开。
       */
      function openSessionLink(activeId, card) {
        var link = getSessionLink(activeId, card);
        if (!link) return { ok: false, reason: 'nolink' };
        var byId = null;
        try {
          var sessions = lookupService('sessions');
          var snap = sessions && sessions.list && sessions.list.getSnapshot();
          byId = (snap && snap.byId) || null;
        } catch (e) { byId = null; }
        if (byId && byId[link.sessionId] === undefined) {
          var hasAny = false;
          for (var k in byId) { if (k === '__proto__') continue; hasAny = true; break; }
          if (hasAny) {
            removeSessionLink(activeId, card);
            return { ok: false, reason: 'missing' };
          }
        }
        var ws = lookupService('uiWorkspace');
        if (!ws || typeof ws.openSession !== 'function') return { ok: false, reason: 'unsupported' };
        try {
          ws.openSession(link.sessionId);
        } catch (e) {
          return { ok: false, reason: 'error', message: String((e && e.message) || e) };
        }
        return { ok: true, sessionId: link.sessionId };
      }

      // ───────────────────────── M6 处理中任务的实时状态：常驻监控 ─────────────────────────
      // 「任务完成 / 需要决策」提醒不依赖面板打开：插件 apply() 即启动本监控。
      // 信号源（0.2.1-rc.2 源码确认，dsh-notify-me 同款）：
      //   uiSession.sessionStatus = observable store，快照 Map<sessionId,
      //     {running, pendingInteraction, completionUnread}>；
      //   - pendingInteraction ∈ 'approval'|'plan-review'|'question'（宿主算好的「等你决策」）
      //   - completionUnread：后台会话跑完置位、打开该会话即清（宿主算好的「完成未读」）
      // 观察对象 = 会话关联表（§4.3 links.v1）里当前账号的条目；活性汇成
      // watchGetSnapshot().states（sessionId → 'running'|'ask'|'done'|null），禅道卡片/chip
      // 渲染时查询；边沿事件触发常驻 toast（带「去看看」一键跳回会话）。
      var INTERACTION_LABEL = { approval: '审批', 'plan-review': '方案确认', question: '提问' };
      var LIVE_STATE_LABEL = { running: '处理中', ask: '等你决策', done: '已完成' };
      var LIVE_STATE_TITLE = {
        running: '关联会话正在处理这个任务',
        ask: '关联会话在等你决策，点击会话 chip 跳回',
        done: '关联会话已处理完成，去看看结果',
      };

      var watch = {
        started: false, bound: false, retry: 0,
        prev: {},          // sessionId -> {running, pendingInteraction, completionUnread}（边沿基线）
        listeners: [],
        unsub: [],
        stopRetry: null, unslow: null,
        snapshot: { ready: false, activeId: null, states: {} }, // states: sessionId -> 'running'|'ask'|'done'|null
      };

      function watchGetSnapshot() { return watch.snapshot; }
      function watchSubscribe(cb) {
        watch.listeners.push(cb);
        return function () {
          var i = watch.listeners.indexOf(cb);
          if (i >= 0) watch.listeners.splice(i, 1);
        };
      }
      function watchEmit() {
        for (var i = 0; i < watch.listeners.length; i++) {
          try { watch.listeners[i](); } catch (e) { /* 面板异常不拖垮监控 */ }
        }
      }
      /** links/缓存有变（保存关联、禅道面板刷新 mine、切账号）→ 重新评估。 */
      function watchPoke() {
        if (watch.bound) watchEval();
      }

      function watchStart() {
        if (watch.started) return;
        watch.started = true;
        watchTryBind();
        if (typeof setInterval !== 'function' || typeof clearInterval !== 'function') return;
        // uiSession/sessions 是核心服务但激活时序晚于插件：3s 重试，60s 后降频到 30s
        var fast = setInterval(function () {
          if (watch.bound) { clearInterval(fast); return; }
          watchTryBind();
        }, 3000);
        watch.stopRetry = function () { clearInterval(fast); };
        setTimeout(function () {
          clearInterval(fast);
          if (!watch.bound) {
            var slow = setInterval(function () {
              if (watch.bound) { clearInterval(slow); return; }
              watchTryBind();
            }, 30000);
            watch.unslow = function () { clearInterval(slow); };
          }
        }, 60000);
      }

      function watchTryBind() {
        if (watch.bound) return;
        var uiSession = null;
        try { uiSession = lookupService('uiSession'); } catch (e) { uiSession = null; }
        var store = uiSession && uiSession.sessionStatus;
        if (!store || typeof store.subscribe !== 'function' || typeof store.getSnapshot !== 'function') {
          watch.retry++;
          return;
        }
        watch.bound = true;
        if (watch.stopRetry) { watch.stopRetry(); watch.stopRetry = null; }
        if (watch.unslow) { watch.unslow(); watch.unslow = null; }
        watch.unsub.push(store.subscribe(function () { watchEval(); }));
        var sessions = null;
        try { sessions = lookupService('sessions'); } catch (e) { sessions = null; }
        if (sessions && sessions.list && typeof sessions.list.subscribe === 'function') {
          watch.unsub.push(sessions.list.subscribe(function () { watchEval(); }));
        }
        watchEval();
      }

      /**
       * 活性推导（给卡片徽标/chip 状态点）：
       * ask（等你决策）> done（完成未读）> running（处理中）；idle（turn 结束且无事发生）
       * 与会话已删都返回 null——「已处理」这件事由会话 chip 表达，不叠徽标。
       */
      function deriveLiveState(next, live) {
        if (!live || !next) return null;
        if (next.pendingInteraction) return 'ask';
        if (next.completionUnread) return 'done';
        if (next.running) return 'running';
        return null;
      }

      /** 边沿事件：决策出现 / 完成未读置位。同帧两者兼有只报决策（行动需求已覆盖）。 */
      function watchEdges(prev, next) {
        var out = [];
        if (next.pendingInteraction && next.pendingInteraction !== prev.pendingInteraction) out.push('decision');
        if (next.completionUnread && !prev.completionUnread && !next.pendingInteraction) out.push('done');
        return out;
      }

      function watchEval() {
        if (!watch.bound) return;
        var activeId = (paneCache.status && paneCache.status.activeId) || null;
        var map = readLinkMap();
        var entries = [];
        for (var key in map) {
          if (!Object.prototype.hasOwnProperty.call(map, key) || key === '__proto__') continue;
          var pk = parseLinkKey(key);
          if (!pk) continue;
          if (activeId && pk.activeId !== activeId) continue; // 只看当前激活账号（多账号不混卡）
          var v = map[key];
          if (!v || typeof v.sessionId !== 'string' || !v.sessionId) continue;
          entries.push({
            key: key, activeId: pk.activeId, kind: pk.kind, id: pk.id,
            sessionId: v.sessionId, title: String(v.title || ''), at: Number(v.at) || 0,
          });
        }

        var statusMap = null;
        try {
          var uiSession = lookupService('uiSession');
          statusMap = uiSession && uiSession.sessionStatus && uiSession.sessionStatus.getSnapshot();
        } catch (e) { statusMap = null; }
        var byId = null;
        try {
          var sessions = lookupService('sessions');
          var snap = sessions && sessions.list && sessions.list.getSnapshot();
          byId = (snap && snap.byId) || null;
        } catch (e) { byId = null; }
        var byIdReady = false;
        if (byId) for (var b in byId) { if (b !== '__proto__') { byIdReady = true; break; } }

        var states = {};
        var events = [];
        for (var i = 0; i < entries.length; i++) {
          var en = entries[i];
          var st = statusMap
            ? (typeof statusMap.get === 'function' ? statusMap.get(en.sessionId) : statusMap[en.sessionId])
            : undefined;
          var next = st
            ? { running: !!st.running, pendingInteraction: st.pendingInteraction || null, completionUnread: !!st.completionUnread }
            : null;
          var prev = watch.prev[en.sessionId];
          // 首次见到的会话只建基线不提醒（DSH 重启 / 新 link 时避免一次性风暴）
          if (prev && next) {
            var evs = watchEdges(prev, next);
            for (var j = 0; j < evs.length; j++) {
              events.push({ type: evs[j], sessionId: en.sessionId, entry: en, interaction: next.pendingInteraction });
            }
          }
          if (next) watch.prev[en.sessionId] = next;
          else delete watch.prev[en.sessionId];
          states[en.sessionId] = deriveLiveState(next, byIdReady ? (byId[en.sessionId] !== undefined) : true);
        }

        watch.snapshot = { ready: true, activeId: activeId, states: states };
        watchEmit();
        for (var k = 0; k < events.length; k++) watchFire(events[k]);
      }

      /** 卡片 → 活性状态（卡片徽标与 chip 状态点查询入口；activeAcct 由当前 render 传入）。
       *  快照只反映当前激活账号的关联，查询账号不一致时不亮徽标（多账号不混卡）。 */
      function watchStateForCard(activeId, card) {
        var link = getSessionLink(activeId, card);
        if (!link) return null;
        var s = watch.snapshot;
        if (!s || !s.ready || !s.states) return null;
        if (s.activeId && activeId && s.activeId !== String(activeId)) return null;
        return s.states[link.sessionId] || null;
      }

      function watchToastText(ev) {
        var label = (KIND_LABEL[ev.entry.kind] || ev.entry.kind) + ' #' + ev.entry.id;
        var body = label + (ev.entry.title ? '「' + ev.entry.title + '」' : '');
        if (ev.type === 'decision') {
          return {
            kind: 'decision',
            title: '需要你决策',
            body: body + ' 在等你' + (INTERACTION_LABEL[ev.interaction] || '拍板') + '，去看看？',
          };
        }
        return { kind: 'done', title: '任务完成', body: body + ' 处理完了，去看看结果' };
      }

      function watchOpenSession(sessionId) {
        var ws = lookupService('uiWorkspace');
        if (ws && typeof ws.openSession === 'function') {
          try { ws.openSession(sessionId); return true; } catch (e) { /* 下面 toast 兜底 */ }
        }
        return false;
      }

      function watchFire(ev) {
        try { showWatchToast(watchToastText(ev), ev); } catch (e) { /* DOM 不可用（测试替身）时静默 */ }
      }

      // 常驻提醒 toast：挂在 body 的独立小条（面板关着也能弹），带「去看看」跳会话。
      var watchToastRoot = null;
      function watchToastRootEnsure() {
        if (watchToastRoot && watchToastRoot.parentNode) return watchToastRoot;
        try {
          if (typeof document === 'undefined' || !document.body || typeof document.createElement !== 'function') return null;
          var el = document.createElement('div');
          el.className = 'ztp-live-toasts';
          document.body.appendChild(el);
          watchToastRoot = el;
          return el;
        } catch (e) { return null; }
      }
      function showWatchToast(t, ev) {
        var rootEl = watchToastRootEnsure();
        if (!rootEl) return;
        var item = document.createElement('div');
        item.className = 'ztp-live-toast';
        var body = document.createElement('div');
        var tt = document.createElement('div');
        tt.className = 'ztp-live-toast-title ' + t.kind;
        var dot = document.createElement('i');
        tt.appendChild(dot);
        tt.appendChild(document.createTextNode(t.title));
        var tb = document.createElement('div');
        tb.className = 'ztp-live-toast-text';
        tb.textContent = t.body;
        body.appendChild(tt); body.appendChild(tb);
        item.appendChild(body);
        var go = document.createElement('button');
        go.className = 'ztp-live-toast-go';
        go.type = 'button';
        go.textContent = '去看看';
        var x = document.createElement('button');
        x.className = 'ztp-live-toast-x';
        x.type = 'button';
        x.textContent = '×';
        x.setAttribute('aria-label', '关闭');
        item.appendChild(go); item.appendChild(x);
        rootEl.appendChild(item);
        var closed = false;
        function dismiss() {
          if (closed) return;
          closed = true;
          try { if (item.parentNode) item.parentNode.removeChild(item); } catch (e) { /* 忽略 */ }
        }
        go.onclick = function () { watchOpenSession(ev.sessionId); dismiss(); };
        x.onclick = dismiss;
        var timer = setTimeout(dismiss, t.kind === 'decision' ? 12000 : 8000);
        item.addEventListener('mouseenter', function () { clearTimeout(timer); });
        item.addEventListener('mouseleave', function () { timer = setTimeout(dismiss, 4000); });
      }

      // ───────────────────────── 组件 ─────────────────────────
      function KindTag(props) {
        return h('span', { className: 'ztp-tag ' + props.kind }, KIND_LABEL[props.kind] || props.kind);
      }

      /**
       * 处理中任务的活性徽标（M6）：处理中三点跳动 / 等你决策琥珀呼吸 / 已完成绿色对勾。
       * state 来自 watchStateForCard（关联会话的 running/pendingInteraction/completionUnread）。
       */
      function LiveBadge(props) {
        var s = props.state;
        if (!s) return null;
        return h('span', { className: 'ztp-live ' + s, title: LIVE_STATE_TITLE[s] },
          s === 'running'
            ? h('span', { className: 'ztp-dots' }, h('b'), h('b'), h('b'))
            : s === 'ask'
              ? h('i', null)
              : h('svg', { viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
                  h('path', { className: 'ztp-live-ok', d: 'M4.2 8.7l2.5 2.5 5.1-5.7', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' })),
          LIVE_STATE_LABEL[s]);
      }

      /** 会话 chip 前的活性小点：随状态变色，处理中/等决策闪烁。 */
      function SlinkDot(props) {
        return props.state ? h('i', { className: 'ztp-slink-dot ' + props.state }) : null;
      }

      function StatusChip(props) {
        return h('span', { className: 'ztp-st ztp-st-' + statusTone(props.status) },
          h('i', { className: 'ztp-dot' }),
          statusLabel(props.status));
      }

      function CardItem(props) {
        var c = props.card;
        var urgent = isUrgent(c.deadline);
        var live = props.live || null;
        return h('div', {
          className: 'ztp-card ztp-k-' + c.kind
            + (props.active ? ' on' : '')
            + (live === 'ask' ? ' ztp-live-ask' : live === 'done' ? ' ztp-live-done' : ''),
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
          h('div', { className: 'ztp-top' },
            h(KindTag, { kind: c.kind }),
            live ? h(LiveBadge, { state: live }) : null,
            h('span', { className: 'ztp-id' }, '#' + c.id),
            // 禅道超链接在卡片上（详情里不再放链接/按钮）；draggable 关掉避免链接拖拽覆盖卡片 Markdown 拖拽
            c.url ? h('a', {
              className: 'ztp-zlink', href: c.url, target: '_blank', rel: 'noreferrer', draggable: false,
              title: '在禅道打开' + (KIND_LABEL[c.kind] || c.kind) + ' #' + c.id,
              onClick: function (e) { e.stopPropagation(); },
            }, h(LinkIcon)) : null,
            h('span', { className: 'ztp-top-meta' },
              h(StatusChip, { status: c.status }),
              c.pri != null ? h('span', { className: 'ztp-pri p' + c.pri }, 'P' + c.pri) : null,
              c.severity != null ? h('span', null, '严重 ' + c.severity) : null,
              c.deadline ? h('span', { className: urgent ? 'ztp-warn' : '' }, '截止 ' + fmtDate(c.deadline)) : null,
              c.openedBy ? h('span', null, c.openedBy + ' 创建') : null)),
          h('div', { className: 'ztp-card-title' }, c.title || ''),
          h('div', { className: 'ztp-acts' },
            props.linkView ? h('button', {
              className: 'ztp-slink' + (props.linkView.state === 'dead' ? ' dead' : ''),
              type: 'button',
              title: props.linkView.state === 'live'
                ? fmtLinkAt(props.linkView.at) + ' 处理 · 点击跳转到该会话'
                : (props.linkView.state === 'dead' ? '关联的会话已删除，点击清除标记' : '点击跳转到处理时创建的会话'),
              onClick: function (e) { e.stopPropagation(); props.onOpenSession(c); },
            }, h(SlinkDot, { state: live }), h(ChatIcon), h('span', { className: 'ztp-slink-t' },
              props.linkView.state === 'dead' ? '会话已删除' : props.linkView.title)) : null,
            h('button', {
              className: 'ztp-btn', type: 'button',
              title: '选择工作区与模型，新建会话填入草稿并跳转（不自动发送）',
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
        // 图片以真实截图渲染（DetailImages），文本里的 [图片：xxx] 占位标记随之去掉
        var desc = stripImageMarkers(d.desc || card.descBrief || '');
        var imgs = imagesOf(card, detail[0]);
        return h('div', null,
          // 详情纯只读：链接/按钮都在左侧卡片上；返回按钮仅在窄容器覆盖模式下可见
          h('div', { className: 'ztp-detail-bar' },
            h('button', { className: 'ztp-back', type: 'button', onClick: props.onBack }, h(BackIcon), '返回')),

          h('div', { className: 'ztp-panel-card ztp-k-' + card.kind
              + (props.live === 'ask' ? ' ztp-live-ask' : props.live === 'done' ? ' ztp-live-done' : '') },
            h('div', { className: 'ztp-row' },
              h(KindTag, { kind: card.kind }),
              props.live ? h(LiveBadge, { state: props.live }) : null,
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
              d.resolvedBuild ? h('dt', null, '解决版本') : null, d.resolvedBuild ? h('dd', null, String(d.resolvedBuild)) : null)),

          err[0] ? h('div', { className: 'ztp-err' }, err[0]) : null,

          h('div', { className: 'ztp-section' }, card.kind === 'bug' ? '重现步骤 / 描述' : '描述'),
          desc
            ? h('div', { className: 'ztp-desc' }, desc)
            : h('div', { className: 'ztp-desc', style: { color: 'var(--dsw-alias-label-tertiary)' } }, detail[0] ? '无描述' : '加载中…'),

          imgs.length ? h('div', { className: 'ztp-section' }, '截图（' + imgs.length + '）') : null,
          h(DetailImages, { images: imgs }),
        );
      }

      /**
       * 详情截图：desc 里的 <img> 已被 host 归一成可下载地址（images[].url），
       * 这里逐张走 zentao.image RPC 取字节，用 data: URL 直接渲染（DSH 会话 UI
       * 渲染附件图片用的就是 data:/blob:，主窗口无 CSP 拦截）。
       * 逐张独立请求独立落位：单张失败只占位提示不拦其它；点击放大，再点关闭。
       */
      function DetailImages(props) {
        var images = (props.images || []).slice(0, 20);
        var key = images.map(function (x) { return x.url; }).join('|');
        var rows = useState([]);
        var zoom = useState(null);
        useEffect(function () {
          var alive = true;
          var init = key ? key.split('|').map(function (url) { return { url: url, src: null, failed: false }; }) : [];
          rows[1](init);
          init.forEach(function (row, i) {
            var mark = function (patch) {
              if (!alive) return;
              rows[1](function (cur) {
                // key 已切换（url 对不上）或本张已有结果 → 忽略迟到的回调
                if (!cur[i] || cur[i].url !== row.url || cur[i].src || cur[i].failed) return cur;
                var next = cur.slice();
                next[i] = Object.assign({}, cur[i], patch);
                return next;
              });
            };
            rpcCall('zentao.image', { url: row.url }).then(function (r) {
              var v = r && r.ok && r.value;
              mark(v && v.base64 ? { src: 'data:' + (v.mediaType || 'image/png') + ';base64,' + v.base64 } : { failed: true });
            }, function () { mark({ failed: true }); });
          });
          return function () { alive = false; };
        }, [key]);
        if (!key) return null;
        return h('div', { className: 'ztp-imgs' },
          rows[0].map(function (row, i) {
            return h('figure', { key: row.url + '#' + i, className: 'ztp-img-fig' },
              row.src
                ? h('img', {
                    src: row.src, alt: (images[i] && images[i].name) || '截图', loading: 'lazy', draggable: false,
                    onClick: function () { zoom[1](row.src); },
                  })
                : (row.failed
                  ? h('div', { className: 'ztp-img-failed' }, '图片加载失败，可在禅道查看')
                  : h('div', { className: 'ztp-img-loading' }, h('span', { className: 'ztp-spin' }))));
          }),
          zoom[0] ? h('div', { className: 'ztp-img-zoom', onClick: function () { zoom[1](null); } },
            h('img', { src: zoom[0], alt: '' })) : null,
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

      // 模型下拉的 value：'provider\u0000model'（原生 select 单值，\u0000 防与 id 内分隔符冲突）
      function modelKeyOf(groups, sel) {
        if (!sel || !sel.provider || !sel.model) return null;
        for (var i = 0; i < (groups || []).length; i++) {
          var g = groups[i];
          if (g.id !== sel.provider) continue;
          for (var j = 0; j < g.models.length; j++) {
            if (g.models[j].id === sel.model) return g.id + '\u0000' + g.models[j].id;
          }
        }
        return null;
      }
      function firstModelKey(groups) {
        for (var i = 0; i < (groups || []).length; i++) {
          if (groups[i].models.length) return groups[i].id + '\u0000' + groups[i].models[0].id;
        }
        return null;
      }
      function findModelByKey(groups, key) {
        if (!key) return null;
        var sep = key.indexOf('\u0000');
        var pid = key.slice(0, sep), mid = key.slice(sep + 1);
        for (var i = 0; i < (groups || []).length; i++) {
          var g = groups[i];
          if (g.id !== pid) continue;
          for (var j = 0; j < g.models.length; j++) {
            if (g.models[j].id === mid) return g.models[j];
          }
        }
        return null;
      }

      /**
       * 「处理」/「插入对话」确认弹层：先选工作区与模型（provider/模型 + 思考强度）。
       * intent='dispatch'（默认）：新建会话后台自动发送、不跳转；
       * intent='insert'：新建会话并跳转过去、只填草稿不自动发送（2026-10-25 改版）。
       * 服务不可用/列表为空时对应下拉退化为单项说明，仍可直接确认（走默认）。
       */
      function DispatchDialog(props) {
        var card = props.card;
        var insert = props.intent === 'insert';
        var ctx0 = useState(null);   // collectDispatchContext 结果
        var wsSel = useState(null);  // 选中 workspaceId | '__cwd__' | null
        var modelKey = useState(null); // 选中 'provider\u0000model' | null
        var effortSel = useState(null); // 选中思考强度 id | ''（提供商默认）| null
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
            // 模型默认：当前会话在用的 → 全局默认 → 第一个
            var key = modelKeyOf(o.modelGroups, o.currentModel)
              || modelKeyOf(o.modelGroups, o.modelDefault)
              || firstModelKey(o.modelGroups);
            modelSelDefault(o, key, effortSel);
          });
          return function () { alive = false; };
        }, []);

        // 初始化默认值（modelKey + effortSel 一起设；闭包里没有 setState，直接用两个 setter）
        function modelSelDefault(o, key, setters) {
          if (!key) { setters[1] && setters[1](''); return; }
          modelKey[1](key);
          var m = findModelByKey(o.modelGroups, key);
          var cur = o.currentModel && modelKeyOf(o.modelGroups, o.currentModel) === key ? o.currentModel : null;
          // 思考强度默认：当前会话的 effort → 该模型默认 → 提供商默认
          var eff = (cur && cur.reasoningEffort) || (m && m.defaultEffort) || '';
          setters[1] && setters[1](m && m.efforts.length ? String(eff || '') : '');
        }

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
          if (modelKey[0]) {
            var sep = modelKey[0].indexOf('\u0000');
            choice.model = { provider: modelKey[0].slice(0, sep), model: modelKey[0].slice(sep + 1) };
            if (effortSel[0]) choice.model.reasoningEffort = effortSel[0];
          }
          // 数据随调用回传（card/md/images/activeAcct/intent 来自当前 render 的 props），
          // 接收方 useCallback 闭包里读不到最新 state（见 sendDispatch 注释）
          try {
            props.onSend(choice, { card: card, md: props.md, images: props.images, activeAcct: props.activeAcct, intent: props.intent || 'dispatch' });
          } catch (e) {
            busy[1](false); // 发起本身失败 → 至少让弹层可以再操作/关闭
            try { console.error('[dsh-zentao-panel] dispatch send failed', e); } catch (e2) { /* 忽略 */ }
          }
        };

        var o = ctx0[0];
        var groups = o ? o.modelGroups : [];
        var selModel = modelKey[0] ? findModelByKey(groups, modelKey[0]) : null;
        var efforts = selModel ? selModel.efforts : [];
        var hasProviderDefault = Boolean(selModel) && (selModel.defaultEffort == null);

        return h('div', { className: 'ztp-disp-layer', onClick: close },
          h('div', { className: 'ztp-disp-pop', onClick: function (e) { e.stopPropagation(); } },
            h('div', { className: 'ztp-disp-title' },
              (insert ? '插入到新会话 ' : '处理 ') + (KIND_LABEL[card.kind] || card.kind) + ' #' + card.id),
            h('div', { className: 'ztp-disp-sub' }, card.title || ''),

            h('label', { className: 'ztp-label' }, '工作区'),
            h('select', {
              className: 'ztp-input', value: wsSel[0] || '', disabled: busy[0],
              onChange: function (e) { wsSel[1](e.target.value); },
            },
              o === null
                ? h('option', { value: '' }, '正在读取工作区…')
                : (o.workspaces.length || o.cwd
                  ? (o.cwd && !o.currentWorkspaceId
                    ? h('option', { value: '__cwd__' }, '继承当前目录（' + shortenPath(o.cwd) + '）')
                    : null)
                  : h('option', { value: '' }, '默认位置')),
              (o ? o.workspaces : []).map(function (w) {
                return h('option', { key: w.id, value: w.id },
                  w.title + (o && o.currentWorkspaceId === w.id ? '（当前）' : ''));
              })),

            h('label', { className: 'ztp-label' }, '模型'),
            h('select', {
              className: 'ztp-input', value: modelKey[0] || '', disabled: busy[0],
              onChange: function (e) {
                modelKey[1](e.target.value);
                // 换模型 → 思考强度重置为该模型的默认（当前会话 effort 只跟随原模型）
                var m = findModelByKey(groups, e.target.value);
                effortSel[1](m && m.efforts.length ? String(m.defaultEffort || '') : '');
              },
            },
              o === null
                ? h('option', { value: '' }, '正在读取模型…')
                : (groups.length
                  ? groups.map(function (g) {
                    return h('optgroup', { key: g.id, label: g.name },
                      g.models.map(function (m) {
                        return h('option', { key: g.id + '\u0000' + m.id, value: g.id + '\u0000' + m.id }, m.name);
                      }));
                  })
                  : h('option', { value: '' }, '默认模型'))),

            efforts.length ? h('label', { className: 'ztp-label' }, '思考强度') : null,
            efforts.length ? h('select', {
              className: 'ztp-input', value: effortSel[0] || '', disabled: busy[0],
              onChange: function (e) { effortSel[1](e.target.value); },
            },
              hasProviderDefault ? h('option', { value: '' }, '提供商默认') : null,
              efforts.map(function (e) {
                return h('option', { key: e.id, value: e.id }, e.name);
              })) : null,

            h('div', { className: 'ztp-disp-note' },
              insert
                ? '将新建会话并跳转过去，任务背景' + (props.images && props.images.length ? '与 ' + props.images.length + ' 张图片' : '') + '填入草稿，不会自动发送。'
                : '将在新会话发送任务背景' + (props.images && props.images.length ? '，含 ' + props.images.length + ' 张图片附件' : '') + '。'),

            h('div', { className: 'ztp-disp-acts' },
              h('button', { className: 'ztp-btn', type: 'button', disabled: busy[0], onClick: close }, '取消'),
              h('button', { className: 'ztp-btn primary', type: 'button', disabled: busy[0], onClick: send },
                busy[0] ? '创建中…' : (insert ? '新建并跳转' : '发送')))));
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

      // ───────────────────────── 主面板（main slot 全局面板）─────────────────────────
      // 面板快照缓存（模块级）：main slot 按 entryKey = activePanelId 只渲染当前选中面板，
      // 切回会话视图（selectPanel(null)）或别的面板时禅道面板卸载——初始 state 直接取
      // 缓存，重挂瞬间就是完整列表，不闪 loading/骨架；后台 RPC 照常静默刷新。
      // 登出/切账号时这些 state 被置 null，缓存同步为 null，下次重挂走登录/重拉。
      var paneCache = { tab: 'task', status: null, mine: null, detailCard: null };

      function ZentaoPane(props) {
        props = props || {};
        var tab = useState(paneCache.tab);
        var status = useState(paneCache.status);   // {configured, account, baseUrl, loggedIn, cacheAt, activeId, accounts[]}
        var mine = useState(paneCache.mine);       // {cards, cached, at}
        var loading = useState(false);
        var err = useState(null);
        var detailCard = useState(paneCache.detailCard);
        var toast = useState(null);
        var acctOpen = useState(false);  // 账号管理弹出层
        var adding = useState(false);    // 已有账号时再添加一个（LoginView 复用）
        var dispatch = useState(null);   // 「处理」/「插入对话」确认弹层：{card, md, images, intent}
        var linkRev = useState(0);       // 会话关联存储版本号（保存/清除后 bump 重读）
        var liveSnap = useState(watchGetSnapshot()); // 关联会话活性（M6 监控快照）

        // 订阅常驻监控：会话 running/等你决策/完成未读 的变化即时反映到卡片徽标上
        useEffect(function () {
          var un = watchSubscribe(function () { liveSnap[1](watchGetSnapshot()); });
          liveSnap[1](watchGetSnapshot());
          watchPoke();
          return un;
        }, []);

        var rpc = useCallback(function (endpoint, payload) {
          return appCtx.connection.rpc.call(CHANNEL, endpoint, payload || {});
        }, []);

        useEffect(injectCss, []);

        useEffect(function () {
          var t = toast[0];
          // sticky 提示（「处理」等图片的过程提示）常驻，直到被下一条非 sticky toast 替换
          if (!t || t.sticky) return;
          var timer = setTimeout(function () { toast[1](null); }, 2200);
          return function () { clearTimeout(timer); };
        }, [toast[0]]);

        // 面板数据同步进模块级缓存：tab 卸载（切会话/关 tab）后重挂时用它秒恢复；
        // mine/激活账号变化同时通知办公室监控（白板差集、工位取名依赖 mine）
        useEffect(function () {
          paneCache.tab = tab[0];
          paneCache.status = status[0];
          paneCache.mine = mine[0];
          paneCache.detailCard = detailCard[0];
          watchPoke();
        }, [tab[0], status[0], mine[0], detailCard[0]]);

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

        // 「插入对话」（2026-10-25 改版）：与「处理」同款弹层选工作区/模型，确认后
        // 新建会话、自动跳转过去、只填草稿不发送；失败降级插入当前会话输入框（旧版行为）
        var insertToChat = useCallback(function (card, detail) {
          dispatch[1]({ card: card, md: cardToMarkdown(card, detail), images: imagesOf(card, detail), intent: 'insert' });
        }, []);

        // 「处理」：弹确认层选工作区与模型，确认后新建会话后台自动发送、不跳转（失败降级 → 剪贴板）
        var dispatchCard = useCallback(function (card, detail) {
          dispatch[1]({ card: card, md: cardToMarkdown(card, detail), images: imagesOf(card, detail), intent: 'dispatch' });
        }, []);

        // 弹层确认：intent='dispatch' 走 dispatchToNewSession（后台自动发送、不跳转），
        // intent='insert' 走 insertToNewSession（新建会话、跳转过去、只填草稿不发送）；
        // choice 即所选工作区/模型。
        // ⚠️ 数据（card/md/images/activeAcct）由弹层回传：useCallback([]) 的闭包捕获
        // 初次 render 的作用域，在里面读 dispatch[0]/status[0] 拿到的永远是旧值
        // （2026-10-24 真机踩坑：dispatch[0] 恒为 null → sendDispatch 直接 return，
        //  弹层永远卡在「创建中…」）。setState setter 引用稳定，可以直接调。
        var sendDispatch = useCallback(function (choice, d) {
          if (!d || !d.card) return;
          var insert = d.intent === 'insert';
          dispatch[1](null);
          // 过程提示（sticky）：图片还在预取/注册、模型还在设置，让用户知道在等什么；
          // 完成后由下方结果 toast（非 sticky，自动消失）替换。「插入对话」跳转后
          // 面板卸载、toast 随之消失，提示只覆盖跳转前的准备期，无害。
          toast[1](insert
            ? { text: (d.images && d.images.length
              ? '正在新建会话（准备 ' + d.images.length + ' 张图片附件）…'
              : '正在新建会话并跳转…'), sticky: true }
            : ((d.images && d.images.length)
              ? { text: '正在准备 ' + d.images.length + ' 张图片附件，随后自动发送…', sticky: true }
              : { text: '正在新建会话…', sticky: true }));
          var run = insert
            ? insertToNewSession(d.md || '', d.images || [], choice)
            : dispatchToNewSession(d.md || '', d.images || [], choice);
          Promise.resolve(run).then(function (r) {
            if (r && r.ok) {
              // 新会话建好即记录关联（draft 模式也算：内容已填进那个会话）
              if (r.sessionId) {
                saveSessionLink(d.activeAcct || null, d.card, r.sessionId);
                linkRev[1](function (v) { return v + 1; });
              }
              toast[1](r.message); return;
            }
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

        // 跳转到卡片关联的会话；会话已删 → 清除标记并提示（openSessionLink 内判定）。
        // activeAcct 由调用方传当前 render 的值，理由同 sendDispatch 的闭包说明。
        var openLinkedSession = useCallback(function (card, activeAcct) {
          var r = openSessionLink(activeAcct, card);
          if (r && r.ok) return;
          if (r && r.reason === 'missing') toast[1]('关联的会话已不存在，已清除标记');
          else if (r && r.reason === 'unsupported') toast[1]('当前 DSH 缺少跳转服务，无法打开会话');
          else if (r && r.reason === 'error') toast[1]('打开会话失败：' + (r.message || ''));
          linkRev[1](function (v) { return v + 1; });
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
        var linkMap = useMemo(readLinkMap, [linkRev[0]]);
        // 会话标题/存活判定：sessions.list 快照（有 sessions 服务的 DSH 才有；拿不到 → unknown 态）
        var sessionRows = null;
        try {
          var sessionsSvc = lookupService('sessions');
          var listSnap = sessionsSvc && sessionsSvc.list && sessionsSvc.list.getSnapshot();
          sessionRows = (listSnap && listSnap.byId) || null;
        } catch (e) { sessionRows = null; }
        var activeAcct = (st && st.activeId) || null;
        function linkViewOf(card) {
          return sessionLinkView(linkMap[sessionLinkKey(activeAcct, card)] || null, sessionRows);
        }
        /** 卡片活性：关联会话在跑（running）/ 等你决策（ask）/ 完成未读（done）。 */
        function liveOf(card) {
          var link = linkMap[sessionLinkKey(activeAcct, card)];
          if (!link || !liveSnap[0] || !liveSnap[0].ready) return null;
          return (liveSnap[0].states || {})[link.sessionId] || null;
        }
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

        /** 列表列：骨架 / 错误 / 空态 / 卡片列表（详情移到右侧栏）。 */
        function renderList() {
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
            var on = detailCard[0] && detailCard[0].kind === c.kind
              && Number(detailCard[0].id) === Number(c.id);
            return h(CardItem, {
              key: c.kind + '-' + c.id, card: c, active: on,
              linkView: linkViewOf(c),
              live: liveOf(c),
              onOpenSession: function (c2) { openLinkedSession(c2, activeAcct); },
              onOpen: function (x) { detailCard[1](x); },
              onInsert: insertToChat, onDispatch: dispatchCard,
            });
          }));
        }

        /** 详情列：选中卡片 → DetailView；未选中 → 占位（窄屏覆盖模式下未选中即整列隐藏）。 */
        function renderDetail() {
          if (!detailCard[0]) {
            return h('div', { className: 'ztp-dph' },
              h(ZentaoGlyph, { size: 28 }),
              '点击左侧卡片查看详情',
              h('br'),
              h('span', { className: 'ztp-foot-dim' }, '支持拖拽到对话输入框'));
          }
          return h(DetailView, {
            key: detailCard[0].kind + '-' + detailCard[0].id,
            rpc: rpc, card: detailCard[0],
            live: liveOf(detailCard[0]),
            onBack: function () { detailCard[1](null); },
          });
        }

        // 中段：登录态未知占位 / 未配置或正在添加账号 → 登录 / 已配置 → 左列表右详情双栏
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
            : h('div', { className: 'ztp-body' },
              h('div', { className: 'ztp-list-col' }, renderList()),
              h('div', { className: 'ztp-detail-col' + (detailCard[0] ? ' has' : '') }, renderDetail())));

        return h('div', { className: 'ztp-root' },
          // mast：标题行（图标 + 禅道 + 实例主机名 + 账号/刷新/登出），对齐 dsh-mnemon 的页头形态
          h('div', { className: 'ztp-mast' },
            h('span', { className: 'ztp-mast-mark' }, h(ZentaoGlyph, { size: 15 })),
            h('span', { className: 'ztp-mast-title' }, '禅道'),
            configured && st && st.baseUrl ? h('span', { className: 'ztp-mast-sub' }, hostOf(st.baseUrl)) : null,
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

          // 分段 tab 行（未配置/登录视图时不渲染，标题已在 mast 上）
          configured ? h('div', { className: 'ztp-head' },
            h('div', { className: 'ztp-seg', role: 'tablist' }, KIND_ORDER.map(function (k) {
              return h('button', {
                key: k, type: 'button', role: 'tab',
                'aria-selected': tab[0] === k ? 'true' : 'false',
                className: 'ztp-seg-btn',
                onClick: function () { tab[1](k); detailCard[1](null); },
              }, KIND_LABEL[k], counts[k] ? h('span', { className: 'ztp-num' }, counts[k]) : null);
            }))) : null,

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
            md: dispatch[0].md,
            intent: dispatch[0].intent,
            activeAcct: activeAcct,
            onSend: sendDispatch,
            onClose: function () { dispatch[1](null); },
          }) : null,

          toast[0] ? h('div', { className: 'ztp-toast', role: 'status' },
            (typeof toast[0] === 'object' && toast[0].sticky)
              ? h('span', { className: 'ztp-spin', style: { width: '12px', height: '12px', display: 'inline-block', verticalAlign: '-2px' } })
              : null,
            typeof toast[0] === 'string' ? toast[0] : (toast[0] && toast[0].text) || '') : null,
        );
      }

      /** 左侧栏图标行（sidebar.panellist）：DSH 自己画外层按钮/选中态/收起 tooltip，图标收 {size}。 */
      function ZentaoSidebarIcon(props) {
        return h(ZentaoGlyph, { size: (props && props.size) || 16, className: (props && props.className) || undefined });
      }

      /**
       * main slot 的面板组件：占整个主区域。顶部拖拽带（data-window-drag）承担
       * macOS 窗口拖拽，ztp-main 的 padding-top 让位隐藏交通灯
       * （--dsh-frame-top-clearance 仅 darwin 桌面非 0，Web 上高度为 0 无影响）。
       */
      function ZentaoMainPanel() {
        useEffect(injectCss, []);
        return h('div', { className: 'ztp-main' },
          h('div', { className: 'ztp-dragband', 'data-window-drag': true, 'aria-hidden': 'true' }),
          h(ZentaoPane, {}));
      }

      // ───────────────────────── 兜底：悬浮入口（旧版 DSH 没有 main/sidebar.panellist slot）─────────────────────────
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
      var leftWired = false; // 禅道面板两个 slot 都注册成功（兜入口不再挂）

      /**
       * 注册一个左侧栏全局面板（dsh-mnemon 同款机制，源码确认于 0.2.1-rc.2）：
       * - sidebar.panellist（根作用域列表）：左侧栏图标行，{id, order, label}，
       *   label 供展开文字/无障碍名/收起态 tooltip；行按钮与选中态由 DSH 自己画。
       * - main（根作用域 keyed slot）：面板组件，entryKey = activePanelId，
       *   key 必须与 panellist 的 id 同值；conversation 是保留 key。
       * 声明感知嵌套 inject：两个 slot 都已声明才整组注册，任一失败回滚另一侧。
       */
      function registerPanelGroup(id, order, labelOf, IconComp, MainComp) {
        var slots = appCtx.slots;
        return slots.inject('main', function () {
          return slots.inject('sidebar.panellist', function () {
            var stopMain = slots.register({ name: 'main', key: id }, MainComp);
            var stopIcon;
            try {
              stopIcon = slots.register({
                name: 'sidebar.panellist',
                id: id,
                order: order,
                label: labelOf,
              }, IconComp);
            } catch (e) {
              try { stopMain(); } catch (e2) { /* 忽略 */ }
              throw e;
            }
            return function () {
              try { stopIcon(); } catch (e2) { /* 忽略 */ }
              try { stopMain(); } catch (e2) { /* 忽略 */ }
            };
          });
        });
      }

      /** 禅道面板（order 32，排在 dsh-mnemon 记忆 30/技能 31 之后）。 */
      function registerLeftSidebar() {
        var stop = registerPanelGroup(PANEL_ID, 32, function () { return '禅道'; },
          ZentaoSidebarIcon, ZentaoMainPanel);
        leftWired = true;
        return stop;
      }

      /** 旧版 DSH（无 main/sidebar.panellist slot）：shell.overlay 悬浮按钮 + 侧滑面板。 */
      function registerOverlay() {
        // 左侧栏入口已经起来（例如 slot 晚于 2.5s 声明）就不重复挂
        if (leftWired) return;
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
        watchStart(); // 常驻监控：完成/等决策提醒不依赖面板打开

        try {
          registerLeftSidebar();
        } catch (e) {
          try { console.error('[dsh-zentao-panel] register left-sidebar panel failed', e); } catch (e2) { /* 忽略 */ }
        }

        // 2.5s 内 main/sidebar.panellist 没就绪（旧版 DSH）→ 退回悬浮入口
        setTimeout(function () {
          if (!leftWired) registerOverlay();
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
        prefetchImageBytes: prefetchImageBytes,
        imagesOf: imagesOf,
        bytesFromBase64: bytesFromBase64,
        collectDispatchContext: collectDispatchContext,
        dispatchToNewSession: dispatchToNewSession,
        insertToNewSession: insertToNewSession,
        sessionLinkKey: sessionLinkKey,
        parseLinkKey: parseLinkKey,
        readLinkMap: readLinkMap,
        getSessionLink: getSessionLink,
        saveSessionLink: saveSessionLink,
        removeSessionLink: removeSessionLink,
        sessionLinkView: sessionLinkView,
        openSessionLink: openSessionLink,
        paneCache: paneCache,
        fmtLinkAt: fmtLinkAt,
        // 实时状态监控（M6）
        watch: watch,
        watchStart: watchStart,
        watchTryBind: watchTryBind,
        watchEval: watchEval,
        watchPoke: watchPoke,
        watchEdges: watchEdges,
        deriveLiveState: deriveLiveState,
        watchStateForCard: watchStateForCard,
        watchToastText: watchToastText,
        watchGetSnapshot: watchGetSnapshot,
        watchSubscribe: watchSubscribe,
      };
      return module.exports;
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
