# dsh-zentao-panel

DeepSeekRuntime 的禅道（ZenTao）工作台插件：在 DSH 右侧栏「开始」页里以一张
**禅道**卡片作为入口（与内置的「上下文」「工作区文件」同款形式），点开后在右侧栏
作为 tab 查看**指派给我**的任务 / Bug / 需求，一键把卡片转成 DSH 对话上下文。

## 功能

- 右侧栏 tab：任务 / Bug / 需求三个分段标签，卡片列表 + 详情；
- **多账号**：可保存多个禅道账号（同实例换账号、多实例混用都行），头部账号菜单一键切换，
  切换即时生效不用重新登录（每账号独立 cookie/缓存），也可按账号移除；
- 卡片拖拽/点击插入对话输入框（精简 Markdown：标题 + 描述/重现步骤，不带元信息/原地址/页脚）；
- **描述里的截图变成真实图片**：插入时把禅道 `<img>`（含列表接口的 `{35861.png}` 占位符）
  下载下来，作为 DSH 图片附件挂到输入框，发送后模型真的能看到图；
- 「处理」按钮：先弹窗选**工作区**和**模型**（默认带出当前会话的在用项），确认后新建会话并自动
  下发任务背景提示词（含图片附件）；
- 登录态持久化（30 天免登），会话失效自动重登；
- 全部颜色走 DSH 语义 token（`--dsw-alias-*`），日间 / 夜间自动跟随；
- 只读，不回写禅道。

## 开发进度

- **M0** ✅ 禅道 API 探测（见《计划书.md》附录 A）
- **M1** ✅ host 插件：登录（30 天免登 cookie）/ my-work 三接口 / v1 详情 / loopback RPC
- **M2** ✅ client 入口：右侧栏 tab 类型 + 「开始」页引导卡片（参照 dsh-context 的「上下文」）；
  旧版 DSH 没有 `sidebarRightTabs` 时自动退回悬浮按钮 + 侧滑面板
- **M3** ✅ 插入输入框（服务级 setDraft + 真实图片附件 → composer DOM → 剪贴板兜底）+ 新会话下发
- **M4** ⏳ 自动刷新、错误提示打磨
- **M5** ✅ 多账号：配置 schema v2（accounts[] + activeId，旧单账号自动迁移）、
  每账号独立 client/cookie/缓存、账号菜单切换/添加/按账号移除

## 测试

```bash
node test/client.mjs                          # client 半边：bundle 装载 + 右侧栏注册契约（无需 DSH）
node test/multi.mjs                           # 多账号：store 迁移/切换/缓存隔离/移除（mock，不打网络）
DSH_HOME=/tmp/zt-smoke node test/smoke.mjs    # 直连真实禅道验证 client/service（需内网可达）
DSH_HOME=/tmp/zt-host  node test/host.mjs     # apply() + RPC wire 协议端到端（mock ctx，真实禅道）
```

（smoke/host 的禅道地址与账号来自 `ZENTAO_BASE`/`ZENTAO_ACCOUNT`/`ZENTAO_PASSWORD`
环境变量或 `~/.dsh/zentao-panel/config.json`，不落 git。）

## 安装

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
  "accounts": [ /* { id, baseUrl, account, password(base64 混淆), cookies } */ ],
  "activeId": "当前激活账号的 id"
}
```

账号 id 由 `baseUrl + account` 哈希得到，同账号重复登录等于更新凭据；旧版单账号
格式读取时自动迁移，无需手动处理。卸载插件后文件不会自动删除，需要时手动清理。

## 技术说明

数据链路（ZenTao 18.13 开源版实测，RESTful API v2 在该实例不可用）：

- 网页登录协议：`md5(md5(password) + verifyRand)` 加密 + jQuery 风格请求头；
- 数据主通道：`/my-work-{task,bug,story}.json`（登录态 cookie，一次拿全量）；
- 详情：`/api.php/v1/{tasks,bugs,stories}/{id}`。

界面挂载（DSH 0.2.1-rc.2 源码确认）：

- `sidebarRightTabs.register({id, kind, title, guide:[{title, description, icon}]})`
  注册右侧栏 tab 类型与「开始」页引导卡片；
- `sidebar.right.pane.tab` / `.title` 两个 keyed slot 提供 tab 正文与标题，
  **key 用 tab 类型的 id**（`TabSlot` 的 entryKey = `definition.id ?? tab.kind`）；
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
