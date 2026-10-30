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
| M2 client 左侧栏全局面板 | ✅ 2026-10-24 已改为**左侧栏全局面板**入口（对齐 dsh-mnemon「记忆系统」：`sidebar.panellist` 图标行 + `main` keyed 面板，见 §5.1），样式走 DSH token 支持日/夜；注册契约有测试，待真机目视确认 |
| M3 插入输入框 + 新会话下发 | ✅ 服务级 `setDraft` 真机可用；**描述里的截图改为真实图片附件**（`conversation.createDrafts` + `facade.addAttachments`，见 §4.1）；新会话下发待真机复验 |
| M4 打磨 | 🔄 进行中（细节见各节）：2026-10-24 修会话超时静默空白 + 拉取失败 toast/错误视图；「处理」改弹层确认式（§4.2）+ 关联会话 chip（§4.3）+ 弹层闭包 bug 修复与下发时序优化 + 入口改左侧栏全局面板（§5.1）+「处理」不自动跳转（§4.2 末）；2026-10-25「插入对话」改弹层式新会话自动跳转不自动发（§4.5）；**同日新增列表三件套：搜索/排序/逾期高亮 + mine.v1 快照秒开 + 处理结果回读（§4.7，待真机目视确认）**；**自动轮询/在线离线状态/新指派提醒 + 列表多选批量下发已完成（§4.9，待真机目视确认）**——M4 既有欠账已清零；2026-10-27「新建对话」单入口 + 自动带入开关 + 动作行/工具栏界面整理（§4.19） |
| M5 多账号 | ✅ 2026-10-24 完成：schema v2（accounts[]+activeId，旧格式自动迁移）、每账号独立 client/cookie/缓存、账号菜单切换/添加/按账号移除；**2026-10-25 补账号别名**（菜单内 ✎ 行内编辑 + 添加账号时可填 + chip/页脚优先显示别名，新 RPC `zentao.rename`，详见 §6 多账号节；host 改动需重装+重启）；测试全绿（multi 36 项 + client +5），待真机目视确认 |
| M6 实时状态 | ✅ 2026-10-24 完成：**禅道卡片活性徽标（处理中/等你决策/已完成）+ 完成/等决策常驻提醒 toast（「去看看」跳回会话）**，信号来自 DSH 宿主 `uiSession.sessionStatus`（见 §4.4）。当天先做过一版「鲸鱼娘办公室」可视化面板（左侧栏第二面板 + 自绘 SVG 工位场景，角色参考 Neko3000/deepseek-whalechan），**用户看过后明确否决（「太垃圾」）已整体移除**——不要再做办公室/娘化角色类可视化；保留监控内核改为卡片上的活性体现。2026-10-25 补**处理进度持久化（states.v1）+ 不在面板列表事项的定时清理**（见 §4.6，待真机目视确认）；2026-10-27 补**处理状态手动修正**（§4.18：自动检测丢了可手改，持久化、不被自动评估覆盖），并新增**只能人手标记的「已结束」终态**（§4.22）。仅 client 改动，⌘R 生效 |

测试命令：
```bash
node test/client.mjs                         # client 半边注册契约（无需 DSH / 禅道）
node test/multi.mjs                          # 多账号：迁移/切换/缓存隔离/移除（mock client，不打网络）
node test/protocol.mjs                       # 禅道响应信封协议 + 自动重登（stub fetch，不打网络）
DSH_HOME=/tmp/zt-smoke node test/smoke.mjs   # 直连真实禅道验证 client/service 层（需内网可达）
DSH_HOME=/tmp/zt-host  node test/host.mjs    # apply() + RPC wire 协议端到端（mock ctx）
```
凭据走 `ZENTAO_BASE`/`ZENTAO_ACCOUNT`/`ZENTAO_PASSWORD` 或 `~/.dsh/zentao-panel/config.json`——**永远不要把凭据提交到 git**。

发版（2026-10-30 起全自动）：改 `package.json` 的 `version` + 切 `CHANGELOG.md` 顶部小节 →
`git tag vX.Y.Z && git push --tags`。`.github/workflows/release.yml` 的两个 job 依次跑：
`release`（CHANGELOG 抽段建 GitHub Release，已存在则改而非报错）+ `publish`（**npm 信任发布/OIDC**，
无需 `NPM_TOKEN`；tag 与 `package.json` 版本不一致直接 fail；版本已在 registry 上则跳过；
`-rc.N` 之类预发布发 `next`、正式版发 `latest`；public 仓库自动带 provenance）。鉴权靠 npmjs.com
包设置里的 trusted publisher（owner/repo/**workflow 文件名必须写 `release.yml`**），
**配好后 2 天内必须完成首次发布，否则配置过期需删掉重建**（[docs](https://docs.npmjs.com/trusted-publishers/)）。
workflow 改动验证：`actionlint`（带 shellcheck）零告警；版本闸门可用 `GITHUB_REF_NAME=vX.Y.Z` 本地复跑。

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

- **⚠️⚠️⚠️ 真机踩坑（2026-10-24，弹层卡「创建中…」）**：`useCallback(fn, [])` 的闭包捕获的是
  **初次 render 的组件函数调用作用域**，而 `var dispatch = useState(null)` 每次 render 返回**新数组**——
  在 `useCallback([])` 回调里读 `dispatch[0]`/`status[0]` 拿到的永远是初次值（null）。
  症状：弹层「发送」→ `busy[1](true)` 生效（按钮变「创建中…」）→ `sendDispatch` 里
  `var d = dispatch[0]` 恒为 null → `if (!d) return` 直接返回 → 弹层永远停在 busy、会话也没建
  （Escape 也关不掉：close 检查 `!busy[0]`，只能 ⌘R 恢复）。修复模式：**回调不读 state 快照**——
  需要的数据（card/md/images/activeAcct）由 DispatchDialog 的 `send` 随 `props.onSend(choice, data)` 回传
  （props 组装于当前 render 作用域）；计数 bump 一律函数式 `linkRev[1](v => v+1)`（`linkRev[0]+1` 同样
  会因旧闭包恒 0 而只生效一次）；`props.onSend` 外包 try/catch，发起异常时 `busy[1](false)` 让弹层可恢复。
  setter（`xxx[1]`）引用稳定，旧闭包里调用没问题。LoginView 的 `useCallback(fn, [baseUrl[0],…])` 是
  正确对照写法（deps 声明了所读的值，值变则回调重建）。

- **下发时序优化（2026-10-24 晚，真机反馈「切到新会话后空白约 2 秒才填充执行」）**：旧链路是
  create → openSession（空白）→ selectModel → 图片下载 → setDraft → submit 全串行，空白期 =
  selectModel + 图片 + 250ms。优化后：① `prefetchImageBytes` 在点击发送瞬间发起（与 create 并行，
  字节只依赖卡片不依赖会话），`attachImagesToDraft` 第三参复用预取结果跳过 RPC；② 建会话后
  **立即 `facade.setDraft`**；③ selectModel 与附件注册 `Promise.all` 并行等待，互不阻塞；
  submit 前仍留 250ms（M3 验证过的值，勿贸然缩短）。测试：`test/client.mjs`「时序优化」块
  （预取先于 create / setDraft 先于 drafts / selectModel pending 时附件照常 / 预取复用不再发 RPC）。
  过程提示：toast 支持 `{text, sticky:true}`（不自动消失、带转圈图标），`sendDispatch` 发起时挂
  「正在准备 N 张图片附件，随后自动发送…」/「正在新建会话…」，结果 toast（string）到达即替换并恢复自动消失。

- **「处理」不自动跳转新会话（2026-10-24 深夜，用户明确要求：点击处理后 不要自动跳转新会话）**：
  旧实现 create 后调 `uiWorkspace.openSession(sessionId)`，而它内部是
  `sessions.retain(target,{source:"mainView"})` + `replaceMain(...,"reveal")` → `selectPanel(null)`，
  必然把主视图从禅道面板切走。用户要的是**留在禅道面板**，靠卡片的会话 chip（§4.3）/ 活性徽标（§4.4）跳回。
  改法：**不调 openSession，改调 `sessions.retain(sessionId, { source: 'zentao-panel' })`**——
  `retain` 内部 `retainScope` 会 materialize scope（`sessions.scope(id)` 由此可用），
  `conversation.input.for(scope)` 的 setDraft/addAttachments/submit 全是服务级调用，**不需要视图挂载**，
  所以后台会话照常填草稿并自动发送。要点：
  - source 用自定义名 `'zentao-panel'`，别用 `'mainView'`（那是 uiWorkspace 的记账位，会被它的
    release 语义搅乱）；`retain` 返回 `{sessionId, release()}`（ClientSessionReference）。
  - **释放时机**：dispatched 模式 submit 后 **3s `release()`**（prompt 已交宿主，turn 在 host 侧跑，
    拆 client 连接无影响）；**draft 模式不释放**——release 会使 referenceCount 归零 → `retireScope`，
    未发送的草稿 store 可能随之丢；等用户点 chip 的 `openSession` 再接管。
  - 已去掉 `facade.focus()`（没有可见 composer，抢焦点无意义）。
  - 失败降级：`conversation` 服务缺失或没拿到 scope（facade 不可用）时**不自动发**、立即释放后台
    retain（新建的会话是空的，不能留悬挂连接），返回 `{ok:false, mode:'unavailable'}` → 上层
    `sendDispatch` 走 `insertToCurrentChat` 降级（内容+图片进**当前会话**，文案「已改为插入当前会话」）。
    不再走旧的 `fillComposerEditable` 兜底（那条会把内容塞进当前输入框却回 `ok:true`，文案又说
    「已新建会话并填入草稿」，误导 + 把卡片错误关联到那个空会话）。
  - 文案：`mode:'dispatched'` →「已在后台新会话发送任务背景（含 N 张图片），卡片标签可跳回」；
    `mode:'draft'` →「已新建会话并填入草稿…，点卡片标签跳回确认发送」。
  - 测试：`test/client.mjs` 新增 4 项——「不跳转：只 retain（zentao-panel 来源）不调
    uiWorkspace.openSession」+「不跳转：retain 后文本草稿立即写入」+「conversation 服务缺失 →
    不自动发、返回 unavailable 供上层降级」+「降级路径立即释放后台 retain」；dispatch mock 的
    sessions 加 `retain`（记录 id/source 与 release 次数），uiWorkspace mock 记录 openSession 调用
    并断言 **null**（open 被调用即违规）。

### 4.3 关联会话 chip：处理过的卡片可跳回会话（2026-10-24，DSH 0.2.1-rc.2 源码确认）

用户要求：点了「处理」后，右侧面板卡片上能看到关联的 DSH 会话并快速跳转。实现与源码事实：

- **会话标题不用自己算**：`sessions.list.getSnapshot().byId[id]` 的行自带 **`displayTitle`**
  （dsh-api-session-controller client.js `projectList()` :4153 构造），降级链源码已做好：
  durable title → `cwd` 目录 basename（`displayTitleOf` :3700）→ 裸 sessionId。行上还有
  `running/blank/updatedAt/retainedBy/cwd/parentId/origin`；初始快照 `{ids:[], byId:{}, phase:'pending'}`。
- **关联存 localStorage**（key `dsh-zentao-panel.links.v1`，map 形态）：DSH 会话本来就只在本机，跨设备无意义。
  key = `<禅道账号activeId>/<kind>-<id>`（多账号下同 id 不是同一张卡片）；值 `{sessionId, at}`。
  标题不落盘，每次渲染从 sessions.list 快照现读（会话改名/删除自动跟进）。
- **`ZentaoPane.sendDispatch` 成功即 `saveSessionLink`**（`r.sessionId` 存在时，draft 模式也算——内容已填进那个会话）；
  同卡片再次处理 → 覆盖为最新会话。
- **跳转** = `uiWorkspace.openSession(sessionId)`（retain + replaceMain + selectPanel(null)，即用户主动点 chip 才跳；
  「处理」本身已不跳转，见 §4.2 末）。跳转前用 byId 校验会话存活：byId 非空但无该行 → 判定已删，
  清关联 + toast「关联的会话已不存在」；
  **byId 为空（列表 phase 未就绪）时不删不拦，直接尝试打开**（防止 DSH 刚启动时误清全部关联）。
- 卡片/详情 actions 行左侧渲染 chip（`.ztp-slink`，live=会话标题、dead=「会话已删除」点击清除、
  unknown=「已处理 · M月d日 HH:mm」）；纯函数 `sessionLinkView(link, byId)` 产出三态，`openSessionLink()` 负责跳转+清理。
- 本地存储不可用时（测试替身/极端环境）退进程内对象兜底，读坏 JSON 自愈为空表。

实现要点（client/client.js「会话关联」块）：纯函数全部进 `exports._test`（`sessionLinkKey/readLinkMap/
getSessionLink/saveSessionLink/removeSessionLink/sessionLinkView/openSessionLink/fmtLinkAt`），
`test/client.mjs` 用挂在 window 上的 localStorage 替身直测。

**反向跳转（2026-10-25 Idea 3 已实现，仅 client，⌘R 生效）**：处理过的**会话头部**出现「禅道」小按钮
（`.ztp-hbtn`），点击切回禅道面板并定位该卡片——闭环的另一半。机制（探测记录《计划书.md》§8）：
`conversation.session.header.actions` 是 scope:'session'，**entry 的 `inject(sessionId)` 首参即当前会话 id**
（renderer `runInject` 传 `binding.key`，官方 ui-jobs 同款）；本项目 `inject: (sessionId) => ({zentaoSessionId: sessionId})`
传给 `ZentaoHeaderAction`（渲染时重读 links.v1 决定显隐，`leftWired=false` 悬浮兜底模式不显示）。
点击走 `jumpToZentaoCard`：`findLinkBySession` 反查（多条同 sessionId 取 at 最新）→ 卡片属其他账号先
`zentao.switch`（成功后 `paneCache.status` 换新 + **mine/detailCard 清空**防闪旧账号列表）→ 写
`paneCache.tab=kind` + `paneCache.focus={kind,id}` → `layout.selectPanel('zentao')`（服务名 'layout'，
未注册 throw → 回滚 tab/focus 返回 reason:'panel'）。**⚠️ 真机踩坑（2026-10-25 首版点击无反应）：
`layout.selectPanel` 是 class 方法（内部 `this.hasMainPanel/this.panels`），从服务实例抽成裸函数调用
this=undefined 直接 throw 被 catch 静默——必须 `svc.selectPanel(id)` 方法形式调用（dsh-pocket #117 同款）；
onClick 失败已加 console.warn(`[dsh-zentao-panel] header jump failed: …`) 不再静默。** 面板挂载后 ZentaoPane 的 focus effect（依赖
`mine[0]`）用 `findFocusCard` 从列表找完整卡片选中详情（id 统一 String 比较）；列表就位却无此卡
（已完结/转派）→ 清 focus 留在目标 tab。测试 +15（slot 注册契约/inject 传参/反查/定位/五分支 jump/
渲染显隐 + 方法形式调用防回归 2 项）。

### 4.4 实时状态：卡片活性徽标 + 完成/等决策常驻提醒（M6，2026-10-24，DSH 0.2.1-rc.2 源码确认）

用户原始需求：「正在处理的任务要有体现；任务完成要提醒并能点击跳转到对话；中途需要我决策同理」。
当天第一版做成了「鲸鱼娘办公室」可视化面板（左侧栏第二面板 + 自绘 SVG 工位场景，角色参考
Neko3000/deepseek-whalechan 公开规范——**注意其图片素材不在开源许可内，当时是全自绘未搬原图**），
用户看过后明确否决（「太垃圾」）已整体移除。**不要再做办公室/娘化角色类可视化**。最终形态 =
监控内核保留，活性体现改到禅道卡片本身。

**信号源（最值钱的知识，dsh-notify-me 同款，源码 dsh-client-ui-session/lib/client.js :782 `UiSession`）**：
- `lookupService('uiSession').sessionStatus` 是 observable store（`getSnapshot()` + `subscribe(cb)`，
  cb 返回退订函数）；快照是 `Map<sessionId, {running, pendingInteraction, completionUnread}>`：
  - `pendingInteraction` ∈ `'approval'|'plan-review'|'question'|undefined`——宿主算好的「等你决策」
    （agent 的 ask_user_question / 审批 / 方案确认都会挂上）；
  - `completionUnread`：**后台**会话 turn 跑完时置位、该会话被打开（mainView retain）即清——宿主算好的
    「完成未读」；**正开着的会话完成不会置位**（人在看，合理；但用户随后切走也不会补置位，这是宿主语义）；
  - `running`：turn 进行中。
- 老版 DSH（≤0.1.5-rc.3）是 `uiSession.pendingInteractions` Map（值带 kind），本项目直接不支持也不需要。
- 监控同时订阅 `sessions.list`（会话删除检测：byId 非空且无该行 → 该会话活性清零）。

**实现（client/client.js「M6 实时状态」块，模块级 `watch` 对象）**：
- `watchStart()` 在 apply() 调用——**常驻**，不依赖面板打开；`watchTryBind()` 懒查找 uiSession
  （3s 重试、60s 后降频 30s——服务激活晚于插件时不丢）；仍走 `lookupService` 懒查找（不加 inject，
  避免硬门槛）。
- `watchEval()`：links.v1（§4.3）里**当前激活账号**的条目 → 查 sessionStatus → 快照
  `watch.snapshot = {ready, activeId, states: {sessionId → 'running'|'ask'|'done'|null}}`；
  边沿基线 `watch.prev[sessionId]`——**首次见到的会话只建基线不提醒**（DSH 重启/新 link 防风暴）。
- 边沿事件 `watchEdges(prev, next)`：pendingInteraction 出现/变化 → `decision`；completionUnread
  false→true → `done`；**同帧两者兼有只报 decision**。`watchFire` → 常驻 toast
  （`showWatchToast`：挂 body 的 `.ztp-live-toasts`，标题点 + 「去看看」按钮 =
  `uiWorkspace.openSession`、× 关闭、hover 暂停自动消失；decision 12s / done 8s）。
- 卡片活性：`deriveLiveState` = ask > done > running；**idle（turn 结束且无事件）与会话已删 → null**
  （「已处理」由 §4.3 的 chip 表达，不叠徽标）。ZentaoPane 里 `liveSnap` state 订阅
  `watchSubscribe`，`liveOf(card)` = linkMap[cardKey].sessionId → states；CardItem 顶行 KindTag 旁
  渲染 `LiveBadge`（running=三点跳动 / ask=琥珀呼吸+卡片暖色描边+左彩条变 warn / done=绿对勾+卡片绿描边），
  会话 chip 前加 `SlinkDot` 状态点；DetailView 同款。
- `saveSessionLink` 值升级为 `{sessionId, at, kind, id, title}`（提醒文案取名用；旧值无这些字段时
  从 key 解析 kind/id：`parseLinkKey('acct1/bug-123') → {activeId, kind, id}`，title 退而显示
  「类型 #id」）。save/remove 都 `watchPoke()`；ZentaoPane 的 paneCache 同步 effect 也 poke
  （切账号后监控自动切视角）。
- 测试：`test/client.mjs` 93 项（watch 块 22 项：单面板回归 / parseLinkKey / 值结构 / deriveLiveState
  优先级 / watchEdges 边沿矩阵 / toast 文案 / 集成（fake sessionStatus store + sessions.list：
  绑定、活性快照、卡片查询、多账号不混、完成→提问→idle 三段翻转、会话删除清零））。
  fake store 用真 `new Map` 跨 vm context 传入没问题（`typeof statusMap.get === 'function'` 判定兼容
  Map 和普通对象）。

### 4.5 「插入对话」改版：弹层 + 新会话 + 自动跳转不自动发（2026-10-25，用户要求）

> 2026-10-27 起「插入对话」并入「新建对话」（单入口 + 自动带入开关），见 §4.19。

用户要求：「插入对话」改成和「处理」差不多（弹层选工作区/模型/思考强度、新建会话），但**会自动跳转到新对话**（与「处理」相反，§4.2 末）且**不会自动开始对话**（只填草稿不 submit）。仅 client 改动，⌘R 生效。

- **实现拆分**：原 `dispatchToNewSession` 的前半段（create 与图片预取并行 → `retain('zentao-panel')` → `facade.setDraft`）抽成 **`createDraftSession(md, images, choice)`** 共用；`dispatchToNewSession` 行为不变（并行 selectModel+附件 → 模型 OK 才 submit → 3s release；被拒只留草稿）。
- **新 `insertToNewSession(md, images, choice)`**：`createDraftSession` → 发起 selectModel + 附件注册（后台、不阻塞）→ **`uiWorkspace.openSession(sessionId)` 自动跳转** → 立即 `release()` 自己的 retain（openSession 内部 `retain(mainView)` 同步接管保活，refcount 不归零、scope 不 retire）→ **不 submit**。跳转前 setDraft 已先行——落在新会话时文本草稿已就位（§4.2「切过去空白 2 秒」的教训），图片附件稍后在附件 rail 陆续出现。
- **跳转失败**（uiWorkspace 缺失/抛错）：草稿已在新会话里，**保留 retain**（release → retireScope 丢草稿），返回 `{ok:true, mode:'draft'}` 提示从会话列表打开。**前段失败**（sessions/conversation 缺失）→ `ok:false` → 上层 `sendDispatch` 降级 `insertToCurrentChat`（= 旧版「插入对话」行为：服务级 setDraft → DOM composer → 剪贴板，该函数保留）。
- **弹层 `DispatchDialog` 加 `intent`**（'dispatch'|'insert'，缺省 dispatch）：标题「插入到新会话 …」、说明「将新建会话并跳转过去…不会自动发送」、确认按钮「新建并跳转」（dispatch 仍为「发送」）；`onSend(choice, data)` 的 data 带 intent。`sendDispatch` 按 intent 分流；sticky 过程 toast 文案区分（insert「正在新建会话并跳转…」）。
- **「插入对话」成功也 `saveSessionLink`**：卡片 chip/活性徽标（§4.3/§4.4）照常工作——用户在新会话里手动发送后，卡片会亮「处理中」徽标。
- **注意**：跳转 = openSession 内部 `selectPanel(null)` → 禅道面板卸载，面板 toast 随之消失——sticky 提示只覆盖跳转前的准备期，结果以用户落点（新会话里的草稿/附件）为准，别在跳转后再指望面板 toast。
- 测试：`test/client.mjs` 新增 10 项（传工作区建会话不掺 cwd / 自动跳转 openSession / setDraft 先于 open / 不 submit / 跳转后释放 retain / selectModel 照常 / 附件照常 / 草稿文本就位 / uiWorkspace 缺失 draft 模式不释放 / conversation 缺失 unavailable+释放）。

### 4.6 处理进度持久化 + 陈旧事项清理（2026-10-25，用户要求）

用户痛点：任务/Bug 的**处理进度没有持久化**——M6 活性徽标来自 `uiSession.sessionStatus`（内存 store），DSH 关闭期间后台会话跑完的 completionUnread 永久丢失，重启/重开面板后看不到任何进度；且 links.v1 只增不减，事项完结/转派离开「指派给我」列表后关联与状态残留。仅 client 改动，⌘R 生效。

- **`states.v1` localStorage 持久化**（key 与 links 同构 `<activeId>/<kind>-<id>`，读坏自愈、进程内兜底，同 links.v1 模式）：
  - `watchEval` 每次评估后调 `syncPersistedStates` 落盘：`{sessionId, state, at}`，**状态或会话变化才刷新 `at`**（「更新于」语义取状态变化时刻，同状态不重写）。
  - **done 是粘性进度记录**：实时归零（看过会话/重启）后仍保留——它表达「这个事项已处理完」。
  - **⚠️⚠️ 真机踩坑（2026-10-25，#16141 未标完成）**：宿主的 completionUnread **只对后台会话置位**——用户正看着的会话（「插入对话」跳过去手动发送、或中途点 chip/toast 去看过）跑完**永远不产生完成信号**。第一版把「running 归零」当瞬态删记录 → 这些场景下卡片漏成「无状态」。已修：**running 归零（有结束信号时）→ 升级记录为 done**（这一轮确实跑完了；steer 排队会重新出现 running 覆盖回去）；**ask 归零 = 用户已回应 → 删**（不是完成）。结束确认信号 `confirmed = statusReady || sessionSeen[sessionId]`（状态源非空，或该会话在快照里有行且全 false=真实 idle——比「Map 非空」更准，防跑完瞬间 Map 恰好清空时卡「处理中」）；两者皆无（DSH 刚启动）→ 不动（防重启风暴）。**注意：第一版期间跑完的任务记录已被删除，无法事后追补**（不敢追补——insert 模式建了会话没发送的也会是 idle，误标「已完成」），只保证此后正确。
  - **会话被删**（byIdReady 且无该行）→ 一律删（与 chip「会话已删除」语义一致）。**再处理**（saveSessionLink 覆盖新会话）→ 旧进度记录作废。
- **渲染兜底 `resolveLiveState(link, snap, persisted)`**（liveOf/liveSinceOf 查询入口，返回 `{state, since}`）：实时优先；实时拿不到 → persisted 兜底——**done 粘性显示**，running/ask **仅在监控未就绪时**兜底（`watch.snapshot` 新增 `statusReady` 闸门，就绪后以实时为准，避免把重启前死掉的 turn 显示成「处理中」）。`LiveBadge` 加 `since` prop（兜底显示时 title 带「更新于 M月d日 HH:mm」）。`watchStateForCard` 保持纯实时（toast 边沿用）。
- **定时清理 `cleanupStaleLinks(activeId, cards, now)`**：挂在 ZentaoPane 的 paneCache 同步 effect 里——**每次 mine 拉取成功后顺带跑**（mine 一次返回三类全量，不存在某类没刷新误删；「定时」即每次拉取/未来轮询）。规则：卡片在线 → 刷新 `lastSeen`（**每小时最多写一次盘**，减少 localStorage 磨损）；离线超过宽限期 `LINK_GRACE_MS = 8h`（**2026-10-29 用户要求从 72h 收紧**：72h 太长，卡片完结/转派离开列表后再被指派回来，旧「已完成」进度还挂着；8h 保证「当天短暂波动不误删、第二天回来是干净状态」。旧格式值无 lastSeen 退回 `at` 计时）→ links 与 states 条目一起删；孤儿进度记录（无对应 link）同规则清；只动当前账号。有删动 bump `linkRev` 重读。
- `saveSessionLink` 值新增 `lastSeen`（= at，清理计时基准）。
- 测试：`test/client.mjs` 新增 29 项（states.v1 自愈 / statusMapReady / syncPersistedStates 8 项含粘性 done、running 归零升级 done、sessionSeen 通道、重启防护、会话删除 / resolveLiveState 5 项 / cleanupStaleLinks 7 项含宽限保留、旧格式退回、他账号不动、孤儿清理、幂等 / saveSessionLink lastSeen 与换会话作废 / watchEval 联动落盘 + statusReady / 重启恢复 2 项）。⚠️ 测试注意：cleanup 会 `watchPoke` → watchEval，fake `sessions.list` 的 byId 必须覆盖全部关联会话，否则被误判「会话已删」连带删 done 记录。

### 4.7 列表增强三件套：搜索/排序/逾期高亮 + 快照秒开 + 处理结果回读（2026-10-25，用户批准的三提案）

按 1→2→3 顺序全做，**全部仅 client 改动，⌘R 生效**。测试 +38 项（见文末测试现状）。

**① 搜索 + 排序 + 临期/逾期高亮（纯渲染层）**：`.ztp-head` 右侧加搜索框（`.ztp-search`）+ 排序下拉（`.ztp-sort`）。`matchSearch`：标题/#id/状态名/创建人/指派人拼 haystack，**多词空格 AND**、大小写不敏感、空查询恒 true；无命中空态给「清空搜索」，页脚变「共 X/Y 条」。`sortCards(cards, mode, now, liveOf)`：**smart**（默认：终态沉底 → **等你决策(ask) > 处理中(running) > 普通（逾期 > 临期(≤3天) > 有截止 > 无截止）> 已完成(done，禅道侧未终态）** → 段内截止↑ 优先级↑ id↓；liveOf(card) 注入 `resolveLiveState` 的实时状态，2026-10-25 加）/ **deadline** / **pri** / **origin**（禅道原序；后三者不掺实时状态——用户显式选了维度就尊重）。ZentaoPane 调用处 useMemo deps 补 `linkRev/liveSnap`（状态变化触发重排）。`deadlineInfo(deadline, now)`（now 可注入）：截止日 23:59:59 → `{ts, days, overdue, soon}`（soon 沿用旧 isUrgent ≤3 天语义，**isUrgent 已删**）；终态（`FINAL_STATUS`：done/closed/cancel）不着色不置顶；卡片/详情截止 span 换 `.ztp-dl(.soon|.overdue)`（warn/error token），逾期显示「逾期 M-d」+ title 逾期天数。

**② 列表快照 mine.v1：重启/重开秒开 + 离线兜底**：localStorage `dsh-zentao-panel.mine.v1`，`{activeId: {cards, at, savedAt}}`，读坏自愈，**上限 400 卡/账号、4 账号（按 savedAt 淘汰）**。ZentaoPane 的 activeId effect **先** `readMineSnapshot` 水合（值带 `cached:true`，页脚「HH:mm 缓存」）**再** `loadMine(false)` 后台替换——首屏不闪骨架；禅道不可达时快照即兜底视图（错误视图只在 cards 为空时抢占）。`loadMine` 成功后 `writeMineSnapshot(paneCache.status.activeId, …)`——**activeId 必须从 paneCache 读**（loadMine 是 useCallback([rpc])，闭包 status 是旧值）。登出/移除账号 → `removeMineSnapshot`。

**③ 处理结果摘要回读 replies.v1：不出面板看 agent 最后说了什么**：
- **源码事实（0.2.1-rc.2 已核实）**：`sessions.retain(id,{source})` 内部即 `reference.attachOpening(manager.get(id).open())`（session-controller client.js:3849）——**retain 即自动开事件流并回放最近历史窗口**（maxMessages 500/minTurns 2）；`sessions.binding(id).eventSource.getSnapshot()` → `{entries, hasMore, revision, change}`（binding 在 retainScope materialize 后同步可用，borrow 不续命）；`assistant/message` 文本在 `event.data.message.content` **块数组**（dsh-client-ui-chat `toAssistantBlocks` 同款 `{type:'text', text}`/reasoning/工具块）。
- `fetchLastReply(sessionId, timeoutMs)`：retain('zentao-panel') → eventSource 订阅+即查（窗口就绪立即命中）→ 超时兜底（默认 5s）→ **成败都 release**；环节缺失 → `{ok:false, reason:'unsupported'|'retain'|'timeout'}` 不抛错。提取：`assistantEntryText`（拼接 text 块跳过 reasoning；只有 reasoning → null）+ `lastAssistantText`（entries 从尾往头）。
- 缓存 `dsh-zentao-panel.replies.v1`（key 同 links 构，值 `{sessionId, text, at, full}`）。**完整显示不截行**（2026-10-25 用户反馈「显示不全」后改：去 8 行 line-clamp；`REPLY_MAX_CHARS=20000` 仅防炸兜底，`full` 标记是否完整——旧版截 500 字的缓存无 full 字段 → 自动回读判不新鲜重拉）。**生命周期联动**：saveSessionLink 换会话 → 旧摘要作废（同会话重复保存不清）；syncPersistedStates 会话被删 → 连带删；cleanupStaleLinks 超期/孤儿摘要一并清。
- UI：DetailView 元信息卡下加「处理结果（关联会话最新回复）」区：**markdown 渲染 + 限高 360px 内部滚动**（2026-10-25 用户要求；DSH 无可 require 的 markdown 组件——primitives 的 MarkdownText 被内联进 ui-chat bundle、模块表没有——自研 `MarkdownLite`：md → 块结构 → React 元素树，**不经 innerHTML 无 XSS 面**；支持标题/段落/粗斜体/行内代码/链接/围栏代码块/引用递归/缩进列表/分隔线/GFM 表格，段落内单换行渲染 `<br>`；`mdToBlocks/mdInlineNodes/mdListTree` 进 _test）+ 更新时间 + 「重新读取」；**自动回读**条件：详情打开 && resolveLiveState=done && 缓存非（完整+未过期）（TTL 10min），失败冷却 60s（`replyLastTry` 防抖）；running/ask 可手动刷新。`fetchReplyNow` 的 activeAcct/card/link 全由当前 render 传参（useCallback([]) 闭包坑，同 sendDispatch）。

### 4.8 详情页「最近动态」时间线 + story 详情 404 修复（2026-10-25，提案 2）

用户批准的提案 2：详情页看同事备注/流转记录/字段变更，不用切回禅道网页。探测结论在《计划书.md》§9（**必读**），要点：

- **数据源零成本**：v1 详情接口 `/api.php/v1/{tasks,bugs,stories}/{id}` 响应自带 `actions` 数组，且**actor 已是真名、每条带 `desc` 现成中文句**（「由 张三 指派给 李四。」）——不用自建动作名翻译。`comment` 是 HTML（图片同描述归一）、`history` 带中文 `fieldName` + old→new。
- **host**（`service.mjs`）：`toActions(raw, baseUrl)` 精简映射——desc 走 `htmlToText` + 剥时间戳前缀（date 字段独立存在）；comment 走 `htmlToText`（保留 `[图片：x]` 占位符，client 去掉）+ `extractImageRefs` 提图；history 值 `shortHistValue`（HTML 转文本、压空白、80 字截断，任务描述 diff 会很长）；desc/comment/history 全空的条目滤掉。`fetchDetail` 返回值加 `actions`。**host 改动 → 重装 + 重启桌面版**。
- **client**（`client.js`）：DetailView「截图」区下加「最近动态（N）」区 + `ActionTimeline` 组件——时间正序、默认折叠只显示最近 5 条（`ACTION_FOLD_N`，`slice` 尾部）、「展开全部（N 条）/收起」按钮（fold state 在 `useEffect([props.actions])` 里重置，切卡片不残留展开态）；每条 = desc 主行 + `fmtActDate` 紧凑日期（今年 `MM-DD HH:mm`、往年带年份）+ 备注块（`stripImageMarkers`）+ 备注**图片复用 DetailImages 真实渲染** + 变更明细行（`field：old → new`，old 空只显 new）。样式 `.ztp-act*` 走 `--dsw-alias-*` token。
- **⚠️ story 详情 404 真相（M3 起就坏）**：探测中曾误判为「session 产品上下文污染 + vision=rnd 重试可恢复」，写单测时揭穿——client 把 story 简单加 s 拼成 `/api.php/v1/storys/{id}`（正确复数 `stories`），**story 详情从 M3 起一直 404「不存在」**。修复：`zentao-client.mjs` 的 `V1_KIND_PATHS` 显式映射；vision 重试方案已删（错误归因的产物）。教训：某类对象接口整体 404 先查 URL 拼写。
- 测试：`protocol` +5（stories 拼写 / 真 404 / toActions 3 项）、`client` +8（fmtActDate / ActionTimeline 折叠·展开·备注图·变更·空态；**fake createElement 不展平数组 children，children.flat(2) 后再断言**）、`host` +2（actions 透传、story detail 真机——实测 story#8 有 4 条动态）。**host 测试的 logout 会清掉借用凭据目录的账号**（/tmp/zt-smoke 的 config 已被消耗，下次跑 host.mjs 需重新提供凭据）。

### 4.9 自动轮询/离线状态 + 批量下发（2026-10-25，用户批准的 Idea 1 + Idea 2）

用户从三个提案里选了两个（Idea 3「日报生成」未做）。**全部仅 client 改动，⌘R 生效**。测试 +14（client 224 项全绿）。

**Idea 1：列表自动轮询 + 在线/离线状态 + 新指派提醒**（补齐 M4 欠的「自动轮询、禅道不可达文案」）：
- **轮询**：ZentaoPane 挂载且 configured 时 `setInterval` 每 `POLL_INTERVAL_MS = 5min` 调 `loadMine(false, true)`（silent），卸载即停——数据拉取只在面板可见时做（M6 会话活性监控照常常驻）。host 侧 60s 缓存天然防打爆。**⚠️ 轮询 effect 的 deps 不能写 `configured`**——它是函数体后半段才赋值的 var，构造 deps 数组时是 undefined，轮询永远不启动；要用 `[status[0] && status[0].configured, loadMine]` 表达式（与 activeId effect 同款）。
- **loadMine(refresh, silent)**：silent=true（轮询）时不动 loading spinner、失败不弹 toast（离线期间每 5 分钟弹一次会吵死），只翻转 `offline` state（null 未知/true 离线/false 在线）；手动刷新失败仍弹 toast。成功时做**新指派检测**：与模块级基线 `lastMineIds[activeId]`（kind-id 键集合）比对，`diffNewCards` 首次（基线 null）只建基线不提醒（同 watchEval 模式），之后有新增 → toast `newAssignedText`（「禅道新指派 2 条（任务×1 · Bug×1）」，类型按 KIND_ORDER 排）。基线按账号分桶、面板卸载重挂不清零（防重复提醒）；切回旧账号若期间有新指派会在下次拉取时提醒。
- **UI**：mast 标题旁连接小点（`.ztp-conn`：绿=已连/红=不可达闪烁/灰=未知）；离线且仍有数据时列表上方常驻 `OfflineBar`（`.ztp-offline`：「禅道当前不可达，正在展示 HH:mm 的缓存数据」+ 重试按钮=强刷）；无数据时错误视图照旧抢占。离线兜底数据源就是 mine.v1 快照/上次列表（§4.7②）。
- 纯函数 `cardKeyMap/diffNewCards/newAssignedText` + `OfflineBar` 进 `_test`。

**Idea 2：列表多选 + 批量处理/批量插入**（「一批 Bug 一起丢给 agent 排查」场景）：
- **多选模式**：head 工具行加「批量」入口按钮（`BatchIcon`）→ `selMode=true`：卡片点击=勾选/取消（不打开详情）、左缘圆形勾选框（`.ztp-check`）、隐藏动作行/外链/拖拽（`.ztp-card.sel` 选中描边）、保留活性徽标（帮你判断选哪些）。底部 `batchbar`：已选计数（`batchSummary` label 如「任务×1 · Bug×2」）+「全选当前列表/取消全选」（作用于 filtered=当前 tab+搜索）+「批量插入」「批量处理」+ 退出。**选中集合 `selKeys` 跨 tab 保留**（切 tab 再选，批量时一起下发）；退出多选/切账号/登出/移除账号清空；不入 paneCache（重挂自然清空）。
- **批量下发链路**：`openBatchDialog(intent)` 组装 `{cards, md: batchToMarkdown(cards), images: mergeCardImages(cards)}` → 复用 `DispatchDialog`（新 props `cards/batch`：标题「批量处理：3 项」、副标题类型摘要；单卡路径零变化，card 传首卡作 fallback）→ `sendDispatch` 支持 `d.cards`：走现有 `dispatchToNewSession`/`insertToNewSession`（md 是一份合并背景，images 合并截 20 张=DSH 单消息上限）→ 成功后**逐卡 `saveSessionLink` 指向同一会话**（M6 徽标/chip/反向跳转对每张卡照常工作；watchEval 同帧同 sessionId 只产生一次边沿 toast，天然去重）→ 发起即退出多选清空选中。失败降级照旧：合并 md 插当前会话/剪贴板。
- **闭包坑照旧**：`openBatchDialog/toggleSelAll` 是 render 作用域函数（读当次 selCards/filtered，**不能**写进 `useCallback([])`）；`toggleSel` 用函数式 setState（setter 引用稳定）。
- 纯函数 `batchToMarkdown/batchSummary/mergeCardImages` + `CardItem/DispatchDialog` 进 `_test`。测试注意：fake createElement 下 className 断言要 `.split(' ').includes('sel')`——`ztp-k-bug` 类型类夹在中间，连续子串匹配会误判。

### 4.10 详情图片双层缓存（2026-10-25，用户要求：重开详情/面板重挂不再每次转圈）

此前图片零缓存：`DetailImages` 每次挂载逐张发 `zentao.image` RPC，host `fetchImage` 每次真实下载禅道——
面板切走再切回（main slot 只渲染当前面板，禅道面板整个卸载重挂）详情图全部重新转圈。现加两层内存缓存
（都不落盘，⌘R / 重启即清；禅道 `/file-read-<fileID>` 按 fileID 定址、内容不变，天然适合缓存）：

- **client 层（`client.js` 模块级 `imageCache`: Map<url, dataURL>）**：上限 **40 张 / 24MB**（dataURL 字符
  串长度计），Map 迭代序即新旧序，超限最旧先出（`rememberImageSrc` 每次插入重算总量再淘汰，无字节计数漂移）。
  **三个消费方共用一套读写**：`fetchImageValue(img)` 统一「查缓存（`imageDataUrlParts` 把 dataURL 还原成
  RPC value 形态，name 取图片引用的）→ miss 走 RPC → 成功回写」；`DetailImages` 的取图内核抽成
  `loadDetailImages(urls, markRow)`（effect 只做缓存铺底 + 委托，fake React 测不了 effect 所以抽出来直测）：
  初始行直接用缓存铺 src（已看过的图不转圈），未命中的逐张 RPC；**失败不缓存**（下次挂载自然重试）。
  `prefetchImageBytes`/`attachImagesToDraft` 走 `fetchImageValue` —— 详情看过的图点「处理」时不再重拉。
- **host 层（`service.mjs` 每账号会话 `imageCache`: Map<path, {at, value}>）**：TTL **10min**（`IMAGE_CACHE_TTL_MS`）+
  容量 **32MB**（`IMAGE_CACHE_MAX_BYTES`，按图片原字节计，最旧先出；单图超上限不入缓存）。**缓存命中在
  `ensureLogin` 之前返回**——登录态失效也不触发重登/探活。缓存随账号会话生灭：upsert/logout 整只重建即清空。
  两个参数经 `createZentaoService({imageCacheTtlMs, imageCacheMaxBytes})` 可注入（测试用）。
- 测试：client +11（imageDataUrlParts / 记忆-读回 / 张数淘汰 / 字节淘汰 / loadDetailImages 4 项含 cancel
  与失败不缓存 / prefetch 二次 0 RPC / attach 缓存命中照常建附件）、multi +6（命中不重打 / 命中绕过登录探活 /
  TTL 过期重拉 / 容量淘汰最旧先出 / 单图超上限不入缓存）。**⚠️ 测试坑**：client 的时序断言（「预取先于
  create」）依赖真实 RPC——前面向同 url 的取图已入缓存会让预取静默命中，断言挂掉；test/client.mjs 在该处
  先 `mod._test.imageCache.clear()`（`TT` 在 669 行才定义，之前用 `mod._test`）。
- 插件是 `link:` 符号链接直连本仓库（`~/.dsh/profiles/desktop/node_modules/dsh-zentao-panel`），host 改动
  **重启桌面版即生效，无需重装**（package.json 没动时）。

### 4.11 下发弹层「附加指令」+ 完成后一键去禅道闭环（2026-10-25，用户批准的两提案）

用户从四个提案里选了这两个（「多账号聚合收件箱」暂不做）。**仅 client 改动，⌘R 生效**。

**①「处理/插入」弹层附加指令**：DispatchDialog 在思考强度下方加可选 textarea（`.ztp-input.ztp-instr`，
placeholder「拼到任务背景末尾，如：只分析定位原因，先不要改代码」）。纯函数 `appendInstruction(md, instr)`
——空白指令原样返回，否则追加 `\n\n## 处理要求\n\n<trim 后指令>`；`sendDispatch` 入口统一拼接，
三条链路（dispatchToNewSession / insertToNewSession / 降级 insertToCurrentChat）都吃拼好的 md；
批量模式同样适用（拼在合并背景之后）。**记忆上次输入**：localStorage `dsh-zentao-panel.instr.v1`
（`readLastInstruction/saveLastInstruction`，读坏/不可用退进程内兜底，同 links.v1 模式）——
弹层初值带出上次输入，send 时保存本次输入（含清空）。注意 `useState(readLastInstruction())` 的
初值在 fake React（useState 恒返初值）下正好可测「带出上次输入」。
**指令模板预设**（2026-10-25 二轮）：textarea 下方 `.ztp-instr-tps` chip 行——点 chip 填入 textarea
（整体替换）、chip 的 × 删除、行尾「+ 存为预设」把当前输入存成模板。localStorage
`dsh-zentao-panel.instr-presets.v1`（`[{id, text, at}]` 按插入序；`normInstrPresets` 全文去重留先出现、
空文本滤掉、上限 12 条最旧先出；坏 JSON 回退内存兜底不抛错——注意坏 JSON 时读到的是上次写入的
内存列表而非空表）。chip 预览 `instrChipLabel`（压空白 + 12 字截断加 …，title 放全文）。

**② 完成后一键去禅道闭环**：`finishUrl(card)` 由 `card.url`（禅道查看页）把 `*-view-{id}.html` 替换为
操作页：task→`task-finish-{id}.html`、bug→`bug-resolve-{id}.html`、story→`story-close-{id}.html`
（ZenTao PATH_INFO 模块-方法-id 约定，18.13 实测）。**不违反只读边界**——只是打开禅道网页表单，
不 API 回写。DetailView 在元信息卡与「处理结果」区之间渲染「去禅道标记完成」外链按钮
（`.ztp-finish-row` 包 `.ztp-btn.primary` 的 `<a target="_blank">`，
仅当该卡 `resolveLiveState` 为 done 时显示——agent 处理完才有闭环动作；点开禅道完成操作页后事项
离开指派列表，由 cleanupStaleLinks 8h 宽限清理）。

### 4.12 快捷筛选条（2026-10-25，用户批准的提案）

列表 head 下方一行 chip：**等你决策 / 处理中 / 逾期 / 今天到期 / 已完成**（`QfBar` 组件，`.ztp-qf*`）。
单选开关：点激活项清除、点其他切换；**激活时跨分类**——过滤池从「当前 tab」变「全量卡片过搜索」
（等你决策的活不该按任务/Bug/需求分开找），卡片自带 KindTag 所以混合列表可读。**点 tab = 明确选
范围，同时退出快捷筛选**（tab onClick 里 `qf[1](null)`）。chip 计数在「搜索过滤后的全量卡片」上统计
（`quickFilterCounts`，数字随搜索词联动）；零值 chip 淡化不隐藏（防行跳动）。计数/命中注入同一个
`liveOf`（resolveLiveState，实时+持久化兜底）——活性维度（ask/running/done）与排序 smart 同源；
截止维度（overdue/today）排除禅道终态（isFinalCard）与无截止卡，today = 距 23:59:59 不足一天且未逾期。
空态在快捷筛选激活时显示「清除筛选」按钮；页脚分母变 `filtered.length/cards.length`（全量）。
纯函数 `quickFilterHit/quickFilterCards/quickFilterCounts` + `QUICK_FILTERS` + `QfBar` 进 _test。
批量模式「全选当前列表」作用的就是 filtered——快捷筛选天然约束批量范围。

### 4.13 一键复制 + 旗标与隐藏 + 极速重发（2026-10-25，用户批准的三提案）

**①一键复制**：`copyToClipboard(text)`（clipboard API → textarea+execCommand 兜底，promise 化）。
卡片动作行复制图标 = `#id 标题`（贴 IM）；DetailView 返回栏右侧 `.ztp-detail-copy`「复制 Markdown」=
`cardToMarkdown(card, detail)`（详情已加载含完整描述；**按钮类不能用 `.ztp-back`——它在宽屏
`display:none`**，只有返回键吃那条规则）。

**②旗标与隐藏（marks.v1）**：key 与 links 同构，值 `{flag?, hide?, at, lastSeen?}`；`toggleCardMark`
切换（空条目自动删，**组件内有同名局部函数，模块级叫 toggleCardMark**）。旗标 → 卡片顶行 `.ztp-flagdot`
+ 快捷筛选新增「已标记」维度（`quickFilterHit/Counts` 第 5 参 `flaggedOf` 注入，缺省恒 false 向后兼容，
QUICK_FILTERS 现在 6 项）；隐藏 → `visCards` 把隐藏卡从列表/计数/筛选/页脚全部滤掉，页脚
`.ztp-foot-hide`「显示已隐藏 N」临时切换 `showHidden`（淡化 `.ztp-card.hiddenmark` 显示，点 ⊘ 取消）。
**N 只数当前列表里实际隐藏的卡**（`hiddenCount(map, activeId, cards)`；2026-10-26 用户反馈修复：
原先按 marks 全量计数，卡片在禅道完成/转派离开「指派给我」后仍占着数字、点开却找不到那张卡）。
隐藏标记本身仍按 8h 宽限保留（当日重新指派回来仍然隐藏；`cleanupStaleLinks` 顺带清 marks：在线刷
lastSeen 1h 限频 / 离线 8h 宽限删 / 只动当前账号）。

**③极速重发（lastdispatch.v1）**：`{workspaceId?, cwd?, model?, instr, at}`——sendDispatch **成功即保存**
（含批量）。卡片动作行 ⚡（`quickTitle` 非空才渲染，title=`lastDispatchSummary` 摘要：工作区/继承目录/
模型/指令截断）→ `quickRedispatch(card)`（render 作用域函数，lastDispatch 每次现读防闭包坑；详情开着
带完整描述）直接 `sendDispatch(choice, {..., intent:'dispatch', instr})`，跳过弹层。弹层正常路径不受影响；
无记录时按钮不渲染。

### 4.14 本地备注 + 继续处理（2026-10-25，用户批准的两提案）

**①本地备注（notes.v1）**：key 与 links 同构，值 `{text, at, seenAt?}`；`saveNote`（空串=清除）/
`getNote`/`noteLine`（压空白 50 字截断）。卡片标题下一行 `.ztp-note-line`（铅笔图标+摘要，title 全文）；
DetailView 元信息卡下编辑区（textarea + 保存/清除，`noteText` 在切卡 effect 里重置——与备注共用一个 effect，
并把「继续处理」框的 contOpen/contText 也一并重置）。cleanupStaleLinks 顺带清（在线 1h 限频刷 seenAt、
离线 8h 宽限删，**notes 的在线计时字段叫 seenAt 不是 lastSeen**）。

**②继续处理（continueInSession）**：处理结果区「继续处理…」按钮（仅 `replyLink && onContinue` 存在时渲染）
→ 展开 textarea → 「续发到会话」。链路：`retain('zentao-panel')` → `scope` → `facade.setDraft(【继续处理
禅道X #id】
<用户输入>)` → **250ms 后 submit**（与 dispatchToNewSession 同款时序）→ **3s 释放 retain**。
会话正在跑时 submit 走宿主排队，不冲突。失败分支：空白文本 → empty；conversation/sessions 缺失 →
unsupported；retain 后 scope/facade 拿不到 → **立即释放 retain** 返回 unavailable（不留悬挂连接）。
handler `continueLinked` 的 link 由当前 render 传参（闭包老坑）；前缀带卡片标识便于模型接上下文。

### 4.15 卡片回复摘要行 + 决策应答台（2026-10-25，用户批准的两提案）

**①回复摘要行**：卡片标题下（备注行之后）`.ztp-reply-line`——agent 最后回复的一行预览
（`replyLine` 压空白 60 字截断，title 全文）。数据源 replies.v1，**与当前关联会话一致才显示**
（`replySummaryOf` 同会话守卫，再处理换会话后旧回复不带）；ChatIcon 前缀、secondary 色。

**②决策应答台**：卡片 ask 态（等你决策）时 DetailView 顶部（处理结果区之上）`.ztp-ask-box`
（warn 色 token：state-warn-bg/border/label，均带回退）——「agent 正等你决策」+ 一键
**「同意，继续执行」**（固定文案 `同意，请继续执行。`）+ 「自定义回复…」展开 textarea
（askOpen/askText，切卡 effect 里与 cont/note 一起重置）。发送都走 `props.onContinue` =
continueLinked（continueInSession 链路，带【继续处理 禅道X #id】前缀）——ask 态在面板里
直接拍板，不跳会话。**自动回读条件从仅 done 扩为 done || ask**（ask 时也要看到 agent
在问什么；TTL/失败冷却不变）。

### 4.16 流程看板（2026-10-25，用户提案·方案 A：四列泳道全局视图）

> 2026-10-27 视觉/动效重做见 **§4.20**（以下为初版设计记录；缩略卡已去掉 KindTag、
> 四列已改为满幅管线工作面，动效不再「不做」）。

用户自己提的 idea（流程图界面展示正在进行的任务，先出方案再拍板——选了泳道看板）。
head 加「列表 / 流程」视图切换（`.ztp-viewseg`，`viewMode` 入 paneCache.view 持久化）；
board 模式占满主体渲染 `BoardView`，**tab 段/快捷筛选条/排序/批量入口都隐藏**（board 是
跨分类全局视图），搜索框保留（过滤看板卡）。点缩略卡 → 回列表视图 + 切到该分类 +
清快捷筛选 + 打开详情。**教训重申：鲸鱼娘办公室被否决后，可视化只做信息密度
（无装饰动画），四列紧凑卡片走现有 token。**

- **分列**：`boardColumns(cards, liveOf, now)` → `{todo, running, ask, done}`——liveOf 为 null
  （从未下发/进度已清）归「待处理」；**禅道终态卡（isFinalCard）不入板**；段内 `sortCards
  ('deadline')`（截止↑优先级↑）。列色点：todo=tertiary / running=business / ask=warn / done=success。
- **缩略卡** `.ztp-bcard`：KindTag + 旗标点 + #id + 截止 chip（overdue 红/soon 橙文字）+
  两行截断标题；title 提示点击行为。**列内按 任务/Bug/需求 分组**（2026-10-25 用户反馈加）：
  每组 `.ztp-bgrp` 组头（类型色点 + 名称 + 计数，空组不渲染，组内保持截止序）；缩略卡左彩条
  改用类型色 `--ztp-c`（紧迫性由截止 chip 表达，不再用左彩条）。
- 数据零新增 RPC：cards=visCards 过 matchSearch；活性随 liveSnap/linkRev 渲染周期自动刷新。
- 测试：client +4（296 项）。⚠️ 又踩 map 嵌套（第 4 次）：BoardView 列体 children 要 flat(2)。

### 4.17 「插入对话」带上最近动态（2026-10-27，用户要求）

用户要求：「插入对话 需要把最近动态也插入进去」。**只动插入模板**——「处理」/「复制 Markdown」/
批量下发/拖拽仍用原精简模板（M3 用户拍板的「标题 + 描述」），避免误改既有行为。仅 client 改动，⌘R 生效。

- **模板**：`cardToMarkdown(card, detail, opts)` 新增可选第三参——`opts.actions=true` 时在描述后追加
  `### 最近动态（N 条）` 小节（`actionsToMarkdown()`）。每条 = `- <YYYY-MM-DD HH:mm> <desc>`（host 已剥
  时间戳前缀、actor 已是真名），备注缩进成 `  - 备注：…`（多行续行 4 空格），字段变更缩进成
  `  - 字段：旧 → 新`。**备注里的 `[图片：x]` 占位符仍去掉**（图片走真实附件，见下）。
- **上限 `MD_ACTIONS_MAX = 30`**：取尾部最新 30 条（时间正序），更早的只在小节标题报总数
  （「最近 30 条，共 87 条」）——防长寿命 Bug 的百来条历史灌爆上下文。
- **详情不在手边时先拉**：最近动态只在 v1 详情里（列表卡片没有），而「插入对话」按钮在卡片上、
  `detail` 传的是 null。`prepareInsertPayload(card, detail, rpc)`：detail 已带 `actions` 数组 → 直接用；
  否则 `rpc('zentao.detail', {kind, id})` 拉一次——**顺带把描述从 300 字 `descBrief` 换成完整正文**。
  读取失败不挡插入：退列表摘要 + 标 `error`，面板 toast「详情读取失败，本次只插入标题与摘要」。
  返回 `{md, images, detail, fetched?, error?}`（纯函数，进 `_test` 直测）。
  `insertToChat` 在拉取期间挂 sticky toast「正在读取禅道详情与最近动态…」，到手后再开弹层。
- **备注图片也作为附件**：`insertImagesOf(card, detail)` = 描述图 + `actions[].images`，按 url 去重、
  **上限 20 张**（DSH 单消息上限；与 `batchToMarkdown` 的 `mergeCardImages` 同款约束）。
- 未做：拖拽进输入框（dragstart 只能同步取 `text/plain`，列表数据里没有 actions）、批量插入的
  逐卡动态（N 张卡 = N 次 detail RPC，代价与收益不划算）。
- 测试：client +16（共 317 项；默认模板不变 / 小节标题与行格式 / 备注去占位符 / 字段变更 / 空 actions 无小节 /
  30 条截断报总数 / 图片去重与上限 / 被截掉的老备注不附图 / prepareInsertPayload 五分支：有详情不 RPC、
  列表卡拉详情、失败与抛错退摘要）。真机样本（bug #15977 / #15964）确认输出形态（后者带备注截图）。

### 4.18 处理状态手动修正（2026-10-27，用户要求：已完成状态偶尔会丢）

用户反馈「有时候已完成的状态可能会丢失，需要支持手动修改这个状态」。**仅 client 改动，⌘R 生效**。

- **丢失根因**（既有设计，见 §4.6）：done 是 states.v1 的粘性进度记录，但会话被删
  （syncPersistedStates 的 gone 分支）、再处理换会话（saveSessionLink 清 states）、卡片离开
  列表 8h（cleanupStaleLinks）都会清；宿主的 completionUnread 又只对后台会话置位，正看着
  的会话跑完没有完成信号（§4.6 已用 running→done 补，但重启/会话删除等场景仍可能漏）。
- **数据模型**：states.v1 条目新增 `manual:true`，完整值 `{sessionId, state, at, manual,
  lastSeen}`。`setManualState(activeId, card, state, now)`：state 为 null/不在 `LIVE_STATES`
  → 清除手动设置（回到自动检测）；合法值写入，sessionId 取关联会话，没有关联也能设
  （sessionId 为 null——没处理过的卡也能先标「已完成」）。
- **优先级**：`resolveLiveState` 先看 `persisted.manual`（返回 `{state, since, manual:true}`，
  **无 link 也返回**），手动状态压过实时检测；`syncPersistedStates` 遇到 manual 条目直接
  `continue`——自动评估不覆盖、会话归零/被删也不删（人明确断言过的状态比会话存活权威）；
  唯一例外是关联会话确实被删时顺手清该条的旧结果摘要（replies.v1，与 chip「会话已删除」一致）。
  手动值非法（坏 localStorage）时 `resolveLiveState` 不认（`LIVE_STATES.indexOf` 校验）。
- **清理**：`cleanupStaleLinks` 的 states 循环改成按 `seen`（卡片还在当前列表）判定——在线
  就保留并按 1h 限频刷 `lastSeen`，离线且超 `LINK_GRACE_MS` 才清。**旧逻辑把「无 link 的
  状态记录」一律当孤儿**，会把手动状态当垃圾删掉；手动状态允许没有 link，不能这样判。
- **UI**：卡片动作行加 `<select class="ztp-statesel">`（状态：自动/处理中/等你决策/已完成，
  回显手动值，非空时 `.on` 高亮）→ `onSetState`；详情元信息卡下加 `.ztp-state-edit`
  （「自动 + 三态」chip 组，手动态高亮，`.ztp-state-hint` 标「手动设置 · 覆盖自动检测」，
  底部说明持久化）。**2026-10-27 晚补第四态「已结束」（只能手动），见 §4.22：下拉与 chip
  现在都是「自动 + 四态」。** `LiveBadge` 加 `manual` prop：title 前缀「手动设置的状态：」+ `.manual`
  内描边。两处都走 ZentaoPane 的 `setStateHere`（`useCallback([activeAcct])`）→
  `setManualState` → bump `stateRev` 重读 states.v1 → toast；清除时 `watchPoke()` 让自动
  评估立刻回填。
- **联动**：手动状态走同一个 `liveOf`，所以徽标 / 快捷筛选计数与过滤 / 智能排序 / 流程看板
  分列 / 「去禅道标记完成」闭环按钮全部自动生效。`stateRev` 已补进 stateMap、filtered、
  qfCounts、reply 自动回读 effect 的 deps；`.ztp-acts` 加 `flex-wrap:wrap`（多了一个下拉，
  窄面板换行不溢出）。`watchStateForCard`（toast 边沿）保持纯实时，不受手动设置影响。
- 测试：client +16（共 333 项；setManualState 落盘/带 sessionId/清除/非法值、manual 优先于
  实时且无 link 可用、syncPersistedStates 不改写/会话删除不删、再处理作废、无 link 在线保留
  与超宽限清理、LiveBadge manual 类与 title、CardItem 下拉回显与回传、DetailView chip 高亮
  与回传/自动高亮）。

### 4.19 「新建对话」单一入口 + 自动带入开关 + 界面整理（2026-10-27，用户要求）

用户先说「参考插入对话按钮再搞一个新建对话按钮」，澄清后拍板：**只留一个「新建对话」**，
弹层里可勾选「自动带入」。**仅 client 改动，⌘R 生效**。

- **卡片动作行**：删除「插入对话」，只留「新建对话」（NewChatIcon：对话气泡 + 加号）与「处理」
  （PlayIcon：播放三角，primary）。动作行拆两层——左侧会话 chip；右侧 `.ztp-acts-right` =
  `.ztp-utils`（状态下拉 + ⚡/旗标/隐藏/复制）+ `.ztp-acts-sep` 分隔线 + 两个主操作。
  图标按钮 24×24、边框透明；窄面板换行时工具组整体换行，主操作不拆散。状态下拉收窄到 11px/98px。
- **弹层**：`intent='insert'` 且非批量（`allowCarry = insert && !batch`）时渲染 `.ztp-carry`
  勾选框「自动带入任务背景」，默认 `readCarryPref()`（localStorage `dsh-zentao-panel.carry.v1`；
  发送时 `saveCarryPref` 记住，取消后下次沿用，勾选框始终可见不会静默）。取消勾选 → `withContent=false`：
  文案变「新建空白会话」、附加指令 textarea + 模板 chip 整段收起、`onSend` 回传
  `{carry:false, md:null, images:[], instr:''}`。标题统一「新建对话：X #id」/「新建对话：N 项」。
- **懒读取**：从卡片点「新建对话」不再提前拉详情（`dispatch[1]({card, md:null, images:null,
  intent:'insert', lazy:true})`）；sendDispatch 在确认后、且 carry=true 时才
  `prepareInsertPayload`（sticky toast「正在读取禅道详情与最近动态…」），失败只退标题+摘要并把
  「（详情读取失败，仅带入标题与摘要）」拼到结果文案——取消带入时零详情 RPC。
- **空白会话**：`newBlankSession(choice)`（模块级，进 `_test`）——create（workspaceId|cwd|继承
  当前 cwd）→ selectModelFor → `uiWorkspace.openSession` 跳转；**不填草稿/不挂附件/不
  saveSessionLink**（没有内容，关联会让卡片误亮处理中/已完成），也不存 lastDispatch。返回
  mode `jumped|created`（uiWorkspace 缺失 → created，提示从会话列表打开）；sessions 缺失 →
  ok:false → toast「sessions 服务不可用」。sendDispatch 的 `carry===false` 分支直接走它，
  **不降级插入当前会话**（没有内容可插）。
- **批量**：底部「批量插入」改名「批量新建对话」（intent 仍是 insert，不带勾选框，始终带内容）。
- **样式整理**（用户一并要求的界面优化，全部走 `--dsw-alias-*`，不引入不存在的变量名）：
  head 加 `.ztp-head-sep`、行高 40、gap 6、搜索框 28 高 + 聚焦主题色描边、视图切换改胶囊分段
  （`.ztp-viewseg` 边框圆角 + 按钮 22 高）；卡片 hover 加 `shadow-lv1`；`.ztp-acts` 间距 6/8、
  主操作 27 高；弹层 380 宽 + `max-height:86vh` 内部滚动；新增 `.ztp-carry*` 样式。
- 测试：client 349 项（新增 16：CardItem 单入口与动作行分层 / 弹层默认勾选与文案 / 取消后空白
  文案 + 附加指令收起 / send 回传 carry 与清空 md/images / 批量弹层标题且无开关 / 空白会话 3 项 / carry 偏好 3 项）。
  布局用 headless Chrome 静态预览（日/夜 token + 1280/820/560 三档宽度）核对，未在真机 DSH 内目视。

### 4.20 流程看板视觉/动效重做（2026-10-27，用户要求「加点动画 好好设计一下」）

用户看的是「流程」视图（§4.16 的四列泳道），原样是四个带边框的盒子 + 每张卡带 KindTag。
本次把它当一块「四站管线」重做，**只动 client**，⌘R 生效；数据/RPC/分列规则零变化。

- **视觉**：`.ztp-board` 变成满幅工作面（bg-layer-1、无外框），四列用 `.5px` 发丝线分隔；
  每列顶部 2px `--ztp-lane` 色带拼成一根四段状态条（todo=tertiary / running=business /
  ask=warn / done=success），站头背景 9% 同色向下渐隐（ask 13%）。站头 = 状态字形
  `.ztp-bglyph`（todo 空心圈 / running 三根均衡器条 / ask 琥珀点+扩散环 / done 对勾）+
  站名 + 右对齐 `.ztp-bcol-n`（tab 数字，前一条 1px 分隔线）。列体 `.ztp-bcol-b` 独立滚动，
  分组头 `.ztp-bgrp` 吸顶（-6px 负边距盖住 gap；`background: bg-layer-1`）。
- **卡片** `.ztp-bcard` 改为 `<button>`（键盘可达 + focus-visible 主题色描边）：不再放 KindTag
  （分组头已说明类型），元信息行 `#id` + 旗标 + P1/P2 + done 对勾 + `.ztp-bdl` 相对截止；
  两行标题；hover 时类型色 4% 底 + 左彩条上下延伸 + 右侧箭头滑入；done 列标题降为 secondary。
- **截止文案** `boardDue(deadline, now)`：按日历天 → 逾期 N 天 / 今天 / 明天 / N 天后 /
  MM-DD（**跨年才带年份**）；now 可注入。与列表的完整日期不同，看板空间小、扫描优先。
- **动效只看「变了什么」**（用户此前否决过装饰性可视化，这条是硬约束）：
  - 分列基线 `boardLaneMap(cols)` → `{key: lane}`；`boardMotions(prev, next)` 产出
    `cards[key] = {kind:'new'|'move', from, dir:'fwd'|'back'}` 与 `moved`（一次刷新只留
    最后一颗光点）。BoardView 用 `useRef` 存基线、`useEffect([sig])` 比对（sig = 稳定的
    key:lane 串）；**首次挂载只建基线不放动画**（打开面板不满屏乱跳），900ms 后清标记
    （计时器随 effect cleanup）；无变化时 `setMarks(NO_BOARD_MARKS)` 同一对象 → React bail out。
  - CSS：换列卡 `.mv-fwd/.mv-back`（从原站方向 14px 滑入 .4s）、新卡 `.is-new`、
    光点 `.ztp-pkt`（`--ztp-x1/--ztp-x2` 由 `laneCenterPct(lane)` 给，top 2px 沿色带飞 .62s）、
    目标站 `.hot`（色带闪 .8s + 计数 bump）、在跑卡左彩条 `ztp-spine` 下滑高光 2.6s、
    ask 站头 `ztp-warnrib` 呼吸 3.2s、running 色带 `ztp-ribbon` 流光 2.8s、done 站头对勾
    `ztp-draw` 描一遍。`@media (prefers-reduced-motion:reduce)` 全部 `animation:none` + 隐藏光点。
  - **⚠️ 测试替身没有 `React.useRef`**：顶部 `useRef = React.useRef || (init)=>({current:init})`，
    退化后每次渲染新盒子；effect 在假 React 里是空实现，契约渲染只跑一次，不影响断言。
- **视图切换**：`.ztp-viewseg` 加 `.ztp-viewseg-ind` 滑块（`.is-board` 时 translateX(100%)），
  按钮只留文字色/字重（不再各自换底）。
- 测试：client **362 项**（当时；§4.21 后 366 项。+13：boardLaneMap / boardMotions 首次·换列·新卡·moved 取最后一个 /
  laneCenterPct / boardDue 四档 + 跨年 + 坏值 / BoardGlyph 四态 / done 对勾与箭头 / 空车道文案 /
  CSS 动效与 reduced-motion 契约）。视觉用本地 `.preview/build.mjs`（真实 CSS + BoardView 序列化，
  已 gitignore）+ headless Chrome 在 1500/980 宽、日/夜/空板/动效暂停帧核对；**未在真机 DSH 内目视**。

### 4.21 列表侧视觉收口（2026-10-27，用户要求「列表侧也优化下样式」）

看板重做后，列表仍是旧的「圆角浮卡 + 阴影 + 满屏实心蓝按钮」。本次只动 client 样式与卡片顶行
信息顺序（**零行为变化**：筛选/排序/批量/下发/本地标记全部原样），与看板共用一套语言。

- **表面层级**：`.ztp-list-col` 铺 `bg-layer-1`（列表工作面），卡片改 `bg-layer-2` + 8px 圆角 +
  `.5px` 发丝边框，和看板的「工作面 + 卡」一致；列表/详情之间的竖线收到 `border-l2`。
- **卡片** `.ztp-card`：去掉 hover 阴影与浮起，改为类型色 4% 底 + `border-l4`（同看板缩略卡）；
  左彩条 2px 收短（top/bottom 12px），hover 伸展到 6px；选中态从「类型色」改成**业务蓝**
  （背景 8% + 描边 + 右移 2px），避免 bug 卡一选中整张变红；类型仍由彩条 + 标签表达。
  **⚠️ 选中态的左彩条不要再用伪元素画满高**（2026-10-27 用户截图反馈：3px 方条从 8px 圆角的
  左上/左下戳出去）——改成 `box-shadow: inset 3px 0 0 0 var(--ztp-c), inset 0 0 0 1px business`，
  inset 阴影天然跟随 border-radius；伪元素在 `.on` 下 `opacity:0`。看板缩略卡加 `overflow:hidden`，
  hover 时上下伸展的彩条同样不会顶出圆角。
  `:focus-visible` 主题色描边。
- **顶行身份列**：顺序固定为 `KindTag → #id → 禅道外链 → 旗标 → LiveBadge`（原先把 LiveBadge
  放在 #id 前，有活性时 ID 会被推走，列表里 #id 上下对不齐）；顶行右组 = 状态 chip + P1/P2 徽标
  （P3/P4 仍是安静文本）+ `严重 N` + 相对截止 +「查看中」；**创建人从卡片移除**（详情有，搜索
  `matchSearch` 仍按数据命中）。截止复用 `boardDue`（今天/明天/N 天后/逾期 N 天，跨年才带年份），
  `title` 里保留完整日期与逾期天数；终态卡仍显示原始日期、不标逾期。逾期改为红色小胶囊。
- **动作行**：`.ztp-acts` 加 `border-top: .5px border-l1` 与 `padding-top:7px`，和内容分开；
  按钮从 27/11.5 收到 26/11，图标 23×23；**卡片内主操作**（`.ztp-acts .ztp-btn.primary`）静息
  是蓝色描边 + 蓝字，hover / `:focus-visible` 才填 `button-primary-fill`（弹层里的 `.ztp-btn.primary`
  仍是实心，不受影响）。
- **「查看中」**：从右上角折角（会盖住截止）改成顶行内联小标签（业务蓝 13% 底 + 蓝字），
  仍是 `.ztp-top-meta` 的最后一个子节点（测试契约不变）。
- **其他**：`.ztp-tag` 收成 17px 高 / 10.5px / 5px 圆角的标签；`.ztp-skel` 88px + 8px 圆角；
  `.ztp-live-ask/done` 的卡片描边加 `:not(.on)`，选中态永远最优先。
- 测试：client **366 项**（+3 列表行为：相对截止「今天」+ title 完整日期 / 创建人不再占顶行 / #id 在
  LiveBadge 之前；+1 CSS 契约：选中卡彩条必须用 inset 阴影，防方条戳出圆角）。视觉仍用 `.preview/build.mjs` 的列表页（`list-dark/light/narrow.png`），
  在 1500/1000 宽、日/夜核对；**未在真机 DSH 内目视**。

### 4.22 「已结束」人工终态（2026-10-27，用户要求：会话完成 ≠ 我收摊）

用户原话「现在会话完成就是标记已完成，还要一个已结束的状态，由我来手动标记」。拍板：**仍显示在列表**
（不收起）、**沉到最底 + 整卡灰化**；**已结束覆盖自动检测作为最终状态**（不叠加「已完成」）。
**仅 client 改动，⌘R 生效**。

- **状态模型**：`LIVE_STATES = ['running','ask','done','ended']`（顺序即下拉/chip 顺序）。
  ended **只能人设**——`deriveLiveState` 永不产出它；`setManualState` 接受 ended，照旧写
  `{sessionId, state, at, manual:true, lastSeen}`。`resolveLiveState` 的 manual 分支天然支持
  （无需改判定）；`syncPersistedStates` 对 manual 条目照旧跳过，自动评估/会话删除都不会覆盖。
  再处理换会话（saveSessionLink 清 states）与 8h 离场清理规则不变。
- **UI**：LiveBadge 新增 `ended`：灰底灰字 + **方框对勾「封存章」**（rect + 对勾两步，不再用 done 的
  check 动画）；title 写「你已手动标记为已结束（不再跟进；选「自动」可恢复跟随会话）」。卡片根节点
  `ztp-live-ended`（opacity .6，hover/focus/选中恢复 .95；标题转 secondary；截止不再标红/临期，
  回退完整日期）；详情面板 `ztp-panel-card.ztp-live-ended` 只压边框与标题色（读详情时不降可读性）。
  状态下拉与详情 chip 都从 LIVE_STATES 生成（自动 + 四态），回显手动值。
- **排序**：`endedRank(c, liveOf)` 最先比较——smart / deadline / pri 都把已结束沉到**最底**
  （在 done 与禅道终态之后）；origin 保持禅道原序（显式「默认顺序」不掺状态）。为此 deadline/pri
  的 maker 也接收 liveOf，但只用它判断 ended，ask/running/done 仍不掺（§4.7 的原则不变）。
- **联动**：流程看板 `boardColumns` 跳过 ended（阶段已终结，留在「待处理」会变假待办）；
  `quickFilterHit` 的逾期/今天到期维度排除 ended（收摊的旧账不再天天在「逾期」里报到，计数同步）；
  已结束不进入「已完成」筛选（两个维度分开）。其余（搜索/批量/备注/复制/会话 chip）全部照常可用。
- 测试：client **380 项**（+14：ended 落盘 / 压过实时 done·running / 自动不覆盖 / smart·deadline·pri
  沉底 + origin 原序 / LiveBadge 封存章 / CardItem 灰化类与下拉回显 / DetailView 灰化与 chip 高亮 /
  逾期与今天到期排除 / 已结束卡不标逾期 / 看板不入板 / 自动检测永不产出 ended / CSS 契约）。
  下拉与 chip 的旧断言从 4 项改 5 项、chip 索引不变（done 仍是 [3]、ended 是 [4]）。
  视觉用 `.preview/build.mjs` 的列表页（假数据加了一张 overdue 的已结束卡）在日/夜、1500/760 宽核对：
  灰化后仍能读标题，封存章与 done 对勾一眼可分。

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

### 5.1 左侧栏全局面板入口与主题（2026-10-24 改版，源码确认）

入口从「右侧栏 tab」改为 **左侧栏全局面板**（对齐 dsh-mnemon 的「记忆系统」：左侧栏一个图标行，
点开后面板占据整个主区域，与「插件管理」页同一机制）。机制源码事实（dsh-client-ui-sidebar /
dsh-client-ui-layout README + dsh-mnemon lib/client.js mountSkillsPanel/mountMnemonSidebarNavigation，
0.2.1-rc.2）：

- **两个 slot 配对注册**（dsh-mnemon 同款声明感知嵌套：`slots.inject('main', () =>
  slots.inject('sidebar.panellist', () => { 先 register main 再 register panellist }))`，任一失败回滚另一侧）：
  - `sidebar.panellist`（根作用域列表）：`slots.register({ name:'sidebar.panellist', id, order, label:
    ()=>string }, IconComp)` —— 左侧栏图标行。行按钮/展开文字/无障碍名/收起态 tooltip/选中态全由
    DSH 自己画；IconComp 只收 `{size, className}`（本项目直接转发给 ZentaoGlyph）。order 32 排在
    dsh-mnemon 记忆(30)/技能(31) 之后。
  - `main`（根作用域 keyed slot）：`slots.register({ name:'main', key: id }, PanelComp)` ——
    **key 必须与 panellist 的 id 同值**，选中态按这个 id 寻址 main 注册项；`conversation` 是保留 key。
- **选中/切回**：`ctx.layout.selectPanel(id)` 切到面板；`selectPanel(null)` 回 Conversation（不动当前
  会话）。selectPanel 会查 live main registry，key 不存在时 throw 且不改选中——顺序上先 register main
  再 register panellist（dsh-mnemon 也是这个顺序）。**`uiWorkspace.openSession` 内部
  `replaceMain(...,"reveal")` → `selectPanel(null)`**，所以**用户主动点会话 chip / 提醒 toast 的
  「去看看」**天然从面板切回会话视图，插件无需任何「面板跟随」逻辑。
  （「处理」下发**不**走 openSession——用户要求处理后留在面板，见 §4.2 末。）
- **main slot 按 `entryKey = activePanelId ?? 'conversation'` 只渲染当前选中面板**（AppFrame 里
  `renderSlot("main", {}, { entryKey })`）——切回会话/别的面板时禅道面板**卸载**，重挂靠模块级
  `paneCache`（`{tab, status, mine, detailCard}`）秒恢复列表，不闪 loading/骨架（原为右栏 per-session
  重开设计，全局面板下正好复用）。
- **macOS 桌面**：主面板内容要让位隐藏交通灯——根上 `padding-top: var(--dsh-frame-top-clearance, 0px)`
  （仅 darwin 桌面非 0，Web 上 0 无影响），顶部再铺一条 `data-window-drag` 拖拽带（dsh-mnemon 的
  SkillsMainPanel/MnemonMainPanel 同款，DSH 会把 `data-window-drag` 的盒子变成窗口拖拽区）。
- **布局形态（2026-10-24 晚二次优化）**：主面板**占满全宽**（无限宽留白）；主体 `.ztp-body` 是
  **左列表 / 右详情双栏**（`.ztp-list-col` flex:1.2 + 右侧分隔线，`.ztp-detail-col` flex:1）——点左侧
  卡片右侧常驻显示 DetailView（未选中显示占位），选中卡片带 `.on` 高亮（左彩条类型色描边），
  切 tab 清详情；窄容器（悬浮兜底 <720px）媒体查询退化为详情**覆盖**列表（`.has` 控制，返回按钮
  仅此时显示，宽屏 `.ztp-detail-col .ztp-back{display:none}`）。头部两层——`.ztp-mast`（46px 标题行：
  图标标记 + 「禅道」+ 实例主机名 + 账号 chip + 刷新/登出）与 `.ztp-head`（纯分段 tab 行，未配置/
  登录视图时不渲染）；卡片顶行合并（tag+#id 左、状态/P/严重/截止/创建人右贴 `ztp-top-meta`，窄容器
  wrap 不破版），标题独占一行 13.5px；`.ztp-root` 加了 `position:relative` 作账号弹层定位基准
  （`ztp-acct-pop` top 对齐 mast 底部）。
- 主题：暗色是 `body[data-ds-dark-theme]`，颜色全走 `--dsw-alias-*`（bg-layer-1/2/3、border-l1..l4、
  label-primary/secondary/tertiary/caption、interactive-bg-hover(-solid)、state-{business,error,success,warn}-*、
  button-primary-fill + label-primary-foreground、toast-bg/label、bg-skeleton、radius-sm/md/lg、shadow-lv1..3）。
  **旧代码里的 `--dsw-alias-border-subtle`、`--dsw-alias-bg-canvas-subtle`、`--dsw-alias-border-strong` 根本不存在**，
  一直回落到 `#fff` 兜底色——这就是夜间模式错色的根因，改样式时不要再写这些名字。
- 旧版 DSH 没有 `main`/`sidebar.panellist` slot 时（2.5s 内没注册上），插件退回 `shell.overlay`
  悬浮按钮 + 侧滑面板（同一套组件）。
- **历史（2026-10-23~24 曾用右侧栏 `sidebarRightTabs` 入口，已弃用）**：右栏 per-session（surface 存 `store.bySession[sessionId]`），当时的 keepMounted/面板跟随两层修补已随全局面板删除，paneCache 保留。若回右栏形态，`sidebar.right.pane.tab(.title)` 的 key 用 tab 类型 **id**（`entryKey = definition.id ?? tab.kind`）、`MAX_DESCRIBED_ENTRIES=4`（第 5 张引导卡片起不显示 description）两条坑仍有效。

### 6. 设计决策记录

- **不做 npm 依赖**：host 侧纯 Node 内置（fetch/crypto/fs），避免 peerDependencies 版本地狱（dsh-zentao 的 README 专门警告过 semver 匹配拒绝安装的问题）
- **client 免构建**：手写 `window.__ModuleLoader__.load` 包装的 CJS 风格 bundle（dsh-notify-me 模式），不用 esbuild——改动即时生效，代价是不能用 JSX（全用 `h()` createElement）
- **RPC 通道选型**：直接挂自己 inject 的 webServer（dsh-pocket v2 模式），回退 `ctx.connection.rpc.handle`；不复刻浏览器 cookie 认证（loopback-only 信任栅栏足够）
- **缓存 60s**：面板展开不重复打禅道；「刷新」按钮带 `refresh:true` 强刷
- **卡片统一模型**：`{kind, id, title, status, pri, severity, deadline, assignedTo, openedBy, execution, product, url, descBrief, images}`，Markdown 生成在 client 的 `cardToMarkdown()`
- **详情只读改版（2026-10-25 用户要求）**：DetailView 移除全部按钮/链接（会话 chip、插入对话、处理、在禅道打开；「返回」仅在窄容器覆盖模式 <720px 保留），动作全部在左侧卡片上；禅道超链接迁到卡片顶行 #id 旁的小图标 `ztp-zlink`（stopPropagation + `draggable:false` 防链接拖拽覆盖卡片 Markdown 拖拽）。详情图片改为**真实截图画廊** `DetailImages`：`zentao.image` RPC 逐张取字节 → `data:<type>;base64` 直接渲染（DSH 会话 UI 渲染附件图片就是 data:/blob:，主窗口无 CSP 拦截；`--dsw-alias-link` token 已在 asar 源码确认存在），逐张独立落位、单张失败虚线占位、点击全屏放大再点关闭；描述文本用 `stripImageMarkers()` 去掉 `[图片：xxx]` 占位。渲染路径曾用一次性冒烟脚本验证（假 React + 可用 hooks，未入仓库），`test/client.mjs` 93 项不受影响
- **「插入对话」改版（2026-10-25 用户要求，见 §4.5）**：从「插入当前会话输入框」改为弹层式新会话——同「处理」弹层选工作区/模型/思考强度，但建会话后 `uiWorkspace.openSession` **自动跳转**过去、只填草稿+附件**不自动发送**；共用 `createDraftSession` 前段（create 并行图片预取 → retain('zentao-panel') → setDraft），跳转后释放自己的 retain（mainView 接管保活）。失败降级链保留：新会话建不成/接口缺失 → `insertToCurrentChat` 插当前会话输入框（旧版行为）→ 剪贴板
- **多账号（M5，2026-10-24）**：
  - 配置 schema v2：`config.json` = `{version:2, accounts:[{id, baseUrl, account, alias?, password(b64), cookies, savedAt}], activeId}`；
    **旧单账号格式读取时自动迁移**（`store.readConfig()` 里做，不在读取时改写文件），`readConfig()` 同时保留 `baseUrl/account/alias/password/cookies` 兼容字段（取激活账号），smoke/host 测试不用改
  - 账号 id = `sha1(baseUrl + '\n' + account)` 前 12 位 → 同地址同账号重复登录 = upsert（更新凭据重置登录态），不是新增
  - **账号别名（2026-10-25 新增）**：`store.normAlias()`（trim + 30 字截断，空 = 清除）；账号会话持 `alias`（getter/setAlias，snapshot 透出）；`configure` 不传 alias 时**沿用旧值**（重新登录不抹别名），login RPC 只在 trim 后非空才带该字段（防 upsert 误清）；新 RPC `zentao.rename {id, alias}`（alias 必须是 string，空串 = 清除；未知 id → bad-request）；`zentao.status` 顶层与 `accounts[]` 每项带 `alias`。client：`acctDisplayName(a)`（别名优先，进 `_test`）用于头部 chip/页脚/菜单主名；`AccountSwitcher` 行内编辑（`editing={id,value}` state，回车/✓ 保存、Esc 取消、✎ 按钮 stopPropagation）——**fake useState 恒 null，测试只能覆盖展示路径**，编辑交互靠真机；`LoginView` 加可选「别名（可选）」输入框
  - `service.mjs`：`createAccountSession()` 每账号独立 client/cookie jar/缓存/登录去重/探活节流；service 层持有 `Map<id, session>` + `activeId`，所有取数只作用于激活账号；登录成功经 `onLoginSaved` 回调整体落盘
  - RPC：新增 `zentao.switch {id}`；`zentao.logout {id?}`（不传 = 移除激活账号）；`zentao.rename {id, alias}`；`zentao.status` 返回值多 `activeId` + `accounts[]`（含 alias）
  - client：头部账号 chip（`.ztp-acct`）点开 `AccountSwitcher` 弹层（切换/添加/改别名/按账号移除）；切换用持久化 cookie 即时生效；`LoginView` 复用（`mode:'add'` 带取消按钮）；切换/移除后 `mine`/`detail` 先清空再由 effect（依赖 `activeId`）重拉
  - 移除激活账号 → 自动切到剩余第一个；最后一个移除 → `clearConfig()`

## 剩余任务（按优先级）

### 1. 真机验证 M1+M2+M3（第一件事，代码全部完成）
重载 DSH Desktop（client 改动 ⌘R 即可；host 改动才需要重装 + 重启）→ 左侧栏应在
「记忆系统」图标下方出现「禅道」图标行（dsh-mnemon 同款）→ 点击 → 主区域变成禅道面板 →
登录 → 列表 → 详情 → 「插入对话」/「处理」。
- host 侧如果没激活，看桌面版日志（插件加载警告会打在启动输出里）
- client 侧如果没出现：先 `node test/client.mjs` 确认注册契约没坏；再看 console 里 `[dsh-zentao-panel]` 前缀的报错；
  右缘悬浮按钮出现说明走的是兜底路径（没拿到 `main`/`sidebar.panellist` slot）
- M3 插入对话（2026-10-25 已改弹层式，见 §4.5）：点「插入对话」→ 同款 `DispatchDialog` 弹层
  （标题「插入到新会话 …」、按钮「新建并跳转」）→ 确认后 `insertToNewSession`：建会话 → setDraft →
  **`uiWorkspace.openSession` 自动跳转过去** → selectModel 与图片附件后台继续 → **不 submit**。
  真机重点验证：① 确认后**自动切到新会话**且文本草稿已就位、图片稍后落附件 rail、**不会自动发送**；
  ② 「处理」行为不变（后台发送、留在面板）；③ 手动发送后卡片亮「处理中」徽标（insert 也存会话关联）。
  失败降级链保留：新会话建不成/接口缺失 → 插入**当前会话**输入框（服务级 setDraft 优先，DOM 兜底
  `[data-composer-input]`，再兜底剪贴板）。**仅 client 改动，⌘R 即可生效，无需重装**
- M3 图片附件（2026-10-23 新增，host 有改动 → **必须重启桌面版**才生效）：列表卡片或详情点「插入对话」→
  输入框上方应出现图片缩略图（附件 rail），发送后消息里是真实图片；「处理」新会话同理。
  若只看到文本 + toast「图片未能附加」，说明 host 还是旧代码（`zentao.image` 404）或禅道图片下载失败，看 console/日志
- M3 处理（弹层式 + **不自动跳转**，见 §4.2）：弹层选工作区/模型/思考强度 → create → retain 后台保活 →
  selectModel → setDraft + 250ms submit（被拒只留草稿；服务缺失降级插当前会话）。真机重点验证：
  ① 下发后**视图停在禅道面板**，toast「已在后台新会话发送…卡片标签可跳回」；② 点会话 chip 跳到新会话，
  草稿/图片就位；③ 弹层三个下拉默认项合理（工作区=当前会话归属；模型/思考强度=当前会话在用）、
  改选后新会话确实落在所选位置和模型上。**仅 client 改动，⌘R 即可生效，无需重装**
- M4 关联会话 chip（2026-10-24，见 §4.3）：「处理」成功 → 卡片 actions 行左侧出现会话 chip（显示
  `sessions.list` 的 `displayTitle`）→ 切到别的会话后点 chip 应回到处理时创建的那个会话；再点一次「处理」
  → chip 更新为最新会话；把该会话删掉 → chip 显示「会话已删除」，点击清除并 toast。**仅 client 改动，⌘R 生效**
- M2 左侧栏入口（2026-10-24 更晚，见 §5.1）：左侧栏「记忆系统」下方出现「禅道」图标行 → 点击主区域
  变禅道面板（登录/列表/详情照常）→ 再点侧栏顶部「新建会话」或任一会话 → 回会话视图 → 再点「禅道」
  图标 → 面板回来且列表瞬时恢复（paneCache，不闪骨架）。真机重点验证：① 面板打开时点「处理」并下发
  → **视图仍停在禅道面板不跳转**（§4.2 末），点卡片会话 chip 或提醒 toast 的「去看看」才切到该会话视图
  （openSession 内部 selectPanel(null)）；② macOS 顶部内容不被交通灯
  遮挡、顶部空白区可拖拽窗口（data-window-drag）；③ 侧栏收起成 rail 时图标只剩图标 + tooltip「禅道」；
  ④ 右侧栏不再出现禅道 tab/引导卡片（旧入口已删）。**仅 client 改动，⌘R 生效**
- M6 实时状态（2026-10-24，见 §4.4）：点「处理」下发后回到禅道面板 → 该卡片 KindTag 旁出现蓝色
  「处理中」胶囊（三点跳动）、会话 chip 前有闪烁小点；切到别的会话/面板等它跑完 → 底部弹常驻 toast
  「任务完成 …」带「去看看」（点击跳回该会话），卡片徽标变绿色「已完成」；若 agent 中途 ask 了 →
  toast「需要你决策 …」+ 卡片琥珀色「等你决策」胶囊（呼吸描边）；点开该会话看完 → 徽标消退只剩 chip。
  注意：**正开着的会话完成不会弹 toast**（completionUnread 只在后台会话置位，宿主语义）；
  ⚠️ 若已装 dsh-notify-me，它也会对同一事件发系统通知（两条是不同通道，可自行关掉其一）。
  **仅 client 改动，⌘R 生效**
- M6 进度持久化 + 清理（2026-10-25，见 §4.6）：① 「处理」→ 会话跑完 → 卡片绿「已完成」→
  **点开该会话看完**（实时徽标本应消失）→ 回面板卡片**仍显示绿色「已完成」**（粘性进度记录，
  hover 徽标 title 带「更新于 …」时间）；② **重启 DSH Desktop** → 打开禅道面板 → 已完成事项的
  「已完成」徽标**立即可见**（states.v1 兜底，不等监控就绪）；DSH 关闭期间后台会话跑完的也能看到；
  ③ 在禅道把某张处理过的卡完结/转派（离开「指派给我」列表）→ 8h 后面板任一次拉取成功时，
  该卡的会话 chip 与徽标一起消失（links/states 条目被清；验证可临时把 `LINK_GRACE_MS` 调小）；
  ④ 重启后正在跑的 turn 若已死，**不**显示「处理中」（瞬态兜底只在监控未就绪的过渡期生效）。
  **仅 client 改动，⌘R 生效**
- 改完代码后重装：`dsh plugin --profile desktop remove dsh-zentao-panel && dsh plugin --profile desktop add /path/to/dsh-zentao-panel`，再重启桌面版
- 测试现状（2026-10-25 复跑全绿）：`test/client.mjs` **298 项**（注册契约 8 项 +「处理」弹层/下发/时序/
  不跳转 +「插入对话」10 项（§4.5）+ M6 22 项（§4.4）+ 进度持久化 29 项（§4.6）+ **列表三件套 56 项**
  （§4.7：搜索排序 25 项含 smart 融合实时状态、mine.v1 7 项、replies/fetchLastReply 24 项含 Markdown 渲染 10 项）
  + **会话头部反向跳转 13 项（§4.3 末）** + **账号别名 5 项（§6 多账号节：acctDisplayName 纯函数 +
  AccountSwitcher 展示/编辑态结构——fake useState 恒 null 只能测展示路径，行内编辑交互靠真机）**
  + **附加指令 7 项 + 指令模板预设 8 项 + 完成闭环 4 项（§4.11）+ 快捷筛选 6 项（§4.12）
  + 一键复制 4 项 + 旗标隐藏 7 项（含 cleanup marks、隐藏计数随列表减少）+ 极速重发 3 项（§4.13）+ 本地备注 5 项 + 继续处理 6 项（§4.14）+ 回复摘要行 2 项 + 决策应答台 1 项（§4.15）+ 流程看板 5 项（§4.16，列内类型分组）**）
  ——DetailView 首次进 _test；chips 类组件断言要 children.flat(2)（map 出的是嵌套数组，§4.8 同坑，
  指令模板与 QfBar 各踩一次）、
  `multi` 42 项（别名 11 项 + **fetchImage 缓存 6 项（§4.10）**）、`protocol` 15 项（+actions/stories 拼写 5 项，§4.8）；`host.mjs` 21+6 项
  （真机 20 张卡片；actions 透传 + story detail 2 项为 §4.8 新增；**别名 6 项 + fetchImage 缓存已 2026-10-25
  用真实凭据复跑全绿**；host.mjs 凭据解析已改为「环境变量 → $DSH_HOME 配置激活账号 → 只读兜底真实
  ~/.dsh 配置的激活账号」，空 scratch 目录一条命令 `DSH_HOME=/tmp/zt-host node test/host.mjs` 即可全绿，
  登录失败（凭据错/账号锁）会明确报错退出而非崩栈）、`smoke.mjs` 需真实禅道凭据。

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
