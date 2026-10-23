# dsh-zentao-panel

DeepSeekRuntime 的禅道（ZenTao）工作台插件：在 DSH 右侧栏「开始」页里以一张
**禅道**卡片作为入口（与内置的「上下文」「工作区文件」同款形式），点开后在右侧栏
作为 tab 查看**指派给我**的任务 / Bug / 需求，一键把卡片转成 DSH 对话上下文。

## 功能

- 右侧栏 tab：任务 / Bug / 需求三个分段标签，卡片列表 + 详情；
- 卡片拖拽/点击插入对话输入框（Markdown 任务卡）；
- 「处理」按钮：新建会话并自动下发任务背景提示词；
- 登录态持久化（30 天免登），会话失效自动重登；
- 全部颜色走 DSH 语义 token（`--dsw-alias-*`），日间 / 夜间自动跟随；
- 只读，不回写禅道。

## 开发进度

- **M0** ✅ 禅道 API 探测（见《计划书.md》附录 A）
- **M1** ✅ host 插件：登录（30 天免登 cookie）/ my-work 三接口 / v1 详情 / loopback RPC
- **M2** ✅ client 入口：右侧栏 tab 类型 + 「开始」页引导卡片（参照 dsh-context 的「上下文」）；
  旧版 DSH 没有 `sidebarRightTabs` 时自动退回悬浮按钮 + 侧滑面板
- **M3** ⏳ 插入输入框（服务级 setDraft → composer DOM → 剪贴板兜底）+ 新会话下发
- **M4** ⏳ 自动刷新、错误提示打磨

## 测试

```bash
node test/client.mjs                          # client 半边：bundle 装载 + 右侧栏注册契约（无需 DSH）
DSH_HOME=/tmp/zt-smoke node test/smoke.mjs    # 直连真实禅道验证 client/service（需内网可达）
DSH_HOME=/tmp/zt-host  node test/host.mjs     # apply() + RPC wire 协议端到端（mock ctx）
```

（smoke/host 的禅道地址与账号来自 `ZENTAO_BASE`/`ZENTAO_ACCOUNT`/`ZENTAO_PASSWORD`
环境变量或 `~/.dsh/zentao-panel/config.json`，不落 git。）

## 安装（本地开发）

```bash
DSH="/Applications/DeepSeekRuntime.app/Contents/Resources/runtime/cli/bin/dsh"
"$DSH" plugin --profile desktop add /path/to/dsh-zentao-panel
```

重启 DSH Desktop 生效（client 侧改动一般 ⌘R 重载渲染进程即可）。

## 卸载

```bash
"$DSH" plugin --profile desktop remove dsh-zentao-panel
# 可选：清除本地凭据
rm -rf ~/.dsh/zentao-panel
```

## 配置

登录信息保存在 `~/.dsh/zentao-panel/config.json`（权限 0600，仅本机）：
禅道地址、账号、密码（base64 混淆）、登录 cookie。卸载插件后不会自动删除，
需要时手动清理。

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

详见《计划书.md》附录 A。

## License

MIT
