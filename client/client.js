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
        '.ztp-head{flex:none;display:flex;align-items:center;gap:6px;min-height:40px;padding:0 10px;border-bottom:.5px solid var(--dsw-alias-border-l3);box-sizing:border-box;}',
        '.ztp-head-sep{width:1px;height:16px;flex:none;background:var(--dsw-alias-border-l2);margin:0 1px;}',
        '.ztp-seg{display:flex;align-items:center;gap:2px;min-width:0;overflow-x:auto;scrollbar-width:none;}',
        '.ztp-seg::-webkit-scrollbar{display:none;}',
        '.ztp-seg-btn{appearance:none;border:0;background:transparent;font:inherit;font-size:12.5px;line-height:1;color:var(--dsw-alias-label-secondary);height:26px;padding:0 10px;border-radius:999px;display:inline-flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap;}',
        '.ztp-seg-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);}',
        '.ztp-seg-btn[aria-selected="true"]{background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-primary);font-weight:600;}',
        '.ztp-num{font-size:11px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-tertiary);font-weight:400;}',
        '.ztp-seg-btn[aria-selected="true"] .ztp-num{color:var(--dsw-alias-label-secondary);}',
        '.ztp-grow{flex:1;min-width:6px;}',

        // 列表工具行（tab 行右侧）：搜索框 + 排序下拉
        '.ztp-search{flex:none;height:28px;width:146px;box-sizing:border-box;padding:0 9px;border-radius:var(--dsw-radius-md);border:.5px solid var(--dsw-alias-border-l3);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;outline:none;transition:border-color .12s ease,box-shadow .12s ease;}',
        '.ztp-search::placeholder{color:var(--dsw-alias-label-caption);}',
        '.ztp-search:hover{border-color:var(--dsw-alias-border-l4);}',
        '.ztp-search:focus{border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-state-business-primary) 18%,transparent);}',
        '.ztp-sort{flex:none;height:28px;box-sizing:border-box;padding:0 4px;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;outline:none;cursor:pointer;}',
        '.ztp-sort:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);}',
        // 快捷筛选条：head 下方独立一行 chip（等你决策/处理中/逾期/今天到期/已完成）
        '.ztp-qfbar{flex:none;display:flex;align-items:center;gap:4px;padding:6px 8px 6px 10px;border-bottom:.5px solid var(--dsw-alias-border-l2);overflow-x:auto;scrollbar-width:none;}',
        '.ztp-qfbar::-webkit-scrollbar{display:none;}',
        '.ztp-qf{appearance:none;border:.5px solid var(--dsw-alias-border-l3);border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;line-height:1;height:22px;padding:0 9px;cursor:pointer;display:inline-flex;align-items:center;gap:4px;white-space:nowrap;}',
        '.ztp-qf:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l4);background:var(--dsw-alias-interactive-bg-hover);}',
        '.ztp-qf.zero{opacity:.55;}',
        '.ztp-qf.on{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground);border-color:transparent;}',
        '.ztp-qf.on:hover{background:var(--dsw-alias-button-primary-hover);color:var(--dsw-alias-label-primary-foreground);}',
        '.ztp-qf .ztp-num{font-size:10px;opacity:.85;}',
        '.ztp-viewseg{flex:none;display:inline-flex;align-items:center;gap:1px;height:28px;box-sizing:border-box;padding:2px;border:.5px solid var(--dsw-alias-border-l3);border-radius:999px;background:var(--dsw-alias-bg-layer-1);}',
        '.ztp-view-btn{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;line-height:1;height:22px;padding:0 11px;border-radius:999px;cursor:pointer;}',
        '.ztp-view-btn:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover);}',
        '.ztp-view-btn.on{background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-primary);font-weight:500;}',
        // 流程看板：四列泳道（不做装饰动画，信息密度优先）
        '.ztp-board{flex:1;display:flex;gap:10px;padding:12px 14px;min-height:0;overflow-x:auto;}',
        '.ztp-bcol{flex:1;min-width:180px;display:flex;flex-direction:column;min-height:0;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-alias-radius-lg,var(--dsw-radius-lg));background:var(--dsw-alias-bg-layer-1);overflow:hidden;}',
        '.ztp-bcol-h{flex:none;display:flex;align-items:center;gap:6px;padding:8px 10px;font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary);border-bottom:.5px solid var(--dsw-alias-border-l2);}',
        '.ztp-bcol-dot{width:7px;height:7px;border-radius:50%;flex:none;}',
        '.ztp-bcol-dot.todo{background:var(--dsw-alias-label-tertiary);}',
        '.ztp-bcol-dot.running{background:var(--dsw-alias-state-business-primary);}',
        '.ztp-bcol-dot.ask{background:var(--dsw-alias-state-warn-primary);}',
        '.ztp-bcol-dot.done{background:var(--dsw-alias-state-success-primary);}',
        '.ztp-bcol-h .ztp-num{font-weight:400;opacity:.75;}',
        '.ztp-bcol-b{flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:6px;}',
        '.ztp-bcol-empty{color:var(--dsw-alias-label-caption);text-align:center;padding:14px 0;font-size:12px;}',
        '.ztp-bgrp{display:flex;align-items:center;gap:5px;font-size:10.5px;font-weight:600;color:var(--dsw-alias-label-secondary);padding:2px 2px 0;}',
        '.ztp-bgrp-dot{width:6px;height:6px;border-radius:50%;background:var(--ztp-c,var(--dsw-alias-label-tertiary));}',
        '.ztp-bgrp .ztp-num{font-weight:400;opacity:.7;}',
        '.ztp-bcard{border:.5px solid var(--dsw-alias-border-l3);border-left:3px solid var(--ztp-c,var(--dsw-alias-border-l3));border-radius:var(--dsw-alias-radius-sm,var(--dsw-radius-sm));background:var(--dsw-alias-bg-layer-2);padding:7px 9px;cursor:pointer;}',
        '.ztp-bcard:hover{border-color:var(--dsw-alias-border-l4);background:var(--dsw-alias-interactive-bg-hover);}',
        '.ztp-bcard-t{display:flex;align-items:center;gap:5px;font-size:11px;color:var(--dsw-alias-label-secondary);flex-wrap:wrap;}',
        '.ztp-bcard-title{margin-top:3px;font-size:12px;line-height:1.4;color:var(--dsw-alias-label-primary);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word;}',
        '@media (max-width:719px){.ztp-search{width:110px;}}',

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
        '.ztp-card{position:relative;display:block;width:100%;box-sizing:border-box;text-align:left;font:inherit;color:inherit;background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-lg);padding:11px 14px 11px 16px;margin:0 0 10px;cursor:pointer;transition:background .12s ease,border-color .12s ease,transform .12s ease,box-shadow .12s ease;}',
        '.ztp-card:hover{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l4);box-shadow:var(--dsw-alias-shadow-lv1,0 1px 4px rgba(0,0,0,.1));}',
        '.ztp-card:active{background:var(--dsw-alias-interactive-bg-active);}',
        // 选中态二轮加强（2026-10-25 用户反馈「只是颜色变化不够明显」）：全高 4px 类型彩条 +
        // 阴影浮起 + 向右微移（示意指向右侧详情）+「查看中」文字角标——不依赖颜色感知也能识别。
        '.ztp-card.on{background:color-mix(in srgb,var(--ztp-c,var(--dsw-alias-state-business-primary)) 12%,var(--dsw-alias-bg-layer-2));border-color:var(--ztp-c,var(--dsw-alias-state-business-primary));box-shadow:inset 0 0 0 1px var(--ztp-c,var(--dsw-alias-state-business-primary)),var(--dsw-alias-shadow-lv1,0 1px 4px rgba(0,0,0,.12));transform:translateX(3px);}',
        '.ztp-card.on:before{opacity:1;width:4px;top:0;bottom:0;border-radius:0;}',
        '.ztp-card.on .ztp-card-title{font-weight:600;}',
        '.ztp-viewing-badge{position:absolute;top:-1px;right:-1px;font-size:10px;line-height:1;padding:3px 7px;border-radius:0 var(--dsw-alias-radius-lg,var(--dsw-radius-lg)) 0 var(--dsw-alias-radius-sm,var(--dsw-radius-sm));background:var(--ztp-c,var(--dsw-alias-state-business-primary));color:var(--dsw-alias-label-primary-foreground);pointer-events:none;}',
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
        // 截止时间强调：逾期红 / 临期（≤3 天）橙（终态状态不着色）
        '.ztp-dl{font-variant-numeric:tabular-nums;}',
        '.ztp-dl.soon{color:var(--dsw-alias-state-warn-primary);font-weight:600;}',
        '.ztp-dl.overdue{color:var(--dsw-alias-state-error-primary);font-weight:600;}',

        // 动作行（2026-10-27 改版）：左侧会话 chip；右侧「工具组 + 分隔线 + 主操作」——
        // 图标按钮与状态下拉收进 .ztp-utils（窄面板换行时整组不散），主操作永远在最后。
        '.ztp-acts{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:6px 8px;margin-top:9px;}',
        '.ztp-acts-right{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:6px;margin-left:auto;min-width:0;}',
        '.ztp-utils{display:inline-flex;align-items:center;gap:1px;flex:none;}',
        '.ztp-acts-sep{width:1px;height:15px;flex:none;background:var(--dsw-alias-border-l2);margin:0 2px;}',
        '.ztp-acts .ztp-btn{height:27px;padding:0 11px;font-size:11.5px;}',
        '.ztp-btn{appearance:none;font:inherit;font-size:12px;line-height:1;height:28px;padding:0 12px;border-radius:var(--dsw-radius-sm);border:.5px solid var(--dsw-alias-border-l3);background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;box-sizing:border-box;}',
        '.ztp-btn:hover{background:var(--dsw-alias-interactive-bg-hover);}',
        '.ztp-btn.primary{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground);border-color:transparent;}',
        '.ztp-btn.primary:hover{background:var(--dsw-alias-button-primary-hover);}',
        '.ztp-btn:disabled{opacity:.45;cursor:default;}',
        '.ztp-btn svg{width:13px;height:13px;}',
        // 纯图标小按钮（旗标/隐藏/复制）与激活态；卡片上再收紧到 24×24，和状态下拉排成一组
        '.ztp-btn.icon{padding:0 7px;color:var(--dsw-alias-label-tertiary);}',
        '.ztp-btn.icon:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover);}',
        '.ztp-btn.icon.on{color:var(--dsw-alias-state-business-primary);}',
        '.ztp-acts .ztp-btn.icon{width:24px;height:24px;padding:0;justify-content:center;border-color:transparent;}',
        '.ztp-acts .ztp-btn.icon:hover{background:var(--dsw-alias-interactive-bg-hover);}',
        '.ztp-acts .ztp-btn.icon.on{color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 12%,transparent);}',
        // 卡片上的「手动处理状态」下拉（自动 / 处理中 / 等你决策 / 已完成）
        // 与 head 的排序下拉同款轻量样式（原生 select，不设外观避免日/夜主题错色）
        '.ztp-statesel{flex:none;height:22px;box-sizing:border-box;padding:0 3px;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:11px;outline:none;cursor:pointer;max-width:98px;}',
        '.ztp-statesel:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);}',
        '.ztp-statesel.on{color:var(--dsw-alias-state-business-primary);font-weight:500;}',
        '.ztp-card.hiddenmark{opacity:.55;}',
        '.ztp-note-line{margin-top:3px;display:flex;align-items:flex-start;gap:4px;font-size:11.5px;line-height:1.4;color:var(--dsw-alias-label-caption);word-break:break-word;}',
        '.ztp-note-line svg{width:10px;height:10px;flex:none;margin-top:2px;}',
        '.ztp-reply-line{margin-top:2px;display:flex;align-items:flex-start;gap:4px;font-size:11.5px;line-height:1.4;color:var(--dsw-alias-label-secondary);word-break:break-word;}',
        '.ztp-reply-line svg{width:10px;height:10px;flex:none;margin-top:2px;opacity:.8;}',
        '.ztp-note-edit{display:flex;flex-direction:column;gap:6px;margin-top:12px;}',
        '.ztp-note-acts{display:flex;gap:6px;}',
        '.ztp-cont-box{display:flex;flex-direction:column;gap:6px;margin-top:8px;}',
        '.ztp-ask-box{display:flex;flex-direction:column;gap:6px;margin-top:12px;padding:10px 12px;border:.5px solid var(--dsw-alias-state-warn-border,var(--dsw-alias-border-l3));border-radius:var(--dsw-alias-radius-md,var(--dsw-radius-md));background:var(--dsw-alias-state-warn-bg,transparent);}',
        '.ztp-ask-t{font-size:12.5px;font-weight:600;color:var(--dsw-alias-state-warn-label,var(--dsw-alias-label-primary));}',
        '.ztp-ask-d{font-size:11px;color:var(--dsw-alias-label-tertiary);}',
        '.ztp-flagdot{display:inline-flex;color:var(--dsw-alias-state-business-primary);}',
        '.ztp-flagdot svg{width:11px;height:11px;}',

        // 关联会话 chip（「处理」过的卡片左侧显示会话标题，点击跳回该会话）
        '.ztp-slink{display:inline-flex;align-items:center;gap:4px;max-width:58%;height:22px;padding:0 8px;margin-right:auto;border-radius:999px;border:.5px solid var(--dsw-alias-border-l3);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;cursor:pointer;box-sizing:border-box;min-width:0;}',
        '.ztp-slink:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l4);}',
        '.ztp-slink svg{width:11px;height:11px;flex:none;opacity:.8;}',
        '.ztp-hbtn{display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 8px;border:none;border-radius:var(--dsw-alias-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer;}',
        '.ztp-hbtn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);}',
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
        '.ztp-foot-hide{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;height:18px;padding:0 4px;border-radius:var(--dsw-radius-sm);cursor:pointer;text-decoration:underline dotted;}',
        '.ztp-foot-hide:hover{color:var(--dsw-alias-label-primary);}',

        // ───────── Idea 1（2026-10-25）：连接状态点 + 离线提示条 ─────────
        // mast 右侧小圆点：绿=已连禅道 / 红=不可达（闪烁）/ 灰=未知（刚打开还没拉过）
        '.ztp-conn{width:7px;height:7px;border-radius:50%;flex:none;background:var(--dsw-alias-label-caption);}',
        '.ztp-conn.on{background:var(--dsw-alias-state-success-primary);}',
        '.ztp-conn.off{background:var(--dsw-alias-state-error-primary);animation:ztp-blink 1.6s ease-in-out infinite;}',
        // 离线常驻横条：轮询/刷新失败且面板仍在展示缓存数据时显示（错误视图只在无数据时抢占）
        '.ztp-offline{flex:none;display:flex;align-items:center;gap:10px;justify-content:space-between;padding:6px 14px;background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 9%,transparent);color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:1.5;border-bottom:.5px solid color-mix(in srgb,var(--dsw-alias-state-error-primary) 25%,transparent);}',

        // ───────── Idea 2（2026-10-25）：列表多选 + 批量下发 ─────────
        // 卡片左缘圆形勾选框（多选模式）：选中填主题色 + 白勾
        '.ztp-check{width:16px;height:16px;flex:none;border-radius:50%;border:1.2px solid var(--dsw-alias-border-l4);display:inline-flex;align-items:center;justify-content:center;color:transparent;transition:border-color .12s ease,background .12s ease;box-sizing:border-box;}',
        '.ztp-check svg{width:10px;height:10px;}',
        '.ztp-check.on{background:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary);color:#fff;}',
        '.ztp-card.sel{border-color:color-mix(in srgb,var(--dsw-alias-state-business-primary) 60%,var(--dsw-alias-border-l3));background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 7%,var(--dsw-alias-bg-layer-1));}',
        '.ztp-card.sel:before{opacity:1;}',
        // 底部批量操作条（多选模式常驻）：已选计数 + 全选/批量新建对话/批量处理/退出
        '.ztp-batchbar{flex:none;display:flex;align-items:center;gap:8px;padding:8px 14px;border-top:.5px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-layer-2);}',
        '.ztp-batch-info{font-size:12px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;}',

        // 详情
        '.ztp-detail-bar{display:flex;align-items:center;gap:8px;margin:0 0 8px;}',
        '.ztp-back{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;height:24px;padding:0 6px 0 2px;border-radius:var(--dsw-radius-sm);cursor:pointer;display:inline-flex;align-items:center;gap:3px;}',
        '.ztp-detail-copy{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;height:24px;padding:0 6px;border-radius:var(--dsw-alias-radius-sm,var(--dsw-radius-sm));cursor:pointer;display:inline-flex;align-items:center;gap:3px;margin-left:auto;}',
        '.ztp-detail-copy:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover);}',
        '.ztp-detail-copy svg{width:13px;height:13px;}',
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
        // 完成闭环按钮行（详情元信息卡下，仅 done 状态渲染）
        '.ztp-finish-row{margin-top:12px;display:flex;}',
        // 处理状态手动修正（详情元信息卡下）：自动检测丢失时可手改，持久化在本机
        '.ztp-state-edit{margin-top:12px;padding:10px 12px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-2);}',
        '.ztp-state-head{display:flex;align-items:center;gap:8px;margin-bottom:7px;}',
        '.ztp-state-label{font-size:11.5px;font-weight:600;color:var(--dsw-alias-label-secondary);letter-spacing:.02em;}',
        '.ztp-state-hint{font-size:11px;color:var(--dsw-alias-state-business-primary);}',
        '.ztp-state-chips{display:flex;flex-wrap:wrap;gap:6px;}',
        '.ztp-state-chip{appearance:none;font:inherit;font-size:12px;height:26px;padding:0 11px;border-radius:999px;border:.5px solid var(--dsw-alias-border-l3);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;}',
        '.ztp-state-chip:hover{border-color:var(--dsw-alias-border-l4);color:var(--dsw-alias-label-primary);}',
        '.ztp-state-chip.on{background:var(--dsw-alias-state-business-primary);border-color:transparent;color:var(--dsw-alias-label-primary-foreground);}',
        '.ztp-state-tip{margin-top:7px;font-size:11px;line-height:1.45;color:var(--dsw-alias-label-tertiary);}',
        '.ztp-desc{margin-top:10px;padding:10px 12px;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);font-size:12.5px;line-height:1.7;white-space:pre-wrap;word-break:break-word;}',
        '.ztp-section{font-size:11.5px;color:var(--dsw-alias-label-tertiary);margin:14px 2px 6px;}',
        // 处理结果摘要（关联会话最新回复，replies.v1 缓存）：详情页回读 agent 最后说了什么。
        // 限高 360px 内部滚动（完整内容不截断）；正文按 markdown 子集渲染（见 MarkdownLite）
        '.ztp-reply{padding:10px 12px;border-radius:var(--dsw-radius-md);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 7%,var(--dsw-alias-interactive-bg-hover));color:var(--dsw-alias-label-primary);font-size:12.5px;line-height:1.7;word-break:break-word;max-height:360px;overflow-y:auto;scrollbar-gutter:stable;scrollbar-width:thin;}',
        '.ztp-reply::-webkit-scrollbar{width:6px;}',
        '.ztp-reply::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l4);border-radius:3px;}',
        '.ztp-reply::-webkit-scrollbar-track{background:transparent;}',
        '.ztp-reply-meta{display:flex;align-items:center;gap:8px;margin-top:5px;font-size:11px;color:var(--dsw-alias-label-caption);}',
        '.ztp-reply-refresh{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;height:20px;padding:0 5px;border-radius:var(--dsw-radius-sm);cursor:pointer;}',
        '.ztp-reply-refresh:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover);}',
        // MarkdownLite 排版（agent 回复常用子集；尺寸按详情栏紧凑调过）
        '.ztp-md{font-size:12.5px;line-height:1.7;color:var(--dsw-alias-label-primary);}',
        '.ztp-md>*:first-child{margin-top:0;}',
        '.ztp-md>*:last-child{margin-bottom:0;}',
        '.ztp-md h1,.ztp-md h2,.ztp-md h3,.ztp-md h4,.ztp-md h5,.ztp-md h6{margin:10px 0 6px;line-height:1.4;font-weight:600;color:var(--dsw-alias-label-primary);}',
        '.ztp-md h1{font-size:15px;}.ztp-md h2{font-size:14px;}.ztp-md h3{font-size:13.5px;}.ztp-md h4,.ztp-md h5,.ztp-md h6{font-size:12.5px;}',
        '.ztp-md p{margin:6px 0;}',
        '.ztp-md ul,.ztp-md ol{margin:6px 0;padding-left:20px;}',
        '.ztp-md li{margin:2px 0;}',
        '.ztp-md blockquote{margin:6px 0;padding:2px 10px;border-left:2px solid var(--dsw-alias-border-l4);color:var(--dsw-alias-label-secondary);}',
        '.ztp-md code{font-family:var(--dsh-font-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-size:11.5px;background:var(--dsw-alias-interactive-bg-hover);border-radius:4px;padding:1px 4px;}',
        '.ztp-md pre{margin:8px 0;padding:10px 12px;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-interactive-bg-hover);overflow-x:auto;}',
        '.ztp-md pre code{background:transparent;padding:0;white-space:pre;display:block;min-width:max-content;}',
        '.ztp-md a{color:var(--dsw-alias-link);text-decoration:none;}',
        '.ztp-md a:hover{text-decoration:underline;}',
        '.ztp-md hr{border:0;border-top:.5px solid var(--dsw-alias-border-l3);margin:10px 0;}',
        '.ztp-md table{border-collapse:collapse;margin:8px 0;font-size:12px;max-width:100%;display:block;overflow-x:auto;}',
        '.ztp-md th,.ztp-md td{border:.5px solid var(--dsw-alias-border-l3);padding:4px 8px;text-align:left;vertical-align:top;}',
        '.ztp-md th{background:var(--dsw-alias-interactive-bg-hover);font-weight:600;white-space:nowrap;}',
        // 详情截图画廊：host 归一后的图片引用 → zentao.image RPC 取字节 → data: URL 渲染
        // （DSH 会话 UI 渲染附件图片就是 data:/blob: 两手，无 CSP 拦截）；点击放大
        '.ztp-imgs{display:flex;flex-direction:column;gap:8px;}',
        '.ztp-img-fig{margin:0;}',
        '.ztp-img-fig img{display:block;max-width:100%;max-height:420px;width:auto;height:auto;border-radius:var(--dsw-radius-md);border:.5px solid var(--dsw-alias-border-l3);cursor:zoom-in;}',
        '.ztp-img-loading{height:120px;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-skeleton);border:.5px solid var(--dsw-alias-border-l1);display:flex;align-items:center;justify-content:center;}',
        '.ztp-img-failed{height:56px;border-radius:var(--dsw-radius-md);border:.5px dashed var(--dsw-alias-border-l3);display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-tertiary);font-size:11.5px;}',
        '.ztp-img-zoom{position:fixed;inset:0;z-index:2147482100;background:color-mix(in srgb,#000 72%,transparent);display:flex;align-items:center;justify-content:center;cursor:zoom-out;}',
        '.ztp-img-zoom img{max-width:94vw;max-height:94vh;border-radius:var(--dsw-radius-md);box-shadow:var(--dsw-shadow-lv3);}',
        // 最近动态时间线（v1 actions）：左侧竖线 + 每条 desc/备注/字段变更
        '.ztp-actions{display:flex;flex-direction:column;gap:2px;margin:2px 0 4px;}',
        '.ztp-act{padding:5px 2px 5px 10px;border-left:2px solid var(--dsw-alias-border-l2);}',
        '.ztp-act + .ztp-act{border-top:.5px solid var(--dsw-alias-border-l1);}',
        '.ztp-act-head{display:flex;align-items:baseline;gap:8px;justify-content:space-between;}',
        '.ztp-act-desc{font-size:12.5px;color:var(--dsw-alias-label-primary);word-break:break-word;}',
        '.ztp-act-date{flex:none;font-size:11px;color:var(--dsw-alias-label-caption);}',
        '.ztp-act-comment{margin-top:4px;padding:6px 9px;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-interactive-bg-hover);font-size:12px;line-height:1.65;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;word-break:break-word;}',
        '.ztp-act .ztp-imgs{margin-top:6px;}',
        '.ztp-act-hist{margin-top:3px;font-size:11px;line-height:1.6;color:var(--dsw-alias-label-caption);word-break:break-word;}',
        '.ztp-act-toggle{appearance:none;border:0;background:transparent;color:var(--dsw-alias-link);font:inherit;font-size:11.5px;padding:4px 0 2px;cursor:pointer;align-self:flex-start;}',
        '.ztp-act-toggle:hover{text-decoration:underline;}',

        // 登录
        '.ztp-fill{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;}',
        '.ztp-login{flex:1;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;padding:32px 28px;max-width:420px;width:100%;margin:0 auto;}',        '.ztp-login-mark{width:44px;height:44px;border-radius:var(--dsw-radius-md);display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 12%,transparent);color:var(--dsw-alias-state-business-primary);margin-bottom:14px;}',
        '.ztp-login-title{font-size:15px;font-weight:600;color:var(--dsw-alias-label-primary);}',
        '.ztp-login-sub{margin:6px 0 16px;font-size:12px;line-height:1.7;color:var(--dsw-alias-label-tertiary);}',
        '.ztp-label{display:block;font-size:12px;color:var(--dsw-alias-label-secondary);margin:12px 0 5px;}',
        '.ztp-input{width:100%;height:32px;box-sizing:border-box;padding:0 10px;border-radius:var(--dsw-radius-md);border:.5px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;outline:none;}',
        // 附加指令 textarea（弹层）：覆盖 .ztp-input 的高度/内边距，可纵向拉伸
        '.ztp-instr{height:auto;min-height:52px;padding:7px 10px;resize:vertical;line-height:1.5;}',
        '.ztp-instr:focus{border-color:var(--dsw-alias-border-l4);}',
        // 指令模板预设 chip 行：填入按钮 + 删除 × + 存为预设
        '.ztp-instr-tps{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px;}',
        '.ztp-tp{display:inline-flex;align-items:center;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-2);overflow:hidden;}',
        '.ztp-tp-btn{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;line-height:1;height:22px;padding:0 7px;cursor:pointer;max-width:13em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
        '.ztp-tp-btn:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover);}',
        '.ztp-tp-x{appearance:none;border:0;border-left:.5px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:11px;line-height:1;height:22px;padding:0 5px;cursor:pointer;}',
        '.ztp-tp-x:hover{color:var(--dsw-alias-state-error-label);background:var(--dsw-alias-interactive-bg-hover);}',
        '.ztp-tp-add{appearance:none;border:.5px dashed var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:11px;line-height:1;height:22px;padding:0 8px;cursor:pointer;}',
        '.ztp-tp-add:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l4);}',
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
        '.ztp-acct-edit-btn{width:22px;height:22px;flex:none;display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;}',
        '.ztp-acct-edit-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);}',
        '.ztp-acct-edit-btn svg{width:12px;height:12px;}',
        '.ztp-acct-edit{flex:1;min-width:0;height:24px;box-sizing:border-box;padding:0 7px;border-radius:var(--dsw-radius-sm);border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;}',
        '.ztp-acct-edit:focus{outline:none;border-color:var(--dsw-alias-state-business-primary);}',
        '.ztp-acct-ok{width:22px;height:22px;flex:none;display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-state-success-primary);cursor:pointer;}',
        '.ztp-acct-ok:hover{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 12%,transparent);}',
        '.ztp-acct-ok svg{width:13px;height:13px;}',
        '.ztp-acct-no{width:22px;height:22px;flex:none;display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;}',
        '.ztp-acct-no:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);}',
        '.ztp-acct-no svg{width:12px;height:12px;}',
        '.ztp-acct-add{display:flex;align-items:center;gap:6px;width:100%;box-sizing:border-box;margin-top:3px;padding:7px 8px;border-radius:var(--dsw-radius-md);border:0;border-top:.5px solid var(--dsw-alias-border-l1);background:transparent;font:inherit;font-size:12.5px;color:var(--dsw-alias-label-secondary);cursor:pointer;}',
        '.ztp-acct-add:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);}',
        '.ztp-acct-add svg{width:13px;height:13px;}',

        // 「处理」确认弹层：先选工作区与模型，再新建会话下发
        '.ztp-disp-layer{position:fixed;inset:0;z-index:2147482000;display:flex;align-items:center;justify-content:center;background:var(--dsw-alias-bg-mask-2);}',
        '.ztp-disp-pop{width:min(380px,92vw);max-height:min(86vh,720px);overflow-y:auto;box-sizing:border-box;padding:16px;border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l3);box-shadow:var(--dsw-shadow-lv3);animation:ztp-pop .14s ease-out;}',
        '@keyframes ztp-pop{from{transform:scale(.97);opacity:.6}to{transform:none;opacity:1}}',
        '.ztp-disp-title{font-size:13.5px;font-weight:600;color:var(--dsw-alias-label-primary);}',
        '.ztp-disp-sub{margin:5px 0 2px;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-tertiary);word-break:break-word;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}',
        '.ztp-disp-acts{display:flex;gap:8px;margin-top:16px;}',
        '.ztp-disp-acts .ztp-btn{flex:1;height:30px;justify-content:center;}',
        '.ztp-disp-note{margin-top:10px;font-size:11px;color:var(--dsw-alias-label-caption);line-height:1.6;}',
        // 「自动带入」勾选（新建对话专用）：默认勾选 = 任务背景与截图填入草稿；取消 = 只建空白会话
        '.ztp-carry{display:flex;align-items:flex-start;gap:8px;margin-top:12px;padding:9px 11px;box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);cursor:pointer;user-select:none;}',
        '.ztp-carry:hover{border-color:var(--dsw-alias-border-l4);}',
        '.ztp-carry input{width:14px;height:14px;margin:1px 0 0;flex:none;accent-color:var(--dsw-alias-state-business-primary);cursor:pointer;}',
        '.ztp-carry-main{min-width:0;}',
        '.ztp-carry-t{display:block;font-size:12.5px;line-height:1.45;color:var(--dsw-alias-label-primary);}',
        '.ztp-carry-d{display:block;margin-top:2px;font-size:11px;line-height:1.5;color:var(--dsw-alias-label-tertiary);word-break:break-word;}',

        // ───────────────── 处理中任务的实时状态（M6：卡片上的活性徽标 + 常驻提醒）─────────────────────────
        // 会话关联（§4.3）+ uiSession.sessionStatus（running/pendingInteraction/completionUnread）
        // → 卡片顶行一枚状态胶囊：处理中三点跳动 / 等决策琥珀呼吸 / 已完成绿色对勾。
        '.ztp-live{display:inline-flex;align-items:center;gap:5px;height:20px;padding:0 9px;border-radius:999px;font-size:11px;font-weight:500;line-height:1;flex:none;white-space:nowrap;}',
        '.ztp-live i{width:5px;height:5px;border-radius:50%;background:currentColor;flex:none;}',
        '.ztp-live.running{color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 13%,transparent);}',
        '.ztp-live.ask{color:var(--dsw-alias-state-warn-primary);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 15%,transparent);}',
        '.ztp-live.done{color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 14%,transparent);}',
        // 手动修正过的状态：内描边区分「人设的」与「自动检测的」（title 里也写明）
        '.ztp-live.manual{box-shadow:inset 0 0 0 1px color-mix(in srgb,currentColor 42%,transparent);}',
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
      /** 账号别名编辑（账号菜单行内）。 */
      function PencilIcon() {
        return h('svg', { viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
          h('path', { d: 'M11.3 2.9l1.8 1.8L6 11.8l-2.4.6.6-2.4z', stroke: 'currentColor', strokeWidth: 1.1, strokeLinejoin: 'round' }),
        );
      }
      function ChatIcon() {
        return h('svg', { viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
          h('path', { d: 'M3 4.3c0-.72.58-1.3 1.3-1.3h7.4c.72 0 1.3.58 1.3 1.3v5c0 .72-.58 1.3-1.3 1.3H7.8L5.2 13.2v-2.6h-.9C3.58 10.6 3 10.02 3 9.3z', stroke: 'currentColor', strokeWidth: 1.1, strokeLinejoin: 'round' }),
        );
      }
      /** 新建对话（卡片动作行）：对话气泡 + 右上角加号，跟「处理」的播放三角区分开。 */
      function NewChatIcon() {
        return h('svg', { viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
          h('path', { d: 'M13.4 8.5v1.9c0 .72-.58 1.3-1.3 1.3H7.9l-2.6 2.1v-2.1h-.9c-.72 0-1.3-.58-1.3-1.3v-5c0-.72.58-1.3 1.3-1.3h3.2', stroke: 'currentColor', strokeWidth: 1.1, strokeLinejoin: 'round', strokeLinecap: 'round' }),
          h('path', { d: 'M12.6 2.6v4.2M10.5 4.7h4.2', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round' }),
        );
      }
      /** 处理（卡片主操作）：播放三角——「交给 agent 跑」。 */
      function PlayIcon() {
        return h('svg', { viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
          h('path', { d: 'M5.4 3.7l6.4 4.3-6.4 4.3z', stroke: 'currentColor', strokeWidth: 1.2, strokeLinejoin: 'round' }),
        );
      }
      /** 复制（卡片动作行/详情栏）：两张叠纸。 */
      function CopyIcon() {
        return h('svg', { viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
          h('rect', { x: 5.5, y: 5.5, width: 8, height: 8, rx: 1.5, stroke: 'currentColor', strokeWidth: 1.1 }),
          h('path', { d: 'M10.5 3.5v-.2c0-.72-.58-1.3-1.3-1.3H3.8c-.72 0-1.3.58-1.3 1.3v5.4c0 .72.58 1.3 1.3 1.3H4', stroke: 'currentColor', strokeWidth: 1.1, strokeLinecap: 'round' }),
        );
      }
      /** 旗标（卡片动作行）：小旗。 */
      function FlagIcon() {
        return h('svg', { viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
          h('path', { d: 'M4 13.5V3.2c2-.9 3.9-.9 6 .2 1.6.8 3 .9 4 .4V9c-1 .5-2.4.4-4-.4-2.1-1.1-4-1.1-6-.2', stroke: 'currentColor', strokeWidth: 1.1, strokeLinejoin: 'round', strokeLinecap: 'round' }),
        );
      }
      /** 本地备注（卡片摘要行）：铅笔。 */
      function NoteIcon() {
        return h('svg', { viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
          h('path', { d: 'm3 13 .9-3.2 6.4-6.4c.5-.5 1.3-.5 1.8 0l.5.5c.5.5.5 1.3 0 1.8l-6.4 6.4z', stroke: 'currentColor', strokeWidth: 1.1, strokeLinejoin: 'round', strokeLinecap: 'round' }),
        );
      }
      /** 极速重发（卡片动作行）：闪电。 */
      function BoltIcon() {
        return h('svg', { viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
          h('path', { d: 'M9.2 1.8 3.9 8.9h3.1l-.9 5.3 5.3-7.1H8.3z', stroke: 'currentColor', strokeWidth: 1.1, strokeLinejoin: 'round', strokeLinecap: 'round' }),
        );
      }
      /** 隐藏（卡片动作行）：圈斜杠。 */
      function HideIcon() {
        return h('svg', { viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
          h('circle', { cx: 8, cy: 8, r: 5.6, stroke: 'currentColor', strokeWidth: 1.1 }),
          h('path', { d: 'M4 12 12 4', stroke: 'currentColor', strokeWidth: 1.1, strokeLinecap: 'round' }),
        );
      }
      /** 批量选择入口（工具栏）：方框 + 勾。 */
      function BatchIcon() {
        return h('svg', { viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
          h('rect', { x: 2.5, y: 2.5, width: 11, height: 11, rx: 2.5, stroke: 'currentColor', strokeWidth: 1.2 }),
          h('path', { d: 'M5.4 8.3l1.8 1.8 3.4-3.8', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round' }),
        );
      }
      /** 勾选框内的小对勾（ztp-check.on 时显示）。 */
      function CheckMarkIcon() {
        return h('svg', { viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
          h('path', { d: 'M4.2 8.6l2.4 2.4 5.2-5.6', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }),
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
      /** 账号显示名：有别名用别名，否则禅道登录账号（host 侧已 trim/截断，这里再做防御）。 */
      function acctDisplayName(a) {
        var alias = a && typeof a.alias === 'string' ? a.alias.trim() : '';
        if (alias) return alias;
        return String((a && a.account) || '');
      }
      // ───────────── 列表搜索 / 排序 / 截止强调（纯函数，进 _test）─────────────
      /** 终态（已完成/已关闭/已取消）：不再参与逾期/临期强调，排序沉底。 */
      var FINAL_STATUS = { done: true, closed: true, cancel: true };
      function isFinalCard(c) { return FINAL_STATUS[(c && c.status) || ''] === true; }

      /**
       * 截止时间解析（now 可注入供测试）：逾期（截止日 23:59:59 已过）/
       * 临期（≤3 天，沿用旧 isUrgent 语义）/ 正常；解析不了返回 null。
       */
      function deadlineInfo(deadline, now) {
        if (!deadline) return null;
        var t = Date.parse(String(deadline).slice(0, 10) + 'T23:59:59');
        if (!Number.isFinite(t)) return null;
        var days = (t - (typeof now === 'number' ? now : Date.now())) / 86400000;
        return { ts: t, days: days, overdue: days < 0, soon: days >= 0 && days <= 3 };
      }
      /** 已逾期天数（向上取整，当天过期不算）；未逾期返回 0。 */
      function overdueDays(info) {
        if (!info || !info.overdue) return 0;
        return Math.floor(-info.days) + 1;
      }

      function priWeight(c) {
        var p = Number(c && c.pri);
        return Number.isFinite(p) && p > 0 ? p : 99;
      }
      function cmpIdDesc(a, b) { return Number(b && b.id) - Number(a && a.id); }
      /** 段序：逾期 0 / 临期 1 / 有截止 2 / 无截止 3（终态在 smart 里先行沉底）。 */
      function deadlineBucket(c, now) {
        var d = deadlineInfo(c && c.deadline, now);
        if (!d) return 3;
        return d.overdue ? 0 : d.soon ? 1 : 2;
      }
      function cmpDeadlineAsc(a, b, now) {
        var da = deadlineInfo(a && a.deadline, now), db = deadlineInfo(b && b.deadline, now);
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return da.ts - db.ts;
      }
      /**
       * 排序比较器（smart 是默认值）：
       * - smart：终态沉底 → 等你决策 > 处理中 > 普通卡片（逾期 > 临期 > 有截止 > 无截止）> 已完成
       *   → 段内截止↑ → 优先级↑ → id↓。实时状态由 liveOf(card) 注入（'ask'/'running'/'done'/null，
       *   来自 resolveLiveState），最该看的卡（agent 正在等你决策）永远第一屏；
       * - deadline：截止↑（无截止最后，终态沉底）；
       * - pri：优先级↑ → 截止↑ → id↓；
       * - origin：保持禅道返回顺序。
       * deadline/pri/origin 不掺实时状态——用户显式选了排序维度就尊重它。
       */
      /** 实时状态桶：ask 0 / running 1 / 普通 2 / done 3（已处理完但禅道侧未终态，沉到普通之后）。 */
      function liveRank(c, liveOf) {
        if (typeof liveOf !== 'function') return 2;
        var s = liveOf(c);
        if (s === 'ask') return 0;
        if (s === 'running') return 1;
        if (s === 'done') return 3;
        return 2;
      }
      var SORT_MAKERS = {
        smart: function (now, liveOf) {
          return function (a, b) {
            var fa = isFinalCard(a), fb = isFinalCard(b);
            if (fa !== fb) return fa ? 1 : -1;
            var la = liveRank(a, liveOf), lb = liveRank(b, liveOf);
            if (la !== lb) return la - lb;
            var ba = deadlineBucket(a, now), bb = deadlineBucket(b, now);
            if (ba !== bb) return ba - bb;
            var dl = cmpDeadlineAsc(a, b, now);
            if (dl !== 0) return dl;
            var pa = priWeight(a), pb = priWeight(b);
            if (pa !== pb) return pa - pb;
            return cmpIdDesc(a, b);
          };
        },
        deadline: function (now) {
          return function (a, b) {
            var fa = isFinalCard(a), fb = isFinalCard(b);
            if (fa !== fb) return fa ? 1 : -1;
            var dl = cmpDeadlineAsc(a, b, now);
            if (dl !== 0) return dl;
            return cmpIdDesc(a, b);
          };
        },
        pri: function (now) {
          return function (a, b) {
            var pa = priWeight(a), pb = priWeight(b);
            if (pa !== pb) return pa - pb;
            var dl = cmpDeadlineAsc(a, b, now);
            if (dl !== 0) return dl;
            return cmpIdDesc(a, b);
          };
        },
        origin: function () { return null; },
      };
      function sortCards(cards, mode, now, liveOf) {
        var list = Array.isArray(cards) ? cards.slice() : [];
        var maker = SORT_MAKERS[mode] || SORT_MAKERS.smart;
        var cmp = maker(typeof now === 'number' ? now : Date.now(), liveOf);
        return cmp ? list.sort(cmp) : list;
      }

      /** 搜索命中域：标题 + #id + 状态名 + 创建人/指派人（大小写不敏感）。 */
      function searchHaystack(card) {
        return ((card && card.title || '') + ' #' + (card && card.id) + ' '
          + statusLabel(card && card.status) + ' ' + (card && card.openedBy || '')
          + ' ' + (card && card.assignedTo || '')).toLowerCase();
      }
      /** 多关键词 AND 匹配（空格分隔，每个词都要命中）；空查询恒 true。 */
      function matchSearch(card, q) {
        var terms = String(q == null ? '' : q).trim().toLowerCase().split(/\s+/).filter(Boolean);
        if (!terms.length) return true;
        var hay = searchHaystack(card);
        for (var i = 0; i < terms.length; i++) {
          if (hay.indexOf(terms[i]) === -1) return false;
        }
        return true;
      }

      // ───────── 快捷筛选条（2026-10-25 迭代）：一键过滤高频关注维度 ─────────
      // 跨分类作用于全量卡片（等你决策的活不该按任务/Bug/需求分开找）；ask/running/done
      // 走活性状态（resolveLiveState 注入），overdue/today 走截止且排除禅道终态。
      var QUICK_FILTERS = [
        { id: 'ask', label: '等你决策' },
        { id: 'running', label: '处理中' },
        { id: 'flagged', label: '已标记' },
        { id: 'overdue', label: '逾期' },
        { id: 'today', label: '今天到期' },
        { id: 'done', label: '已完成' },
      ];

      /** 单卡是否命中快捷筛选；liveOf(card) → 'ask'|'running'|'done'|null（同列表排序注入）；
       *  flaggedOf(card) → bool（本地旗标，缺省恒 false）。 */
      function quickFilterHit(card, qf, liveOf, now, flaggedOf) {
        if (qf === 'flagged') return Boolean(flaggedOf) && flaggedOf(card) === true;
        if (qf === 'ask' || qf === 'running' || qf === 'done') {
          return Boolean(liveOf) && liveOf(card) === qf;
        }
        if (!card || isFinalCard(card)) return false;
        var dl = deadlineInfo(card.deadline, now);
        if (!dl) return false;
        if (qf === 'overdue') return dl.overdue;
        if (qf === 'today') return !dl.overdue && dl.days < 1; // 截止日当天（距 23:59:59 不足一天）
        return false;
      }
      /** 按快捷筛选过滤（qf 空 = 原样返回副本）。 */
      function quickFilterCards(cards, qf, liveOf, now, flaggedOf) {
        var list = Array.isArray(cards) ? cards : [];
        if (!qf) return list.slice();
        return list.filter(function (c) { return quickFilterHit(c, qf, liveOf, now, flaggedOf); });
      }
      /** 各筛选维度的计数（调用方先过搜索，chip 数字随搜索联动）。 */
      function quickFilterCounts(cards, liveOf, now, flaggedOf) {
        var m = { ask: 0, running: 0, flagged: 0, overdue: 0, today: 0, done: 0 };
        var list = Array.isArray(cards) ? cards : [];
        for (var i = 0; i < list.length; i++) {
          for (var j = 0; j < QUICK_FILTERS.length; j++) {
            if (quickFilterHit(list[i], QUICK_FILTERS[j].id, liveOf, now, flaggedOf)) m[QUICK_FILTERS[j].id]++;
          }
        }
        return m;
      }

      // ───────── 流程看板（2026-10-25 用户提案）：按处理阶段四列泳道 ─────────
      var BOARD_COLS = [
        { id: 'todo', label: '待处理' },
        { id: 'running', label: '处理中' },
        { id: 'ask', label: '等你决策' },
        { id: 'done', label: '已完成待闭环' },
      ];
      /** 卡片按处理阶段分四列（禅道终态卡不出现在看板；段内按截止↑优先级↑排）。
       *  liveOf(card) → 'ask'|'running'|'done'|null；null（含从未下发/进度已清）归「待处理」。 */
      function boardColumns(cards, liveOf, now) {
        var out = { todo: [], running: [], ask: [], done: [] };
        var list = Array.isArray(cards) ? cards : [];
        for (var i = 0; i < list.length; i++) {
          var c = list[i];
          if (!c || isFinalCard(c)) continue;
          var st = liveOf ? liveOf(c) : null;
          if (st === 'ask') out.ask.push(c);
          else if (st === 'running') out.running.push(c);
          else if (st === 'done') out.done.push(c);
          else out.todo.push(c);
        }
        for (var k in out) out[k] = sortCards(out[k], 'deadline', now, null);
        return out;
      }

      // ───────────── 自动轮询 + 新指派检测（Idea 1，2026-10-25）─────────────
      // 面板挂载期间每 POLL_INTERVAL_MS 静默拉一次 mine（host 侧 60s 缓存兜底），
      // 成功 → 连接点转绿 + 与上次键集合比对发现新指派时 toast 提醒；
      // 失败 → 连接点转红 + 离线横条常驻（数据兜底走 mine.v1 快照/上次列表），
      // 不弹 toast（离线期间每 5 分钟弹一次会把人吵死）。基线按账号分桶存模块级
      // 变量：面板卸载重挂不清零（避免重复提醒），首次见到只建基线（同 watchEval 模式）。
      var POLL_INTERVAL_MS = 5 * 60 * 1000;
      var lastMineIds = {}; // activeId → { 'kind-id': true }（新指派检测基线）

      /** mine.cards → 键集合（基线/对比用）。 */
      function cardKeyMap(cards) {
        var m = {};
        var list = Array.isArray(cards) ? cards : [];
        for (var i = 0; i < list.length; i++) {
          var c = list[i];
          if (c && c.kind && c.id != null) m[c.kind + '-' + c.id] = true;
        }
        return m;
      }
      /** 与基线比对的新指派：prev 为 null（首次，只建基线不提醒）；
       *  返回 {count, byKind}（无新增时 count=0）。 */
      function diffNewCards(prev, cards) {
        if (!prev) return { count: 0, byKind: {} };
        var byKind = {};
        var list = Array.isArray(cards) ? cards : [];
        for (var i = 0; i < list.length; i++) {
          var c = list[i];
          if (!c || !c.kind || c.id == null) continue;
          if (prev[c.kind + '-' + c.id]) continue;
          byKind[c.kind] = (byKind[c.kind] || 0) + 1;
        }
        var count = 0;
        for (var k in byKind) count += byKind[k];
        return { count: count, byKind: byKind };
      }
      /** 新指派 toast 文案：'禅道新指派 2 条（任务×1 · Bug×1）'。 */
      function newAssignedText(diff) {
        if (!diff || !diff.count) return '';
        var parts = [];
        for (var i = 0; i < KIND_ORDER.length; i++) {
          var k = KIND_ORDER[i];
          if (diff.byKind[k]) parts.push((KIND_LABEL[k] || k) + '×' + diff.byKind[k]);
        }
        return '禅道新指派 ' + diff.count + ' 条' + (parts.length ? '（' + parts.join(' · ') + '）' : '');
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

      /** 「最近动态」在插入内容里最多带多少条（取尾部最新；更早的只报总数不展开）。 */
      var MD_ACTIONS_MAX = 30;

      /** action 日期（"2026-09-22 09:09:16"）→ "2026-09-22 09:09"（非标准格式原样返回）。 */
      function mdActDate(s) {
        var t = String(s == null ? '' : s).trim().replace('T', ' ');
        return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(t) ? t.slice(0, 16) : t;
      }

      /**
       * 最近动态的可见条目（滤掉 desc/comment/history 全空的 + 截断到 MD_ACTIONS_MAX）。
       * 返回 {all, shown}：all 用于小节标题报总数，shown 是实际写进 Markdown / 附图的尾部最新条目。
       */
      function mdVisibleActions(actions) {
        var all = (Array.isArray(actions) ? actions : []).filter(function (a) {
          return a && (a.desc || a.comment || (a.history && a.history.length));
        });
        var shown = all.length > MD_ACTIONS_MAX ? all.slice(all.length - MD_ACTIONS_MAX) : all;
        return { all: all, shown: shown };
      }

      /**
       * 「最近动态」（v1 actions，host 已精简）→ Markdown 小节（2026-10-27 新建对话要求）。
       * 时间正序；每条 = 日期 + 禅道渲染好的中文句（desc，已由 host 剥掉时间戳前缀），
       * 备注与字段变更缩进成子项。备注里的图片占位符去掉——图片本身走真实附件插入
       * （与描述同款处理，见 insertImagesOf）。
       */
      function actionsToMarkdown(actions) {
        var vis = mdVisibleActions(actions);
        var acts = vis.all, shown = vis.shown;
        if (!shown.length) return '';
        var lines = ['### 最近动态（' + (shown.length < acts.length
          ? '最近 ' + shown.length + ' 条，共 ' + acts.length + ' 条'
          : acts.length + ' 条') + '）'];
        for (var i = 0; i < shown.length; i++) {
          var a = shown[i];
          var when = mdActDate(a.date);
          var head = (when ? when + ' ' : '') + String(a.desc || a.actor || '').trim();
          lines.push('- ' + (head || '（动态）'));
          var cmt = stripImageMarkers(a.comment);
          if (cmt) {
            var cl = cmt.split('\n');
            lines.push('  - 备注：' + cl[0]);
            for (var j = 1; j < cl.length; j++) lines.push('    ' + cl[j]);
          }
          var hist = Array.isArray(a.history) ? a.history : [];
          for (var k = 0; k < hist.length; k++) {
            var hv = hist[k];
            if (!hv || !hv.field) continue;
            lines.push('  - ' + hv.field + '：' + (hv.old ? hv.old + ' → ' : '') + (hv.new || ''));
          }
        }
        return lines.join('\n');
      }

      /**
       * 卡片 → 精简 Markdown（M3：插入输入框 / 新会话用；标题 + 描述/重现步骤，图片走真实附件）。
       * opts.actions=true 时追加「最近动态」小节（「新建对话」用，2026-10-27；「处理」、
       * 复制 Markdown、批量下发保持原模板不变）。
       */
      function cardToMarkdown(card, detail, opts) {
        var lines = [];
        lines.push('## 禅道' + (KIND_LABEL[card.kind] || card.kind) + ' #' + card.id + '：' + card.title);
        var desc = stripImageMarkers((detail && detail.desc) || card.descBrief || '');
        if (desc) {
          lines.push('');
          lines.push(card.kind === 'bug' ? '### 重现步骤/描述' : '### 描述');
          lines.push(desc);
        }
        var acts = (opts && opts.actions) ? actionsToMarkdown(detail && detail.actions) : '';
        if (acts) {
          lines.push('');
          lines.push(acts);
        }
        return lines.join('\n');
      }

      /** 「新建对话」的图片：描述图 + 最近动态备注里的图（按 url 去重，DSH 单消息 ≤20 张）。
       *  只取实际写进 Markdown 的动态条目（被 MD_ACTIONS_MAX 截掉的老备注不附图，免得
       *  附件里多出正文没提到的截图）。 */
      function insertImagesOf(card, detail) {
        var out = [];
        var seen = {};
        var add = function (list) {
          if (!Array.isArray(list)) return;
          for (var i = 0; i < list.length && out.length < 20; i++) {
            var x = list[i];
            if (!x || typeof x.url !== 'string' || !x.url || seen[x.url]) continue;
            seen[x.url] = true;
            out.push(x);
          }
        };
        add(imagesOf(card, detail));
        var acts = mdVisibleActions(detail && detail.actions).shown;
        for (var j = 0; j < acts.length && out.length < 20; j++) add(acts[j] && acts[j].images);
        return out;
      }

      /**
       * 「新建对话」的内容准备（2026-10-27：最近动态只在 v1 详情里，列表卡片没有）：
       * 调用方没带详情（从列表卡点「新建对话」）时先拉一次 detail，顺带拿到完整描述
       * （列表 descBrief 只有 300 字）。读取失败不挡插入——退列表摘要、本次不含最近动态。
       * 返回 {md, images, detail, fetched?, error?}。
       */
      function prepareInsertPayload(card, detail, rpc) {
        var build = function (d) {
          return {
            md: cardToMarkdown(card, d, { actions: true }),
            images: insertImagesOf(card, d),
            detail: d || null,
          };
        };
        if (detail && Array.isArray(detail.actions)) return Promise.resolve(build(detail));
        if (typeof rpc !== 'function') return Promise.resolve(build(detail || null));
        return Promise.resolve()
          .then(function () { return rpc('zentao.detail', { kind: card.kind, id: card.id }); })
          .then(function (r) {
            if (r && r.ok && r.value) {
              var ok = build(r.value);
              ok.fetched = true;
              return ok;
            }
            var p = build(detail || null);
            p.error = (r && r.error && r.error.message) || '详情读取失败';
            return p;
          }, function (e) {
            var p = build(detail || null);
            p.error = String((e && e.message) || e) || '详情读取失败';
            return p;
          });
      }

      // ───────────── 批量下发（Idea 2，2026-10-25）─────────────
      /** 批量 Markdown：一句总述 + 每卡一节（节格式与单卡 cardToMarkdown 完全一致，
       *  用列表级数据不逐个拉详情——单卡「处理」同样只用列表数据，行为对齐）。 */
      function batchToMarkdown(cards) {
        var list = (Array.isArray(cards) ? cards : []).filter(Boolean);
        if (!list.length) return '';
        var head = '共 ' + list.length + ' 项指派给我的禅道事项，请逐项分析处理：';
        return head + '\n\n' + list.map(function (c) { return cardToMarkdown(c, null); }).join('\n\n');
      }
      /** 批量摘要：{count, label, byKind}，label 形如 '任务×1 · Bug×2'（按 task→bug→story 列非零项）。 */
      function batchSummary(cards) {
        var m = { task: 0, bug: 0, story: 0 };
        var list = Array.isArray(cards) ? cards : [];
        for (var i = 0; i < list.length; i++) {
          var c = list[i];
          if (c && m[c.kind] != null) m[c.kind]++;
        }
        var parts = [];
        for (var j = 0; j < KIND_ORDER.length; j++) {
          var k = KIND_ORDER[j];
          if (m[k]) parts.push((KIND_LABEL[k] || k) + '×' + m[k]);
        }
        return { count: list.length, label: parts.join(' · '), byKind: m };
      }
      /** 批量图片：按卡片顺序合并图片引用，DSH 单消息 ≤20 张，超出截断。 */
      function mergeCardImages(cards) {
        var out = [];
        var list = Array.isArray(cards) ? cards : [];
        for (var i = 0; i < list.length && out.length < 20; i++) {
          var imgs = imagesOf(list[i], null);
          for (var j = 0; j < imgs.length && out.length < 20; j++) out.push(imgs[j]);
        }
        return out;
      }

      // ───────── 「自动带入」偏好（2026-10-27，新建对话弹层）：默认勾选 ─────────
      // 记住上次确认时的选择：常开空白会话的人不必每次取消勾选（勾选框始终可见，不会误操作）。
      var CARRY_KEY = 'dsh-zentao-panel.carry.v1';
      function readCarryPref() {
        try {
          var s = root.localStorage;
          var v = s && s.getItem(CARRY_KEY);
          if (v === '0') return false;
          if (v === '1') return true;
        } catch (e) { /* localStorage 不可用 → 默认勾选 */ }
        return true;
      }
      function saveCarryPref(on) {
        try {
          var s = root.localStorage;
          if (s) s.setItem(CARRY_KEY, on === false ? '0' : '1');
        } catch (e) { /* 忽略 */ }
      }

      // ───────── 附加指令（2026-10-25 迭代）：弹层可选输入，拼到任务背景末尾 ─────────
      var INSTR_KEY = 'dsh-zentao-panel.instr.v1';
      var instrFallback = null; // localStorage 不可用时的进程内兜底（与 links.v1 同模式）

      function readLastInstruction() {
        try {
          var s = root.localStorage;
          var v = s && s.getItem(INSTR_KEY);
          return typeof v === 'string' ? v : String(instrFallback || '');
        } catch (e) { return String(instrFallback || ''); }
      }
      function saveLastInstruction(text) {
        var v = String(text == null ? '' : text);
        instrFallback = v;
        try {
          var s = root.localStorage;
          if (s) s.setItem(INSTR_KEY, v);
        } catch (e) { /* 配额满等 → 内存兜底已写 */ }
      }
      /** 附加指令拼进任务背景（空白指令原样返回；指令 trim 后整段作为「## 处理要求」）。 */
      function appendInstruction(md, instr) {
        var t = String(instr == null ? '' : instr).trim();
        if (!t) return md;
        return String(md == null ? '' : md) + '\n\n## 处理要求\n\n' + t;
      }

      // ───────── 指令模板预设（2026-10-25 迭代）：附加指令的多套快捷模板 ─────────
      // 存 localStorage（数组 [{id, text, at}]，按插入序），全文去重、上限 12 条（超限最旧先出）。
      var INSTR_PRESETS_KEY = 'dsh-zentao-panel.instr-presets.v1';
      var MAX_INSTR_PRESETS = 12;
      var instrPresetsFallback = null; // localStorage 不可用时的进程内兜底

      /** 规整预设数组：非对象/空文本滤掉，全文去重（留先出现的），超上限最旧先出。 */
      function normInstrPresets(list) {
        var seen = {};
        var out = [];
        var arr = Array.isArray(list) ? list : [];
        for (var i = 0; i < arr.length; i++) {
          var p = arr[i];
          var text = String(p && p.text != null ? p.text : '').trim();
          if (!text || seen[text]) continue;
          seen[text] = true;
          out.push({ id: String(p.id || ('p' + i + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8))), text: text, at: Number(p.at) || Date.now() });
        }
        return out.length > MAX_INSTR_PRESETS ? out.slice(out.length - MAX_INSTR_PRESETS) : out;
      }
      function readInstrPresets() {
        try {
          var s = root.localStorage;
          var raw = s && s.getItem(INSTR_PRESETS_KEY);
          if (raw) return normInstrPresets(JSON.parse(raw)); // 坏 JSON 会 throw → 兜底
        } catch (e) { /* 坏数据当空 */ }
        return normInstrPresets(instrPresetsFallback || []);
      }
      function writeInstrPresets(list) {
        instrPresetsFallback = list;
        try {
          var s = root.localStorage;
          if (s) s.setItem(INSTR_PRESETS_KEY, JSON.stringify(list));
        } catch (e) { /* 配额满等 → 内存兜底已写 */ }
      }
      /** 存当前输入为模板（空白/已存在同文 = no-op）；返回新列表。 */
      function saveInstrPreset(text) {
        var t = String(text == null ? '' : text).trim();
        if (!t) return readInstrPresets();
        var list = readInstrPresets().filter(function (p) { return p.text !== t; });
        list.push({ id: 'p' + Date.now() + '-' + Math.random().toString(36).slice(2, 8), text: t, at: Date.now() });
        var next = normInstrPresets(list);
        writeInstrPresets(next);
        return next;
      }
      /** 删除指定模板；返回新列表。 */
      function removeInstrPreset(id) {
        var next = readInstrPresets().filter(function (p) { return p.id !== String(id); });
        writeInstrPresets(next);
        return next;
      }
      /** chip 预览文案：压空白取前 12 字，超长加省略号。 */
      function instrChipLabel(text) {
        var t = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
        return t.length > 12 ? t.slice(0, 12) + '…' : t;
      }

      // ───────── 旗标与隐藏（2026-10-25 迭代）：卡片本地标记 ─────────
      // marks.v1 与 links.v1 同构 key（<activeId>/<kind>-<id>），值 {flag?, hide?, at}。
      // 旗标 = 重点关注（快捷筛选加「已标记」维度）；隐藏 = 本地不想看（默认从列表滤掉，
      // 页脚「显示已隐藏」临时查看，宽限期后由 cleanupStaleLinks 一并清）。
      var MARKS_KEY = 'dsh-zentao-panel.marks.v1';
      var marksFallback = null; // localStorage 不可用时的进程内兜底

      function readMarkMap() {
        try {
          var s = root.localStorage;
          var raw = s && s.getItem(MARKS_KEY);
          if (raw) {
            var v = JSON.parse(raw); // 坏 JSON → 兜底
            if (v && typeof v === 'object') return v;
          } else {
            return marksFallback || (marksFallback = {});
          }
        } catch (e) { /* 坏数据当空 */ }
        return marksFallback || (marksFallback = {});
      }
      function writeMarkMap(map) {
        marksFallback = map;
        try {
          var s = root.localStorage;
          if (s) s.setItem(MARKS_KEY, JSON.stringify(map));
        } catch (e) { /* 配额满等 → 内存兜底已写 */ }
      }
      /** 切换旗标/隐藏；条目变空自动删。返回新 map。（组件内有同名局部，故加 Store 后缀语义词） */
      function toggleCardMark(activeId, card, field, now) {
        var map = readMarkMap();
        var key = sessionLinkKey(activeId, card);
        var v = map[key] && typeof map[key] === 'object' ? Object.assign({}, map[key]) : {};
        if (v[field]) delete v[field];
        else { v[field] = 1; v.at = (typeof now === 'number' && now) || Date.now(); }
        if (v.flag || v.hide) map[key] = v;
        else delete map[key];
        writeMarkMap(map);
        return map;
      }
      /** 卡片标记视图：{flag:bool, hide:bool}（缺省全 false）。 */
      function markOf(map, activeId, card) {
        var v = map && map[sessionLinkKey(activeId, card)];
        return {
          flag: Boolean(v && v.flag),
          hide: Boolean(v && v.hide),
        };
      }
      /** 当前账号在「当前列表」中被隐藏的卡片数（页脚「显示已隐藏」入口用）。
       *  只数列表里真实存在的卡：禅道里完成/转派后卡片离开「指派给我」，隐藏标记按
       *  72h 宽限保留（重新指派回来仍生效），但页脚数字必须与「点开能看到几张」一致，
       *  否则会一直挂着点开却找不到的旧卡片（2026-10-26 用户反馈）。 */
      function hiddenCount(map, activeId, cards) {
        var list = Array.isArray(cards) ? cards : [];
        var n = 0;
        for (var i = 0; i < list.length; i++) {
          var c = list[i];
          if (!c || !c.kind) continue;
          var v = map && map[sessionLinkKey(activeId, c)];
          if (v && v.hide) n++;
        }
        return n;
      }

      // ───────── 极速重发（2026-10-25 迭代）：记住上次下发的完整配置 ─────────
      // lastdispatch.v1 = {workspaceId?, cwd?, model?, instr, at}；「处理/插入/批量」任一
      // 成功（ok && sessionId）即保存。卡片上的 ⚡ 用它跳过弹层直接重发同类任务。
      var LASTDISPATCH_KEY = 'dsh-zentao-panel.lastdispatch.v1';
      var lastDispatchFallback = null;

      function readLastDispatch() {
        try {
          var s = root.localStorage;
          var raw = s && s.getItem(LASTDISPATCH_KEY);
          if (raw) {
            var v = JSON.parse(raw);
            if (v && typeof v === 'object' && (v.workspaceId || v.cwd || v.model || v.instr)) return v;
          }
        } catch (e) { /* 坏数据当空 */ }
        return lastDispatchFallback || null;
      }
      function saveLastDispatch(entry) {
        lastDispatchFallback = entry || null;
        try {
          var s = root.localStorage;
          if (s) s.setItem(LASTDISPATCH_KEY, JSON.stringify(entry));
        } catch (e) { /* 内存兜底已写 */ }
      }
      /** ⚡ 按钮 title 摘要：工作区/模型/指令三段拼一句（缺哪段跳哪段）。 */
      function lastDispatchSummary(last) {
        if (!last) return '';
        var parts = [];
        if (last.cwd) parts.push('继承目录');
        if (last.workspaceId) parts.push('工作区');
        if (last.model && last.model.model) parts.push('模型 ' + last.model.model);
        var t = parts.join(' · ');
        if (last.instr && String(last.instr).trim()) t += (t ? ' · ' : '') + '指令「' + instrChipLabel(last.instr) + '」';
        return t;
      }

      // ───────── 本地备注（2026-10-25 迭代）：卡片自己的可见笔记，不回写禅道 ─────────
      // notes.v1 与 links 同构 key，值 {text, at}；卡片上一行摘要、详情里编辑；
      // 保存空串 = 清除；cleanupStaleLinks 按宽限期顺带清。
      var NOTES_KEY = 'dsh-zentao-panel.notes.v1';
      var notesFallback = null;

      function readNoteMap() {
        try {
          var s = root.localStorage;
          var raw = s && s.getItem(NOTES_KEY);
          if (raw) {
            var v = JSON.parse(raw);
            if (v && typeof v === 'object') return v;
          }
        } catch (e) { /* 坏数据当空 */ }
        return notesFallback || (notesFallback = {});
      }
      function writeNoteMap(map) {
        notesFallback = map;
        try {
          var s = root.localStorage;
          if (s) s.setItem(NOTES_KEY, JSON.stringify(map));
        } catch (e) { /* 内存兜底已写 */ }
      }
      /** 保存/清除（空串清除）备注。返回新 map。 */
      function saveNote(activeId, card, text, now) {
        var map = readNoteMap();
        var key = sessionLinkKey(activeId, card);
        var t = String(text == null ? '' : text).trim();
        if (!t) delete map[key];
        else map[key] = { text: t, at: (typeof now === 'number' && now) || Date.now() };
        writeNoteMap(map);
        return map;
      }
      function getNote(map, activeId, card) {
        var v = map && map[sessionLinkKey(activeId, card)];
        return (v && typeof v.text === 'string' && v.text.trim()) ? v.text : '';
      }
      /** 卡片一行摘要：压空白取前 50 字，超长加省略号。 */
      function noteLine(text) {
        var t = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
        return t.length > 50 ? t.slice(0, 50) + '…' : t;
      }
      /** agent 回复一行摘要（卡片摘要行）：压空白取前 60 字，超长加省略号。 */
      function replyLine(text) {
        var t = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
        return t.length > 60 ? t.slice(0, 60) + '…' : t;
      }

      // ───────── 完成闭环（2026-10-25 迭代）：已完成卡片深链到禅道操作页 ─────────
      // 只读边界的最后一步留给禅道网页表单：task-finish / bug-resolve / story-close
      // 与查看页同 base（模块-方法-id.html，PATH_INFO 约定），由 card.url 替换得到。
      var FINISH_VIEWS = { task: 'task-finish', bug: 'bug-resolve', story: 'story-close' };

      /** card.url（*-view-{id}.html）→ 操作页深链；kind 不认识 / url 形态不符 → null。 */
      function finishUrl(card) {
        if (!card) return null;
        var method = FINISH_VIEWS[card.kind];
        if (!method) return null;
        var m = /^(.*\/)(?:task|bug|story)-view-(\d+)\.html?$/.exec(String(card.url || ''));
        return m ? (m[1] + method + '-' + m[2] + '.html') : null;
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
       * 详情图片内存缓存（模块级，不落盘）：url → dataURL。
       * 禅道 file-read 按 fileID 定址、内容不变，面板重挂/重开详情直接命中（不再转圈）；
       * ⌘R / 重启 DSH 即清。Map 迭代序 = 插入序，容量超限（张数/字节）从最旧开始淘汰。
       * 三个消费方共用：DetailImages（浏览）、prefetchImageBytes / attachImagesToDraft（下发附件）。
       */
      var IMAGE_CACHE_MAX = 40;
      var IMAGE_CACHE_MAX_BYTES = 24 * 1024 * 1024; // dataURL 字符串长度 ≈ 占用内存
      var imageCache = new Map();

      function cachedImageSrc(url) { return imageCache.get(url) || null; }

      function rememberImageSrc(url, dataUrl) {
        if (!url || typeof dataUrl !== 'string' || !dataUrl) return;
        imageCache.delete(url); // 重新插入移到队尾（保最新）
        imageCache.set(url, dataUrl);
        var total = 0;
        imageCache.forEach(function (v) { total += v.length; });
        var keys = imageCache.keys();
        while (imageCache.size && (imageCache.size > IMAGE_CACHE_MAX || (total > IMAGE_CACHE_MAX_BYTES && imageCache.size > 1))) {
          var oldest = keys.next().value;
          total -= imageCache.get(oldest).length;
          imageCache.delete(oldest);
        }
      }

      /** dataURL → {mediaType, base64}（缓存命中还原成 RPC value 形态）；不是 base64 dataURL 返回 null。 */
      function imageDataUrlParts(dataUrl) {
        var m = /^data:([^;,]+);base64,([\s\S]*)$/.exec(String(dataUrl || ''));
        return m ? { mediaType: m[1], base64: m[2] } : null;
      }

      /** url → RPC value：先查缓存（命中还原 name/mediaType/base64），未命中走 RPC 并回写缓存。 */
      function fetchImageValue(img) {
        var hit = cachedImageSrc(img.url);
        if (hit) {
          var parts = imageDataUrlParts(hit);
          if (parts) return Promise.resolve({ name: img.name, mediaType: parts.mediaType, base64: parts.base64 });
        }
        return rpcCall('zentao.image', { url: img.url }).then(function (r) {
          var v = (r && r.ok && r.value && r.value.base64) ? r.value : null;
          if (v) rememberImageSrc(img.url, 'data:' + (v.mediaType || 'image/png') + ';base64,' + v.base64);
          return v;
        }, function () { return null; });
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
          return fetchImageValue(img);
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
          return fetchImageValue(img);
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
       * 列表滚动到目标卡片（2026-10-25 用户反馈「跳转后不滚动」）：按 data-zcard 查
       * DOM，scrollIntoView nearest（只在卡片不可见时滚动，不打扰当前视野）。doc 参数
       * 可注入（测试用）。返回是否滚动成功。
       */
      function scrollCardIntoView(card, doc) {
        if (!card || !doc || typeof doc.querySelector !== 'function') return false;
        try {
          var el = doc.querySelector('[data-zcard="' + card.kind + '-' + card.id + '"]');
          if (el && typeof el.scrollIntoView === 'function') {
            el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            return true;
          }
        } catch (e) { /* DOM 环境异常忽略 */ }
        return false;
      }

      /**
       * 复制文本到剪贴板（一键复制用）：优先 navigator.clipboard，失败/不存在退
       * textarea + execCommand（老环境兜底）。resolve true = 复制成功。
       */
      function copyToClipboard(text) {
        var s = String(text == null ? '' : text);
        try {
          var nav = root.navigator;
          if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function') {
            return Promise.resolve(nav.clipboard.writeText(s)).then(function () { return true; }, function () {
              return copyViaDom(s);
            });
          }
        } catch (e) { /* 走 DOM 兜底 */ }
        return Promise.resolve(copyViaDom(s));
      }
      function copyViaDom(s) {
        try {
          var ta = document.createElement('textarea');
          ta.value = s;
          ta.setAttribute('readonly', '');
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          var ok = document.execCommand('copy');
          document.body.removeChild(ta);
          return Boolean(ok);
        } catch (e) { return false; }
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
       * 新会话公共前段（「处理」与「新建对话」共用，2026-10-25 抽出）：
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
       * 「新建对话」的插入路径（2026-10-25 用户要求改版）：与「处理」同款弹层选好工作区/
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
      /**
       * 「继续处理」（2026-10-25 迭代）：往已关联的会话**追加**新指令（如「按刚才的
       * 分析把代码改了」），不开新会话丢上下文。retain('zentao-panel') → scope →
       * setDraft → 250ms submit → 3s 释放 retain（模式与 dispatchToNewSession 尾段
       * 一致）；会话在跑时 submit 走宿主排队。调用方负责拼「【继续处理 禅道X #id】」
       * 前缀（模型可辨识是同一事项的追问）。
       */
      function continueInSession(sessionId, text) {
        var body = String(text == null ? '' : text).trim();
        if (!body) return Promise.resolve({ ok: false, reason: 'empty', message: '先输入要继续执行的内容' });
        var sessions = null, conversation = null;
        try {
          sessions = lookupService('sessions');
          conversation = lookupService('conversation');
        } catch (e) { /* 下方统一判 */ }
        if (!sessions || typeof sessions.retain !== 'function' || typeof sessions.scope !== 'function'
          || !conversation || !conversation.input) {
          return Promise.resolve({ ok: false, reason: 'unsupported', message: 'DSH 缺少会话输入服务，无法续发' });
        }
        var retainRef = null, scope = null;
        try {
          retainRef = sessions.retain(sessionId, { source: 'zentao-panel' });
          scope = sessions.scope(sessionId);
        } catch (e) { retainRef = null; scope = null; }
        var facade = null;
        try { facade = scope ? conversation.input.for(scope) : null; } catch (e) { facade = null; }
        if (!facade || typeof facade.setDraft !== 'function') {
          try { if (retainRef && typeof retainRef.release === 'function') retainRef.release(); } catch (e) { /* 已被释放 */ }
          return Promise.resolve({ ok: false, reason: 'unavailable', message: '会话输入接口不可用（会话可能已删除）' });
        }
        facade.setDraft(body);
        setTimeout(function () {
          try { if (typeof facade.submit === 'function') facade.submit(); } catch (e) { /* 已填草稿，发送交给用户 */ }
          setTimeout(function () {
            try { if (retainRef && typeof retainRef.release === 'function') retainRef.release(); } catch (e) { /* 已被释放 */ }
          }, 3000);
        }, 250);
        return Promise.resolve({ ok: true, mode: 'sent', sessionId: sessionId,
          message: '已续发到关联会话，卡片标签可跳回查看' });
      }

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

      /**
       * 新建**空白**会话（「新建对话」弹层取消勾选「自动带入」时，2026-10-27）：
       * 只建会话 + 按所选模型设置 + 跳转过去，不填草稿、不挂附件、不记卡片关联
       * （没有内容，关联只会让卡片误显示「处理中/已完成」）。
       * 顺序：create → selectModel（竞态小，跳过去模型已生效）→ uiWorkspace.openSession。
       * 服务缺失时：sessions 缺失 → ok:false 交上层提示；uiWorkspace 缺失 → 会话已建，
       * mode:'created'（从会话列表打开）。
       */
      function newBlankSession(choice) {
        var sessions = lookupService('sessions');
        if (!sessions || typeof sessions.create !== 'function') {
          return Promise.resolve({ ok: false, mode: 'unavailable', message: 'sessions 服务不可用（DSH 版本过旧？）' });
        }
        var opts = {};
        if (choice && choice.workspaceId) opts.workspaceId = choice.workspaceId;
        else if (choice && choice.cwd) opts.cwd = choice.cwd;
        else {
          // 未指定位置 → 继承当前会话工作目录（与 createDraftSession 同款兜底）
          try {
            var cur = currentSessionId(sessions);
            if (cur) {
              var row = sessions.list.getSnapshot().byId[cur];
              if (row && row.cwd) opts = { cwd: row.cwd };
            }
          } catch (e) { /* 忽略 */ }
        }
        return Promise.resolve()
          .then(function () { return sessions.create(opts); })
          .then(function (sessionId) {
            if (!sessionId) throw new Error('session.create 未返回会话 id');
            var modelStep = (choice && choice.model)
              ? selectModelFor(sessionId, choice.model)
              : Promise.resolve({ ok: true });
            return modelStep.then(function (mres) {
              var note = (mres && mres.ok === false) ? '（模型设置失败：' + mres.message + '）' : '';
              var ws = null;
              try { ws = lookupService('uiWorkspace'); } catch (e) { ws = null; }
              var jumped = Boolean(ws && typeof ws.openSession === 'function');
              if (jumped) {
                try { ws.openSession(sessionId); } catch (e) { jumped = false; }
              }
              return {
                ok: true, mode: jumped ? 'jumped' : 'created', sessionId: sessionId,
                message: (jumped
                  ? '已新建空白会话并跳转过去（未带入禅道内容）'
                  : '已新建空白会话（未能自动跳转，可从会话列表打开）') + note,
              };
            });
          })
          .catch(function (err) {
            return { ok: false, mode: 'failed', message: '新会话创建失败：' + (err && err.message ? err.message : String(err)) };
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
       *  值里带 kind/id/title（M6 实时状态徽标取名用；旧值没有也能从 key 解析 kind/id）
       *  和 lastSeen（最近一次确认还在「指派给我」列表的时间，清理宽限期的计时基准）。 */
      function saveSessionLink(activeId, card, sessionId) {
        var key = sessionLinkKey(activeId, card);
        var link = {
          sessionId: String(sessionId), at: Date.now(), lastSeen: Date.now(),
          kind: card.kind, id: card.id, title: String(card.title || ''),
        };
        var map = readLinkMap();
        map[key] = link;
        writeLinkMap(map);
        // 换了新会话 → 旧会话的进度记录与结果摘要作废（避免徽标/回复显示旧会话的陈旧内容）
        var sm = readStateMap();
        if (sm[key]) { delete sm[key]; writeStateMap(sm); }
        var rm = readReplyMap();
        if (rm[key] && rm[key].sessionId !== String(sessionId)) { delete rm[key]; writeReplyMap(rm); }
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

      // ───────────── 处理进度持久化（states.v1）+ 陈旧关联清理 ─────────────
      // M6 的活体状态来自 uiSession.sessionStatus（内存 store）：DSH 关闭期间后台
      // 会话跑完的 completionUnread 永久丢失，重启后面板看不到任何处理进度。
      // 这里把每次评估出的状态落 localStorage（key 与 links 同构）：
      // - done 是粘性进度记录——实时归零（看过会话/重启）后仍保留并兜底显示，
      //   直到再次处理 / 会话被删 / 卡片离开「指派给我」列表被清理；
      // - running/ask 是瞬态，只用于监控未就绪时（DSH 刚启动）短暂兜底显示。
      var STATES_KEY = 'dsh-zentao-panel.states.v1';
      var statesFallback = null; // localStorage 不可用时的进程内兜底（与 links 同模式）

      function readStateMap() {
        var s = linkStorage();
        if (s) {
          try {
            var v = s.getItem(STATES_KEY) ? JSON.parse(s.getItem(STATES_KEY)) : null;
            if (v && typeof v === 'object') return v;
          } catch (e) { /* 坏数据当空 */ }
          return {};
        }
        return statesFallback || (statesFallback = {});
      }
      function writeStateMap(map) {
        var s = linkStorage();
        if (s) {
          try { s.setItem(STATES_KEY, JSON.stringify(map)); return; } catch (e) { /* 配额满 → 退内存 */ }
        }
        statesFallback = map;
      }

      /** 可手动修正的处理状态（与 LIVE_STATE_LABEL 的键一致；顺序即详情里的 chip 顺序）。 */
      var LIVE_STATES = ['running', 'ask', 'done'];

      /**
       * 手动修正处理状态（2026-10-27 用户要求：已完成状态偶尔会丢）。
       * state 为 null/不认识 → 清除手动设置（回到自动检测）；否则写
       * {sessionId, state, at, manual:true, lastSeen}。
       * - resolveLiveState 优先取它，syncPersistedStates 不再改写（会话被删也不动：人明确
       *   断言过这个事项的状态，比会话存活更权威）；
       * - 没有关联会话也能设（sessionId 为 null）——没处理过的卡也能先标「已完成」。
       */
      function setManualState(activeId, card, state, now) {
        var key = sessionLinkKey(activeId, card);
        var map = readStateMap();
        var val = LIVE_STATES.indexOf(state) === -1 ? null : state;
        if (!val) {
          if (Object.prototype.hasOwnProperty.call(map, key)) {
            delete map[key];
            writeStateMap(map);
          }
          return map;
        }
        var link = getSessionLink(activeId, card);
        var prev = map[key];
        var t = (typeof now === 'number' && now) || Date.now();
        map[key] = {
          sessionId: (link && link.sessionId) || (prev && prev.sessionId) || null,
          state: val, at: t, manual: true, lastSeen: t,
        };
        writeStateMap(map);
        return map;
      }

      /** 状态源就绪判定：sessionStatus 快照里有任何条目才算就绪。
       *  空 Map/对象 = DSH 刚启动还没跟踪任何会话 → 不做「状态已结束」类写删（防重启风暴）。 */
      function statusMapReady(statusMap) {
        if (!statusMap) return false;
        if (typeof statusMap.size === 'number') return statusMap.size > 0;
        for (var k in statusMap) { if (k !== '__proto__') return true; }
        return false;
      }

      /** 活性状态落盘（watchEval 每次评估后调用）。
       *  会话被删（byIdReady 且无该行）→ 一律删；live 有值 → 记录（状态或会话变了才
       *  刷新 at，同一状态保留原时间——「更新于」语义要的是状态变化时刻）；
       *  live 归零 → done 保留（粘性）；**running 归零 → 升级为 done**（宿主的完成未读
       *  只对「后台」会话置位——用户正看着的会话（新建对话跳过去手动发、点 chip 去看过）
       *  跑完永远不置位，只认 completionUnread 会把「完成」漏成「无状态」）；ask 归零 =
       *  用户已回应（agent 会继续跑），不是完成 → 删。
       *  「确认结束」信号 confirmed = 状态源就绪（快照非空）或该会话在状态源里有行
       *  （有行且全 false = 真实 idle——比「整个 Map 非空」更准，避免跑完瞬间 Map
       *  恰好清空时误判成「未就绪」而卡在「处理中」）。 */
      function syncPersistedStates(entries, states, opts, now) {
        var t = (typeof now === 'number' && now) || Date.now();
        var map = null, dirty = false;
        var rmap = null, rdirty = false; // 结果摘要（replies.v1）：会话删了跟着删
        for (var i = 0; i < entries.length; i++) {
          var en = entries[i];
          var live = states[en.sessionId] || null;
          var gone = opts.byIdReady && opts.byId && opts.byId[en.sessionId] === undefined;
          if (!map) map = readStateMap();
          var cur = map[en.key];
          // 手动设置优先：自动评估既不覆盖，也不因会话归零/被删而清掉（人明确改过的状态）。
          // 唯一例外：关联会话确实被删时，旧结果摘要仍清（与 chip「会话已删除」一致）。
          if (cur && cur.manual) {
            if (gone) {
              if (!rmap) rmap = readReplyMap();
              if (rmap[en.key]) { delete rmap[en.key]; rdirty = true; }
            }
            continue;
          }
          if (live) {
            if (!cur || cur.state !== live || cur.sessionId !== en.sessionId) {
              map[en.key] = { sessionId: en.sessionId, state: live, at: t };
              dirty = true;
            }
          } else if (cur) {
            var confirmed = opts.statusReady
              || (opts.sessionSeen && opts.sessionSeen[en.sessionId]);
            if (gone) {
              delete map[en.key];
              dirty = true;
              if (!rmap) rmap = readReplyMap();
              if (rmap[en.key]) { delete rmap[en.key]; rdirty = true; }
            } else if (cur.state === 'done') {
              // 粘性进度记录：看过会话/重启后实时归零也保留
            } else if (!confirmed) {
              // 没有任何结束信号（DSH 刚启动、状态源全空且无该会话行）→ 不动，防重启风暴
            } else if (cur.state === 'running') {
              // running 消失 = 这一轮跑完了（含用户正看着的会话：completionUnread 不置位）
              map[en.key] = { sessionId: en.sessionId, state: 'done', at: t };
              dirty = true;
            } else {
              // ask 消失 = 用户已回应（agent 会继续跑），不是完成 → 删
              delete map[en.key];
              dirty = true;
            }
          }
        }
        if (dirty && map) writeStateMap(map);
        if (rdirty && rmap) writeReplyMap(rmap);
        return dirty || rdirty;
      }

      /** 卡片徽标取值（渲染查询入口）：实时监控优先，实时拿不到 → 兜底持久化进度。
       *  返回 {state, since}（since = 持久化记录的时间，实时命中时为 null）。
       *  - done 粘性显示：实时归零也保留——它记录的是「这个事项已处理完」；
       *  - running/ask 只在监控未就绪（快照没起来 / 状态源为空，DSH 刚启动）时
       *    兜底显示，就绪后以实时为准，避免把重启前死掉的 turn 显示成「处理中」。 */
      function resolveLiveState(link, snap, persisted) {
        // 手动修正优先（允许没有关联会话）：人明确设置过的状态比自动检测权威。
        // manual 标记由 setManualState 写入 states.v1，syncPersistedStates 不会改写它。
        if (persisted && persisted.manual && LIVE_STATES.indexOf(persisted.state) !== -1) {
          return { state: persisted.state, since: Number(persisted.at) || null, manual: true };
        }
        if (!link) return null;
        if (snap && snap.ready && snap.states && snap.states[link.sessionId]) {
          return { state: snap.states[link.sessionId], since: null };
        }
        if (!persisted || !persisted.state) return null;
        if (persisted.state !== 'done' && snap && snap.ready && snap.statusReady) return null;
        return { state: persisted.state, since: Number(persisted.at) || null };
      }

      /** 清理已不在「指派给我」列表里的事项（每次 mine 拉取成功后顺带跑，即「定时清理」）：
       *  卡片还在线 → 刷新 lastSeen（每小时最多写一次盘，减少 localStorage 磨损）；
       *  不在线且距 lastSeen（旧值退回 at）超过宽限期 → links 与 states 条目一起删
       *  （事项已完结/转派，会话关联与处理进度都没意义了）。
       *  无关联的手动状态（setManualState）按同一个 seen 判定保留——卡片在线就不清。
       *  只动当前账号的条目。mine 一次返回 task/bug/story 三类全量，不存在「某类数据没刷新误删」的情况。 */
      var LINK_GRACE_MS = 72 * 3600 * 1000; // 离开列表 72h 后清理（容忍列表短暂波动）
      function cleanupStaleLinks(activeId, cards, now) {
        var t = (typeof now === 'number' && now) || Date.now();
        var acct = String(activeId || 'anon');
        var seen = {};
        var list = Array.isArray(cards) ? cards : [];
        for (var i = 0; i < list.length; i++) {
          var c = list[i];
          if (c && c.kind && c.id != null) seen[c.kind + '-' + c.id] = true;
        }
        var links = readLinkMap();
        var states = readStateMap();
        var replies = readReplyMap();
        var dirtyLinks = false, dirtyStates = false, dirtyReplies = false;
        for (var key in links) {
          if (!Object.prototype.hasOwnProperty.call(links, key) || key === '__proto__') continue;
          var pk = parseLinkKey(key);
          if (!pk || pk.activeId !== acct) continue;
          var v = links[key];
          if (seen[pk.kind + '-' + pk.id]) {
            var ls = Number(v && v.lastSeen) || 0;
            if (t - ls > 3600 * 1000) { v.lastSeen = t; dirtyLinks = true; }
            continue;
          }
          // 不在列表：旧格式值没有 lastSeen 时退回 at（处理时间）作计时基准
          var ref = Number(v && (v.lastSeen || v.at)) || 0;
          if (t - ref > LINK_GRACE_MS) {
            delete links[key]; dirtyLinks = true;
            if (Object.prototype.hasOwnProperty.call(states, key)) { delete states[key]; dirtyStates = true; }
            if (Object.prototype.hasOwnProperty.call(replies, key)) { delete replies[key]; dirtyReplies = true; }
          }
        }
        // 进度记录（含「手动状态」这类可以没有关联会话的条目）：
        // 卡片还在列表 → 只刷新 lastSeen（每小时最多写一次）；关联已没了且超宽限期 → 清。
        // ⚠️ 不能按「无 link 即孤儿」直接删——手动状态允许在没处理过（无 link）的卡上设置。
        for (var sk in states) {
          if (!Object.prototype.hasOwnProperty.call(states, sk) || sk === '__proto__') continue;
          var spk = parseLinkKey(sk);
          if (!spk || spk.activeId !== acct) continue;
          var sv = states[sk];
          if (seen[spk.kind + '-' + spk.id]) {
            var sls = Number(sv && sv.lastSeen) || 0;
            if (t - sls > 3600 * 1000) { sv.lastSeen = t; dirtyStates = true; }
            continue;
          }
          if (links[sk]) continue; // 仍有关联的：由上面的 links 循环按 link.lastSeen 处理
          var sref = Number(sv && (sv.lastSeen || sv.at)) || t;
          if (t - sref > LINK_GRACE_MS) { delete states[sk]; dirtyStates = true; }
        }
        for (var rk in replies) {
          if (!Object.prototype.hasOwnProperty.call(replies, rk) || rk === '__proto__') continue;
          var rpk = parseLinkKey(rk);
          if (!rpk || rpk.activeId !== acct || links[rk]) continue;
          var rref = Number(replies[rk] && replies[rk].at) || t;
          if (t - rref > LINK_GRACE_MS) { delete replies[rk]; dirtyReplies = true; }
        }
        // 本地标记（旗标/隐藏）同样按宽限期清：卡片离开「指派给我」太久，标记跟着失效
        var marks = readMarkMap();
        var dirtyMarks = false;
        for (var mk in marks) {
          if (!Object.prototype.hasOwnProperty.call(marks, mk) || mk === '__proto__') continue;
          var mpk = parseLinkKey(mk);
          if (!mpk || mpk.activeId !== acct) continue;
          if (seen[mpk.kind + '-' + mpk.id]) {
            var mls = Number(marks[mk] && marks[mk].lastSeen) || 0;
            if (t - mls > 3600 * 1000) { marks[mk].lastSeen = t; dirtyMarks = true; }
            continue;
          }
          var mref = Number(marks[mk] && (marks[mk].lastSeen || marks[mk].at)) || 0;
          if (t - mref > LINK_GRACE_MS) { delete marks[mk]; dirtyMarks = true; }
        }
        if (dirtyMarks) writeMarkMap(marks);
        // 本地备注同规则：在线卡随 1h 限频刷新 seenAt 计时，离线超宽限删（备注已无意义）
        var notes = readNoteMap();
        var dirtyNotes = false;
        for (var nk in notes) {
          if (!Object.prototype.hasOwnProperty.call(notes, nk) || nk === '__proto__') continue;
          var npk = parseLinkKey(nk);
          if (!npk || npk.activeId !== acct) continue;
          if (seen[npk.kind + '-' + npk.id]) {
            if (t - (Number(notes[nk] && notes[nk].seenAt) || 0) > 3600 * 1000) {
              notes[nk].seenAt = t; dirtyNotes = true;
            }
            continue;
          }
          var nref = Number(notes[nk] && (notes[nk].seenAt || notes[nk].at)) || 0;
          if (t - nref > LINK_GRACE_MS) { delete notes[nk]; dirtyNotes = true; }
        }
        if (dirtyNotes) writeNoteMap(notes);
        if (dirtyLinks) writeLinkMap(links);
        if (dirtyStates) writeStateMap(states);
        if (dirtyReplies) writeReplyMap(replies);
        if (dirtyLinks || dirtyStates || dirtyReplies) watchPoke();
        return dirtyLinks || dirtyStates || dirtyReplies || dirtyMarks || dirtyNotes;
      }

      // ───────────── 列表快照持久化（mine.v1）：重启/重挂秒开 + 离线兜底 ─────────────
      // paneCache 是内存的，DSH 重启后首屏要等「RPC → 禅道探活 → 三类拉取」整条链路。
      // 这里把每次拉取成功的 mine 按账号存 localStorage：面板打开先用上次快照渲染
      // （值带 cached:true，页脚显示「HH:mm 缓存」），后台静默刷新替换；禅道不可达
      // 时快照 + 时间戳就是兜底视图，不再是一片骨架/错误。读坏自愈，同 links 模式。
      var MINE_KEY = 'dsh-zentao-panel.mine.v1';
      var MINE_SNAPSHOT_MAX_CARDS = 400;   // 卡片数上限（超出截断，正常远用不到）
      var MINE_SNAPSHOT_MAX_ACCOUNTS = 4;  // 账号数上限（按 savedAt 淘汰最旧）

      function readMineSnapshots() {
        var s = linkStorage();
        if (s) {
          try {
            var v = s.getItem(MINE_KEY) ? JSON.parse(s.getItem(MINE_KEY)) : null;
            if (v && typeof v === 'object') return v;
          } catch (e) { /* 坏数据当空 */ }
          return {};
        }
        return {};
      }
      /** 该账号的上次列表快照 → 直接可作 mine state 的形态（{cards, at, cached:true}）；无则 null。 */
      function readMineSnapshot(activeId) {
        if (!activeId) return null;
        var v = readMineSnapshots()[String(activeId)];
        if (!v || !Array.isArray(v.cards)) return null;
        return { cards: v.cards, at: Number(v.at) || 0, cached: true, savedAt: Number(v.savedAt) || 0 };
      }
      function writeMineSnapshot(activeId, mine) {
        if (!activeId || !mine || !Array.isArray(mine.cards)) return;
        var s = linkStorage();
        if (!s) return;
        var all = readMineSnapshots();
        all[String(activeId)] = {
          cards: mine.cards.slice(0, MINE_SNAPSHOT_MAX_CARDS),
          at: Number(mine.at) || Date.now(),
          savedAt: Date.now(),
        };
        var keys = Object.keys(all);
        if (keys.length > MINE_SNAPSHOT_MAX_ACCOUNTS) {
          keys.sort(function (a, b) { return (all[a].savedAt || 0) - (all[b].savedAt || 0); });
          for (var i = 0; i < keys.length - MINE_SNAPSHOT_MAX_ACCOUNTS; i++) delete all[keys[i]];
        }
        try { s.setItem(MINE_KEY, JSON.stringify(all)); } catch (e) { /* 配额满：放弃快照，不影响主流程 */ }
      }
      /** 账号被移除（凭据清除）时一并清它的列表快照。 */
      function removeMineSnapshot(activeId) {
        if (!activeId) return;
        var s = linkStorage();
        if (!s) return;
        var all = readMineSnapshots();
        if (!Object.prototype.hasOwnProperty.call(all, String(activeId))) return;
        delete all[String(activeId)];
        try { s.setItem(MINE_KEY, JSON.stringify(all)); } catch (e) { /* 忽略 */ }
      }

      // ───────────── 处理结果摘要回读（replies.v1 + 关联会话事件窗口）─────────────
      // 不跳会话就知道 agent 最后说了什么：retain 关联会话（retain 即自动打开事件流
      // 并回放最近历史窗口，HISTORY_PAGE_OPTIONS：maxMessages 500 / minTurns 2）→
      // binding(id).eventSource 快照的 entries 里找最后一条 assistant/message
      // （event.data.message.content 是块数组，源码 dsh-client-ui-chat toAssistantBlocks
      // 同款取 text 块）→ 截断后缓存 replies.v1（key 与 links 同构）→ release。
      var REPLIES_KEY = 'dsh-zentao-panel.replies.v1';
      var REPLY_MAX_CHARS = 20000;         // 防炸兜底上限（正常回复远达不到，达到也只是文末加省略号）
      var REPLY_TTL_MS = 10 * 60 * 1000;   // 详情打开自动回读的缓存有效期
      var repliesFallback = null;

      function readReplyMap() {
        var s = linkStorage();
        if (s) {
          try {
            var v = s.getItem(REPLIES_KEY) ? JSON.parse(s.getItem(REPLIES_KEY)) : null;
            if (v && typeof v === 'object') return v;
          } catch (e) { /* 坏数据当空 */ }
          return {};
        }
        return repliesFallback || (repliesFallback = {});
      }
      function writeReplyMap(map) {
        var s = linkStorage();
        if (s) {
          try { s.setItem(REPLIES_KEY, JSON.stringify(map)); return; } catch (e) { /* 配额满 → 退内存 */ }
        }
        repliesFallback = map;
      }

      function getReply(activeId, card) {
        var v = readReplyMap()[sessionLinkKey(activeId, card)];
        return (v && typeof v.sessionId === 'string' && v.sessionId && typeof v.text === 'string')
          ? v : null;
      }
      function saveReply(activeId, card, sessionId, text) {
        var raw = String(text == null ? '' : text);
        var clipped = raw.length > REPLY_MAX_CHARS;
        var t = clipped ? raw.slice(0, REPLY_MAX_CHARS) + '…' : raw;
        var map = readReplyMap();
        // full 标记本次是否存了完整文本：旧版截 500 字的缓存没有该字段 → 视为不完整，自动重拉
        var entry = { sessionId: String(sessionId), text: t, at: Date.now(), full: !clipped };
        map[sessionLinkKey(activeId, card)] = entry;
        writeReplyMap(map);
        return entry;
      }
      function removeReply(activeId, card) {
        var map = readReplyMap();
        delete map[sessionLinkKey(activeId, card)];
        writeReplyMap(map);
      }

      /** assistant/message 事件 → 可展示文本（拼接 text 块；只有 reasoning/工具块 → null）。 */
      function assistantEntryText(entry) {
        try {
          var ev = entry && entry.event;
          if (!ev || ev.type !== 'assistant/message') return null;
          var content = ev.data && ev.data.message && ev.data.message.content;
          if (!Array.isArray(content)) return null;
          var out = [];
          for (var i = 0; i < content.length; i++) {
            var b = content[i];
            if (b && b.type === 'text' && typeof b.text === 'string' && b.text.trim()) out.push(b.text.trim());
          }
          return out.length ? out.join('\n\n') : null;
        } catch (e) { return null; }
      }
      /** 事件窗口里最后一条有文本的 assistant 消息（从尾往头找；无 → null）。 */
      function lastAssistantText(entries) {
        if (!Array.isArray(entries)) return null;
        for (var i = entries.length - 1; i >= 0; i--) {
          var t = assistantEntryText(entries[i]);
          if (t) return t;
        }
        return null;
      }

      /**
       * 读取会话里最后一条 assistant 回复：retain（自动打开事件流并回放历史窗口）→
       * 等窗口里出现文本（subscribe + 超时兜底）→ 释放 retain。任何环节不可用 →
       * {ok:false, reason}，不抛错。手动刷新传较短超时；默认 5s。
       */
      function fetchLastReply(sessionId, timeoutMs) {
        var sessions = lookupService('sessions');
        if (!sessions || typeof sessions.retain !== 'function' || typeof sessions.binding !== 'function') {
          return Promise.resolve({ ok: false, reason: 'unsupported' });
        }
        var ref = null;
        try { ref = sessions.retain(sessionId, { source: 'zentao-panel' }); } catch (e) { ref = null; }
        if (!ref) return Promise.resolve({ ok: false, reason: 'retain' });
        var release = function () {
          try { if (ref && typeof ref.release === 'function') ref.release(); } catch (e) { /* 已被释放 */ }
        };
        var binding = null;
        try { binding = sessions.binding(sessionId); } catch (e) { binding = null; }
        var es = binding && binding.eventSource;
        if (!es || typeof es.getSnapshot !== 'function') {
          release();
          return Promise.resolve({ ok: false, reason: 'unsupported' });
        }
        return new Promise(function (resolve) {
          var settled = false;
          var un = null, timer = null;
          var finish = function (r) {
            if (settled) return;
            settled = true;
            if (un) { try { un(); } catch (e) { /* 忽略 */ } }
            if (timer) { try { clearTimeout(timer); } catch (e) { /* 忽略 */ } }
            release();
            resolve(r);
          };
          var grab = function () {
            try {
              var snap = es.getSnapshot();
              var text = lastAssistantText(snap && snap.entries);
              if (text) return { ok: true, text: text };
            } catch (e) { /* 忽略，等下一次 */ }
            return null;
          };
          var check = function () {
            var r = grab();
            if (r) finish(r);
          };
          if (typeof es.subscribe === 'function') un = es.subscribe(check);
          check();
          timer = setTimeout(function () {
            var r = grab();
            finish(r || { ok: false, reason: 'timeout' });
          }, (typeof timeoutMs === 'number' && timeoutMs > 0) ? timeoutMs : 5000);
        });
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

      // ───────────────────────── 会话头部反向跳转（Idea 3，2026-10-25）─────────────────
      // 面板 → 会话有 chip/toast 跳转（openSessionLink），这里是另一半闭环：处理过的
      // 会话头部（conversation.session.header.actions slot）出现「禅道」小按钮，点击
      // 切回禅道面板并定位到该卡片。源码事实（0.2.1-rc.2，探测记录见《计划书.md》§8）：
      //   该 slot 是 scope:'session'，entry 的 inject 回调第一个参数就是当前会话 id
      //   （dsh-client-ui-renderer 的 runInject 传 binding.key，官方 ui-jobs 同款）；
      //   inject 结果按会话缓存、切会话 remount，所以 links 的变化靠组件渲染时重读。
      /** links.v1 反查：sessionId → 最新关联（多条命中取 at 最新）。返回
       *  {key, link, parsed}（parsed = parseLinkKey 结果，含 activeId/kind/id），无则 null。 */
      function findLinkBySession(links, sessionId) {
        var best = null;
        if (!links || !sessionId) return null;
        for (var key in links) {
          if (!Object.prototype.hasOwnProperty.call(links, key) || key === '__proto__') continue;
          var v = links[key];
          if (!v || v.sessionId !== sessionId) continue;
          var at = Number(v.at) || 0;
          if (!best || at >= best.at) best = { key: key, link: v, parsed: parseLinkKey(key), at: at };
        }
        return best;
      }

      /** header 跳转的定位目标在列表里找完整卡片（focus.id 与卡片 id 统一 String 比较）。 */
      function findFocusCard(cards, focus) {
        if (!focus) return null;
        var list = Array.isArray(cards) ? cards : [];
        for (var i = 0; i < list.length; i++) {
          var c = list[i];
          if (c && c.kind === focus.kind && String(c.id) === String(focus.id)) return c;
        }
        return null;
      }

      /**
       * 会话头部「禅道」按钮点击：反查 links → （卡片属于其他账号时先 zentao.switch）→
       * 写 paneCache（tab + focus + 新 status/清 mine）→ layout.selectPanel('zentao')。
       * 面板挂载后由 ZentaoPane 的 focus effect 用列表数据定位完整卡片。
       * deps 可注入（rpc / selectPanel），缺省走真实服务；返回 {ok, reason?} 不抛错。
       */
      function jumpToZentaoCard(sessionId, deps) {
        deps = deps || {};
        var found = findLinkBySession(readLinkMap(), sessionId);
        if (!found || !found.parsed) return Promise.resolve({ ok: false, reason: 'nolink' });
        var target = found.parsed;
        var prevTab = paneCache.tab, prevFocus = paneCache.focus || null;
        var jump = function () {
          // 面板挂载读 paneCache 初始 state：tab 即目标分类；focus 由 ZentaoPane 消费
          paneCache.tab = target.kind;
          paneCache.focus = { kind: target.kind, id: target.id };
          try {
            // ⚠️ selectPanel 是 class 方法（内部 this.hasMainPanel/this.panels）——必须以
            // 方法形式调用，抽成裸函数会 this=undefined 直接 throw（dsh-pocket #117 同款坑，
            // 2026-10-25 真机踩过：按钮点了没反应、异常被 catch 静默）
            var layout = deps.selectPanel ? { selectPanel: deps.selectPanel } : lookupService('layout');
            if (!layout || typeof layout.selectPanel !== 'function') throw new Error('layout unavailable');
            layout.selectPanel(PANEL_ID);
          } catch (e) {
            paneCache.focus = prevFocus; // 面板没注册（selectPanel throw）→ 回滚定位意图
            paneCache.tab = prevTab;
            return { ok: false, reason: 'panel', message: String((e && e.message) || e) };
          }
          return { ok: true };
        };
        var cur = (paneCache.status && paneCache.status.activeId) || null;
        if (cur === target.activeId) return Promise.resolve(jump());
        // 卡片属于其他账号：先切过去（host 侧 cookie 即时生效），面板挂载时 status
        // 即新账号；旧账号的 mine/detailCard 必须清掉，防止挂载瞬间闪旧账号列表
        var call = deps.rpc || function (endpoint, payload) {
          return appCtx.connection.rpc.call(CHANNEL, endpoint, payload || {});
        };
        return Promise.resolve(call('zentao.switch', { id: target.activeId }))
          .then(function (r) {
            if (!r || !r.ok) return { ok: false, reason: 'switch', message: (r && r.error && r.error.message) || '' };
            paneCache.status = r.value || paneCache.status;
            paneCache.mine = null;
            paneCache.detailCard = null;
            return jump();
          })
          .catch(function (e) {
            return { ok: false, reason: 'switch', message: String((e && e.message) || e) };
          });
      }

      /**
       * 会话头部按钮组件（conversation.session.header.actions，scope:'session'）。
       * inject(sessionId) 经 zentaoSessionId prop 传入；渲染时重读 links 决定显隐
       * （切会话 remount + 本会话关联被覆盖/清除时下一次渲染自然消失）。
       * 左侧栏面板没挂上（leftWired=false，旧 DSH 悬浮兜底模式）时不显示——没有可跳的面板。
       */
      function ZentaoHeaderAction(props) {
        var sessionId = props && props.zentaoSessionId;
        if (!leftWired) return null;
        var found = sessionId ? findLinkBySession(readLinkMap(), sessionId) : null;
        if (!found) return null;
        var p = found.parsed || {};
        var label = found.link && found.link.title ? found.link.title
          : (p.kind ? p.kind + ' #' + p.id : '禅道卡片');
        return h('button', {
          type: 'button',
          className: 'ztp-hbtn',
          title: '回到禅道面板：' + label,
          onClick: function () {
            jumpToZentaoCard(sessionId, {}).then(function (r) {
              // 跳转失败不静默：console 留因（reason/message），下次真机排查直接可见
              if (!r || !r.ok) {
                try { console.warn('[dsh-zentao-panel] header jump failed:', r && r.reason, (r && r.message) || ''); } catch (e2) { /* 忽略 */ }
              }
            });
          },
        }, h(ZentaoGlyph, { size: 12 }), h('span', { className: 'ztp-hbtn-t' }, '禅道'));
      }

      /** 注册会话头部按钮（ui-conversation 激活该 slot 的 factory 时才真正挂 entry）。 */
      function registerHeaderAction() {
        appCtx.slots.inject('conversation.session.header.actions', function () {
          return appCtx.slots.register({
            name: 'conversation.session.header.actions',
            id: 'zentao-card',
            order: 25,
            inject: function (sessionId) { return { zentaoSessionId: sessionId }; },
          }, ZentaoHeaderAction);
        });
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
        var statusReady = statusMapReady(statusMap);

        var states = {};
        var sessionSeen = {}; // 该会话在 sessionStatus 快照里有行（有行且全 false = 真实 idle）
        var events = [];
        for (var i = 0; i < entries.length; i++) {
          var en = entries[i];
          var st = statusMap
            ? (typeof statusMap.get === 'function' ? statusMap.get(en.sessionId) : statusMap[en.sessionId])
            : undefined;
          sessionSeen[en.sessionId] = (st !== undefined && st !== null);
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

        watch.snapshot = { ready: true, activeId: activeId, statusReady: statusReady, states: states };
        watchEmit();
        // 处理进度落盘（states.v1）：重启/重开面板后徽标可恢复；粘性 done 记录「处理完」
        syncPersistedStates(entries, states,
          { byId: byId, byIdReady: byIdReady, statusReady: statusReady, sessionSeen: sessionSeen });
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
      /**
       * 离线提示条（Idea 1）：拉取失败且面板仍有数据可展示时常驻显示（错误视图只在
       * 无数据时抢占），点击重试强刷。at 传上次数据时间，有则说明正在看的是缓存。
       */
      function OfflineBar(props) {
        var at = Number(props && props.at) || 0;
        return h('div', { className: 'ztp-offline', role: 'alert' },
          h('span', { className: 'ztp-offline-t' },
            '禅道当前不可达' + (at
              ? '，正在展示 ' + new Date(at).toLocaleTimeString() + ' 的缓存数据'
              : '，数据可能不是最新')),
          h('button', { className: 'ztp-err-retry', type: 'button', onClick: props && props.onRetry }, '重试'));
      }

      /**
       * 流程看板（2026-10-25 用户提案·方案 A）：四列泳道同屏——待处理 → 处理中 →
       * 等你决策 → 已完成待闭环。纯信息密度（不做装饰动画，鲸鱼娘办公室的教训），
       * 点缩略卡回列表视图并打开详情。数据来自现有 links/states/实时监控，零新增 RPC。
       */
      function BoardView(props) {
        var cols = boardColumns(props.cards || [], props.liveOf || null, undefined);
        return h('div', { className: 'ztp-board' },
          BOARD_COLS.map(function (col) {
            var list = cols[col.id] || [];
            return h('div', { key: col.id, className: 'ztp-bcol c-' + col.id },
              h('div', { className: 'ztp-bcol-h' },
                h('i', { className: 'ztp-bcol-dot ' + col.id }),
                col.label,
                h('span', { className: 'ztp-num' }, list.length)),
              h('div', { className: 'ztp-bcol-b' },
                list.length
                  ? KIND_ORDER.map(function (k) {
      // 列内按 任务/Bug/需求 分组（2026-10-25 用户反馈）：组头带计数与类型色点，
      // 组内保持截止↑排序；缩略卡左彩条用类型色（--ztp-c），紧迫性由截止 chip 表达
                    var group = list.filter(function (c) { return c.kind === k; });
                    if (!group.length) return null;
                    return [
                      h('div', { key: 'g-' + k, className: 'ztp-bgrp' },
                        h('i', { className: 'ztp-bgrp-dot ztp-k-' + k }),
                        KIND_LABEL[k] || k,
                        h('span', { className: 'ztp-num' }, group.length)),
                      group.map(function (c) {
                        var dl = deadlineInfo(c.deadline);
                        return h('div', {
                          key: c.kind + '-' + c.id,
                          className: 'ztp-bcard ztp-k-' + c.kind,
                          title: (KIND_LABEL[c.kind] || c.kind) + ' #' + c.id + ' · 点击回列表打开详情',
                          onClick: function () { props.onPick(c); },
                        },
                          h('div', { className: 'ztp-bcard-t' },
                            h(KindTag, { kind: c.kind }),
                            props.flaggedOf && props.flaggedOf(c)
                              ? h('span', { className: 'ztp-flagdot' }, h(FlagIcon)) : null,
                            h('span', { className: 'ztp-id' }, '#' + c.id),
                            dl ? h('span', {
                              className: 'ztp-dl' + (dl.overdue ? ' overdue' : dl.soon ? ' soon' : ''),
                            }, (dl.overdue ? '逾期 ' : '') + fmtDate(c.deadline)) : null),
                          h('div', { className: 'ztp-bcard-title' }, c.title || ''));
                      }),
                    ];
                  })
                  : h('div', { className: 'ztp-bcol-empty' }, '—')));
          }));
      }

      /**
       * 快捷筛选条（2026-10-25 迭代）：等你决策/处理中/逾期/今天到期/已完成的
       * 一键过滤 chip（跨任务/Bug/需求）。单选：再点同一个清除；counts 由调用方
       * 在「搜索过滤后的全量卡片」上统计（数字随搜索联动）。
       */
      function QfBar(props) {
        var counts = (props && props.counts) || {};
        var active = (props && props.active) || null;
        return h('div', { className: 'ztp-qfbar', role: 'toolbar', 'aria-label': '快捷筛选' },
          QUICK_FILTERS.map(function (f) {
            var n = counts[f.id] || 0;
            return h('button', {
              key: f.id, type: 'button',
              className: 'ztp-qf' + (active === f.id ? ' on' : '') + (n ? '' : ' zero'),
              title: active === f.id
                ? '清除筛选「' + f.label + '」，回到分类视图'
                : '只看' + f.label + '的（跨任务/Bug/需求，叠加搜索词）',
              onClick: function () { props.onPick(active === f.id ? null : f.id); },
            }, f.label, n ? h('span', { className: 'ztp-num' }, n) : null);
          }));
      }

      function KindTag(props) {
        return h('span', { className: 'ztp-tag ' + props.kind }, KIND_LABEL[props.kind] || props.kind);
      }

      /**
       * 处理中任务的活性徽标（M6）：处理中三点跳动 / 等你决策琥珀呼吸 / 已完成绿色对勾。
       * state 来自 resolveLiveState（实时优先，持久化进度兜底）；since 有值时说明
       * 是持久化兜底（DSH 重启后恢复的进度），title 里带「更新于」时间。
       */
      function LiveBadge(props) {
        var s = props.state;
        if (!s) return null;
        return h('span', {
          className: 'ztp-live ' + s + (props.manual ? ' manual' : ''),
          title: (props.manual ? '手动设置的状态：' : '') + LIVE_STATE_TITLE[s]
            + (props.since ? '（更新于 ' + fmtLinkAt(props.since) + '）' : ''),
        },
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

      /**
       * 列表卡片。selectable（Idea 2 批量模式）：点击=勾选/取消、左缘圆形勾选框、
       * 不显示动作行/外链/拖拽（点卡片就是为了选，别的东西都是误触源）。
       */
      function CardItem(props) {
        var c = props.card;
        var sel = props.selectable === true;
        var dl = deadlineInfo(c.deadline);
        var dlCls = (!isFinalCard(c) && dl)
          ? (dl.overdue ? ' overdue' : dl.soon ? ' soon' : '') : '';
        var live = props.live || null;
        return h('div', {
          className: 'ztp-card ztp-k-' + c.kind
            + (props.active ? ' on' : '')
            + (sel && props.selected ? ' sel' : '')
            + (props.hidden ? ' hiddenmark' : '')
            + (live === 'ask' ? ' ztp-live-ask' : live === 'done' ? ' ztp-live-done' : ''),
          'data-zcard': c.kind + '-' + c.id, // 选中滚动定位锚点（scrollCardIntoView）
          draggable: !sel,
          title: sel ? '点击选中/取消选中' : '点击查看详情，可拖拽到对话输入框',
          onDragStart: sel ? undefined : function (e) {
            try {
              e.dataTransfer.setData('text/plain', cardToMarkdown(c));
              e.dataTransfer.effectAllowed = 'copy';
            } catch (err) { /* 忽略 */ }
          },
          onClick: function () {
            if (sel) { if (props.onToggleSel) props.onToggleSel(c); return; }
            props.onOpen(c);
          },
        },
          h('div', { className: 'ztp-top' },
            sel ? h('span', { className: 'ztp-check' + (props.selected ? ' on' : '') },
              props.selected ? h(CheckMarkIcon) : null) : null,
            h(KindTag, { kind: c.kind }),
            props.flagged ? h('span', { className: 'ztp-flagdot', title: '已标记重点关注' }, h(FlagIcon)) : null,
            live ? h(LiveBadge, { state: live, since: props.liveSince || null, manual: Boolean(props.liveManual) }) : null,
            h('span', { className: 'ztp-id' }, '#' + c.id),
            // 禅道超链接在卡片上（详情里不再放链接/按钮）；draggable 关掉避免链接拖拽覆盖卡片 Markdown 拖拽
            (!sel && c.url) ? h('a', {
              className: 'ztp-zlink', href: c.url, target: '_blank', rel: 'noreferrer', draggable: false,
              title: '在禅道打开' + (KIND_LABEL[c.kind] || c.kind) + ' #' + c.id,
              onClick: function (e) { e.stopPropagation(); },
            }, h(LinkIcon)) : null,
            h('span', { className: 'ztp-top-meta' },
              h(StatusChip, { status: c.status }),
              c.pri != null ? h('span', { className: 'ztp-pri p' + c.pri }, 'P' + c.pri) : null,
              c.severity != null ? h('span', null, '严重 ' + c.severity) : null,
              c.deadline ? h('span', {
                className: 'ztp-dl' + dlCls,
                title: dlCls ? (dl.overdue ? '已逾期 ' + overdueDays(dl) + ' 天' : '距截止不足 3 天') : '',
              }, (dlCls.indexOf('overdue') !== -1 ? '逾期 ' : '截止 ') + fmtDate(c.deadline)) : null,
              c.openedBy ? h('span', null, c.openedBy + ' 创建') : null,
              props.active && !sel ? h('span', { className: 'ztp-viewing-badge' }, '查看中') : null)),
          h('div', { className: 'ztp-card-title' }, c.title || ''),
          props.note ? h('div', { className: 'ztp-note-line', title: '本地备注：' + props.note },
            h(NoteIcon), noteLine(props.note)) : null,
          props.replySummary ? h('div', { className: 'ztp-reply-line', title: 'agent 最新回复：' + props.replySummary },
            h(ChatIcon), replyLine(props.replySummary)) : null,
          sel ? null : h('div', { className: 'ztp-acts' },
            props.linkView ? h('button', {
              className: 'ztp-slink' + (props.linkView.state === 'dead' ? ' dead' : ''),
              type: 'button',
              title: props.linkView.state === 'live'
                ? fmtLinkAt(props.linkView.at) + ' 处理 · 点击跳转到该会话'
                : (props.linkView.state === 'dead' ? '关联的会话已删除，点击清除标记' : '点击跳转到处理时创建的会话'),
              onClick: function (e) { e.stopPropagation(); props.onOpenSession(c); },
            }, h(SlinkDot, { state: live }), h(ChatIcon), h('span', { className: 'ztp-slink-t' },
              props.linkView.state === 'dead' ? '会话已删除' : props.linkView.title)) : null,
            // 右侧：工具组（状态下拉 + 图标动作）+ 分隔线 + 主操作。
            // 工具组整体换行，窄面板下不会把「新建对话 / 处理」拆散。
            h('div', { className: 'ztp-acts-right' },
              h('span', { className: 'ztp-utils' },
                // 处理状态手动修正（2026-10-27）：自动检测偶尔会丢（会话被删/重启/看着会话跑完），
                // 这里直接改；「自动」= 清除手动设置，回到跟随关联会话。选中值 = 手动值（空 = 自动）。
                h('select', {
                  className: 'ztp-statesel' + (props.liveManual ? ' on' : ''),
                  value: props.liveManual || '',
                  title: '手动设置处理状态（覆盖自动检测）：「自动」= 跟随关联会话',
                  'aria-label': '手动设置处理状态',
                  onClick: function (e) { e.stopPropagation(); },
                  onChange: function (e) { if (props.onSetState) props.onSetState(c, e.target.value || null); },
                }, h('option', { value: '' }, '状态：自动'),
                  h('option', { value: 'running' }, '处理中'),
                  h('option', { value: 'ask' }, '等你决策'),
                  h('option', { value: 'done' }, '已完成')),
                // 极速重发：有上次配置才显示——跳过弹层直接按上次的工作区/模型/指令下发
                props.quickTitle ? h('button', {
                  className: 'ztp-btn icon', type: 'button',
                  title: '极速重发（不弹窗）：' + props.quickTitle,
                  onClick: function (e) { e.stopPropagation(); props.onQuick(c); },
                }, h(BoltIcon)) : null,
                // 旗标/隐藏（本地标记，不回写禅道）：旗标进「已标记」筛选；隐藏从列表滤掉（页脚可临时显示）
                h('button', {
                  className: 'ztp-btn icon' + (props.flagged ? ' on' : ''), type: 'button',
                  title: props.flagged ? '取消标记（重点关注）' : '标记为重点关注（快捷筛选「已标记」可一键过滤）',
                  onClick: function (e) { e.stopPropagation(); props.onToggleMark(c, 'flag'); },
                }, h(FlagIcon)),
                h('button', {
                  className: 'ztp-btn icon' + (props.hidden ? ' on' : ''), type: 'button',
                  title: props.hidden ? '取消隐藏，恢复在列表显示' : '本地隐藏（不回写禅道；页脚「显示已隐藏」可找回）',
                  onClick: function (e) { e.stopPropagation(); props.onToggleMark(c, 'hide'); },
                }, h(HideIcon)),
                h('button', {
                  className: 'ztp-btn icon', type: 'button',
                  title: '复制「#' + c.id + ' ' + (c.title || '') + '」到剪贴板（贴 IM 用）',
                  onClick: function (e) { e.stopPropagation(); props.onCopyTitle(c); },
                }, h(CopyIcon))),
              h('span', { className: 'ztp-acts-sep', 'aria-hidden': 'true' }),
              h('button', {
                className: 'ztp-btn', type: 'button',
                title: '新建对话：选工作区与模型，可勾选「自动带入」任务背景与截图（跳过去，不自动发送）',
                onClick: function (e) { e.stopPropagation(); props.onNewChat(c, null); },
              }, h(NewChatIcon), '新建对话'),
              h('button', {
                className: 'ztp-btn primary', type: 'button',
                title: '选择工作区与模型，新建会话发送任务背景',
                onClick: function (e) { e.stopPropagation(); props.onDispatch(c, null); },
              }, h(PlayIcon), '处理'))),
        );
      }

      // ───────────── 极简 Markdown 渲染（MarkdownLite）─────────────
      // 免构建零依赖：md → 块结构 → React 元素树（不经 innerHTML，无 XSS 面）。
      // 覆盖 agent 回复常用子集：标题 / 段落 / **粗体** / *斜体* / `行内代码` /
      // [链接](http…) / 围栏代码块 / 引用（递归解析）/ 有序无序列表（缩进分级）/
      // 分隔线 / GFM 表格。段落内单个换行渲染为 <br>（贴合聊天文本习惯）。
      // ⚠️ DSH 没有可 require 的 markdown 组件（dsh-client-ui-primitives 的
      // MarkdownText 被内联进 ui-chat 的 bundle，模块表里没有），才自研这份子集。
      var MD_INLINE_RE = /(\*\*|__)([\s\S]+?)\1|\*([^*\n]+?)\*|`([^`\n]+)`|\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g;

      /** 行内标记 → 子节点数组（字符串与元素混排）。 */
      function mdInlineNodes(text, keyPrefix) {
        var s = String(text == null ? '' : text);
        var out = [];
        var last = 0, m = null, n = 0;
        MD_INLINE_RE.lastIndex = 0;
        while ((m = MD_INLINE_RE.exec(s)) !== null) {
          if (m.index > last) out.push(s.slice(last, m.index));
          if (m[2] !== undefined) out.push(h('strong', { key: keyPrefix + 'b' + n }, m[2]));
          else if (m[3] !== undefined) out.push(h('em', { key: keyPrefix + 'i' + n }, m[3]));
          else if (m[4] !== undefined) out.push(h('code', { key: keyPrefix + 'c' + n }, m[4]));
          else if (m[5] !== undefined) {
            out.push(h('a', { key: keyPrefix + 'a' + n, href: m[6], target: '_blank', rel: 'noreferrer' }, m[5]));
          }
          n++;
          last = m.index + m[0].length;
        }
        if (last < s.length) out.push(s.slice(last));
        return out.length ? out : [s];
      }
      /** 行内标记 + 单换行 <br>（段落 / 列表项文本用）。 */
      function mdInlineNodesWithBreaks(text, keyPrefix) {
        var lines = String(text == null ? '' : text).split('\n');
        var out = [];
        for (var i = 0; i < lines.length; i++) {
          if (i) out.push(h('br', { key: keyPrefix + 'br' + i }));
          var part = mdInlineNodes(lines[i], keyPrefix + 'l' + i + '-');
          for (var j = 0; j < part.length; j++) out.push(part[j]);
        }
        return out;
      }
      function mdSplitCells(row) {
        var s = String(row).trim();
        if (s.charAt(0) === '|') s = s.slice(1);
        if (s.charAt(s.length - 1) === '|' && s.slice(-2) !== '\\|') s = s.slice(0, -1);
        return s.split('|').map(function (c) { return c.trim(); });
      }
      var MD_IS_TABLE_SEP = function (line) {
        return line.indexOf('|') !== -1 && line.indexOf('-') !== -1 && /^[\s|:\-]+$/.test(line);
      };

      /** markdown 文本 → 块数组：h/p/code/quote/hr/list/table。 */
      function mdToBlocks(md) {
        var lines = String(md == null ? '' : md).replace(/\r\n?/g, '\n').split('\n');
        var blocks = [];
        var i = 0;
        while (i < lines.length) {
          var line = lines[i];
          if (!line.trim()) { i++; continue; }
          // 围栏代码块（``` 或 ~~~，任意围栏行闭合，未闭合到 EOF 也收）
          var fence = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
          if (fence) {
            var buf = [];
            i++;
            while (i < lines.length && !/^\s*(`{3,}|~{3,})\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
            if (i < lines.length) i++;
            blocks.push({ type: 'code', lang: fence[2].trim(), text: buf.join('\n') });
            continue;
          }
          var hm = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
          if (hm) { blocks.push({ type: 'h', level: hm[1].length, text: hm[2] }); i++; continue; }
          if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) { blocks.push({ type: 'hr' }); i++; continue; }
          // 引用：连续 > 行去掉标记后递归解析
          if (/^\s{0,3}>/.test(line)) {
            var qs = [];
            while (i < lines.length && /^\s{0,3}>/.test(lines[i])) {
              qs.push(lines[i].replace(/^\s{0,3}>\s?/, ''));
              i++;
            }
            blocks.push({ type: 'quote', blocks: mdToBlocks(qs.join('\n')) });
            continue;
          }
          // GFM 表格：表头行 + 分隔行（| : - 组成）
          if (line.indexOf('|') !== -1 && i + 1 < lines.length && MD_IS_TABLE_SEP(lines[i + 1])) {
            var head = mdSplitCells(line);
            i += 2;
            var rows = [];
            while (i < lines.length && lines[i].trim() && lines[i].indexOf('|') !== -1) {
              rows.push(mdSplitCells(lines[i]));
              i++;
            }
            blocks.push({ type: 'table', head: head, rows: rows });
            continue;
          }
          // 列表（缩进每 2 空格一级，封顶 3 级；带缩进的普通行并入上一项作软换行）
          var lm = /^(\s*)([-*+]|\d{1,3}[.)])\s+(.*)$/.exec(line);
          if (lm) {
            var items = [];
            while (i < lines.length) {
              var m2 = /^(\s*)([-*+]|\d{1,3}[.)])\s+(.*)$/.exec(lines[i]);
              if (m2) {
                items.push({
                  depth: Math.min(Math.floor(m2[1].replace(/\t/g, '  ').length / 2), 3),
                  ordered: m2[2].charAt(0) >= '0' && m2[2].charAt(0) <= '9',
                  text: m2[3],
                });
                i++;
                continue;
              }
              if (items.length && /^\s+\S/.test(lines[i])
                && !/^\s*(`{3,}|~{3,}|#{1,6}\s|>)/.test(lines[i])) {
                items[items.length - 1].text += '\n' + lines[i].replace(/^\s+/, '');
                i++;
                continue;
              }
              break;
            }
            blocks.push({ type: 'list', items: items });
            continue;
          }
          // 段落：吃到空行或任意块起始
          var ps = [line];
          i++;
          while (i < lines.length) {
            var l2 = lines[i];
            if (!l2.trim()
              || /^\s*(`{3,}|~{3,})/.test(l2)
              || /^#{1,6}\s/.test(l2)
              || /^\s{0,3}>/.test(l2)
              || /^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(l2)
              || /^(\s*)([-*+]|\d{1,3}[.)])\s+/.test(l2)
              || (l2.indexOf('|') !== -1 && i + 1 < lines.length && MD_IS_TABLE_SEP(lines[i + 1]))) break;
            ps.push(l2);
            i++;
          }
          blocks.push({ type: 'p', text: ps.join('\n') });
        }
        return blocks;
      }

      /** 扁平列表项（带 depth）→ 树（缩进跳级时挂到最近的浅级项下）。 */
      function mdListTree(items) {
        var roots = [];
        var stack = [];
        for (var k = 0; k < items.length; k++) {
          var it = items[k];
          var node = { ordered: it.ordered, text: it.text, children: [] };
          while (stack.length && stack[stack.length - 1].depth >= it.depth) stack.pop();
          if (!stack.length) roots.push(node);
          else stack[stack.length - 1].node.children.push(node);
          stack.push({ depth: it.depth, node: node });
        }
        return roots;
      }
      /** 列表树 → ul/ol 元素数组（连续同类型根合并进同一个列表）。 */
      function mdListGroup(nodes, kp) {
        var groups = [];
        var cur = null;
        for (var r = 0; r < nodes.length; r++) {
          if (!cur || cur.ordered !== nodes[r].ordered) {
            cur = { ordered: nodes[r].ordered, items: [] };
            groups.push(cur);
          }
          cur.items.push(nodes[r]);
        }
        return groups.map(function (grp, gi) {
          return h(grp.ordered ? 'ol' : 'ul', { key: kp + 'g' + gi },
            grp.items.map(function (nd, ii) {
              var k = kp + 'g' + gi + 'i' + ii;
              var kids = mdInlineNodesWithBreaks(nd.text, k + '-');
              if (nd.children.length) {
                var subs = mdListGroup(nd.children, k + 'c');
                for (var s = 0; s < subs.length; s++) kids.push(subs[s]);
              }
              return h('li', { key: k }, kids);
            }));
        });
      }
      function renderMdBlocks(blocks, kp) {
        return blocks.map(function (b, i) {
          var k = kp + '-' + i;
          if (b.type === 'h') return h('h' + b.level, { key: k }, mdInlineNodes(b.text, k + '-'));
          if (b.type === 'p') return h('p', { key: k }, mdInlineNodesWithBreaks(b.text, k + '-'));
          if (b.type === 'code') return h('pre', { key: k, 'data-lang': b.lang || undefined }, h('code', null, b.text));
          if (b.type === 'quote') return h('blockquote', { key: k }, renderMdBlocks(b.blocks, k + 'q'));
          if (b.type === 'hr') return h('hr', { key: k });
          if (b.type === 'table') {
            return h('table', { key: k },
              h('thead', { key: k + 'th' }, h('tr', { key: k + 'thr' },
                b.head.map(function (c, ci) { return h('th', { key: ci }, mdInlineNodes(c, k + 'h' + ci + '-')); }))),
              h('tbody', { key: k + 'tb' }, b.rows.map(function (row, ri) {
                return h('tr', { key: ri }, row.map(function (c, ci) {
                  return h('td', { key: ci }, mdInlineNodes(c, k + 'c' + ri + '_' + ci + '-'));
                }));
              })));
          }
          if (b.type === 'list') return mdListGroup(mdListTree(b.items), k);
          return null;
        });
      }
      /** markdown 子集渲染组件（处理结果摘要用；纯函数组件，无 hooks）。 */
      function MarkdownLite(props) {
        return h('div', { className: 'ztp-md' },
          renderMdBlocks(mdToBlocks((props && props.text) || ''), 'md'));
      }

      function DetailView(props) {
        var card = props.card;
        var detail = useState(null), err = useState(null);
        var noteText = useState(props.note || ''); // 本地备注编辑值；切卡重置（effect）
        var contOpen = useState(false), contText = useState(''); // 继续处理：展开态 + 追问文本
        var askOpen = useState(false), askText = useState('');   // 决策应答台：自定义回复展开态 + 文本
        useEffect(function () {
          noteText[1](String(props.note || ''));
          contOpen[1](false); contText[1](''); // 切卡收起续发框、清空输入
          askOpen[1](false); askText[1]('');
        }, [card.kind, card.id, props.note]);
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
        var dlAll = card.deadline || d.deadline;
        var dl = deadlineInfo(dlAll);
        var dlCls = (!isFinalCard(card) && dl)
          ? (dl.overdue ? ' overdue' : dl.soon ? ' soon' : '') : '';
        // 图片以真实截图渲染（DetailImages），文本里的 [图片：xxx] 占位标记随之去掉
        var desc = stripImageMarkers(d.desc || card.descBrief || '');
        var imgs = imagesOf(card, detail[0]);
        return h('div', null,
          // 详情纯只读：链接/按钮都在左侧卡片上；返回按钮仅在窄容器覆盖模式下可见
          h('div', { className: 'ztp-detail-bar' },
            h('button', { className: 'ztp-back', type: 'button', onClick: props.onBack }, h(BackIcon), '返回'),
            // 一键复制：详情已加载则含完整描述/重现步骤，未加载退列表摘要
            h('button', {
              className: 'ztp-detail-copy', type: 'button',
              title: '复制完整 Markdown（标题 + 描述/重现步骤）到剪贴板',
              onClick: function () { props.onCopyMd(card, detail[0] || null); },
            }, h(CopyIcon), '复制 Markdown')),

          h('div', { className: 'ztp-panel-card ztp-k-' + card.kind
              + (props.live === 'ask' ? ' ztp-live-ask' : props.live === 'done' ? ' ztp-live-done' : '') },
            h('div', { className: 'ztp-row' },
              h(KindTag, { kind: card.kind }),
              props.live ? h(LiveBadge, { state: props.live, since: props.liveSince || null, manual: Boolean(props.manual) }) : null,
              h('span', { className: 'ztp-id' }, '#' + card.id)),
            h('div', { className: 'ztp-detail-title' }, card.title || ''),
            h('div', { className: 'ztp-meta' },
              h(StatusChip, { status: card.status }),
              card.pri != null ? h('span', { className: 'ztp-pri p' + card.pri }, 'P' + card.pri) : null,
              card.severity != null ? h('span', null, '严重 ' + card.severity) : null,
              (card.deadline || d.deadline) ? h('span', {
                className: 'ztp-dl' + dlCls,
                title: dlCls ? (dl.overdue ? '已逾期 ' + overdueDays(dl) + ' 天' : '距截止不足 3 天') : '',
              }, (dlCls.indexOf('overdue') !== -1 ? '逾期 ' : '截止 ') + fmtDate(card.deadline || d.deadline)) : null),

            h('dl', { className: 'ztp-kv' },
              h('dt', null, '指派给'), h('dd', null, card.assignedTo || '—'),
              h('dt', null, '创建人'), h('dd', null, card.openedBy || '—'),
              d.type ? h('dt', null, '类型') : null, d.type ? h('dd', null, String(d.type)) : null,
              d.stage ? h('dt', null, '阶段') : null, d.stage ? h('dd', null, String(d.stage)) : null,
              d.estStarted ? h('dt', null, '预计开始') : null, d.estStarted ? h('dd', null, fmtDate(d.estStarted)) : null,
              d.resolvedBuild ? h('dt', null, '解决版本') : null, d.resolvedBuild ? h('dd', null, String(d.resolvedBuild)) : null)),

          // 处理状态手动修正（2026-10-27 用户要求）：自动检测偶尔会丢（会话被删、DSH 重启、
          // 正看着的会话跑完宿主不置完成未读），这里手动覆盖；持久化在 states.v1，重开面板/
          // 重启后仍在。「自动」清除覆盖，回到跟随关联会话的自动检测。
          h('div', { className: 'ztp-state-edit' },
            h('div', { className: 'ztp-state-head' },
              h('span', { className: 'ztp-state-label' }, '处理状态'),
              props.manual
                ? h('span', { className: 'ztp-state-hint' }, '手动设置 · 覆盖自动检测')
                : null),
            h('div', { className: 'ztp-state-chips' },
              h('button', {
                className: 'ztp-state-chip' + (!props.manual ? ' on' : ''), type: 'button',
                title: '跟随关联会话自动判断（清除手动设置）',
                onClick: function () { if (props.onSetState) props.onSetState(card, null); },
              }, '自动'),
              LIVE_STATES.map(function (s) {
                return h('button', {
                  key: s, type: 'button',
                  className: 'ztp-state-chip' + (props.manual === s ? ' on' : ''),
                  title: '手动标记为「' + LIVE_STATE_LABEL[s] + '」（覆盖自动检测，保存在本机）',
                  onClick: function () { if (props.onSetState) props.onSetState(card, s); },
                }, LIVE_STATE_LABEL[s]);
              })),
            h('div', { className: 'ztp-state-tip' },
              '自动检测丢了可在这里改；手动状态保存在本机，重开面板/重启后仍在。')),

          // 完成闭环（2026-10-25）：agent 处理完（done）才显示——深链到禅道的
          // 完成/解决操作页，由人在禅道里做最终操作（插件保持只读，不 API 回写）
          (props.live === 'done' && finishUrl(card)) ? h('div', { className: 'ztp-finish-row' },
            h('a', {
              className: 'ztp-btn primary', href: finishUrl(card), target: '_blank', rel: 'noreferrer',
              title: '在禅道打开该事项的完成/解决表单页（由你确认提交）',
            }, '去禅道标记完成', h(LinkIcon))) : null,

          err[0] ? h('div', { className: 'ztp-err' }, err[0]) : null,

          // 本地备注（2026-10-25 迭代）：自己的待办备忘，只存本机不回写禅道；卡片上一行摘要
          h('div', { className: 'ztp-note-edit' },
            h('div', { className: 'ztp-section' }, '本地备注（仅本机可见）'),
            h('textarea', {
              className: 'ztp-input ztp-instr', value: noteText[0], rows: 2,
              placeholder: '如：等张三回复后再动；先看 #1234 的关联改动',
              onChange: function (e) { noteText[1](e.target.value); },
            }),
            h('div', { className: 'ztp-note-acts' },
              h('button', {
                className: 'ztp-btn', type: 'button',
                onClick: function () { props.onSaveNote(card, noteText[0]); },
              }, '保存备注'),
              noteText[0] ? h('button', {
                className: 'ztp-btn', type: 'button',
                onClick: function () { noteText[1](''); props.onSaveNote(card, ''); },
              }, '清除') : null)),

          // 处理结果摘要（提案 3）：关联会话里最后一条 assistant 回复（replies.v1 缓存，
          // 详情打开且「已完成」时自动回读，TTL 内不重复拉；可手动刷新）
          // 决策应答台（2026-10-25 迭代）：等你决策时在面板里直接回复 agent，不跳会话。
          // 一键「同意继续」或自定义答复，走的都是 continueInSession（带卡片前缀）。
          (props.live === 'ask' && props.onContinue) ? h('div', { className: 'ztp-ask-box' },
            h('div', { className: 'ztp-ask-t' }, 'agent 正等你决策'),
            h('div', { className: 'ztp-ask-d' }, 'agent 的提问在下方「处理结果」区，在这里直接回复即可：'),
            h('div', { className: 'ztp-note-acts' },
              h('button', {
                className: 'ztp-btn primary', type: 'button',
                title: '向该会话发送「同意，请继续执行。」',
                onClick: function () { props.onContinue(card, '同意，请继续执行。'); },
              }, '同意，继续执行'),
              h('button', {
                className: 'ztp-btn', type: 'button',
                onClick: function () { askOpen[1](!askOpen[0]); },
              }, askOpen[0] ? '收起' : '自定义回复…')),
            askOpen[0] ? h('div', { className: 'ztp-cont-box' },
              h('textarea', {
                className: 'ztp-input ztp-instr', value: askText[0], rows: 2,
                placeholder: '输入给 agent 的决策/答复，如：方案 B 可以，但先补上单元测试',
                onChange: function (e) { askText[1](e.target.value); },
              }),
              h('div', { className: 'ztp-note-acts' },
                h('button', {
                  className: 'ztp-btn primary', type: 'button', disabled: !askText[0].trim(),
                  onClick: function () { props.onContinue(card, askText[0]); askOpen[1](false); askText[1](''); },
                }, '回复并继续'))) : null) : null,

          props.replyLink ? h('div', { className: 'ztp-reply-wrap' },
            h('div', { className: 'ztp-section' }, '处理结果（关联会话最新回复）'),
            props.reply
              ? h('div', { className: 'ztp-reply' }, h(MarkdownLite, { text: props.reply.text }))
              : (props.replyLoading
                ? h('div', { className: 'ztp-reply', style: { color: 'var(--dsw-alias-label-tertiary)', display: 'block' } },
                    h('span', { className: 'ztp-spin', style: { display: 'inline-block', verticalAlign: '-2px' } }), ' 正在读取…')
                : h('div', { className: 'ztp-reply', style: { color: 'var(--dsw-alias-label-tertiary)', display: 'block' } }, '暂无缓存的回复，可点下方「重新读取」')),
            h('div', { className: 'ztp-reply-meta' },
              props.reply ? h('span', null, '更新于 ' + fmtLinkAt(props.reply.at)) : null,
              props.onRefreshReply ? h('button', {
                className: 'ztp-reply-refresh', type: 'button', disabled: !!props.replyLoading,
                onClick: props.onRefreshReply,
                title: '重新从关联会话读取最新回复',
              }, '重新读取') : null,
              // 继续处理（2026-10-25 迭代）：往关联会话追加指令，不开新会话丢上下文
              props.onContinue ? h('button', {
                className: 'ztp-reply-refresh', type: 'button',
                onClick: function () { contOpen[1](!contOpen[0]); },
              }, contOpen[0] ? '收起续发' : '继续处理…') : null),
            contOpen[0] && props.onContinue ? h('div', { className: 'ztp-cont-box' },
              h('textarea', {
                className: 'ztp-input ztp-instr', value: contText[0], rows: 2,
                placeholder: '追加给该会话的指令，如：按刚才的分析把代码改了，改完跑一遍测试',
                onChange: function (e) { contText[1](e.target.value); },
              }),
              h('div', { className: 'ztp-note-acts' },
                h('button', {
                  className: 'ztp-btn primary', type: 'button', disabled: !contText[0].trim(),
                  onClick: function () { props.onContinue(card, contText[0]); contOpen[1](false); contText[1](''); },
                }, '续发到会话'))) : null) : null,

          h('div', { className: 'ztp-section' }, card.kind === 'bug' ? '重现步骤 / 描述' : '描述'),
          desc
            ? h('div', { className: 'ztp-desc' }, desc)
            : h('div', { className: 'ztp-desc', style: { color: 'var(--dsw-alias-label-tertiary)' } }, detail[0] ? '无描述' : '加载中…'),

          imgs.length ? h('div', { className: 'ztp-section' }, '截图（' + imgs.length + '）') : null,
          h(DetailImages, { images: imgs }),

          // 最近动态（提案 2）：v1 actions 精简时间线——同事备注/流转记录/字段变更
          (d.actions && d.actions.length) ? h('div', { className: 'ztp-section' }, '最近动态（' + d.actions.length + '）') : null,
          (d.actions && d.actions.length) ? h(ActionTimeline, { actions: d.actions }) : null,
        );
      }

      /**
       * 详情截图：desc 里的 <img> 已被 host 归一成可下载地址（images[].url），
       * 这里逐张走 zentao.image RPC 取字节，用 data: URL 直接渲染（DSH 会话 UI
       * 渲染附件图片用的就是 data:/blob:，主窗口无 CSP 拦截）。
       * 逐张独立请求独立落位：单张失败只占位提示不拦其它；点击放大，再点关闭。
       */
      /**
       * DetailImages 的取图内核（从 effect 抽出便于直测）：缓存命中的同步回填（面板重挂/
       * 重开详情秒出），未命中的逐张走 zentao.image RPC，成功回写缓存。失败不缓存，
       * 下次挂载自然重试。markRow(i, url, patch) 由调用方同步进组件 state。
       * 返回 cancel()：卸载（或 key 切换）后迟到的回调作废。
       */
      function loadDetailImages(urls, markRow) {
        var alive = true;
        urls.forEach(function (url, i) {
          var cached = cachedImageSrc(url);
          if (cached) { markRow(i, url, { src: cached }); return; }
          rpcCall('zentao.image', { url: url }).then(function (r) {
            if (!alive) return;
            var v = r && r.ok && r.value;
            var src = v && v.base64 ? 'data:' + (v.mediaType || 'image/png') + ';base64,' + v.base64 : null;
            if (src) rememberImageSrc(url, src);
            markRow(i, url, src ? { src: src } : { failed: true });
          }, function () {
            if (alive) markRow(i, url, { failed: true });
          });
        });
        return function () { alive = false; };
      }

      function DetailImages(props) {
        var images = (props.images || []).slice(0, 20);
        var key = images.map(function (x) { return x.url; }).join('|');
        var rows = useState([]);
        var zoom = useState(null);
        useEffect(function () {
          var alive = true;
          var urls = key ? key.split('|') : [];
          // 初始行直接用缓存铺底：已看过的图不转圈，转圈只留给新图
          rows[1](urls.map(function (url) { return { url: url, src: cachedImageSrc(url), failed: false }; }));
          var cancel = loadDetailImages(urls, function (i, url, patch) {
            if (!alive) return;
            rows[1](function (cur) {
              // key 已切换（url 对不上）或本张已有结果 → 忽略迟到的回调
              if (!cur[i] || cur[i].url !== url || cur[i].src || cur[i].failed) return cur;
              var next = cur.slice();
              next[i] = Object.assign({}, cur[i], patch);
              return next;
            });
          });
          return function () { alive = false; cancel(); };
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

      /** action.date（"2026-09-22 09:09:16"）→ 紧凑展示：今年 "09-22 09:09"，往年带年份。 */
      function fmtActDate(s) {
        var m = /^(\d{4})-(\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(String(s || ''));
        if (!m) return String(s || '');
        return m[1] === String(new Date().getFullYear()) ? (m[2] + ' ' + m[3]) : (m[1] + '-' + m[2]);
      }

      /** 「最近动态」默认折叠条数（时间正序，折叠时只露尾部最新几条）。 */
      var ACTION_FOLD_N = 5;

      /**
       * 最近动态时间线（v1 actions，host 已精简：desc 现成中文句 / comment 备注正文 /
       * history 字段变更明细）。时间正序、折叠只显示最近 5 条，可展开全部；
       * 备注里的内联图片复用 DetailImages 走 zentao.image 真实渲染。
       */
      function ActionTimeline(props) {
        var acts = (props.actions || []).filter(function (a) {
          return a && (a.desc || a.comment || (a.history && a.history.length));
        });
        var fold = useState(true);
        useEffect(function () { fold[1](true); }, [props.actions]);
        if (!acts.length) return null;
        var over = acts.length > ACTION_FOLD_N;
        var skipped = acts.length - ACTION_FOLD_N;
        var shown = (fold[0] && over) ? acts.slice(skipped) : acts;
        return h('div', { className: 'ztp-actions' },
          shown.map(function (a, i) {
            return h('div', { key: (a.date || '') + '#' + (acts.length - shown.length + i), className: 'ztp-act' },
              h('div', { className: 'ztp-act-head' },
                h('span', { className: 'ztp-act-desc' }, a.desc || a.actor || ''),
                a.date ? h('span', { className: 'ztp-act-date' }, fmtActDate(a.date)) : null),
              a.comment ? h('div', { className: 'ztp-act-comment' }, stripImageMarkers(a.comment)) : null,
              (a.images && a.images.length) ? h(DetailImages, { images: a.images }) : null,
              (a.history && a.history.length) ? h('div', { className: 'ztp-act-hist' },
                a.history.map(function (hv, j) {
                  return h('div', { key: j }, hv.field + '：' + (hv.old ? hv.old + ' → ' : '') + hv.new);
                })) : null);
          }),
          over ? h('button', {
            className: 'ztp-act-toggle', type: 'button',
            onClick: function () { fold[1](!fold[0]); },
          }, fold[0] ? ('展开全部（' + acts.length + ' 条）') : '收起') : null);
      }

      /**
       * 多账号：账号管理弹出层（切换 / 添加 / 改别名 / 按账号移除）。
       * 别名是行内编辑态（editing = {id, value}）：主名显示别名、原账号下沉到副行；
       * 空 = 清除别名。回调都是 render 作用域函数读当次 state，不用 useCallback（闭包坑）。
       */
      function AccountSwitcher(props) {
        var accounts = props.accounts || [];
        var editing = useState(null);
        var startEdit = function (a) {
          editing[1]({ id: a.id, value: (a && typeof a.alias === 'string' ? a.alias : '') });
        };
        var applyEdit = function (a) {
          var ed = editing[0];
          editing[1](null);
          if (ed) props.onRename(a, ed.value);
        };
        return h('div', { className: 'ztp-acct-layer', onClick: props.onClose },
          h('div', { className: 'ztp-acct-pop', onClick: function (e) { e.stopPropagation(); } },
            accounts.map(function (a) {
              var ed = editing[0] && editing[0].id === a.id ? editing[0] : null;
              return h('div', {
                key: a.id,
                className: 'ztp-acct-row' + (a.id === props.activeId ? ' on' : ''),
                role: 'button', tabIndex: 0,
                onClick: ed ? undefined : function () { props.onPick(a); },
                onKeyDown: ed ? undefined : function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); props.onPick(a); } },
              },
                ed ? [
                  h('input', {
                    key: 'input', className: 'ztp-acct-edit', value: ed.value, spellCheck: false,
                    autoFocus: true, maxLength: 30, placeholder: '账号别名（留空 = 清除）',
                    title: '别名只保存在本机，用来区分多个账号（最多 30 字）',
                    onClick: function (e) { e.stopPropagation(); },
                    onChange: function (e) { editing[1]({ id: a.id, value: e.target.value }); },
                    onKeyDown: function (e) {
                      if (e.key === 'Enter') { e.preventDefault(); applyEdit(a); }
                      else if (e.key === 'Escape') { e.preventDefault(); editing[1](null); }
                    },
                  }),
                  h('button', {
                    key: 'ok', className: 'ztp-acct-ok', type: 'button', title: '保存别名',
                    onClick: function (e) { e.stopPropagation(); applyEdit(a); },
                  }, h(CheckMarkIcon)),
                  h('button', {
                    key: 'no', className: 'ztp-acct-no', type: 'button', title: '取消',
                    onClick: function (e) { e.stopPropagation(); editing[1](null); },
                  }, h(CloseIcon)),
                ] : [
                  h('span', { key: 'main', className: 'ztp-acct-main' },
                    h('span', { className: 'ztp-acct-name' }, acctDisplayName(a) || '（未命名）'),
                    h('span', { className: 'ztp-acct-host' },
                      (a.alias && String(a.alias).trim()) ? ((a.account || '') + ' · ' + hostOf(a.baseUrl)) : hostOf(a.baseUrl))),
                  h('button', {
                    key: 'edit', className: 'ztp-acct-edit-btn', type: 'button',
                    title: a.alias ? '修改别名（当前：' + a.alias + '）' : '设置别名（方便区分多个账号）',
                    onClick: function (e) { e.stopPropagation(); startEdit(a); },
                  }, h(PencilIcon)),
                  h('i', {
                    key: 'dot',
                    className: 'ztp-dot',
                    title: a.loggedIn ? '已登录' : '未登录',
                    style: { color: a.loggedIn ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-label-caption)', flex: 'none' },
                  }),
                  h('button', {
                    key: 'del', className: 'ztp-acct-del', type: 'button', title: '移除此账号（清除本机凭据）',
                    onClick: function (e) { e.stopPropagation(); props.onRemove(a); },
                  }, h(TrashIcon)),
                ]);
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
       * 「处理」/「新建对话」确认弹层：先选工作区与模型（provider/模型 + 思考强度）。
       * intent='dispatch'（默认）：新建会话后台自动发送、不跳转；
       * intent='insert'（「新建对话」）：新建会话并跳转过去、只填草稿不自动发送；
       *   单卡模式下可取消「自动带入」（默认勾选，偏好记在本机）——取消则只建空白会话。
       * props.batch（Idea 2 批量模式）= batchSummary() 结果：标题/副标题换批量文案，
       * md/images 此时是 N 卡合并后的任务背景；card 仍传首卡作 fallback（批量不带带入开关）。
       * props.lazy = 内容还没读取（确认后才拉详情）——文案不说图片张数，只说「截图（如有）」。
       * 服务不可用/列表为空时对应下拉退化为单项说明，仍可直接确认（走默认）。
       */
      function DispatchDialog(props) {
        var card = props.card || { kind: '', id: '', title: '' };
        var insert = props.intent === 'insert';
        var batch = props.batch || null;
        var allowCarry = insert && !batch; // 只有「单卡新建对话」需要带入开关
        var ctx0 = useState(null);   // collectDispatchContext 结果
        var wsSel = useState(null);  // 选中 workspaceId | '__cwd__' | null
        var modelKey = useState(null); // 选中 'provider\u0000model' | null
        var effortSel = useState(null); // 选中思考强度 id | ''（提供商默认）| null
        var instr = useState(readLastInstruction()); // 附加指令（可选），默认带出上次输入
        var presets = useState(readInstrPresets()); // 指令模板预设：chip 一键填入
        var carry = useState(readCarryPref()); // 「自动带入」偏好（默认勾选；上次的选择会记住）
        var busy = useState(false);
        var withContent = !allowCarry || carry[0] !== false; // 取消带入 → 空白会话（没有附加指令）

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
          // 数据随调用回传（card/cards/md/images/activeAcct/intent 来自当前 render 的 props），
          // 接收方 useCallback 闭包里读不到最新 state（见 sendDispatch 注释）
          try {
            saveLastInstruction(instr[0]); // 记住这次的输入（含清空），下次打开弹层带出
            if (allowCarry) saveCarryPref(withContent); // 记住「自动带入」选择
            props.onSend(choice, {
              card: card, cards: props.cards || null,
              md: withContent ? props.md : null,
              images: withContent ? props.images : [],
              activeAcct: props.activeAcct, intent: props.intent || 'dispatch',
              instr: withContent ? instr[0] : '',
              carry: withContent,
              lazy: Boolean(props.lazy),
            });
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
              batch
                ? ((insert ? '新建对话：' : '批量处理：') + batch.count + ' 项')
                : ((insert ? '新建对话：' : '处理 ') + (KIND_LABEL[card.kind] || card.kind) + ' #' + card.id)),
            h('div', { className: 'ztp-disp-sub' },
              batch ? ((batch.label || String(batch.count) + ' 项') + '，将合并为一份任务背景') : (card.title || '')),

            // 「自动带入」开关（单卡新建对话）：默认勾选 = 任务背景 + 最近动态 + 截图进草稿；
            // 取消 = 只建空白会话（下面的附加指令一起收起）。偏好记在本机，下次打开沿用。
            allowCarry ? h('label', { className: 'ztp-carry' },
              h('input', {
                type: 'checkbox', checked: withContent, disabled: busy[0],
                onChange: function (e) { carry[1](e.target.checked); },
              }),
              h('span', { className: 'ztp-carry-main' },
                h('span', { className: 'ztp-carry-t' }, '自动带入任务背景'),
                h('span', { className: 'ztp-carry-d' }, withContent
                  ? '标题、描述、最近动态与截图填入草稿（不自动发送）'
                  : '不带入禅道内容：只新建一个空白会话并跳转'))) : null,

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

            withContent ? h('label', { className: 'ztp-label' }, '附加指令（可选）') : null,
            withContent ? h('textarea', {
              className: 'ztp-input ztp-instr', value: instr[0] || '', disabled: busy[0], rows: 2,
              placeholder: '拼到任务背景末尾，如：只分析定位原因，先不要改代码',
              onChange: function (e) { instr[1](e.target.value); },
            }) : null,
            // 指令模板预设：chip 点击填入 textarea、× 删除、「存为预设」存当前输入（空 = no-op）
            withContent ? h('div', { className: 'ztp-instr-tps' },
              presets[0].map(function (p) {
                return h('span', { key: p.id, className: 'ztp-tp' },
                  h('button', {
                    type: 'button', className: 'ztp-tp-btn', title: '填入：' + p.text,
                    onClick: function () { instr[1](p.text); },
                  }, instrChipLabel(p.text)),
                  h('button', {
                    type: 'button', className: 'ztp-tp-x', title: '删除该模板',
                    onClick: function () { presets[1](removeInstrPreset(p.id)); },
                  }, '×'));
              }),
              h('button', {
                type: 'button', className: 'ztp-tp-add', disabled: busy[0],
                title: '把当前输入存为模板（重复内容不重复存，最多 ' + MAX_INSTR_PRESETS + ' 条）',
                onClick: function () { presets[1](saveInstrPreset(instr[0])); },
              }, '+ 存为预设')) : null,

            h('div', { className: 'ztp-disp-note' },
              insert
                ? (withContent
                  ? (props.lazy
                    ? '将新建会话并跳转过去，任务背景（标题、描述与最近动态）与截图（如有）一并填入草稿，不会自动发送。'
                    : '将新建会话并跳转过去，任务背景' + (props.images && props.images.length ? '与 ' + props.images.length + ' 张图片' : '') + '填入草稿，不会自动发送。')
                  : '将新建一个空白会话并跳转过去（不带禅道内容，不会自动发送）。')
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
        var alias = useState(''); // 可选别名：多账号时用来区分（也可之后在账号菜单里改）
        var busy = useState(false), err = useState(null);

        var submit = useCallback(function () {
          if (busy[0]) return;
          busy[1](true); err[1](null);
          var payload = {
            baseUrl: baseUrl[0].trim(), account: account[0].trim(), password: password[0],
          };
          if (alias[0].trim()) payload.alias = alias[0].trim();
          Promise.resolve(props.rpc('zentao.login', payload))
            .then(function (r) {
              busy[1](false);
              if (r && r.ok) props.onDone(r.value);
              else err[1]((r && r.error && r.error.message) || '登录失败');
            })
            .catch(function (e) { busy[1](false); err[1](String((e && e.message) || e)); });
        }, [baseUrl[0], account[0], password[0], alias[0], busy[0]]);

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
          h('label', { className: 'ztp-label' }, '别名（可选）'),
          h('input', {
            className: 'ztp-input', value: alias[0], spellCheck: false, maxLength: 30,
            placeholder: '例如：公司禅道 · 张三（用来区分多个账号）',
            onChange: function (e) { alias[1](e.target.value); },
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
      var paneCache = { tab: 'task', status: null, mine: null, detailCard: null, focus: null, view: 'list' };
      // 结果摘要自动回读的失败冷却（linkKey → 上次尝试时刻；模块级，避免重渲染干扰）
      var replyLastTry = {};

      function ZentaoPane(props) {
        props = props || {};
        var tab = useState(paneCache.tab);
        var viewMode = useState(paneCache.view === 'board' ? 'board' : 'list'); // 列表 / 流程看板
        var status = useState(paneCache.status);   // {configured, account, baseUrl, loggedIn, cacheAt, activeId, accounts[]}
        var mine = useState(paneCache.mine);       // {cards, cached, at}
        var loading = useState(false);
        var err = useState(null);
        var detailCard = useState(paneCache.detailCard);
        var toast = useState(null);
        var acctOpen = useState(false);  // 账号管理弹出层
        var adding = useState(false);    // 已有账号时再添加一个（LoginView 复用）
        var dispatch = useState(null);   // 「处理」/「新建对话」确认弹层：{card, md, images, intent, carry, lazy}
        var linkRev = useState(0);       // 会话关联存储版本号（保存/清除后 bump 重读）
        var stateRev = useState(0);      // 处理状态版本号（手动修正后 bump 重读 states.v1）
        var liveSnap = useState(watchGetSnapshot()); // 关联会话活性（M6 监控快照）
        var search = useState('');       // 列表搜索（标题/#id/状态/人员，纯前端过滤）
        var sortMode = useState('smart');// 列表排序（smart/deadline/pri/origin）
        var qf = useState(null);         // 快捷筛选（ask/running/overdue/today/done；激活时跨分类，null = 分类视图）
        var markRev = useState(0);       // 本地标记（旗标/隐藏）版本号，toggle 后 bump 重读 marks.v1
        var noteRev = useState(0);       // 本地备注版本号，保存后 bump 重读 notes.v1
        var showHidden = useState(false);// 临时显示已隐藏卡片（页脚开关，不入 paneCache）
        var replyRev = useState(0);      // 结果摘要存储版本号（回读保存后 bump 重读）
        var replyBusy = useState(null);  // 正在回读的 linkKey（详情页 spinner 用）
        var offline = useState(null);    // 连接状态（Idea 1）：null 未知 / true 离线 / false 在线
        var selMode = useState(false);   // 批量多选模式（Idea 2）
        var selKeys = useState({});      // 已选卡片键集合（'kind-id' → true，跨 tab 保留）

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

        // 选中卡滚动定位（2026-10-25 用户反馈）：反向跳转/看板回列表等场景，目标卡
        // 可能不在列表视口内——detailCard 或视图切回列表后滚到 nearest。点列表里的卡
        // 本来就可见，nearest 不会额外滚动。
        useEffect(function () {
          if (!detailCard[0] || viewMode[0] !== 'list') return;
          scrollCardIntoView(detailCard[0], document);
        }, [detailCard[0], viewMode[0]]);

        // 面板数据同步进模块级缓存：tab 卸载（切会话/关 tab）后重挂时用它秒恢复；
        // mine 到手后顺带清理：已不在「指派给我」列表超过宽限期的事项 → 关联/进度一起删
        useEffect(function () {
          paneCache.tab = tab[0];
          paneCache.view = viewMode[0];
          paneCache.status = status[0];
          paneCache.mine = mine[0];
          paneCache.detailCard = detailCard[0];
          if (mine[0] && mine[0].cards && status[0] && status[0].activeId
            && cleanupStaleLinks(status[0].activeId, mine[0].cards)) {
            linkRev[1](function (v) { return v + 1; });
          }
          watchPoke();
        }, [tab[0], viewMode[0], status[0], mine[0], detailCard[0]]);

        var loadStatus = useCallback(function () {
          Promise.resolve(rpc('zentao.status'))
            .then(function (r) { if (r && r.ok) status[1](r.value); })
            .catch(function () { /* host 未就绪 */ });
        }, [rpc]);

        /** 拉取列表。silent=true（Idea 1 轮询）：失败不弹 toast、不动 loading spinner，
         *  只把连接状态标离线（离线横条常驻）；成功照常更新并检测新指派。 */
        var loadMine = useCallback(function (refresh, silent) {
          if (!silent) { loading[1](true); err[1](null); }
          Promise.resolve(rpc('zentao.mine', refresh ? { refresh: true } : {}))
            .then(function (r) {
              if (!silent) loading[1](false);
              if (r && r.ok) {
                mine[1](r.value);
                offline[1](false);
                // 列表快照落盘（按激活账号，paneCache.status 由先前的同步 effect 更新）：
                // DSH 重启/面板重开时先渲染这份快照，禅道不可达时它就是兜底视图
                writeMineSnapshot((paneCache.status && paneCache.status.activeId) || null, r.value);
                status[1](function (s) { return s ? Object.assign({}, s, { cacheAt: r.value.at }) : s; });
                // 新指派检测（Idea 1）：与模块级基线比对，首次只建基线不提醒；
                // 基线按账号分桶，切回来若期间有新指派会在下一次拉取时提醒
                var acct = (paneCache.status && paneCache.status.activeId) || 'anon';
                var diff = diffNewCards(lastMineIds[acct], r.value.cards);
                lastMineIds[acct] = cardKeyMap(r.value.cards);
                if (diff.count) toast[1](newAssignedText(diff));
              } else {
                var m = (r && r.error && r.error.message) || '数据加载失败';
                offline[1](true); err[1](m);
                if (!silent) toast[1](m);
              }
            })
            .catch(function (e) {
              if (!silent) loading[1](false);
              offline[1](true);
              var m = String((e && e.message) || e);
              err[1](m);
              if (!silent) toast[1](m);
            });
        }, [rpc]);

        useEffect(function () { loadStatus(); }, [loadStatus]);
        // 激活账号变化（登录/切换/移除）→ 先用上次快照秒开（标 cached），再后台拉取替换
        useEffect(function () {
          if (status[0] && status[0].configured) {
            if (!mine[0]) {
              var snap = readMineSnapshot(status[0].activeId);
              if (snap && snap.cards.length) mine[1](snap);
            }
            loadMine(false);
          }
        }, [status[0] && status[0].configured, status[0] && status[0].activeId]);

        // 自动轮询（Idea 1，2026-10-25）：面板挂载期间每 5 分钟静默刷新一次
        // （host 侧 60s 缓存兜底，不会打爆禅道）；面板卸载即停——数据拉取只在
        // 面板可见时做，常驻监控（M6 会话活性）不受影响。静默失败只标离线不弹 toast。
        // ⚠️ deps 不能写 configured（var 在下方才赋值，这里构造 deps 时是 undefined），
        // 与上面 effect 同款用表达式。
        useEffect(function () {
          if (!(status[0] && status[0].configured)) return;
          var timer = setInterval(function () { loadMine(false, true); }, POLL_INTERVAL_MS);
          return function () { clearInterval(timer); };
        }, [status[0] && status[0].configured, loadMine]);

        // 会话头部「禅道」按钮跳转进来的定位（Idea 3）：paneCache.focus 带 {kind, id}，
        // 等列表数据就位（快照水合或拉取）后从卡片里找完整对象选中详情；列表已就位
        // 却没有这张卡（已完结/转派离开「指派给我」）→ 放弃定位，留在目标分类 tab。
        useEffect(function () {
          var f = paneCache.focus;
          if (!f || !mine[0] || !mine[0].cards) return;
          paneCache.focus = null;
          var hit = findFocusCard(mine[0].cards, f);
          tab[1](f.kind);
          if (hit) detailCard[1](hit);
        }, [mine[0]]);

        // 「新建对话」（2026-10-27 改版，替代原「插入对话」）：只留一个入口，先开弹层选
        // 工作区/模型/思考强度/附加指令，弹层里可勾选「自动带入」（默认勾选 = 任务背景 +
        // 最近动态 + 截图填入草稿；取消 = 只建一个空白会话）。内容在**确认后**才读取——
        // 想开空白会话时不白拉一次禅道详情（最近动态只在 v1 详情里）。
        var openNewChat = useCallback(function (card) {
          dispatch[1]({ card: card, md: null, images: null, intent: 'insert', lazy: true });
        }, []);

        // 「处理」：弹确认层选工作区与模型，确认后新建会话后台自动发送、不跳转（失败降级 → 剪贴板）
        var dispatchCard = useCallback(function (card, detail) {
          dispatch[1]({ card: card, md: cardToMarkdown(card, detail), images: imagesOf(card, detail), intent: 'dispatch' });
        }, []);

        // 极速重发（2026-10-25 迭代）：render 作用域函数——lastDispatch/activeAcct 每次现读，
        // 详情开着就带完整描述（与 dispatchCard 同源），无上次配置时按钮本身不渲染
        var lastDispatch = readLastDispatch();
        var quickSummary = lastDispatchSummary(lastDispatch);
        var quickRedispatch = function (card) {
          var last = readLastDispatch();
          if (!last) { toast[1]('还没有下发记录，先正常「处理」一次'); return; }
          var detail = detailCard[0] && detailCard[0].kind === card.kind
            && Number(detailCard[0].id) === Number(card.id) ? detailCard[0] : null;
          var choice = {};
          if (last.workspaceId) choice.workspaceId = last.workspaceId;
          else if (last.cwd) choice.cwd = last.cwd;
          if (last.model) choice.model = last.model;
          sendDispatch(choice, {
            card: card, md: cardToMarkdown(card, detail), images: imagesOf(card, detail),
            activeAcct: activeAcct, intent: 'dispatch', instr: last.instr || '',
          });
        };

        // 弹层确认：intent='dispatch' 走 dispatchToNewSession（后台自动发送、不跳转），
        // intent='insert'（「新建对话」）走 insertToNewSession（新建会话、跳转过去、只填草稿
        // 不发送）；插入路径取消「自动带入」时（d.carry === false）只建空白会话（newBlankSession）。
        // choice 即所选工作区/模型。批量（Idea 2）时 d.cards 是 N 张卡、md/images 已合并，
        // 成功后逐卡 saveSessionLink 指向同一会话（M6 徽标/chip 对每张卡照常工作）。
        // ⚠️ 数据（card/cards/md/images/activeAcct）由弹层回传：useCallback([]) 的闭包捕获
        // 初次 render 的作用域，在里面读 dispatch[0]/status[0] 拿到的永远是旧值
        // （2026-10-24 真机踩坑：dispatch[0] 恒为 null → sendDispatch 直接 return，
        //  弹层永远卡在「创建中…」）。setState setter 引用稳定，可以直接调。
        var sendDispatch = useCallback(function (choice, d) {
          var cards = (d && d.cards && d.cards.length) ? d.cards
            : (d && d.card ? [d.card] : null);
          if (!d || !cards || !cards.length) return;
          var insert = d.intent === 'insert';
          var carry = !(insert && d.carry === false); // 取消「自动带入」→ 只建空白会话
          dispatch[1](null);
          if (d.cards) { selMode[1](false); selKeys[1]({}); } // 批量发起即退出多选清空选中

          // ① 空白会话：不带禅道内容、不挂附件、不记卡片关联（没有内容可关联）
          if (!carry) {
            toast[1]({ text: '正在新建空白会话…', sticky: true });
            Promise.resolve(newBlankSession(choice)).then(function (r) {
              toast[1](r && r.message ? r.message : '新会话创建失败');
            }).catch(function (e) { toast[1]('新建会话失败：' + String((e && e.message) || e)); });
            return;
          }

          // ② 内容懒读取（2026-10-27）：从卡片点「新建对话」时不再提前拉详情——
          // 用户可能取消「自动带入」，确认后真要带入才拉（最近动态只在 v1 详情里）。
          if (!d.md && !d.lazy) return;
          if (!d.md) {
            toast[1]({ text: '正在读取禅道详情与最近动态…', sticky: true });
          } else {
            // 过程提示（sticky）：图片还在预取/注册、模型还在设置，让用户知道在等什么；
            // 完成后由下方结果 toast（非 sticky，自动消失）替换。跳转后面板卸载、toast
            // 随之消失，提示只覆盖跳转前的准备期，无害。
            toast[1](insert
              ? { text: (d.images && d.images.length
                ? '正在新建会话（准备 ' + d.images.length + ' 张图片附件）…'
                : '正在新建会话并跳转…'), sticky: true }
              : ((d.images && d.images.length)
                ? { text: '正在准备 ' + d.images.length + ' 张图片附件，随后自动发送…', sticky: true }
                : { text: '正在新建会话…', sticky: true }));
          }
          var prepared = d.md
            ? Promise.resolve({ md: d.md, images: d.images || [], error: null })
            : Promise.resolve(prepareInsertPayload(d.card, d.detail || null, rpc)).then(function (p) {
              return { md: p.md, images: p.images || [], error: p.error || null };
            }).catch(function () {
              // 极端情况（prepareInsertPayload 自身抛错）：退回标题+摘要，不挡建会话
              return {
                md: cardToMarkdown(d.card, d.detail || null, { actions: true }),
                images: imagesOf(d.card, d.detail || null), error: 'detail',
              };
            });

          prepared.then(function (payload) {
            var md = appendInstruction(payload.md, d.instr); // 附加指令拼到任务背景末尾（三条链路统一走这里）
            if (!d.md && insert) toast[1]({ text: '正在新建会话并跳转…', sticky: true });
            var run = insert
              ? insertToNewSession(md, payload.images, choice)
              : dispatchToNewSession(md, payload.images, choice);
            return Promise.resolve(run).then(function (r) {
              if (r && r.ok) {
                // 成功即记住本次完整配置（工作区/模型/指令）——卡片 ⚡「极速重发」用它跳过弹层
                saveLastDispatch({
                  workspaceId: choice && choice.workspaceId, cwd: choice && choice.cwd,
                  model: choice && choice.model, instr: d.instr || '', at: Date.now(),
                });
                // 新会话建好即记录关联（draft 模式也算：内容已填进那个会话；批量逐卡指向同一会话）
                if (r.sessionId) {
                  for (var i = 0; i < cards.length; i++) {
                    saveSessionLink(d.activeAcct || null, cards[i], r.sessionId);
                  }
                  linkRev[1](function (v) { return v + 1; });
                }
                toast[1](r.message + (payload.error ? '（详情读取失败，仅带入标题与摘要）' : ''));
                return;
              }
              var msg = r && r.message ? r.message + '，已改为插入当前会话' : '新会话不可用，已改为插入当前会话';
              return insertToCurrentChat(md, payload.images).then(function (x) {
                if (x.mode === 'clipboard') {
                  toast[1](msg + (x.failed ? '（复制失败，请手动复制）' : '（已复制到剪贴板）'));
                } else {
                  toast[1](msg + (x.attached ? '（含 ' + x.attached + ' 张图片）' : ''));
                }
              });
            });
          }).catch(function (e) { toast[1]('下发失败：' + String((e && e.message) || e)); });
        }, []);

        // 一键复制（2026-10-25 迭代）：卡片复制 #id+标题（贴 IM），详情复制完整 Markdown。
        // copyToClipboard 全 promise 化（clipboard API → DOM execCommand 兜底），失败 toast 提示手动复制。
        var copyCardTitle = useCallback(function (card) {
          var s = '#' + card.id + ' ' + (card.title || '');
          Promise.resolve(copyToClipboard(s)).then(function (ok) {
            toast[1](ok ? '已复制 ' + s : '复制失败，请手动复制');
          });
        }, []);
        var copyCardMd = useCallback(function (card, detail) {
          var md = cardToMarkdown(card, detail || null);
          Promise.resolve(copyToClipboard(md)).then(function (ok) {
            toast[1](ok ? '已复制 Markdown（' + (md.length > 60 ? Math.round(md.length / 1000 * 10) / 10 + 'k 字符' : md.length + ' 字符') + '）' : '复制失败，请手动复制');
          });
        }, []);

        // 继续处理（2026-10-25 迭代）：详情里往关联会话追加指令。link 由当前 render 传入
        // （useCallback([]) 闭包读不到最新 state 的老坑），前缀带卡片标识便于模型接上下文。
        var continueLinked = useCallback(function (card, text, link) {
          if (!link || !link.sessionId) return;
          var body = '【继续处理 禅道' + (KIND_LABEL[card.kind] || card.kind) + ' #' + card.id + '】\n' + String(text || '').trim();
          Promise.resolve(continueInSession(link.sessionId, body)).then(function (r) {
            toast[1](r && r.ok ? r.message : '续发失败：' + ((r && r.message) || '未知原因'));
          }, function (e) { toast[1]('续发失败：' + String((e && e.message) || e)); });
        }, []);

        // 跳转到卡片关联的会话；会话已删 → 清除标记并提示（openSessionLink 内判定）。
        // activeAcct 由调用方传当前 render 的值，理由同 sendDispatch 的闭包说明。
        var openLinkedSession = useCallback(function (card, activeAcct) {          var r = openSessionLink(activeAcct, card);
          if (r && r.ok) return;
          if (r && r.reason === 'missing') toast[1]('关联的会话已不存在，已清除标记');
          else if (r && r.reason === 'unsupported') toast[1]('当前 DSH 缺少跳转服务，无法打开会话');
          else if (r && r.reason === 'error') toast[1]('打开会话失败：' + (r.message || ''));
          linkRev[1](function (v) { return v + 1; });
        }, []);

        // 回读关联会话的最新 assistant 回复（activeAcct/card/link 全部由当前 render 的
        // 调用方传入——useCallback([]) 闭包读不到最新 state，同 sendDispatch 的坑）
        var fetchReplyNow = useCallback(function (activeAcct, card, link) {
          if (!link || !link.sessionId) return;
          var key = sessionLinkKey(activeAcct, card);
          replyLastTry[key] = Date.now(); // 自动回读的失败冷却基准（60s 内不重试）
          replyBusy[1](key);
          Promise.resolve(fetchLastReply(link.sessionId, 6000)).then(function (r) {
            replyBusy[1](null);
            if (r && r.ok) {
              saveReply(activeAcct, card, link.sessionId, r.text);
              replyRev[1](function (v) { return v + 1; });
            }
          }, function () { replyBusy[1](null); });
        }, []);

        // 详情打开且该卡「已完成」→ 自动回读一次（TTL 内有缓存就不重复拉；其余状态手动刷新）
        useEffect(function () {
          var card = detailCard[0];
          if (!card) return;
          var key = sessionLinkKey(activeAcct, card);
          var link = linkMap[key];
          if (!link || replyBusy[0]) return;
          var st = resolveLiveState(link, liveSnap[0], stateMap[key] || null);
          if (!st || (st.state !== 'done' && st.state !== 'ask')) return; // ask 也要看到 agent 在问什么
          var cached = getReply(activeAcct, card);
          // 只有「完整文本 + 未过期」才算新鲜；旧版截 500 字的缓存（无 full 字段）重拉一次
          if (cached && cached.sessionId === link.sessionId && cached.full
            && Date.now() - (Number(cached.at) || 0) < REPLY_TTL_MS) return;
          if (Date.now() - (Number(replyLastTry[key]) || 0) < 60000) return; // 失败冷却
          fetchReplyNow(activeAcct, card, link);
        }, [detailCard[0], linkRev[0], liveSnap[0], replyRev[0], stateRev[0]]);

        var logout = useCallback(function () {
          Promise.resolve(rpc('zentao.logout')).then(function () {
            removeMineSnapshot(paneCache.status && paneCache.status.activeId); // 凭据没了，快照一并清
            mine[1](null); detailCard[1](null); status[1](null); adding[1](false); acctOpen[1](false);
            selMode[1](false); selKeys[1]({}); offline[1](null);
            loadStatus();
          });
        }, [rpc, loadStatus]);

        // 切换激活账号：cookie 已持久化在 host 侧，切换即时生效
        var switchAccount = useCallback(function (id) {
          acctOpen[1](false);
          mine[1](null); detailCard[1](null); err[1](null);
          selMode[1](false); selKeys[1]({}); offline[1](null);
          Promise.resolve(rpc('zentao.switch', { id: id }))
            .then(function (r) { if (r && r.ok) status[1](r.value); })
            .catch(function () { /* host 未就绪 */ });
        }, [rpc]);

        // 移除指定账号（登出该账号、清它的本机凭据与列表快照）
        var removeAccount = useCallback(function (a) {
          acctOpen[1](false);
          mine[1](null); detailCard[1](null); err[1](null); adding[1](false);
          selMode[1](false); selKeys[1]({}); offline[1](null);
          removeMineSnapshot(a && a.id);
          Promise.resolve(rpc('zentao.logout', { id: a.id }))
            .then(function (r) { if (r && r.ok) status[1](r.value); })
            .catch(function () { loadStatus(); });
        }, [rpc, loadStatus]);

        // 设置/清除账号别名（alias 空串 = 清除）；成功后 status 自带新别名，UI 随之刷新
        var renameAccount = useCallback(function (a, alias) {
          Promise.resolve(rpc('zentao.rename', { id: a && a.id, alias: String(alias ?? '') }))
            .then(function (r) { if (r && r.ok) status[1](r.value); })
            .catch(function () { /* host 未就绪：保持现状 */ });
        }, [rpc]);

        var st = status[0];
        var configured = Boolean(st && st.configured);
        var cards = mine[0] ? mine[0].cards : [];
        var linkMap = useMemo(readLinkMap, [linkRev[0]]);
        var replyMap = useMemo(readReplyMap, [linkRev[0], replyRev[0]]);
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
        /** 卡片回复摘要行数据：仅当缓存属当前关联会话时显示（再处理换会话后旧回复不带）。 */
        function replySummaryOf(card) {
          var k = sessionLinkKey(activeAcct, card);
          var link = linkMap[k];
          var r = replyMap[k];
          return (link && r && r.sessionId === link.sessionId && r.text) ? r.text : '';
        }
        /** 卡片活性：实时监控优先（running/ask/done）；实时拿不到 → 兜底持久化进度
         *  （done 粘性显示「已处理完」，running/ask 仅监控未就绪时短暂兜底，见 resolveLiveState）。 */
        var stateMap = useMemo(readStateMap, [linkRev[0], liveSnap[0], stateRev[0]]);
        function liveInfoOf(card) {
          var k = sessionLinkKey(activeAcct, card);
          return resolveLiveState(linkMap[k], liveSnap[0], stateMap[k] || null);
        }
        function liveOf(card) {
          var info = liveInfoOf(card);
          return info ? info.state : null;
        }
        function liveSinceOf(card) {
          var info = liveInfoOf(card);
          return info ? info.since : null;
        }
        /** 手动设置的状态值（null = 跟随自动检测）；徽标加「手动」描边、状态下拉回显用。 */
        function liveManualOf(card) {
          var p = stateMap[sessionLinkKey(activeAcct, card)];
          return (p && p.manual && LIVE_STATES.indexOf(p.state) !== -1) ? p.state : null;
        }
        /** 手动修正处理状态（2026-10-27）：写 states.v1 后 bump 版本号重读；「自动」= 清除覆盖。 */
        var setStateHere = useCallback(function (card, state) {
          setManualState(activeAcct, card, state);
          stateRev[1](function (v) { return v + 1; });
          watchPoke(); // 清除手动后让自动评估立刻回填实时状态
          toast[1](state
            ? '已手动标记为「' + (LIVE_STATE_LABEL[state] || state) + '」（选「自动」可恢复跟随会话）'
            : '已恢复自动检测处理状态');
        }, [activeAcct]);
        // 本地标记（旗标/隐藏）：marks.v1 按 <activeId>/<kind>-<id> 隔离；hidden 默认从列表滤掉
        var markMap = useMemo(readMarkMap, [markRev[0]]);
        function flaggedOf(card) {
          return markOf(markMap, activeAcct, card).flag;
        }
        var hiddenN = useMemo(function () {
          return hiddenCount(markMap, activeAcct, cards);
        }, [markMap, activeAcct, cards]);
        var visCards = useMemo(function () {
          if (showHidden[0]) return cards;
          return cards.filter(function (c) { return !markOf(markMap, activeAcct, c).hide; });
        }, [cards, markMap, activeAcct, showHidden[0]]);
        var toggleMark = useCallback(function (card, field) {
          toggleCardMark(activeAcct, card, field);
          markRev[1](function (v) { return v + 1; });
        }, [activeAcct]);
        // 本地备注：保存（空串=清除）后 bump；卡片摘要行与详情编辑区共用这份 map
        var noteMap = useMemo(readNoteMap, [noteRev[0]]);
        var saveNoteHere = useCallback(function (card, text) {
          saveNote(activeAcct, card, text);
          noteRev[1](function (v) { return v + 1; });
          toast[1](String(text || '').trim() ? '本地备注已保存（仅本机可见）' : '本地备注已清除');
        }, [activeAcct]);
        var filtered = useMemo(function () {
          // 快捷筛选激活 → 跨分类（全量卡片过搜索 + 过筛选）；否则当前分类过搜索
          var pool = qf[0]
            ? visCards.filter(function (c) { return matchSearch(c, search[0]); })
            : visCards.filter(function (c) { return c.kind === tab[0] && matchSearch(c, search[0]); });
          return sortCards(quickFilterCards(pool, qf[0], liveOf, undefined, flaggedOf), sortMode[0], undefined, liveOf);
        }, [visCards, tab[0], search[0], sortMode[0], qf[0], markRev[0], linkRev[0], liveSnap[0], stateRev[0]]);
        // 快捷筛选计数：在「搜索过滤后的全量卡片」上统计（chip 数字随搜索联动）
        var qfCounts = useMemo(function () {
          return quickFilterCounts(visCards.filter(function (c) { return matchSearch(c, search[0]); }), liveOf, undefined, flaggedOf);
        }, [visCards, search[0], markRev[0], linkRev[0], liveSnap[0], stateRev[0]]);
        var counts = useMemo(function () {
          var m = { task: 0, bug: 0, story: 0 };
          for (var i = 0; i < visCards.length; i++) m[visCards[i].kind] = (m[visCards[i].kind] || 0) + 1;
          return m;
        }, [visCards]);

        // ───── 多选模式（Idea 2）：选中集合跨 tab 保留（切 tab 再选，批量时一起下发）；
        // 退出多选/切账号/下发发起时清空；面板卸载重挂自然清空（不入 paneCache）。
        var selCards = useMemo(function () {
          var list = [];
          if (!selMode[0]) return list;
          var keys = selKeys[0];
          for (var i = 0; i < cards.length; i++) {
            var c = cards[i];
            if (c && keys[c.kind + '-' + c.id]) list.push(c);
          }
          return list;
        }, [cards, selKeys[0], selMode[0]]);
        var selCount = selCards.length;
        var selSummary = batchSummary(selCards);
        var toggleSel = useCallback(function (card) {
          selKeys[1](function (m) {
            var k = card.kind + '-' + card.id;
            var next = Object.assign({}, m);
            if (next[k]) delete next[k]; else next[k] = true;
            return next;
          });
        }, []);
        var exitSelMode = function () { selMode[1](false); selKeys[1]({}); };
        // 全选/取消全选作用于当前可见列表（当前 tab + 搜索过滤）
        var filteredAllSel = filtered.length > 0 && filtered.every(function (c) {
          return selKeys[0][c.kind + '-' + c.id];
        });
        var toggleSelAll = function () {
          selKeys[1](function (m) {
            var next = Object.assign({}, m);
            for (var i = 0; i < filtered.length; i++) {
              var c = filtered[i];
              var k = c.kind + '-' + c.id;
              if (filteredAllSel) delete next[k]; else next[k] = true;
            }
            return next;
          });
        };
        // 批量弹层（render 作用域函数：读当次 render 的 selCards，避开 useCallback([]) 闭包坑）
        var openBatchDialog = function (intent) {
          if (!selCards.length) return;
          dispatch[1]({
            cards: selCards.slice(),
            md: batchToMarkdown(selCards),
            images: mergeCardImages(selCards),
            intent: intent,
          });
        };

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
            var q = String(search[0] || '').trim();
            if (qf[0]) {
              var qfLabel = '';
              for (var qi = 0; qi < QUICK_FILTERS.length; qi++) {
                if (QUICK_FILTERS[qi].id === qf[0]) qfLabel = QUICK_FILTERS[qi].label;
              }
              return h('div', { className: 'ztp-empty' },
                '没有' + (qfLabel || '符合条件') + '的' + (q ? '匹配「' + q + '」的' : '') + '事项',
                h('br'),
                h('button', {
                  className: 'ztp-err-retry', type: 'button',
                  style: { marginTop: '8px' },
                  onClick: function () { qf[1](null); },
                }, '清除筛选'));
            }
            if (q) {
              return h('div', { className: 'ztp-empty' },
                '没有匹配「' + q + '」的' + (KIND_LABEL[tab[0]] || '内容'),
                h('br'),
                h('button', {
                  className: 'ztp-err-retry', type: 'button',
                  style: { marginTop: '8px' },
                  onClick: function () { search[1](''); },
                }, '清空搜索'));
            }
            return h('div', { className: 'ztp-empty' },
              '没有指派给你的' + (KIND_LABEL[tab[0]] || '内容'),
              h('br'),
              h('span', { className: 'ztp-foot-dim' }, '可点右上角 ⟳ 重新拉取'));
          }
          return h('div', null, filtered.map(function (c) {
            var on = detailCard[0] && detailCard[0].kind === c.kind
              && Number(detailCard[0].id) === Number(c.id);
            return h(CardItem, {
              key: c.kind + '-' + c.id, card: c, active: on && !selMode[0],
              selectable: selMode[0],
              selected: Boolean(selMode[0] && selKeys[0][c.kind + '-' + c.id]),
              onToggleSel: toggleSel,
              linkView: selMode[0] ? null : linkViewOf(c),
              live: liveOf(c),
              liveSince: liveSinceOf(c),
              liveManual: liveManualOf(c),
              onSetState: setStateHere,
              onOpenSession: function (c2) { openLinkedSession(c2, activeAcct); },
              onOpen: function (x) { detailCard[1](x); },
              onNewChat: openNewChat, onDispatch: dispatchCard,
              onCopyTitle: copyCardTitle,
              flagged: flaggedOf(c),
              hidden: Boolean(markOf(markMap, activeAcct, c).hide),
              onToggleMark: toggleMark,
              quickTitle: quickSummary,
              onQuick: quickRedispatch,
              note: getNote(noteMap, activeAcct, c),
              replySummary: replySummaryOf(c),
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
          var dCard = detailCard[0];
          var dKey = sessionLinkKey(activeAcct, dCard);
          var dLink = linkMap[dKey] || null;
          var dReply = replyMap[dKey] || null;
          return h(DetailView, {
            key: dCard.kind + '-' + dCard.id,
            rpc: rpc, card: dCard,
            live: liveOf(dCard),
            liveSince: liveSinceOf(dCard),
            manual: liveManualOf(dCard),
            onSetState: setStateHere,
            replyLink: dLink,
            // 只展示当前关联会话的缓存（再处理换会话后旧回复不显示）
            reply: (dLink && dReply && dReply.sessionId === dLink.sessionId) ? dReply : null,
            replyLoading: replyBusy[0] === dKey,
            onRefreshReply: dLink ? function () { fetchReplyNow(activeAcct, dCard, dLink); } : null,
            onBack: function () { detailCard[1](null); },
            onCopyMd: copyCardMd,
            note: getNote(noteMap, activeAcct, dCard),
            onSaveNote: saveNoteHere,
            onContinue: dLink ? function (card, text) { continueLinked(card, text, dLink); } : null,
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
            // 连接状态点（Idea 1）：绿=已连禅道 / 红=不可达（闪烁）/ 灰=还没拉过
            configured ? h('span', {
              className: 'ztp-conn'
                + (offline[0] === true ? ' off' : offline[0] === false ? ' on' : ''),
              title: offline[0] === true
                ? '禅道不可达（正在展示缓存数据）'
                : (offline[0] === false ? '已连接禅道，每 5 分钟自动刷新' : '连接状态未知'),
            }) : null,
            h('div', { className: 'ztp-grow' }),
            configured ? h('button', {
              className: 'ztp-acct', type: 'button',
              title: '当前账号：' + (acctDisplayName(st) || '未命名')
                + (st.alias ? '（' + (st.account || '') + ' @ ' + hostOf(st.baseUrl) + '）' : ' @ ' + hostOf(st.baseUrl))
                + '（点击切换/管理账号）',
              onClick: function () { acctOpen[1](!acctOpen[0]); },
            }, h('span', { className: 'ztp-acct-label' }, acctDisplayName(st) || '未命名'), h(ChevronDownIcon)) : null,
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

          // 分段 tab 行（未配置/登录视图时不渲染，标题已在 mast 上）；右侧搜索 + 排序
          configured ? h('div', { className: 'ztp-head' },
            viewMode[0] === 'board' ? null : h('div', { className: 'ztp-seg', role: 'tablist' }, KIND_ORDER.map(function (k) {
              return h('button', {
                key: k, type: 'button', role: 'tab',
                'aria-selected': tab[0] === k ? 'true' : 'false',
                className: 'ztp-seg-btn',
                onClick: function () { tab[1](k); qf[1](null); detailCard[1](null); }, // 点分类 = 明确选范围，退出快捷筛选
              }, KIND_LABEL[k], counts[k] ? h('span', { className: 'ztp-num' }, counts[k]) : null);
            })),
            h('div', { className: 'ztp-grow' }),
            // 视图切换（流程看板提案）：board 模式是跨分类全局视图，tab/筛选/批量只在列表模式出现
            h('div', { className: 'ztp-viewseg', role: 'tablist', 'aria-label': '视图' },
              h('button', {
                type: 'button', role: 'tab', 'aria-selected': viewMode[0] === 'list' ? 'true' : 'false',
                className: 'ztp-view-btn' + (viewMode[0] === 'list' ? ' on' : ''),
                title: '分类列表视图', onClick: function () { viewMode[1]('list'); },
              }, '列表'),
              h('button', {
                type: 'button', role: 'tab', 'aria-selected': viewMode[0] === 'board' ? 'true' : 'false',
                className: 'ztp-view-btn' + (viewMode[0] === 'board' ? ' on' : ''),
                title: '流程看板：待处理 / 处理中 / 等你决策 / 已完成待闭环 四列泳道',
                onClick: function () { viewMode[1]('board'); selMode[1](false); },
              }, '流程')),
            viewMode[0] === 'board' ? null : h('button', {
              className: 'ztp-tool', type: 'button',
              title: selMode[0] ? '退出批量选择' : '批量选择多项一起处理',
              style: selMode[0] ? { color: 'var(--dsw-alias-state-business-primary)' } : undefined,
              onClick: function () { if (selMode[0]) exitSelMode(); else selMode[1](true); },
            }, h(BatchIcon)),
            h('span', { className: 'ztp-head-sep', 'aria-hidden': 'true' }),
            h('input', {
              className: 'ztp-search', type: 'text', value: search[0], spellCheck: false,
              placeholder: '搜索' + (KIND_LABEL[tab[0]] ? ' ' + KIND_LABEL[tab[0]] : '') + ' / #ID',
              title: '按标题、#ID、状态、创建人/指派人过滤当前列表（多词空格分隔，全部命中才显示）',
              onChange: function (e) { search[1](e.target.value); },
            }),
            viewMode[0] === 'board' ? null : h('select', {
              className: 'ztp-sort', value: sortMode[0], title: '排序方式',
              'aria-label': '排序方式',
              onChange: function (e) { sortMode[1](e.target.value); },
            },
              h('option', { value: 'smart' }, '智能排序'),
              h('option', { value: 'deadline' }, '按截止'),
              h('option', { value: 'pri' }, '按优先级'),
              h('option', { value: 'origin' }, '默认顺序'))) : null,

          // 快捷筛选条（2026-10-25 迭代）：一键只看 等你决策/处理中/逾期/今天到期/已完成（跨分类）
          configured && viewMode[0] === 'list' && cards.length ? h(QfBar, {
            counts: qfCounts,
            active: qf[0],
            onPick: function (id) { qf[1](id); detailCard[1](null); },
          }) : null,

          // 流程看板（方案 A）：board 模式占满主体；点卡回列表并打开详情
          configured && viewMode[0] === 'board' ? h(BoardView, {
            cards: visCards.filter(function (c) { return matchSearch(c, search[0]); }),
            liveOf: liveOf,
            flaggedOf: flaggedOf,
            onPick: function (card) {
              viewMode[1]('list');
              tab[1](card.kind); qf[1](null);
              detailCard[1](card);
            },
          }) : middle,

          // 离线常驻横条（Idea 1）：拉取失败但仍有数据可展示时提示「正在看缓存」；
          // 无数据时错误视图（renderList 内）已抢占，不重复显示
          configured && offline[0] === true
            ? h(OfflineBar, { at: mine[0] && mine[0].at, onRetry: function () { loadMine(true); } }) : null,

          // 批量操作条（Idea 2）：多选模式常驻底部
          selMode[0] && configured ? h('div', { className: 'ztp-batchbar' },
            h('span', { className: 'ztp-batch-info' },
              '已选 ' + selCount + ' 项' + (selSummary.label ? '（' + selSummary.label + '）' : '')),
            h('div', { className: 'ztp-grow' }),
            h('button', {
              className: 'ztp-btn', type: 'button', disabled: !filtered.length, onClick: toggleSelAll,
            }, filteredAllSel ? '取消全选' : '全选当前列表'),
            h('button', {
              className: 'ztp-btn', type: 'button', disabled: !selCount,
              title: '所选事项合并为一份任务背景，新建会话并跳转（不自动发送）',
              onClick: function () { openBatchDialog('insert'); },
            }, '批量新建对话'),
            h('button', {
              className: 'ztp-btn primary', type: 'button', disabled: !selCount,
              title: '所选事项合并为一份任务背景，新建会话自动发送（不跳转）',
              onClick: function () { openBatchDialog('dispatch'); },
            }, '批量处理'),
            h('button', {
              className: 'ztp-tool', type: 'button', title: '退出多选', onClick: exitSelMode,
            }, h(CloseIcon))) : null,

          configured && mine[0] ? h('div', { className: 'ztp-foot' },
            h('span', null, '共 ' + (qf[0]
              ? filtered.length + '/' + visCards.length
              : (String(search[0] || '').trim()
                ? filtered.length + '/' + (counts[tab[0]] || 0)
                : visCards.length)) + ' 条'),
            hiddenN ? h('button', {
              className: 'ztp-foot-hide', type: 'button',
              title: showHidden[0] ? '收起已隐藏的卡片' : '临时显示本地隐藏的卡片（在卡片上点 ⊘ 取消隐藏）',
              onClick: function () { showHidden[1](!showHidden[0]); },
            }, (showHidden[0] ? '收起' : '显示') + '已隐藏 ' + hiddenN) : null,
            h('span', { className: 'ztp-foot-dim' }, '·'),
            h('span', { className: 'ztp-foot-dim' },
              mine[0].cached ? new Date(mine[0].at).toLocaleTimeString() + ' 缓存' : '刚刚拉取'),
            st && st.account ? h('span', { className: 'ztp-foot-dim', style: { marginLeft: 'auto' } },
              (st.accounts || []).length > 1 ? acctDisplayName(st) + ' @ ' + hostOf(st.baseUrl) : acctDisplayName(st)) : null) : null,

          acctOpen[0] && st && (st.accounts || []).length ? h(AccountSwitcher, {
            accounts: st.accounts,
            activeId: st.activeId,
            onPick: function (a) { if (a.id !== st.activeId) switchAccount(a.id); else acctOpen[1](false); },
            onRemove: removeAccount,
            onRename: renameAccount,
            onAdd: function () { acctOpen[1](false); adding[1](true); },
          }) : null,

          dispatch[0] ? h(DispatchDialog, {
            card: dispatch[0].card || (dispatch[0].cards || [])[0] || null,
            cards: dispatch[0].cards || null,
            batch: dispatch[0].cards ? batchSummary(dispatch[0].cards) : null,
            images: dispatch[0].images,
            md: dispatch[0].md,
            lazy: dispatch[0].lazy,
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

        // 会话头部「禅道」按钮（面板 → 会话 → 面板 闭环的另一半；slot 没声明时静默不挂）
        try {
          registerHeaderAction();
        } catch (e) {
          try { console.error('[dsh-zentao-panel] register header action failed', e); } catch (e2) { /* 忽略 */ }
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
        // 图片内存缓存（url → dataURL，模块级）
        imageCache: imageCache,
        cachedImageSrc: cachedImageSrc,
        rememberImageSrc: rememberImageSrc,
        imageDataUrlParts: imageDataUrlParts,
        fetchImageValue: fetchImageValue,
        loadDetailImages: loadDetailImages,
        IMAGE_CACHE_MAX: IMAGE_CACHE_MAX,
        IMAGE_CACHE_MAX_BYTES: IMAGE_CACHE_MAX_BYTES,
        collectDispatchContext: collectDispatchContext,
        dispatchToNewSession: dispatchToNewSession,
        insertToNewSession: insertToNewSession,
        newBlankSession: newBlankSession,
        readCarryPref: readCarryPref,
        saveCarryPref: saveCarryPref,
        sessionLinkKey: sessionLinkKey,
        parseLinkKey: parseLinkKey,
        readLinkMap: readLinkMap,
        getSessionLink: getSessionLink,
        saveSessionLink: saveSessionLink,
        removeSessionLink: removeSessionLink,
        sessionLinkView: sessionLinkView,
        openSessionLink: openSessionLink,
        // 会话头部反向跳转（Idea 3）
        findLinkBySession: findLinkBySession,
        findFocusCard: findFocusCard,
        jumpToZentaoCard: jumpToZentaoCard,
        ZentaoHeaderAction: ZentaoHeaderAction,
        registerHeaderAction: registerHeaderAction,
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
        // 处理进度持久化 + 陈旧关联清理
        readStateMap: readStateMap,
        statusMapReady: statusMapReady,
        syncPersistedStates: syncPersistedStates,
        resolveLiveState: resolveLiveState,
        setManualState: setManualState,
        LIVE_STATES: LIVE_STATES,
        cleanupStaleLinks: cleanupStaleLinks,
        LINK_GRACE_MS: LINK_GRACE_MS,
        // 列表搜索 / 排序 / 截止强调
        deadlineInfo: deadlineInfo,
        overdueDays: overdueDays,
        isFinalCard: isFinalCard,
        sortCards: sortCards,
        matchSearch: matchSearch,
        quickFilterHit: quickFilterHit,
        quickFilterCards: quickFilterCards,
        quickFilterCounts: quickFilterCounts,
        QUICK_FILTERS: QUICK_FILTERS,
        QfBar: QfBar,
        BoardView: BoardView,
        boardColumns: boardColumns,
        BOARD_COLS: BOARD_COLS,
        copyToClipboard: copyToClipboard,
        scrollCardIntoView: scrollCardIntoView,
        readLastDispatch: readLastDispatch,
        continueInSession: continueInSession,
        readNoteMap: readNoteMap,
        saveNote: saveNote,
        getNote: getNote,
        noteLine: noteLine,
        replyLine: replyLine,
        saveLastDispatch: saveLastDispatch,
        lastDispatchSummary: lastDispatchSummary,
        toggleCardMark: toggleCardMark,
        markOf: markOf,
        readMarkMap: readMarkMap,
        hiddenCount: hiddenCount,
        searchHaystack: searchHaystack,
        // 列表快照持久化（mine.v1）
        readMineSnapshot: readMineSnapshot,
        writeMineSnapshot: writeMineSnapshot,
        removeMineSnapshot: removeMineSnapshot,
        // 处理结果摘要回读（replies.v1 + 事件窗口）
        readReplyMap: readReplyMap,
        getReply: getReply,
        saveReply: saveReply,
        removeReply: removeReply,
        assistantEntryText: assistantEntryText,
        lastAssistantText: lastAssistantText,
        fetchLastReply: fetchLastReply,
        REPLY_MAX_CHARS: REPLY_MAX_CHARS,
        REPLY_TTL_MS: REPLY_TTL_MS,
        // Markdown 子集渲染（处理结果摘要用）
        mdToBlocks: mdToBlocks,
        mdInlineNodes: mdInlineNodes,
        mdListTree: mdListTree,
        // 最近动态时间线（v1 actions）
        fmtActDate: fmtActDate,
        ActionTimeline: ActionTimeline,
        ACTION_FOLD_N: ACTION_FOLD_N,
        // 新建对话带最近动态（2026-10-27）
        actionsToMarkdown: actionsToMarkdown,
        insertImagesOf: insertImagesOf,
        prepareInsertPayload: prepareInsertPayload,
        MD_ACTIONS_MAX: MD_ACTIONS_MAX,
        // 自动轮询 + 在线/离线状态 + 新指派检测（Idea 1，2026-10-25）
        POLL_INTERVAL_MS: POLL_INTERVAL_MS,
        cardKeyMap: cardKeyMap,
        diffNewCards: diffNewCards,
        newAssignedText: newAssignedText,
        OfflineBar: OfflineBar,
        // 批量下发（Idea 2，2026-10-25）
        batchToMarkdown: batchToMarkdown,
        batchSummary: batchSummary,
        mergeCardImages: mergeCardImages,
        appendInstruction: appendInstruction,
        readLastInstruction: readLastInstruction,
        saveLastInstruction: saveLastInstruction,
        readInstrPresets: readInstrPresets,
        saveInstrPreset: saveInstrPreset,
        removeInstrPreset: removeInstrPreset,
        instrChipLabel: instrChipLabel,
        normInstrPresets: normInstrPresets,
        finishUrl: finishUrl,
        LiveBadge: LiveBadge,
        CardItem: CardItem,
        DetailView: DetailView,
        DispatchDialog: DispatchDialog,
        // 账号别名（2026-10-25）
        acctDisplayName: acctDisplayName,
        AccountSwitcher: AccountSwitcher,
      };
      return module.exports;
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
