# CLAUDE.md — dsh-zentao-panel 项目交接文档

> 交接自 DeepSeek Harness（Qoder agent），2026-10-23。
> 本文件是给 Claude 的完整上下文：项目背景、已完成工作、关键技术事实（含踩过的坑）、剩余任务。

## 项目背景

用户的工作依赖公司禅道（任务/Bug 管理），希望在 DSH（DeepSeek Harness Desktop）里直接看到「指派给我」的工作，并能一键把禅道内容转成 DSH 对话上下文，免去「禅道 → 梳理 → DSH 下发」的切换。

**需求边界（用户已拍板，不要扩scope）**：
- 数据范围：指派给我的**任务 / Bug / 需求**三类；
- 界面：右缘悬浮「禅道」按钮 + 右侧滑出面板（不做固定侧边栏）；
- 转上下文方式：① 卡片拖拽/点击插入对话输入框；② 「处理」式一键下发（新会话自动发任务背景）；
- **只读，不回写禅道**（完成/解决操作仍回禅道做）；
- **不做** agent 工具（用户明确拒绝）、**不做** 悬浮按钮角标（用户明确拒绝）；
- 鉴权：账号+密码登录（不做 API Token 方式）。

## 当前状态（截至交接）

| 里程碑 | 状态 |
|---|---|
| M0 禅道 API 探测 | ✅ 完成，结论在《计划书.md》附录 A（必读） |
| M1 host 插件（登录/取数/RPC） | ✅ 代码完成，测试全绿，**已装入 desktop profile 加载树**（重启 DSH Desktop 激活） |
| M2 client 右侧栏 tab + 引导卡片 | ✅ 已改为 `sidebarRightTabs` 入口（对齐 dsh-context「上下文」），样式走 DSH token 支持日/夜；注册契约有测试，待真机目视确认 |
| M3 插入输入框 + 新会话下发 | ✅ 服务级 `setDraft` 真机可用；**描述里的截图改为真实图片附件**（`conversation.createDrafts` + `facade.addAttachments`，见 §4.1）；新会话下发待真机复验 |
| M4 打磨 | 🔄 进行中：2026-10-24 修会话超时静默空白（超时信封识别→自动重登）+ 拉取失败 toast/错误视图；同日改「处理」为**弹层确认式**（先选工作区、接入模型与思考强度再下发，见 §4.2，待真机目视确认）；其余未做 |
| M5 多账号 | ✅ 2026-10-24 完成：schema v2（accounts[]+activeId，旧格式自动迁移）、每账号独立 client/cookie/缓存、账号菜单切换/添加/按账号移除；测试全绿（multi 25 项 + host 新增 4 项），待真机目视确认 |

测试命令：
```bash
node test/client.mjs                         # client 半边注册契约（无需 DSH / 禅道）
node test/multi.mjs                          # 多账号：迁移/切换/缓存隔离/移除（mock client，不打网络）
node test/protocol.mjs                       # 禅道响应信封协议 + 自动重登（stub fetch，不打网络）
DSH_HOME=/tmp/zt-smoke node test/smoke.mjs   # 直连真实禅道验证 client/service 层（需内网可达）
DSH_HOME=/tmp/zt-host  node test/host.mjs    # apply() + RPC wire 协议端到端（mock ctx）
```
凭据走 `ZENTAO_BASE`/`ZENTAO_ACCOUNT`/`ZENTAO_PASSWORD` 或 `~/.dsh/zentao-panel/config.json`——**永远不要把凭据提交到 git**。

## 文件结构

```
dsh-zentao-panel/
├── CLAUDE.md            # 本文件
├── 计划书.md            # 原始计划 + M0 探测记录（附录 A 是禅道协议的权威记录）
├── README.md            # 用户视角说明（安装/进度）
├── package.json         # dsh.bundle + dsh.client 清单声明
├── cordis.patch.yml     # cordis loader insert 条目
├── lib/                 # host 半边（Node ESM，零 npm 依赖）
│   ├── index.js         # 插件入口 apply(ctx) —— inject: ['webServer', 'connection']
│   ├── zentao-client.mjs# 禅道 HTTP 客户端（登录协议/cookie jar/my-work/v1 详情）
│   ├── service.mjs      # 聚合层（多账号会话：每账号独立 client/缓存/自动重登）
│   ├── store.mjs        # ~/.dsh/zentao-panel/config.json 持久化（0600，schema v2）
│   └── rpc.mjs          # /dsh-zentao-panel loopback RPC（wire 协议复刻 dsh-pocket）
├── client/
│   └── client.js        # client 半边（免构建手写 bundle，React 经 DSH 模块系统）
└── test/
    ├── smoke.mjs        # 真实禅道集成测试
    ├── host.mjs         # host 插件端到端测试（mock cordis ctx）
    ├── multi.mjs        # 多账号（mock client，不打网络）
    ├── protocol.mjs     # 禅道响应信封协议 + 自动重登（stub fetch，不打网络）
    └── client.mjs       # client 半边注册契约（免渲染）
```

## 关键技术事实（省你重新踩坑）

### 1. 目标禅道实例（用户公司的，实测于 2026-10-23）

- 地址 `http://zentao.example.com:8090`，账号 `your-account`（密码问用户，不要写进代码/git）
- ZenTao **18.13 开源版**，ALM 模式，PATH_INFO 路由（requestFix=`-`）
- **RESTful API v2 整个不可用**：所有 `/api.php/v2/*` 返回 500 `Class 'tokensEntry' not found`（入口类未部署）。所以 dsh-zentao（GitHub 上那个）的 v2 路线在这台实例上走不通，easysoft/zentao-mcp 官方方案同样依赖 v2 也用不了
- **API v1 部分可用**：`POST /api.php/v1/tokens`（account+password → 201 + token）能拿 Token，`/api.php/v1/{tasks,bugs,stories}/{id}` 详情接口可用；但 `/api.php/v1/my/*` 不存在，`browseType=assigntome` 等过滤参数被服务端忽略，全量遍历（9059 个 bug ÷ 200/页 × 2.6s）要 2 分钟——**只能当兜底，不是主通道**
- 该实例登录**无验证码**（登录表单的 captcha 传空即可）

### 2. 网页登录协议（M0 实测逆向，这是本项目最值钱的知识）

```
1. GET  /user-login.html                          （种 session cookie）
2. GET  /user-refreshRandom.html                  （返回数字串 verifyRand）
3. 密码加密：md5(md5(password) + verifyRand)
4. POST /user-login.html  表单字段：
   account=<账号>&password=<加密后>&passwordStrength=1&referer=/&verifyRand=<rand>&keepLogin=1&captcha=
5. 成功：{"result":"success","locate":"/"}
   失败：{"result":"fail","message":"..."}
```

**最大的坑**：POST 必须带一整套 jQuery 风格请求头，缺任何一个服务端都直接忽略登录、渲染回登录页 HTML（200 + text/html）：
```
X-Requested-With: XMLHttpRequest
Content-Type: application/x-www-form-urlencoded; charset=UTF-8   ← charset 必须有！
Accept: application/json, text/javascript, */*; q=0.01
Referer: http://<host>/user-login.html
Origin: http://<host>
User-Agent: <常规浏览器 UA>
```
用 python urllib 或 curl 少了 Referer/Origin/UA 都失败过——`lib/zentao-client.mjs` 里 `BROWSER_HEADERS` 是已验证的正确组合。

**登录成功后**获得长期 cookie：`za`（账号）、`zp`（免密 hash）、`keepLogin=on`——**30 天免登**。只需持久化 cookie 即可，之后 `GET /my-work-*.json` 直接口令通。会话失效有**两种形态**，都必须识别成 SESSION_EXPIRED（lib/zentao-client.mjs 的错误码）才会触发自动重登：
1. 响应体被重定向到 `user-login`（body 出现 `user-login` 字样）；
2. **HTTP 200 + 失败信封** `{"result":false,"message":"登录已超时，请重新登入!"}`（content-type 仍是 text/html）——不重定向、body 无 `user-login` 字样。**2026-10-24 真机踩坑**：v0.1.0 只认形态 1，形态 2 被 `fetchMyWork` 当成空列表 → 面板静默显示「没有指派给你的任务」，点刷新也无效（探活走同一通道，永远"成功"，到不了自动重登分支）。已修：`result` 为 false/'fail' 且期望数据键缺席时，消息匹配 登录/登入/超时/未登 → SESSION_EXPIRED，否则抛「禅道接口返回失败：<msg>」；回归见 `test/protocol.mjs`。

### 3. 数据接口（登录态 cookie 下）

| 数据 | 接口 | 备注 |
|---|---|---|
| 我的任务/需求 | `GET /my-work-task.json`、`/my-work-story.json` | 双层 JSON：外层 `{status:'success', data:'<json字符串>'}`，`data` 要二次 parse |
| 我的 Bug | `GET /my-work-bug.json` | 同上 |
| 单条详情 | `GET /api.php/v1/tasks/{id}` 等 | 一次一个，字段全（pri/deadline/desc/steps/spec HTML/assignedTo 对象…） |

注意：**my-work 列表的 `id` 是字符串，v1 详情的 `id` 是数字**——比较时统一 `Number()`（已在 `toCard()` 处理，但新代码容易再踩）。story 列表是 dict（按 id 索引）不是数组。

**描述里的图片**（M3 图片附件依赖，2026-10-23 实测）：同一张截图在两种接口里形态不同——
- v1 详情：`<img onload="setImageSize(this,0)" src="http://zentao.example.com:8090/file-read-35861.png" />`
- my-work 列表：`<img src="{35861.png}" />`（占位符，basename 就是 fileID）
两者都归一成 `/file-read-<fileID>.<ext>` 下载（登录态 cookie + Referer 可拿到 `image/png`）；不存在的 fileID
返回 `text/html` 空包（要按 content-type/magic 校验）。见 §4.1。

### 4. DSH 客户端服务 API（M3 实现依据，从 app.asar 源码逆向确认）

**怎么读源码**：DSH Desktop 的 web 端全部模块在 `app.asar` 里：
```bash
cd /tmp && npx asar extract "/Applications/DeepSeek Harness.app/Contents/Resources/app.asar" asar-dsh
# 之后直接读 /tmp/asar-dsh/dsh/node_modules/@deepseek-ai/<包>/lib/{index,client}.js
```
关键包：`dsh-api-session-controller`（sessions 服务）、`dsh-client-ui-workspace`（uiWorkspace）、`dsh-client-ui-conversation`（conversation）。

**服务 API 面（0.2.1-rc.2，均已源码确认）**：

| 服务 | 提供者 | 关键方法 |
|---|---|---|
| `sessions` | dsh-api-session-controller | `.create({cwd?, workspaceId?, agentPreset?})` → Promise<sessionId>；`.scope(id)` → 会话作用域 ctx（未 retain 返回 undefined）；`.binding(id)` → `{sessionId, session, eventSource, ctx}`；`.list` store（`getSnapshot().byId[id]` 有 `cwd/blank/retainedBy.mainView`）；`.retain(target, {source})` |
| `uiWorkspace` | dsh-client-ui-workspace | `.openSession(id)`（内部 `sessions.retain(mainView)` + `replaceMain`，同步完成 scope 即刻可用）；`.startSession(workspaceId?, {prompt})`（建会话+切主视图+填草稿） |
| `conversation` | dsh-client-ui-conversation | `.input.for(scopeCtx)` → 会话输入 facade：`.setDraft(text)` / `.focus()` / `.submit()` / `.insertText` / `.addAttachments`；`conversation.input.for` 要求该会话已被 retain（mainView 天然满足） |
| `session`（binding.session） | 同上 | `.prompt([{type:'text', text}], 'queue'|'steer')` —— 程序化发送消息（conversation.send 内部就是它） |

**cordis inject 语义**（dsh-notify-me 源码注释里专门讲的坑）：`dsh.client.inject` 是硬门槛——列出的包没激活，插件 entry 整个不激活；而服务用 `ctx.get(name)` 懒查找（`lookupService` 三级回退：get → reflect.get → 属性访问）就没这个限制。本项目的 `client.js` 用懒查找，所以 sessions/uiWorkspace/conversation 缺失时面板照常、只是「处理」降级。

**⚠️ 最大的坑（2026-10-23 真机踩到）**：声明了 `dsh.client` 但 `package.json` 的 `exports` 没有 `"./client"` 时，`dsh-client-modules` 在激活扫描时直接 throw：
```
client-modules: <pkg> declares dsh.client but exports no "./client" bundle
```
这个错误**只打在 host 启动日志的 warn 里**（`flush(err => ctx.logger.warn(err))`），该插件被静默 drop——**浏览器 console 一个错都没有**，表现就是「插件完全不存在」。修复：`exports` 必须有 `"./client": "./client/client.js"`（可用 string 或 `{default: string}`）。改完必须**重启桌面版**：client-module 表只在 boot 时组合，失败过的包不会被 HMR 收编。

**验证 client bundle 是否被服务的办法**：`curl -X POST http://127.0.0.1:<dsh端口>/dsh-zentao-panel/zentao.status`——返回 **401**（信任栅栏拒绝）说明 host 路由已挂载；返回 404/405 说明插件没加载。端口用 `lsof -nP -iTCP -sTCP:LISTEN | grep DeepSeek` 找（桌面版是 127.0.0.1 高位端口，3081 是 dsh-pocket 代理）。

**composer DOM**：`[data-composer-input]`（contenteditable，Lexical 受控）。写法必须 `execCommand('insertText')`（选中全部内容后），失败兜底 `textContent + input 事件`——dsh-rewind-plugin 的 `fillComposerEditable` 原样照抄。`data-composer-card` / `data-composer-seat` 是外围挂点。

### 4.1 真实图片附件（2026-10-23 新增，DSH 0.2.1-rc.2 源码确认）

用户要求：插入对话时，禅道描述里的截图要变成**真实图片**（不是 `[图片] {35861.png}` 文本占位符）。

**结论：用户消息不渲染 markdown**（`UserText` 只有 text/session 两类节点，气泡 `white-space:pre-wrap`），
所以图片只能走 **attachments API**，插 markdown `![]()` 没用。

正确调用链（`dsh-client-ui-conversation/lib/client.js`）：
```
conversation.createDrafts(sessionId, File[])            // :4751，File → 注册 draft，图片得 blob: 预览
  → [{id, kind:'image', previewUrl, file}]
conversation.input.for(scope).addAttachments(ids)       // :15093，只收「已注册的 draft id」
  → 草稿附件栏显示缩略图；submit 时 encodeImage 成 base64
  → 宿主 admitPromptContent → image block（模型可见）
```
- `addAttachments(ids)` **不接受 File / Blob / path**，只接受 registry 里的不透明 id；伪造 id 会被
  InputBar 的 `pruneAttachments` 静默清掉（提交时抛 "draft attachments are no longer available"）。
- `conversation.input.for(scope)` 返回 `SessionInputShell` 本体，除 `setDraft/addAttachments/submit/focus`
  外还有 `insertText(需要 captureInsertion 的 span)` / `pickFiles` / `notify` / `snapshot`。
- 附件不持久化：localStorage 只存文本，刷新/切会话后附件 rail 清空。
- 约束：`File.type ∈ {image/png,image/jpeg,image/webp,image/gif}`；单图 ≤20MB、≤64MP、单边 ≤8192；
  单消息 ≤20 张 / 200MB；宿主入库归一化到 ≤2048²px、≤4MiB。
- **模型不支持图片输入时宿主拒绝整条 prompt**（reason `MODEL_DOES_NOT_SUPPORT_IMAGES`，DSH 会提示
  「当前模型不支持图片，请切换支持图片的模型」），发送失败会保留草稿与附件。
- 参考实现：`~/.dsh/profiles/desktop/node_modules/dsh-rewind-plugin/lib/client.js:1680-1716`
  （snapshot 恢复时用同一套 createDrafts + addAttachments）。
- renderer 拿不到附件磁盘路径（没有 `/dsh-attachment` 路由），图片字节要么来自我们自己的 RPC，
  要么用 `session.readAttachment(attachmentId)`。

本项目的实现：
- 禅道图片**两种形态**：v1 详情 `<img src="http://zentao.example.com:8090/file-read-35861.png">`；
  `my-work-*.json` 列表里是占位符 `<img src="{35861.png}">` → 都归一成 `/file-read-35861.png`
  （`service.mjs` 的 `extractImageRefs/normalizeImageUrl`）。
- 卡片模型与详情都带 `images: [{url, name}]`；`htmlToText` 把 `<img>` 渲染成 `[图片：35861.png]`（不内联 URL）。
- 插入内容用**精简模板**（2026-10-23 用户要求）：只有「`## 禅道Bug #id：标题` + `### 重现步骤/描述` + 描述正文」，
  不带类型/状态/优先级/截止、原地址、`[图片：xxx]` 占位符、插件页脚；图片以真实附件插入（`stripImageMarkers()` 负责去占位符）。
- host 新增 RPC `zentao.image`：同源校验 + 路径白名单（`/file-read-`、`/data/upload/`、`/index.php`）
  + magic 嗅探 → 返回 `{name, mediaType, base64, bytes}`，单图上限 20MB。
- client 端 `attachImagesToDraft()`：RPC 取图 → `new File([bytes], name, {type})` → `createDrafts`
  → `interface.addAttachments`；`addAttachments` 返回 false 时 `releaseDraftAttachments` 清理。
  超大图（>8192 边长 / >64MP / >20MB）先用 `createImageBitmap` + canvas 缩到 2048 长边再附加。

### 4.2 「处理」弹层：工作区/模型/思考强度选择（2026-10-24，DSH 0.2.1-rc.2 源码确认）

用户要求「处理」先选**工作区**与**接入的大模型 + 思考强度**（默认带当前会话的在用项）再下发。
点「处理」→ `DispatchDialog` 弹层 → `sessions.create({workspaceId|cwd})` 建会话 →
`remote.session.selectModel` 按会话设置所选模型 → 附件/草稿/submit。源码事实：

- **`sessions.create` 参数**（dsh-api-session-controller client.js :3309）：`{workspaceId?|cwd?, agentPreset?, sessionId?}`。
  **workspaceId 与 cwd 互斥**（host 侧 `session.create accepts workspaceId or cwd, not both`，:756）。
- **工作区列表**：client 服务 `workspaces`（dsh-api-workspace-controller，`Service(ctx, "workspaces")`），
  `workspaces.list.getSnapshot()` → `{items:[{workspaceId, path, title, sessionIds, ...}], phase}`。
  当前会话归属的工作区 = `items.find(w => w.sessionIds.includes(cur))`（uiWorkspace.startSession 同款算法）。
- **⚠️ 模型 ≠ agentPreset**：composer 的模型选择器走的是 **provider/model/reasoningEffort** 体系
  （`dsh-client-ui-model-selection`），`agentPresets` 是另一套（预设=插件组合，会话头部的 chip）。
  用户说的「选模型」指前者。模型目录与按会话选择：
  - **目录**：`ctx.remote.session.modelCatalog()` → RemoteResult `{ok, value: {default: {provider, model, reasoningEffort?}, routableProviders, groups: [{id, name, models: [{id, name, description?, reasoning?: {efforts: [{id, name}], defaultEffort?}}]}]}}}`。
    **efforts 直接挂在 model 上**（`model.reasoning`）；`defaultEffort` 缺席时 UI 要有「提供商默认」项（effort 不传）。
  - **按会话设置**：`ctx.remote.session.selectModel({sessionId, provider, model, reasoningEffort?})`
    → `{selected: {...}}`（typert `session/selectModel`，wire 服务名 sessionController）。**创建会话时
    create 没有 provider/model 参数，模型必须在会话建好后 selectModel**。
  - **⚠️⚠️ 真机踩坑（2026-10-24）**：`ctx.remote.session` 这种**点链访问只在 ctx 代理上有效**
    （cordis 的 tracker.associate 会把 `ctx.remote.xxx` 转发成 `ctx['remote.xxx']` 服务查找，cordis/lib/index.js:130）。
    但 **`ctx.get('remote')` 返回的 ClientRemoteService 裸实例上没有 `.session`/`.agentPresets` 属性**
    （命名空间是独立注册的 cordis 服务，服务名 `remote.<namespace>`，api-gateway 的 RemoteNamespaceService，
    方法 defineProperty 在命名空间服务实例上）。所以懒查找必须写 `lookupService('remote.session')`；
    写 `lookupService('remote').session` 会拿到 undefined → modelCatalog 拿不到 → 弹层模型下拉只剩
    「默认模型」（第一版真机 bug）。官方 `ModelDirectoryResolver` 也是 `inject: ["sessions", "remote", "remote.session"]`。
  - **当前会话在用模型**：client 服务 `modelDirectories`（`Service(ctx, "modelDirectories")`）的
    `directoryFor(sessionId)` → per-session `ModelDirectory`，`.load()` → snapshot（`.current` =
    会话投影的模型选择，composer 选择器显示的就是它）。directoryFor 要求会话已 retain（scope+binding），
    mainView 会话满足；会 throw，要 catch 兜底 `catalog.default`。
    注意 `selectModel` 挂在 **`ctx.remote.session`** 上，**不在** sessions 服务上（`sessions.selectModel` 不存在）。
  - `ModelDirectory.select` 内部就是 `remote.session.selectModel`；effort 语义：
    `efforts` 为空 = 模型不支持思考强度（不显示下拉）；官方 choice 显式带 `reasoningEffort: model.reasoning.defaultEffort`。
- `uiWorkspace.startSession(workspaceId, {agentPreset, prompt})`（:1499）是 DSH「新建会话」按钮的路径，
  内部 connectBlank + prepareDraft（只填草稿不发送）——本项目没用它，因为要在发送前附加图片附件（需要 facade）。

实现要点（client/client.js）：`collectDispatchContext()` 懒查找 workspaces/remote/modelDirectories
（缺失时对应列表为空，弹层退化但可发送）；`DispatchDialog` 三个下拉——工作区（默认=当前会话归属→
「继承当前目录」→第一个）、模型（`<optgroup>` 按 provider 分组，value=`provider\u0000model`，默认=当前会话
在用→全局默认→第一个）、思考强度（仅所选模型有 efforts 时显示；换模型重置为其 defaultEffort；
defaultEffort 缺席加「提供商默认」）。`dispatchToNewSession(md, images, choice)` 的
`choice = {workspaceId?|cwd?, model?: {provider, model, reasoningEffort?}}`；
**selectModel 显式拒绝（ok:false）→ 只填草稿不自动 submit**（用户选的模型没生效不该代发），
服务缺失/网络异常 → 照常自动发（模型走默认）。choice 缺省时保持旧的「继承当前 cwd、不动模型」行为。

### 5. DSH 插件体系（本机实测）

- DSH Desktop **0.2.1-rc.2**，desktop profile，macOS
- CLI：`/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh`（不在 PATH）
  - `dsh plugin --profile desktop add /path/to/dsh-zentao-panel` ✅ 可用（已执行，插件在加载树里，**重启桌面版激活**）
  - `dsh --profile desktop web` ❌ 被拒（"managed exclusively by the Electron application"）
  - **独立测试 profile 起不了 web**：`dsh plugin --profile <new> add <pkg>` 初始化的 profile 缺 web-app，补装 `@deepseek-ai/dsh-web-app` 又因版本互斥被拒（0.0.1-rc.1 vs runtime 0.2.1-rc.2）。所以真机 UI 验证只能在桌面版本身做（重启生效）
- 单包插件结构（参照 dsh-pocket 2.12.0，本机 `~/.dsh/profiles/desktop/node_modules/dsh-pocket` 可直接抄）：
  - `package.json` 的 `dsh.bundle.patch` + `dsh.client.{inject, platform}` 声明
  - host：`export { name, inject, apply }`，apply(ctx) 里 `ctx.webServer.register({kind:'prefix', path, handler})` 挂 RPC 路由
  - client：`window.__ModuleLoader__.load({id, factory})`，factory 里 `require('react')` 拿 React，`export { name, inject, apply }`，apply(ctx) 里 `ctx.slots.inject('shell.overlay', ...)` 挂覆盖层 UI
  - client→host RPC：`ctx.connection.rpc.call(CHANNEL, endpoint, payload)`，wire 协议信封 `{rpcId, method, payload}` → `{type:'server-response', rpcId, result}`
  - `ctx.connection.requestRejection(req)` **必须以方法形式调用**（内部读 this，抽成裸函数调用会 403 全拒——dsh-pocket issue #117 的坑，rpc.mjs 里已按正确方式写）
- 其他可用 slot（从已装插件 grep 到的）：`settings.section`（设置页）、`conversation.session.header.actions`（会话头部按钮）、`sidebar.footer.action`
- 本机已装参照插件：`~/.dsh/profiles/desktop/node_modules/` 下 `dsh-pocket`（RPC + 覆盖层 + esbuild 构建路线）、`dsh-notify-me`（免构建手写 bundle 路线，本项目用的就是这种）、`dsh-office-tools`（ctx.tools.register 路线，本项目不需要）

### 5.1 右侧栏 tab 入口与主题（2026-10-23 改版，源码确认）

入口从「右缘悬浮按钮」改为 **右侧栏 tab + 「开始」页引导卡片**（对齐 dsh-context 的「上下文」）。
`@deepseek-ai/dsh-client-ui-sidebar-right`（0.2.1-rc.2）源码事实：

- 服务 `sidebarRightTabs`（`ctx.reflect.provide` 提供，用 `ctx.inject(['sidebarRightTabs'], cb)` 等它就绪）；
  `tabs.register({ id, kind, title:()=>string, guide:[{ id, order, title, description, icon }] })`
  —— `guide` 就是「开始」页里的那张卡片，`icon` 是接收 `{size, className}` 的 React 组件。
- tab 正文/标题挂点：`slots.inject('sidebar.right.pane.tab', () => slots.register({name, key, locale}, Comp))`，
  标题同理 `sidebar.right.pane.tab.title`。
  **`key` 必须是 tab 类型的 `id`**（`TabSlot` 里 `entryKey = definition.id ?? tab.kind`）；
  dsh-context 的 id 和 kind 同名所以看不出这个坑。
- tab body 外层 `.tabBody` 是 `display:flex;flex-direction:column;height:100%;overflow:hidden`，
  所以根的样式要 `height:100%;min-height:0;display:flex;flex-direction:column`。
- **引导页最多 4 张卡片带描述**：`MAX_DESCRIBED_ENTRIES = 4`，`entries.length > 4` 时全部卡片都不显示 description
  （加了我们这张后是 5 张 → 所有卡片只剩图标+标题，这是 DSH 自身行为）。
- 主题：暗色是 `body[data-ds-dark-theme]`，颜色全走 `--dsw-alias-*`（bg-layer-1/2/3、border-l1..l4、
  label-primary/secondary/tertiary/caption、interactive-bg-hover(-solid)、state-{business,error,success,warn}-*、
  button-primary-fill + label-primary-foreground、toast-bg/label、bg-skeleton、radius-sm/md/lg、shadow-lv1..3）。
  **旧代码里的 `--dsw-alias-border-subtle`、`--dsw-alias-bg-canvas-subtle`、`--dsw-alias-border-strong` 根本不存在**，
  一直回落到 `#fff` 兜底色——这就是夜间模式错色的根因，改样式时不要再写这些名字。
- 旧版 DSH 没有 `sidebarRightTabs` 时，插件 2.5s 后自动退回 `shell.overlay` 悬浮按钮 + 侧滑面板（同一套组件）。

### 6. 设计决策记录

- **不做 npm 依赖**：host 侧纯 Node 内置（fetch/crypto/fs），避免 peerDependencies 版本地狱（dsh-zentao 的 README 专门警告过 semver 匹配拒绝安装的问题）
- **client 免构建**：手写 `window.__ModuleLoader__.load` 包装的 CJS 风格 bundle（dsh-notify-me 模式），不用 esbuild——改动即时生效，代价是不能用 JSX（全用 `h()` createElement）
- **RPC 通道选型**：直接挂自己 inject 的 webServer（dsh-pocket v2 模式），回退 `ctx.connection.rpc.handle`；不复刻浏览器 cookie 认证（loopback-only 信任栅栏足够）
- **缓存 60s**：面板展开不重复打禅道；「刷新」按钮带 `refresh:true` 强刷
- **卡片统一模型**：`{kind, id, title, status, pri, severity, deadline, assignedTo, openedBy, execution, product, url, descBrief, images}`，Markdown 生成在 client 的 `cardToMarkdown()`
- **多账号（M5，2026-10-24）**：
  - 配置 schema v2：`config.json` = `{version:2, accounts:[{id, baseUrl, account, password(b64), cookies, savedAt}], activeId}`；
    **旧单账号格式读取时自动迁移**（`store.readConfig()` 里做，不在读取时改写文件），`readConfig()` 同时保留 `baseUrl/account/password/cookies` 兼容字段（取激活账号），smoke/host 测试不用改
  - 账号 id = `sha1(baseUrl + '\n' + account)` 前 12 位 → 同地址同账号重复登录 = upsert（更新凭据重置登录态），不是新增
  - `service.mjs`：`createAccountSession()` 每账号独立 client/cookie jar/缓存/登录去重/探活节流；service 层持有 `Map<id, session>` + `activeId`，所有取数只作用于激活账号；登录成功经 `onLoginSaved` 回调整体落盘
  - RPC：新增 `zentao.switch {id}`；`zentao.logout {id?}`（不传 = 移除激活账号）；`zentao.status` 返回值多 `activeId` + `accounts[]`
  - client：头部账号 chip（`.ztp-acct`）点开 `AccountSwitcher` 弹层（切换/添加/按账号移除）；切换用持久化 cookie 即时生效；`LoginView` 复用（`mode:'add'` 带取消按钮）；切换/移除后 `mine`/`detail` 先清空再由 effect（依赖 `activeId`）重拉
  - 移除激活账号 → 自动切到剩余第一个；最后一个移除 → `clearConfig()`

## 剩余任务（按优先级）

### 1. 真机验证 M1+M2+M3（第一件事，代码全部完成）
重载 DSH Desktop（client 改动 ⌘R 即可；host 改动才需要重装 + 重启）→ 打开右侧栏「开始」页 →
应看到「禅道」引导卡片（与「上下文」同款，图标 + 标题）→ 点开 tab → 登录 → 列表 → 详情 → 「插入对话」/「处理」。
- host 侧如果没激活，看桌面版日志（插件加载警告会打在启动输出里）
- client 侧如果没出现：先 `node test/client.mjs` 确认注册契约没坏；再看 console 里 `[dsh-zentao-panel]` 前缀的报错；
  悬浮按钮出现说明走的是兜底路径（没拿到 `sidebarRightTabs`）
- M3 插入对话：服务级 setDraft 优先（当前主视图会话），DOM 兜底 `[data-composer-input]`（contenteditable + execCommand insertText），再兜底剪贴板
- M3 图片附件（2026-10-23 新增，host 有改动 → **必须重启桌面版**才生效）：列表卡片或详情点「插入对话」→
  输入框上方应出现图片缩略图（附件 rail），发送后消息里是真实图片；「处理」新会话同理。
  若只看到文本 + toast「图片未能附加」，说明 host 还是旧代码（`zentao.image` 404）或禅道图片下载失败，看 console/日志
- M3 处理（新会话下发，2026-10-24 已改弹层式）：点「处理」→ `DispatchDialog` 弹层选工作区、模型
  （provider/模型，optgroup 分组）与思考强度（见 §4.2）→ `sessions.create({workspaceId|cwd})`
  → `uiWorkspace.openSession` → `remote.session.selectModel({sessionId, provider, model, reasoningEffort?})`
  → `conversation.input.for(scope).setDraft` + 延迟 250ms `submit()`；selectModel 被拒则只填草稿不自动发；
  服务不可用时降级插入当前会话。真机重点验证：弹层三个下拉有值且默认项合理（工作区=当前会话归属；
  模型/思考强度=当前会话在用）、选不同工作区/模型后新会话确实落在所选位置和模型上（看 composer 模型显示）、
  新会话 composer 挂载时序（250ms 是否够，不够就调大或改事件驱动）。**本次仅 client 改动，⌘R 即可生效，无需重装**
- 改完代码后重装：`dsh plugin --profile desktop remove dsh-zentao-panel && dsh plugin --profile desktop add /path/to/dsh-zentao-panel`，再重启桌面版
- 测试现状（2026-10-24 复跑）：`test/client.mjs` 45 项（含「处理」弹层上下文收集 + workspaceId 传参
  + selectModel 按会话设置 provider/model/思考强度 + 被拒时不自动发送）、
  `test/multi.mjs` 25 项、`test/protocol.mjs` 9 项全绿；`test/host.mjs` 19 项（真机 20 张卡片：task 2 / bug 8 / story 10）、
  `test/smoke.mjs`（含 `extractImageRefs` / `fetchImage` 真图下载）需真实禅道凭据。
  注意：沙箱会话里跑 host.mjs 读不了 `~/.dsh/zentao-panel/config.json`（EPERM），需把凭据文件拷进
  `$DSH_HOME/zentao-panel/`，此时「status before config」一项会因预置配置而假失败（该测试项假设初始无配置）

### 2. M4 打磨
- 自动刷新（面板打开时轮询，间隔可选——计划书里定的 30s/1m/5m/10m/关闭）
- 错误提示完善（✅ 2026-10-24 已做「会话失效」这条：超时信封识别 → 自动重登；拉取失败 toast + 空列表时优先显示错误视图。禅道不可达/密码改了的文案还没专门做）
- 登出按钮清理 `~/.dsh/zentao-panel/`（已实现，验证即可）
- 拖拽：卡片 `draggable` 已实现（dragStart 里塞 Markdown），真机验证 DSH 输入框是否接受 drop

### 3. 收尾
- git init + 首次提交（test 凭据已参数化：`ZENTAO_BASE`/`ZENTAO_ACCOUNT`/`ZENTAO_PASSWORD` 环境变量，另有 `~/.dsh/zentao-panel/config.json` 兜底；`.gitignore` 已建）
- README 截图补全

## 用户偏好（交互时注意）

- 回复一律简体中文；代码/命令/路径/报错原文不翻译
- 用户是研发（禅道 realname 真实姓名），能看懂技术细节，不用过度简化
- 改动前先给方案的习惯（本项目就是先计划书后实施），但剩余任务是已批准 scope 内，直接做即可
- 测试真实禅道没问题（内网可达），但凭据不要落 git

## 环境速查

- 工作目录：`/path/to/dsh-zentao-panel`
- DSH CLI：`/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh`
- 禅道：`http://zentao.example.com:8090`（18.13 开源版）
- 插件配置落点：`~/.dsh/zentao-panel/config.json`（运行时生成）
- 桌面 profile：`~/.dsh/profiles/desktop`（插件已装：bundles 列表里有 `dsh-zentao-panel`）
