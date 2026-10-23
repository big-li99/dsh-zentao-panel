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
| M2 client 侧边栏 UI | ✅ 代码完成，未经真实 DSH 界面验证 |
| M3 插入输入框 + 新会话下发 | ⏳ 插入输入框有初版实现（composer 选择器是猜测，需真机适配）；新会话下发未开始 |
| M4 打磨 | ⏳ 未开始 |

测试命令（**依赖内网禅道可达**）：
```bash
DSH_HOME=/tmp/zt-smoke node test/smoke.mjs   # 直连真实禅道验证 client/service 层
DSH_HOME=/tmp/zt-host  node test/host.mjs    # apply() + RPC wire 协议端到端（mock ctx）
```
测试文件里硬编码了禅道地址/账号/密码（用户提供的开发凭据）——**发布前必须参数化**，且永远不要把凭据提交到 git。

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
│   ├── service.mjs      # 聚合层（卡片模型/缓存/自动重登）
│   ├── store.mjs        # ~/.dsh/zentao-panel/config.json 持久化（0600）
│   └── rpc.mjs          # /dsh-zentao-panel loopback RPC（wire 协议复刻 dsh-pocket）
├── client/
│   └── client.js        # client 半边（免构建手写 bundle，React 经 DSH 模块系统）
└── test/
    ├── smoke.mjs        # 真实禅道集成测试
    └── host.mjs         # host 插件端到端测试（mock cordis ctx）
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

**登录成功后**获得长期 cookie：`za`（账号）、`zp`（免密 hash）、`keepLogin=on`——**30 天免登**。只需持久化 cookie 即可，之后 `GET /my-work-*.json` 直接口令通。会话失效的特征：响应里出现 `user-login` 字样（lib 里的 SESSION_EXPIRED 错误码）。

### 3. 数据接口（登录态 cookie 下）

| 数据 | 接口 | 备注 |
|---|---|---|
| 我的任务/需求 | `GET /my-work-task.json`、`/my-work-story.json` | 双层 JSON：外层 `{status:'success', data:'<json字符串>'}`，`data` 要二次 parse |
| 我的 Bug | `GET /my-work-bug.json` | 同上 |
| 单条详情 | `GET /api.php/v1/tasks/{id}` 等 | 一次一个，字段全（pri/deadline/desc/steps/spec HTML/assignedTo 对象…） |

注意：**my-work 列表的 `id` 是字符串，v1 详情的 `id` 是数字**——比较时统一 `Number()`（已在 `toCard()` 处理，但新代码容易再踩）。story 列表是 dict（按 id 索引）不是数组。

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

### 6. 设计决策记录

- **不做 npm 依赖**：host 侧纯 Node 内置（fetch/crypto/fs），避免 peerDependencies 版本地狱（dsh-zentao 的 README 专门警告过 semver 匹配拒绝安装的问题）
- **client 免构建**：手写 `window.__ModuleLoader__.load` 包装的 CJS 风格 bundle（dsh-notify-me 模式），不用 esbuild——改动即时生效，代价是不能用 JSX（全用 `h()` createElement）
- **RPC 通道选型**：直接挂自己 inject 的 webServer（dsh-pocket v2 模式），回退 `ctx.connection.rpc.handle`；不复刻浏览器 cookie 认证（loopback-only 信任栅栏足够）
- **缓存 60s**：面板展开不重复打禅道；「刷新」按钮带 `refresh:true` 强刷
- **卡片统一模型**：`{kind, id, title, status, pri, severity, deadline, assignedTo, openedBy, execution, product, url, descBrief}`，Markdown 生成在 client 的 `cardToMarkdown()`

## 剩余任务（按优先级）

### 1. 真机验证 M1+M2+M3（第一件事，代码全部完成）
重启 DSH Desktop → 看右缘悬浮「禅道」按钮是否出现 → 登录 → 面板数据 → 详情 → 「⤵ 插入对话」/「▶ 处理」。
- host 侧如果没激活，看桌面版日志（插件加载警告会打在启动输出里）
- client 侧如果没出现：检查 `dsh.client.inject` 声明（当前是 session-controller / connection / ui-conversation / ui-slots / ui-workspace 五个）与 slot 注册是否成功（console 有 `[dsh-zentao-panel]` 前缀的报错）
- M3 插入对话：服务级 setDraft 优先（当前主视图会话），DOM 兜底 `[data-composer-input]`（contenteditable + execCommand insertText），再兜底剪贴板
- M3 处理（新会话下发）：`sessions.create({cwd})` 继承当前会话工作目录 → `uiWorkspace.openSession` → `conversation.input.for(scope).setDraft` + 延迟 250ms `submit()`；服务不可用时降级插入当前会话。真机重点验证：新会话 composer 挂载时序（250ms 是否够，不够就调大或改事件驱动）
- 改完代码后重装：`dsh plugin --profile desktop remove dsh-zentao-panel && dsh plugin --profile desktop add /path/to/dsh-zentao-panel`，再重启桌面版
- M1 host 半边与 RPC 已在 test/host.mjs 全绿（13 项，2026-10-23 22:00 复跑通过）

### 2. M4 打磨
- 自动刷新（面板打开时轮询，间隔可选——计划书里定的 30s/1m/5m/10m/关闭）
- 错误提示完善（禅道不可达/密码改了/会话失效重登失败）
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
