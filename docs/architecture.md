# 架构与实现细节

> 面向维护者。README 只讲「怎么用」，本文讲「为什么这样做」——数据链路、DSH 内部接口、
> 下发/状态机制，以及踩过的坑。协议探测的原始记录在《[计划书.md](../计划书.md)》附录 A。

## 1. 总览

```
ZenTao 18.13（内网）
   │  网页登录协议（cookie 30 天免登）+ my-work 三接口 + v1 详情 + file-read 图片
   ▼
host 半边（lib/，Node ESM，零 npm 依赖）
   zentao-client.mjs  登录 / 取数 / 图片下载（HTTP 只读）
   service.mjs        多账号聚合：每账号独立 client / cookie / 缓存 / 自动重登
   store.mjs          $DSH_HOME/zentao-panel/config.json（0600，schema v2）
   rpc.mjs            POST /dsh-zentao-panel/<endpoint>（loopback RPC，信任栅栏）
   index.js           apply(ctx)：inject ['webServer', 'connection']
   ▼
client 半边（client/client.js，免构建手写 bundle，React 走 DSH 模块系统）
   左侧栏 sidebar.panellist 图标行 → main keyed slot 面板（列表 / 详情 / 流程看板）
   下发到 DSH 会话：sessions / conversation / uiWorkspace 懒查找（缺失则降级）
   状态信号：uiSession.sessionStatus（宿主算好的处理中 / 等你决策 / 完成未读）
```

## 2. host 半边

### 2.1 RPC（`lib/rpc.mjs`）

| endpoint | 作用 |
|---|---|
| `zentao.status` | 当前账号 / 是否已配置 / 版本信息（面板启动即调） |
| `zentao.login` / `zentao.logout` | 登录（baseUrl + 账号 + 密码）/ 登出 |
| `zentao.switch` / `zentao.rename` | 切换激活账号 / 改账号别名（空串清除） |
| `zentao.mine` | 「指派给我」的任务 / Bug / 需求（host 侧 60s 缓存） |
| `zentao.detail` | 单条详情 + 最近动态（v1 接口） |
| `zentao.image` | 禅道图片字节（base64 + mediaType，同源校验 + 路径白名单 + magic 嗅探） |

- 通道优先挂到 `webServer` 上（复刻 `dsh-client-connection` 的 wire 协议：
  `client-request` → `server-response`，body ≤ 8 MiB）；旧版 DSH 回退 `connection.rpc.handle`。
- 信任栅栏：能用 `connection.requestRejection` 就用（非 owner 401/403），否则只放行 loopback
  （`127.0.0.1` / `localhost` / `::1` + 同源 + 非 cross-site）。
- 探测插件是否真的加载：`curl -X POST http://127.0.0.1:<dsh端口>/dsh-zentao-panel/zentao.status`
  —— **401 = 已挂载**（栅栏拒绝），404/405 = 没加载。

### 2.2 缓存

| 层 | 位置 | 策略 |
|---|---|---|
| 列表 | host `service.mjs` | 60s TTL，防面板轮询打爆禅道 |
| 图片 | host 每账号 | TTL 10min / 32MB，命中在 `ensureLogin` 之前返回（登录失效也不触发探活） |
| 图片 | client 模块级 | 40 张 / 24MB（dataURL 长度计），最旧先出 |
| 列表快照 / 详情 | client `localStorage` | 见 §6 |

## 3. 禅道侧协议

- **登录**：`GET /user-login.html` 种 session → `GET /user-refreshRandom.html` 取 `verifyRand` →
  `POST /user-login.html`，密码为 `md5(md5(password) + verifyRand)`。
  **POST 必须带整套 jQuery 风格请求头**（`X-Requested-With`、带 charset 的 `Content-Type`、
  `Accept`、`Referer`、`Origin`、浏览器 UA），缺一个服务端就静默返回登录页 HTML。
- **数据主通道**：`/my-work-{task,bug,story}.json`，登录态 cookie 一次拿全量；
  响应是双层 JSON（外层 `{status, data:'<json 字符串>'}`，`data` 需二次 parse）。
- **详情**：`/api.php/v1/{tasks,bugs,stories}/{id}`，自带 `actions`（备注 / 流转 / 字段变更，
  actor 已是真名）。**复数路径显式映射**：需求是 `stories`，不是 `storys`。
- **图片**：v1 详情给绝对 URL，列表接口给 `{35861.png}` 占位符——两者都归一成
  `/file-read-<fileID>.<ext>`，带 cookie + Referer 下载；不存在的 fileID 返回 `text/html` 空包，
  所以要按 content-type + magic 校验。
- **会话失效有两种形态**，都要识别成 `SESSION_EXPIRED` 才会自动重登：
  ① 响应被重定向到 `user-login`；② **HTTP 200 + 失败信封**「登录已超时，请重新登入!」
  （不重定向、body 里没有 `user-login` 字样）。只认 ① 时会静默变成「没有指派给你的任务」。

## 4. client 半边

- **免构建**：`client/client.js` 是手写 bundle，React 经 DSH 模块系统拿；
  `package.json` 的 `exports` 必须有 `"./client": "./client/client.js"`，否则
  `dsh-client-modules` 在激活扫描时直接 throw，且**只打在 host 启动日志的 warn 里**，
  浏览器 console 一个错都没有 —— 表现就是「插件完全不存在」。
- **懒查找服务**：`dsh.client.inject` 是硬门槛（列出的包没激活，插件整个不激活），
  所以 `sessions` / `uiWorkspace` / `conversation` / `uiSession` 一律走 `lookupService` 懒查找，
  缺失时面板照常、只把对应能力降级。
- **入口（对齐 dsh-mnemon 的「记忆系统」）**：`sidebar.panellist` 注册图标行 `{id, order, label}`，
  同 id 在根作用域 `main` keyed slot 注册面板；点图标 = `ctx.layout.selectPanel(id)`，
  面板占满主区域。**`selectPanel` 是 class 方法**，从服务实例抽成裸函数调用会 `this` 丢失并静默抛错。
  `main` slot 只渲染当前 keyed 面板，切回会话时组件卸载 —— 重挂靠模块级 `paneCache` 秒恢复。
  没有这两个 slot 的旧版 DSH 自动退回右缘悬浮按钮 + 侧滑面板。
- **主题**：颜色只用 `--dsw-alias-*` 语义 token，暗色由 `body[data-ds-dark-theme]` 自动切换。

## 5. 下发链路（卡片 → DSH 会话）

三条路径共用 `createDraftSession(md, images, choice)`（建会话 + 写草稿 + 并行设模型/挂附件）：

| 路径 | 建会话 | 视图 | 是否自动发送 | retain 释放 |
|---|---|---|---|---|
| 「处理」 | 弹层选工作区 / 模型 / 思考强度 | **不跳转**（留在面板继续挑活） | 自动发送 | submit 后 3s |
| 「新建对话」 | 同上 + 「自动带入任务背景」开关 | **自动跳转** | 不发送（草稿待你确认） | 跳转后立即释放 |
| 降级 | 服务缺失时 | 当前会话 | — | — |

- 「处理」不跳转的原因：`uiWorkspace.openSession` 内部是 `replaceMain(..., 'reveal')` →
  `selectPanel(null)`，必然把主视图从禅道面板切走。改用
  `sessions.retain(id, {source:'zentao-panel'})` 后台保活——`conversation.input.for(scope)` 的
  `setDraft` / `addAttachments` / `submit` 都是服务级调用，**不需要视图挂载**。
- 草稿模式**不释放** retain：release 会让 referenceCount 归零 → `retireScope`，未发送的草稿可能丢。
- **图片只能走附件通道**：用户消息不渲染 markdown，所以链路是
  RPC 取字节 → `new File(...)` → `conversation.createDrafts(sessionId, files)` 拿 draft id →
  `conversation.input.for(scope).addAttachments(ids)`。`addAttachments` **只收已注册的 draft id**，
  不收 File/Blob/路径；伪造 id 会被静默 prune。单消息 ≤20 张、单图 ≤20MB / 单边 ≤8192，
  超大截图先缩到 2048 长边。
- 时序：图片预取与建会话并行 → 建会话后**立即** `setDraft`（缩短空白期）→ selectModel 与附件注册
  `Promise.all` → submit 前留 250ms。selectModel 被显式拒绝时只填草稿、**不代发**。

## 6. 处理状态

- 信号源：`lookupService('uiSession').sessionStatus`（observable store，`Map<sessionId, {running,
  pendingInteraction, completionUnread}>`），零轮询。`completionUnread` **只对后台会话置位**。
- 边沿：`pendingInteraction` 出现/变化 → 提醒「等你决策」；`completionUnread` false→true → 「已完成」；
  同帧两者兼有只报决策。首次见到的会话只建基线不提醒（防重启风暴）。
- 持久化：状态落 `states.v1`（按账号隔离）。**done 是粘性记录**（看过会话后仍保留）；
  「处理中」归零且有结束确认信号（状态源非空，或该会话在列表里有行且全 false）→ 升级为 done
  —— 覆盖「正看着的会话跑完宿主不置完成未读」这一漏报；「等你决策」归零 = 用户已回应 → 删。
- 人工干预：手动状态（处理中 / 等你决策 / 已完成）与人工终态「已结束」落同一份记录（`manual` 标记），
  自动评估不再覆盖；选「自动」恢复跟随信号。
- 清理：每次拉取到「指派给我」列表后顺带跑——离线超过 **8h** 的卡片，其 links / states / replies /
  marks / notes 一起删（当天短暂波动不误删，第二天回来是干净状态）。

## 7. 数据落在哪

| 位置 | 内容 | 生命周期 |
|---|---|---|
| `$DSH_HOME/zentao-panel/config.json`（0600） | 账号、密码（base64 混淆）、cookie、别名、activeId | 卸载不自动删 |
| `localStorage` `dsh-zentao-panel.links.v1` | 卡片 → DSH 会话关联（含会话标题快照） | 卡片离开列表 8h 后清 |
| `…states.v1` | 处理进度 / 手动状态 | 同上 |
| `…replies.v1` | 关联会话最新回复摘要（TTL 10min） | 换会话 / 会话删除 / 8h |
| `…mine.v1` | 列表快照（400 卡 / 账号，最多 4 账号） | 拉取成功即覆盖 |
| `…marks.v1` / `…notes.v1` | 旗标 / 本地备注 | 8h 清理 |
| `…instr.v1` / `…instr-presets.v1` | 附加指令上次输入 / 预设模板（≤12 条） | 持久 |
| `…carry.v1` / `…lastdispatch.v1` | 「自动带入」开关 / 极速重发配置 | 持久 |

localStorage 全部只是本机 UI 状态；凭据只在 `config.json`。两者都不上传任何远端。

## 8. 踩过的坑（改代码前先读）

1. `exports` 少 `"./client"` → 插件被静默 drop，前端无任何报错。
2. `ctx.get('remote')` 拿不到 `.session`（命名空间是独立服务）——要 `lookupService('remote.session')`。
3. `useCallback(fn, [])` 里读 `useState` 返回值会拿到**初次 render 的快照**；弹层卡「创建中…」、
   计数只加一次都是这个原因。需要的数据由调用方随参数回传，计数用函数式 setter。
4. v1 需求详情是 `stories`，拼成 `storys` 会一直 404。
5. `layout.selectPanel` 必须以方法形式调用。
6. 会话失效形态 ②（200 + 失败信封）不识别 → 面板静默空列表。
7. host 改动要**重启桌面版**（插件是 `link:` 符号链接直连仓库，不用重装）；client 改动 ⌘R 生效。

## 9. 验证

```bash
node test/client.mjs        # client 半边：bundle 装载 + 注册契约 + 纯函数（无需 DSH）
node test/multi.mjs         # 多账号：store 迁移 / 切换 / 缓存隔离 / 移除（mock，不打网络）
node test/protocol.mjs      # 禅道响应信封协议 + actions 映射（stub fetch，不打网络）
DSH_HOME=/tmp/zt-smoke node test/smoke.mjs   # 直连真实禅道（需内网可达）
DSH_HOME=/tmp/zt-host  node test/host.mjs    # apply() + RPC wire 协议端到端（mock ctx，真实禅道）
```

`smoke` / `host` 的凭据来自 `ZENTAO_BASE` / `ZENTAO_ACCOUNT` / `ZENTAO_PASSWORD` 环境变量或
`~/.dsh/zentao-panel/config.json`。`host.mjs` 末尾的登出会清掉借用凭据目录里的账号
（`/tmp/zt-smoke` 会被消耗），下次要重新提供。
