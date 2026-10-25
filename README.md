# dsh-zentao-panel

DeepSeekRuntime 的禅道（ZenTao）工作台插件：在 DSH **左侧边栏**里以一个**禅道**图标
作为入口（与「记忆系统」同款形式，位于其下方），点开后禅道面板占据主区域，查看
**指派给我**的任务 / Bug / 需求，一键把卡片转成 DSH 对话上下文。

## 功能

- 左侧栏全局面板：任务 / Bug / 需求三个分段标签，卡片列表 + 详情；
- **列表搜索与排序**：tab 行右侧搜索框按标题 / #ID / 状态 / 创建人实时过滤（多词空格分隔、
  全命中才显示），排序可选「智能排序」（逾期 > 临期 > 按截止 > 按优先级，已完结沉底）/
  按截止 / 按优先级 / 默认顺序；**截止临期（≤3 天）橙色、逾期红色**高亮，一眼看到最急的活；
- **快捷筛选条**：列表上方一键过滤「等你决策 / 处理中 / 逾期 / 今天到期 / 已完成」（跨任务/Bug/需求
  合并展示，计数随搜索联动），比切排序更直接；
- **秒开与离线兜底**：列表按账号快照在本机，DSH 重启或重开面板先显示上次列表（页脚带
  「HH:mm 缓存」时间）再后台刷新；禅道暂时连不上也能看到旧数据而不是一片空白；
- **处理结果回读**：处理完的卡片在详情页直接显示**关联会话里 agent 的最新回复摘要**
  （点开详情且已完成后自动读取并缓存，也可手动「重新读取」），不用切过去翻会话；
- **多账号**：可保存多个禅道账号（同实例换账号、多实例混用都行），头部账号菜单一键切换，
  切换即时生效不用重新登录（每账号独立 cookie/缓存），也可按账号移除；每个账号可设
  **别名**（账号菜单里点 ✎ 行内编辑，或添加账号时填写），头部账号 chip 与页脚显示别名、
  原账号+实例地址下沉到副行，多个账号一眼区分（别名只存本机，最多 30 字，留空即清除）；
- 卡片拖拽进对话输入框（精简 Markdown：标题 + 描述/重现步骤，不带元信息/原地址/页脚）；
- **「插入对话」按钮**：先弹窗选**工作区**、**接入的模型**与**思考强度**（同「处理」），确认后新建会话、
  **自动跳转过去**，任务背景与截图已填入草稿，**不会自动发送**——检查/改完再点发送；
- **描述里的截图变成真实图片**：插入时把禅道 `<img>`（含列表接口的 `{35861.png}` 占位符）
  下载下来，作为 DSH 图片附件挂到草稿，发送后模型真的能看到图；
- 「处理」按钮：先弹窗选**工作区**、**接入的模型**（按接入方分组）和**思考强度**（默认带出当前会话的
  在用项），确认后新建会话、按所选模型设置并自动下发任务背景提示词（含图片附件）；下发**不会跳转视图**，
  你仍留在禅道面板继续挑活，卡片上会亮出该会话的状态与入口（要过去再点 chip）；
- **关联会话跳转**：处理过的卡片左侧会出现会话 chip（显示该 DSH 会话标题），点击即可跳回那个会话
  继续跟进；会话被删除后 chip 显示「会话已删除」，点击清除标记。关联按禅道账号隔离，只存本机
  localStorage，不落任何远端；
- **实时状态（处理中的任务一目了然）**：处理过的卡片 chip 前有活性状态点；会话在跑 → 卡片亮蓝色
  「处理中」胶囊（三点跳动）；agent 等你拍板 → 琥珀色「等你决策」（呼吸描边）；后台会话跑完 →
  绿色「已完成」徽标，同时弹提醒条，点「去看看」直接跳回那个会话。提醒不依赖面板是否打开
  （正开着的会话完成不重复提醒；装了 dsh-notify-me 的话系统通知照发，两条通道独立）；
- **详情页「最近动态」**：同事备注 / 流转记录（指派、转派、优先级与截止日变更）/ 字段新旧值对照，
  以时间线直接显示在详情里（默认折叠显示最近 5 条，可展开全部；备注里的截图也以真实图片渲染），
  不用切回禅道网页看讨论；
- **自动轮询 + 在线状态 + 新指派提醒**：面板打开时每 5 分钟静默刷新；标题旁连接小点
  （绿 = 已连 / 红 = 不可达），禅道连不上时列表上方常驻提示条（展示缓存时间、可重试）；
  轮询到**新指派**弹提醒（「禅道新指派 2 条（任务×1 · Bug×1）」），按账号记忆不重复提醒；
- **一键复制 / 旗标隐藏 / 极速重发**：卡片复制「#ID 标题」贴 IM、详情复制完整 Markdown；
  卡片可打旗标（「已标记」一键筛选）或本地隐藏（页脚找回）；⚡ 按上次配置直接重发同类任务；
- **批量处理 / 批量插入**：多选模式跨分类勾选一批事项，合并成一份任务背景一次下发
  （图片合并上限 20 张）；每张卡片都关联同一会话，徽标 / chip 照常工作；
- **详情图片双层缓存**：看过的截图 client + host 各缓存一份，重开详情 / 面板切回 /
  详情看过的图点「处理」都不再重新转圈；
- **下发「附加指令」**：「处理 / 插入」弹层可选输入框（如「只分析定位原因，先不要改代码」），
  拼到任务背景末尾，单卡与批量共用；记住上次输入，且支持**多套模板预设**（chip 一键填入、
  × 删除、「存为预设」新增，最多 12 条）；
- **完成后一键去禅道闭环**：卡片绿勾（已完成）后详情页出现「去禅道标记完成」，深链到禅道的
  完成 / 解决 / 关闭操作页，由你确认提交——插件保持只读；
- 登录态持久化（30 天免登），会话失效自动重登；
- 全部颜色走 DSH 语义 token（`--dsw-alias-*`），日间 / 夜间自动跟随；
- 只读，不回写禅道。

## 开发进度

- **M0** ✅ 禅道 API 探测（见《计划书.md》附录 A）
- **M1** ✅ host 插件：登录（30 天免登 cookie）/ my-work 三接口 / v1 详情 / loopback RPC
- **M2** ✅ client 入口：左侧栏全局面板（`sidebar.panellist` 图标行 + `main` keyed 面板，
  参照 dsh-mnemon 的「记忆系统」）；旧版 DSH 没有这两个 slot 时自动退回悬浮按钮 + 侧滑面板
- **M3** ✅ 「插入对话」弹层式新会话（选工作区/模型 → 建会话 → 自动跳转 → 只填草稿不自动发送；
  服务缺失时降级：服务级 setDraft → composer DOM → 剪贴板）+
  「处理」新会话下发（后台 retain 保活 + 自动发送，不打断当前视图）
- **M4** ✅ 打磨：自动轮询（5 分钟）+ 在线/离线状态 + 新指派提醒；列表搜索/排序/逾期高亮；
  快照秒开 + 离线兜底；批量处理/批量插入；详情图片双层缓存；下发「附加指令」；完成后一键去禅道闭环
- **M5** ✅ 多账号：配置 schema v2（accounts[] + activeId，旧单账号自动迁移）、
  每账号独立 client/cookie/缓存、账号菜单切换/添加/按账号移除
- **M6** ✅ 实时状态：卡片活性徽标（处理中/等你决策/已完成）+ 完成/等决策常驻提醒
  （信号来自 DSH 宿主 `uiSession.sessionStatus`，零轮询）+ 处理进度持久化（重启后徽标恢复）
- **M7** ✅ 详情页「最近动态」时间线（v1 actions：备注/流转/字段变更，折叠展示、备注截图真实渲染）；
  修复需求（story）详情自 M3 起一直 404 的问题——v1 路径复数是 `stories`，此前误拼成 `storys`

## 测试

```bash
node test/client.mjs                          # client 半边：bundle 装载 + 注册契约 + 纯函数（无需 DSH）
node test/multi.mjs                           # 多账号：store 迁移/切换/缓存隔离/移除（mock，不打网络）
node test/protocol.mjs                        # 禅道响应信封协议 + actions 映射（stub fetch，不打网络）
DSH_HOME=/tmp/zt-smoke node test/smoke.mjs    # 直连真实禅道验证 client/service（需内网可达）
DSH_HOME=/tmp/zt-host  node test/host.mjs     # apply() + RPC wire 协议端到端（mock ctx，真实禅道）
```

（smoke/host 的禅道地址与账号来自 `ZENTAO_BASE`/`ZENTAO_ACCOUNT`/`ZENTAO_PASSWORD`
环境变量或 `~/.dsh/zentao-panel/config.json`，不落 git。）

## 安装

从 npm 安装（推荐）：

```bash
DSH="/Applications/DeepSeekRuntime.app/Contents/Resources/runtime/cli/bin/dsh"
"$DSH" plugin --profile desktop add dsh-zentao-panel
```

或从源码安装：

```bash
git clone https://github.com/big-li99/dsh-zentao-panel.git
DSH="/Applications/DeepSeekRuntime.app/Contents/Resources/runtime/cli/bin/dsh"
"$DSH" plugin --profile desktop add "$(pwd)/dsh-zentao-panel"
```

重启 DSH Desktop 生效（client 侧改动一般 ⌘R 重载渲染进程即可；host 侧改动需重装插件后重启）。

## 卸载

```bash
"$DSH" plugin --profile desktop remove dsh-zentao-panel
# 可选：清除本地凭据
rm -rf ~/.dsh/zentao-panel
```

## 配置

登录信息保存在 `~/.dsh/zentao-panel/config.json`（权限 0600，仅本机），schema v2：

```jsonc
{
  "version": 2,
  "accounts": [ /* { id, baseUrl, account, alias?, password(base64 混淆), cookies } */ ],
  "activeId": "当前激活账号的 id"
}
```

账号 id 由 `baseUrl + account` 哈希得到，同账号重复登录等于更新凭据（已有别名保留，
不会被登录覆盖）；`alias` 为本机显示别名（可选，≤30 字）。旧版单账号
格式读取时自动迁移，无需手动处理。卸载插件后文件不会自动删除，需要时手动清理。

## 技术说明

数据链路（ZenTao 18.13 开源版实测，RESTful API v2 在该实例不可用）：

- 网页登录协议：`md5(md5(password) + verifyRand)` 加密 + jQuery 风格请求头；
- 数据主通道：`/my-work-{task,bug,story}.json`（登录态 cookie，一次拿全量）；
- 详情：`/api.php/v1/{tasks,bugs,stories}/{id}`。

界面挂载（DSH 0.2.1-rc.2 源码确认）：

- 左侧栏全局面板（dsh-mnemon 同款机制）：`sidebar.panellist` 列表 slot 注册图标行
  `{id, order, label}`，同 id 在根作用域 `main` keyed slot 注册面板组件——
  点图标即 `ctx.layout.selectPanel(id)`，面板占据整个主区域（与「插件管理」页同机制）；
- `main` slot 按 `entryKey = activePanelId ?? 'conversation'` 只渲染当前选中面板，
  切回会话时面板卸载，重挂由模块级 `paneCache` 秒恢复列表（不闪加载）；
- **用户主动跳转**（会话 chip / 提醒条「去看看」）走 `uiWorkspace.openSession`，其内部
  `replaceMain(..., "reveal")` → `selectPanel(null)`，会自动切回会话视图；
- 「处理」下发**不**走 `openSession`（那会强制切视图）：改为
  `sessions.retain(sessionId, {source:'zentao-panel'})` 后台保活，`conversation.input.for(scope)`
  的服务级 setDraft / addAttachments / submit 不需要视图挂载，发送完成后释放 retain；
- 旧版 DSH 没有这两个 slot 时自动退回右缘悬浮按钮 + 侧滑面板；
- 颜色只用 `--dsw-alias-*` 语义 token，暗色由 `body[data-ds-dark-theme]` 自动切换。

真实图片附件（DSH 0.2.1-rc.2 源码确认）：

- 宿主用登录态 cookie 下载禅道图片，RPC `zentao.image` 返回 `{name, mediaType, base64}`；
- 渲染端 `new File([bytes], name, {type})` →
  `conversation.createDrafts(sessionId, files)` 拿到 draft id →
  `conversation.input.for(scope).addAttachments(ids)`；
  `addAttachments` **只接受已注册的 draft id**，不直接收 File；
- 用户消息不渲染 markdown，所以图片只能走附件通道；发送后是模型可见的 image block；
- 仅支持 png/jpeg/webp/gif，单图 ≤20MB、单边 ≤8192、单消息 ≤20 张；超大截图会先在
  浏览器里缩到 2048 长边再附加（DSH 宿主本来也会归一化到 ≤2048）。
- 模型不支持图片输入时宿主会拒绝整条 prompt（DSH 自身会提示「当前模型不支持图片」），
  此时可在输入框里移除图片附件后发送。

详见《计划书.md》附录 A。

## License

MIT
