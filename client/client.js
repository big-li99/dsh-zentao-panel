// dsh-zentao-panel — client 半边（悬浮按钮 + 右侧滑出面板）
//
// 装载方式（参照 dsh-notify-me）：dsh.client 声明 → dsh-client-modules 以
// /plugins/dsh-zentao-panel/client.js 提供 → window.__ModuleLoader__.load 执行。
// 界面挂载（参照 dsh-pocket）：shell.overlay slot —— 不改布局、纯覆盖层。
// 数据通道：ctx.connection.rpc.call('/dsh-zentao-panel', endpoint, payload) →
// host 半边挂载的 loopback RPC 路由。
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
      var useState = React.useState, useEffect = React.useEffect, useMemo = React.useMemo, useRef = React.useRef, useCallback = React.useCallback;

      var CHANNEL = '/dsh-zentao-panel';

      // ───────────────────────── 样式 ─────────────────────────
      var Z = 9000; // 覆盖层 z-index（低于 DSH 自身弹窗，高于正文）
      var cssInjected = false;
      function injectCss() {
        if (cssInjected || typeof document === 'undefined') return;
        cssInjected = true;
        var style = document.createElement('style');
        style.setAttribute('data-dsh-zentao-panel', '1');
        style.textContent = [
          // 悬浮按钮
          '.ztp-fab{position:fixed;right:0;top:50%;transform:translateY(-50%);z-index:' + Z + ';width:34px;padding:10px 6px;border:1px solid var(--dsw-alias-border-strong,#d0d5dd);border-right:none;border-radius:8px 0 0 8px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#1f2937);font-size:12px;line-height:1.25;writing-mode:vertical-rl;letter-spacing:2px;cursor:pointer;box-shadow:-2px 2px 10px rgba(0,0,0,.12);user-select:none;}',
          '.ztp-fab:hover{background:var(--dsw-alias-state-brand-bg-layer,#eef2ff);color:var(--dsw-alias-brand-primary,#4f6ef7);}',
          // 面板
          '.ztp-mask{position:fixed;inset:0;z-index:' + Z + ';background:rgba(0,0,0,.28);}',
          '.ztp-panel{position:fixed;top:0;right:0;bottom:0;z-index:' + (Z + 1) + ';width:min(430px,92vw);display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:-6px 0 24px rgba(0,0,0,.18);animation:ztp-slide .18s ease-out;}',
          '@keyframes ztp-slide{from{transform:translateX(30px);opacity:.4}to{transform:none;opacity:1}}',
          '.ztp-head{display:flex;align-items:center;gap:8px;padding:14px 16px;border-bottom:1px solid var(--dsw-alias-border-subtle,#e4e7ec);}',
          '.ztp-title{font-size:15px;font-weight:600;color:var(--dsw-alias-label-primary,#1f2937);flex:1;}',
          '.ztp-tabs{display:flex;gap:4px;padding:8px 12px;border-bottom:1px solid var(--dsw-alias-border-subtle,#e4e7ec);}',
          '.ztp-tab{padding:5px 14px;border:none;border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary,#6b7280);font-size:13px;cursor:pointer;}',
          '.ztp-tab.on{background:var(--dsw-alias-state-brand-bg-layer,#eef2ff);color:var(--dsw-alias-brand-primary,#4f6ef7);font-weight:600;}',
          '.ztp-body{flex:1;overflow-y:auto;padding:10px 12px;}',
          // 卡片
          '.ztp-card{border:1px solid var(--dsw-alias-border-subtle,#e4e7ec);border-radius:10px;padding:10px 12px;margin-bottom:8px;cursor:pointer;background:var(--dsw-alias-bg-layer-1,#fff);}',
          '.ztp-card:hover{border-color:var(--dsw-alias-brand-primary,#4f6ef7);background:var(--dsw-alias-state-brand-bg-layer,#eef2ff);}',
          '.ztp-card-title{font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary,#1f2937);line-height:1.45;word-break:break-all;}',
          '.ztp-card-meta{display:flex;flex-wrap:wrap;gap:4px 10px;margin-top:6px;font-size:11.5px;color:var(--dsw-alias-label-secondary,#6b7280);align-items:center;}',
          '.ztp-badge{display:inline-block;padding:1px 8px;border-radius:999px;font-size:11px;line-height:1.5;}',
          '.ztp-btn{padding:5px 12px;border:1px solid var(--dsw-alias-border-strong,#d0d5dd);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#1f2937);font-size:12.5px;cursor:pointer;}',
          '.ztp-btn:hover{background:var(--dsw-alias-bg-canvas-subtle,#f2f4f7);}',
          '.ztp-btn.primary{background:var(--dsw-alias-brand-primary,#4f6ef7);border-color:var(--dsw-alias-brand-primary,#4f6ef7);color:#fff;}',
          '.ztp-btn.primary:hover{opacity:.9;}',
          '.ztp-input{width:100%;padding:7px 10px;border:1px solid var(--dsw-alias-border-strong,#d0d5dd);border-radius:8px;font-size:13px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#1f2937);box-sizing:border-box;}',
          '.ztp-label{display:block;font-size:12.5px;color:var(--dsw-alias-label-secondary,#6b7280);margin:12px 0 4px;}',
          '.ztp-empty{padding:40px 10px;text-align:center;color:var(--dsw-alias-label-secondary,#6b7280);font-size:13px;}',
          '.ztp-err{margin:10px 12px;padding:8px 12px;border-radius:8px;background:var(--dsw-alias-state-error-bg-layer,#fef2f2);color:var(--dsw-alias-state-error-primary,#dc2626);font-size:12.5px;line-height:1.5;}',
          '.ztp-detail-desc{font-size:12.5px;line-height:1.7;color:var(--dsw-alias-label-primary,#1f2937);white-space:pre-wrap;word-break:break-word;margin-top:10px;padding:10px;background:var(--dsw-alias-bg-canvas-subtle,#f2f4f7);border-radius:8px;max-height:340px;overflow-y:auto;}',
          '.ztp-back{border:none;background:transparent;color:var(--dsw-alias-label-secondary,#6b7280);font-size:12.5px;cursor:pointer;padding:4px 6px;}',
          '.ztp-spin{display:inline-block;width:14px;height:14px;border:2px solid var(--dsw-alias-border-strong,#d0d5dd);border-top-color:var(--dsw-alias-brand-primary,#4f6ef7);border-radius:50%;animation:ztp-rot .7s linear infinite;vertical-align:-2px;margin-right:6px;}',
          '@keyframes ztp-rot{to{transform:rotate(360deg)}}',
        ].join('\n');
        document.head.appendChild(style);
      }

      // ───────────────────────── 工具 ─────────────────────────
      var KIND_LABEL = { task: '任务', bug: 'Bug', story: '需求' };
      var STATUS_LABEL = {
        wait: '未开始', doing: '进行中', done: '已完成', closed: '已关闭', cancel: '已取消', pause: '已暂停',
        active: '激活', resolved: '已解决', reviewing: '评审中',
      };
      var KIND_COLOR = {
        task: { bg: '#eef2ff', fg: '#4f6ef7' },
        bug: { bg: '#fef2f2', fg: '#dc2626' },
        story: { bg: '#ecfdf5', fg: '#059669' },
      };

      function statusLabel(s) { return STATUS_LABEL[s] ?? s ?? ''; }
      function fmtDate(d) { return d ? String(d).slice(0, 10) : ''; }
      function fmtPri(p) { return p != null ? 'P' + p : ''; }

      /** 卡片 → Markdown 任务卡（M3：插入输入框 / 新会话用） */
      function cardToMarkdown(card, detail) {
        var lines = [];
        lines.push('## 禅道' + (KIND_LABEL[card.kind] || card.kind) + ' #' + card.id + '：' + card.title);
        var meta = [];
        meta.push('**类型**：' + (KIND_LABEL[card.kind] || card.kind) + (card.severity != null ? '（严重程度 ' + card.severity + '）' : ''));
        meta.push('**状态**：' + statusLabel(card.status));
        if (card.pri != null) meta.push('**优先级**：P' + card.pri);
        if (card.openedBy) meta.push('**创建人**：' + card.openedBy);
        if (card.deadline) meta.push('**截止**：' + fmtDate(card.deadline));
        lines.push('- ' + meta.join(' · '));
        lines.push('- **原地址**：' + card.url);
        var desc = (detail && detail.desc) || card.descBrief || '';
        if (desc) {
          lines.push('');
          lines.push(card.kind === 'bug' ? '### 重现步骤/描述' : '### 描述');
          lines.push(desc);
        }
        lines.push('');
        lines.push('> 来自 dsh-zentao-panel，可直接编辑后发送');
        return lines.join('\n');
      }

      // ───────────────────────── 登录表单 ─────────────────────────
      function LoginForm(props) {
        var rpc = props.rpc, onDone = props.onDone, init = props.init || {};
        var baseUrl = useState(init.baseUrl || 'http://'), account = useState(init.account || ''), password = useState('');
        var busy = useState(false), err = useState(null);
        var doLogin = useCallback(function () {
          if (busy[0]) return;
          busy[1](true); err[1](null);
          Promise.resolve(rpc('zentao.login', { baseUrl: baseUrl[0].trim(), account: account[0].trim(), password: password[0] }))
            .then(function (r) {
              busy[1](false);
              if (r && r.ok) onDone(r.value);
              else err[1]((r && r.error && r.error.message) || '登录失败');
            })
            .catch(function (e) { busy[1](false); err[1](String(e && e.message || e)); });
        }, [baseUrl[0], account[0], password[0], busy[0]]);
        return h('div', { style: { padding: '18px 16px' } },
          h('div', { style: { fontSize: 14, fontWeight: 600, marginBottom: 4, color: 'var(--dsw-alias-label-primary,#1f2937)' } }, '登录禅道'),
          h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary,#6b7280)', marginBottom: 8 } }, '账号密码仅保存在本机（~/.dsh/zentao-panel），用于换取 30 天免登 cookie。'),
          err[0] ? h('div', { className: 'ztp-err', style: { margin: '0 0 8px' } }, err[0]) : null,
          h('label', { className: 'ztp-label' }, '禅道地址'),
          h('input', { className: 'ztp-input', value: baseUrl[0], onChange: function (e) { baseUrl[1](e.target.value); }, placeholder: 'http://zentao.example.com:8090', spellCheck: false }),
          h('label', { className: 'ztp-label' }, '账号'),
          h('input', { className: 'ztp-input', value: account[0], onChange: function (e) { account[1](e.target.value); }, placeholder: '禅道登录账号', spellCheck: false, autoFocus: true }),
          h('label', { className: 'ztp-label' }, '密码'),
          h('input', { className: 'ztp-input', type: 'password', value: password[0], onChange: function (e) { password[1](e.target.value); }, onKeyDown: function (e) { if (e.key === 'Enter') doLogin(); } }),
          h('button', { className: 'ztp-btn primary', style: { width: '100%', marginTop: 16, padding: '8px 0' }, disabled: busy[0], onClick: doLogin },
            busy[0] ? '登录中…' : '登录'),
        );
      }

      // ───────────────────────── 卡片列表 ─────────────────────────
      function CardList(props) {
        var cards = props.cards, onOpen = props.onOpen, onInsert = props.onInsert, onDispatch = props.onDispatch;
        if (!cards.length) return h('div', { className: 'ztp-empty' }, '没有指派给你的' + (props.kind ? KIND_LABEL[props.kind] : '内容'));
        return h('div', null, cards.map(function (c) {
          var kc = KIND_COLOR[c.kind] || {};
          return h('div', {
            key: c.kind + c.id, className: 'ztp-card',
            draggable: true,
            onDragStart: function (e) {
              try { e.dataTransfer.setData('text/plain', cardToMarkdown(c)); e.dataTransfer.effectAllowed = 'copy'; } catch (err) { /* 忽略 */ }
            },
            onClick: function () { onOpen(c); },
          },
            h('div', { className: 'ztp-card-title' },
              h('span', { className: 'ztp-badge', style: { background: kc.bg, color: kc.fg, marginRight: 6 } }, KIND_LABEL[c.kind] || c.kind),
              '#' + c.id + ' ' + c.title,
            ),
            h('div', { className: 'ztp-card-meta' },
              h('span', null, statusLabel(c.status)),
              c.pri != null ? h('span', null, 'P' + c.pri) : null,
              c.severity != null ? h('span', null, '严重' + c.severity) : null,
              c.deadline ? h('span', null, '截止 ' + fmtDate(c.deadline)) : null,
              c.openedBy ? h('span', null, '来自 ' + c.openedBy) : null,
            ),
            h('div', { style: { display: 'flex', gap: 6, marginTop: 8 } },
              h('button', { className: 'ztp-btn primary', style: { fontSize: 11.5, padding: '3px 10px' }, title: '新建会话并自动发送任务背景', onClick: function (e) { e.stopPropagation(); onDispatch(c); } }, '▶ 处理'),
              h('button', { className: 'ztp-btn', style: { fontSize: 11.5, padding: '3px 10px' }, onClick: function (e) { e.stopPropagation(); onInsert(c, null); } }, '⤵ 插入对话'),
              h('a', { href: c.url, target: '_blank', rel: 'noreferrer', className: 'ztp-btn', style: { fontSize: 11.5, padding: '3px 10px', textDecoration: 'none', display: 'inline-block' }, onClick: function (e) { e.stopPropagation(); } }, '原地址 ↗'),
            ),
          );
        }));
      }

      // ───────────────────────── 详情 ─────────────────────────
      function DetailView(props) {
        var rpc = props.rpc, card = props.card, onBack = props.onBack, onInsert = props.onInsert, onDispatch = props.onDispatch;
        var detail = useState(null), err = useState(null);
        useEffect(function () {
          var alive = true;
          err[1](null); detail[1](null);
          Promise.resolve(rpc('zentao.detail', { kind: card.kind, id: card.id }))
            .then(function (r) { if (!alive) return; if (r && r.ok) detail[1](r.value); else err[1](r && r.error && r.error.message || '详情加载失败'); })
            .catch(function (e) { if (alive) err[1](String(e && e.message || e)); });
          return function () { alive = false; };
        }, [card.kind, card.id]);
        var kc = KIND_COLOR[card.kind] || {};
        return h('div', null,
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 } },
            h('button', { className: 'ztp-back', onClick: onBack }, '‹ 返回列表'),
            h('a', { href: card.url, target: '_blank', rel: 'noreferrer', style: { fontSize: 12, color: 'var(--dsw-alias-brand-primary,#4f6ef7)', textDecoration: 'none', marginLeft: 'auto' } }, '在禅道打开 ↗'),
          ),
          h('div', { className: 'ztp-card', style: { cursor: 'default' } },
            h('div', { className: 'ztp-card-title' },
              h('span', { className: 'ztp-badge', style: { background: kc.bg, color: kc.fg, marginRight: 6 } }, KIND_LABEL[card.kind] || card.kind),
              '#' + card.id + ' ' + card.title,
            ),
            h('div', { className: 'ztp-card-meta' },
              h('span', null, statusLabel(card.status)),
              card.pri != null ? h('span', null, 'P' + card.pri) : null,
              card.severity != null ? h('span', null, '严重' + card.severity) : null,
              card.openedBy ? h('span', null, '来自 ' + card.openedBy) : null,
              card.assignedTo ? h('span', null, '指派给 ' + card.assignedTo) : null,
              card.deadline ? h('span', null, '截止 ' + fmtDate(card.deadline)) : null,
            ),
            h('div', { style: { display: 'flex', gap: 6, marginTop: 10 } },
              h('button', { className: 'ztp-btn primary', style: { fontSize: 12 }, title: '新建会话并自动发送任务背景', onClick: function () { onDispatch(card, detail[0]); } }, '▶ 处理（新会话下发）'),
              h('button', { className: 'ztp-btn', style: { fontSize: 12 }, onClick: function () { onInsert(card, detail[0]); } }, '⤵ 插入到对话输入框'),
            ),
          ),
          err[0] ? h('div', { className: 'ztp-err' }, err[0]) : null,
          detail[0] && detail[0].desc
            ? h('div', { className: 'ztp-detail-desc' }, detail[0].desc)
            : h('div', { className: 'ztp-empty', style: { padding: 16 } }, detail[0] ? '无描述' : '加载描述中…'),
        );
      }

      // ───────────────────────── 面板主体 ─────────────────────────
      function Panel(props) {
        var ctx = props.ctx, close = props.close;
        var tab = useState('task');
        var status = useState(null); // {configured, account, baseUrl, loggedIn, cacheAt}
        var mine = useState(null); // {cards, cached, at}
        var loading = useState(false), err = useState(null);
        var detailCard = useState(null); // 详情视图
        var toast = useState(null);

        var rpc = useCallback(function (endpoint, payload) {
          return ctx.connection.rpc.call(CHANNEL, endpoint, payload || {});
        }, []);

        // toast 自动消失
        useEffect(function () {
          if (!toast[0]) return;
          var t = setTimeout(function () { toast[1](null); }, 2200);
          return function () { clearTimeout(t); };
        }, [toast[0]]);

        var loadStatus = useCallback(function () {
          Promise.resolve(rpc('zentao.status')).then(function (r) {
            if (r && r.ok) status[1](r.value);
          }).catch(function () { /* 面板未连接 */ });
        }, [rpc]);

        var loadMine = useCallback(function (refresh) {
          if (loading[0]) return;
          loading[1](true); err[1](null);
          Promise.resolve(rpc('zentao.mine', refresh ? { refresh: true } : {}))
            .then(function (r) {
              loading[1](false);
              if (r && r.ok) { mine[1](r.value); status[1](function (s) { return s ? Object.assign({}, s, { cacheAt: r.value.at }) : s; }); }
              else err[1](r && r.error && r.error.message || '数据加载失败');
            })
            .catch(function (e) { loading[1](false); err[1](String(e && e.message || e)); });
        }, [rpc, loading[0]]);

        // 打开面板即拉状态+数据
        useEffect(function () { loadStatus(); }, [loadStatus]);
        useEffect(function () {
          if (status[0] && status[0].configured) loadMine(false);
        }, [status[0] && status[0].configured]);

        // 插入到输入框（M3：优先服务层 setDraft，再 DOM composer，失败则复制剪贴板）
        var insertToChat = useCallback(function (card, detail) {
          var md = cardToMarkdown(card, detail);
          // 优先：当前主视图会话的服务级 setDraft（dsh-rewind composerFacade 模式）
          var filled = false;
          try {
            var sessions = lookupService('sessions');
            var conversation = lookupService('conversation');
            var cur = sessions && typeof currentSessionId === 'function' ? currentSessionId(sessions) : null;
            var scope = cur ? sessions.scope(cur) : null;
            if (conversation && conversation.input && scope) {
              var facade = conversation.input.for(scope);
              if (facade && typeof facade.setDraft === 'function') {
                facade.setDraft(md);
                try { facade.focus(); } catch (e) { /* 忽略 */ }
                filled = true;
              }
            }
          } catch (e) { filled = false; }
          if (!filled) {
            try { filled = insertIntoComposer(md); } catch (e) { filled = false; }
          }
          if (filled) { toast[1]('已插入对话输入框'); close(); return; }
          // 兜底：复制到剪贴板
          try {
            root.navigator.clipboard.writeText(md).then(function () { toast[1]('已复制 Markdown（可粘贴到输入框）'); }, function () { toast[1]('复制失败，请手动复制'); });
          } catch (e) { toast[1]('复制失败'); }
        }, [close]);

        // M3「处理」：新会话自动下发（失败降级插入当前会话 → 剪贴板）
        var dispatchCard = useCallback(function (card, detail) {
          var md = cardToMarkdown(card, detail);
          Promise.resolve(dispatchToNewSession(md)).then(function (r) {
            if (r && r.ok) { toast[1](r.message); if (r.mode === 'dispatched' || r.mode === 'draft') close(); return; }
            // 服务层失败 → 降级插入当前会话输入框
            var msg = r && r.message ? r.message + '，已改为插入当前会话' : '新会话不可用，已改为插入当前会话';
            var ok = false;
            try { ok = insertIntoComposer(md); } catch (e) { ok = false; }
            if (ok) { toast[1](msg); close(); return; }
            try {
              root.navigator.clipboard.writeText(md).then(function () { toast[1](msg + '（剪贴板）'); }, function () { toast[1]('复制失败，请手动复制'); });
            } catch (e) { toast[1]('复制失败'); }
          }).catch(function (e) {
            toast[1]('下发失败：' + String(e && e.message || e));
          });
        }, [close]);

        var logout = useCallback(function () {
          Promise.resolve(rpc('zentao.logout')).then(function () {
            mine[1](null); status[1](null); detailCard[1](null);
            loadStatus();
          });
        }, [rpc, loadStatus]);

        var cards = mine[0] ? mine[0].cards : [];
        var filtered = useMemo(function () { return cards.filter(function (c) { return c.kind === tab[0]; }); }, [cards, tab[0]]);
        var counts = useMemo(function () {
          var m = { task: 0, bug: 0, story: 0 };
          for (var i = 0; i < cards.length; i++) m[cards[i].kind] = (m[cards[i].kind] || 0) + 1;
          return m;
        }, [cards]);

        var st = status[0];
        var unconfigured = st && !st.configured;

        return h('div', null,
          h('div', { className: 'ztp-mask', onClick: close }),
          h('div', { className: 'ztp-panel' },
            // 头部
            h('div', { className: 'ztp-head' },
              h('span', { className: 'ztp-title' }, '禅道工作台', st && st.account ? h('span', { style: { fontWeight: 400, fontSize: 12, color: 'var(--dsw-alias-label-secondary,#6b7280)', marginLeft: 6 } }, '· ' + st.account) : null),
              loading[0] ? h('span', { className: 'ztp-spin' }) : null,
              h('button', { className: 'ztp-btn', style: { fontSize: 12, padding: '3px 10px' }, onClick: function () { loadMine(true); }, title: '重新拉取' }, '刷新'),
              st && st.configured ? h('button', { className: 'ztp-btn', style: { fontSize: 12, padding: '3px 10px' }, onClick: logout, title: '清除本机凭据' }, '退出') : null,
              h('button', { className: 'ztp-btn', style: { fontSize: 12, padding: '3px 10px' }, onClick: close }, '✕'),
            ),
            unconfigured
              ? h(LoginForm, { rpc: rpc, init: { baseUrl: '', account: '' }, onDone: function (s) { status[1](s); loadMine(true); } })
              : h('div', { style: { display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 } },
                  // 标签页
                  h('div', { className: 'ztp-tabs' },
                    ['task', 'bug', 'story'].map(function (k) {
                      return h('button', {
                        key: k, className: 'ztp-tab' + (tab[0] === k ? ' on' : ''),
                        onClick: function () { tab[1](k); detailCard[1](null); },
                      }, (KIND_LABEL[k] || k) + (counts[k] ? ' ' + counts[k] : ''));
                    }),
                  ),
                  err[0] ? h('div', { className: 'ztp-err' }, err[0]) : null,
                  // 主体：列表 / 详情
                  h('div', { className: 'ztp-body' },
                    detailCard[0]
                      ? h(DetailView, { rpc: rpc, card: detailCard[0], onBack: function () { detailCard[1](null); }, onInsert: insertToChat, onDispatch: dispatchCard })
                      : h(CardList, { cards: filtered, kind: tab[0], onOpen: function (c) { detailCard[1](c); }, onInsert: insertToChat, onDispatch: dispatchCard }),
                  ),
                  mine[0] ? h('div', { style: { padding: '6px 14px', borderTop: '1px solid var(--dsw-alias-border-subtle,#e4e7ec)', fontSize: 11, color: 'var(--dsw-alias-label-secondary,#6b7280)' } },
                    '共 ' + cards.length + ' 条指派给我 · ' + (mine[0].cached ? '缓存于 ' + new Date(mine[0].at).toLocaleTimeString() : '刚刚拉取'),
                  ) : null,
                ),
          ),
          toast[0] ? h('div', { style: { position: 'fixed', left: '50%', bottom: '40px', transform: 'translateX(-50%)', zIndex: Z + 2, background: 'rgba(17,24,39,.92)', color: '#fff', borderRadius: 8, padding: '8px 16px', fontSize: 13 } }, toast[0]) : null,
        );
      }

      // ───────────────────────── 悬浮按钮 + 装载 ─────────────────────────
      // DSH 的 composer 是 contenteditable（textarea → contenteditable 迁移过），
      // 稳定挂点是 [data-composer-input]（dsh-rewind-plugin 在 0.2.1-rc.2 同款用法）。
      // React/Lexical 受控：必须走 execCommand insertText（或兜底 textContent + input 事件），
      // 直接改 DOM 不会同步内部状态。
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
      var insertIntoComposer = tryInsertIntoComposer;

      // ─────────────── 服务懒查找（dsh-notify-me lookupService 模式）───────────────
      // cordis inject 是硬门槛（服务不就绪插件就不激活），这里用 ctx.get() 懒解析：
      // 服务缺失时面板照常工作，「处理」按钮降级。
      function lookupService(name) {
        var svc = null;
        try { if (overlayCtx && typeof overlayCtx.get === 'function') svc = overlayCtx.get(name) || null; } catch (e) { svc = null; }
        if (svc) return svc;
        try { if (overlayCtx && overlayCtx.reflect && typeof overlayCtx.reflect.get === 'function') svc = overlayCtx.reflect.get(name) || null; } catch (e) { svc = null; }
        if (svc) return svc;
        try { if (overlayCtx && name in overlayCtx) svc = overlayCtx[name] || null; } catch (e) { svc = null; }
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

      /**
       * M3「处理」：新会话自动下发。
       * 链路（均在本机 DSH Desktop 0.2.1-rc.2 源码验证过）：
       *   sessions.create({cwd})               → 新会话 id（dsh-api-session-controller）
       *   uiWorkspace.openSession(id)          → 切主视图（内部同步 retain，scope 即刻可用）
       *   conversation.input.for(scope)        → 会话级输入 facade（dsh-rewind 同款）
       *     .setDraft(md) / .focus() / .submit()
       * 任一环失败 → 降级插入当前会话 composer；再失败 → 剪贴板。
       * @returns {Promise<{ok:boolean, mode:string, message:string}>}
       */
      function dispatchToNewSession(md) {
        var sessions = lookupService('sessions');
        var ws = lookupService('uiWorkspace');
        var conversation = lookupService('conversation');
        if (!sessions || typeof sessions.create !== 'function') {
          return Promise.resolve({ ok: false, mode: 'unavailable', message: 'sessions 服务不可用（DSH 版本过旧？）' });
        }
        // 继承当前会话的工作目录，让新会话落在同一个项目里；取不到就交给 host 默认值
        var opts = {};
        try {
          var cur = currentSessionId(sessions);
          if (cur) {
            var row = sessions.list.getSnapshot().byId[cur];
            if (row && row.cwd) opts = { cwd: row.cwd };
          }
        } catch (e) { /* 忽略 */ }

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
                facade.setDraft(md);
                try { facade.focus(); } catch (e) { /* 忽略 */ }
                // 自动发送：等 React 把 composer 挂到新会话后提交
                setTimeout(function () {
                  try {
                    if (typeof facade.submit === 'function') facade.submit();
                  } catch (e) { /* 已填草稿，发送交给用户按 Enter */ }
                }, 250);
                return { ok: true, mode: 'dispatched', message: '已在新会话发送任务背景', sessionId: sessionId };
              }
            }
            // scope/facade 不可用：降级为 DOM 填充（此时主视图可能已切过去）
            setTimeout(function () {
              try { fillComposerEditable(md); } catch (e) { /* 忽略 */ }
            }, 250);
            return { ok: true, mode: 'draft', message: '已新建会话并填入输入框，请确认发送', sessionId: sessionId };
          })
          .catch(function (err) {
            return { ok: false, mode: 'failed', message: '新会话创建失败：' + (err && err.message ? err.message : String(err)) };
          });
      }

      function ZentaoOverlay() {
        var open = useState(false);
        useEffect(injectCss, []);
        useEffect(function () {
          var onKey = function (e) { if (e.key === 'Escape') open[1](false); };
          document.addEventListener('keydown', onKey);
          return function () { document.removeEventListener('keydown', onKey); };
        }, []);
        return h('div', null,
          open[0] ? h(Panel, { ctx: overlayCtx, close: function () { open[1](false); } }) : null,
          h('div', { className: 'ztp-fab', onClick: function () { open[1](true); }, title: '禅道工作台' }, '禅道'),
        );
      }

      var overlayCtx = null; // apply() 时注入

      var inject = ['slots', 'connection'];

      function apply(ctx) {
        overlayCtx = ctx;
        try {
          ctx.slots.inject('shell.overlay', function () {
            return ctx.slots.register({
              name: 'shell.overlay',
              id: 'dsh-zentao-panel',
              order: 20,
            }, function () { return h(ZentaoOverlay, {}); });
          });
        } catch (e) {
          try { console.error('[dsh-zentao-panel] overlay slot unavailable', e); } catch (e2) { /* 忽略 */ }
        }
      }

      exports.name = 'dsh-zentao-panel';
      exports.inject = inject;
      exports.apply = apply;
      exports.cardToMarkdown = cardToMarkdown; // 测试用
      exports._test = { fillComposerEditable: fillComposerEditable, tryInsertIntoComposer: tryInsertIntoComposer };
      return module.exports;
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
