# dsh-zentao-panel

DeepSeek Harness 的禅道（ZenTao）工作台插件：在 DSH 界面里悬浮一个「禅道」按钮，
右侧滑出面板查看**指派给我**的任务 / Bug / 需求，一键把卡片转成 DSH 对话上下文。

## 功能（规划）

- 悬浮按钮 + 右侧滑出面板：任务 / Bug / 需求三个标签页；
- 卡片拖拽/点击插入对话输入框（Markdown 任务卡）；
- 「处理」按钮：新建会话并自动下发任务背景提示词；
- 登录态持久化（30 天免登），会话失效自动重登；
- 只读，不回写禅道。

## 开发进度

- **M0** ✅ 禅道 API 探测（见《计划书.md》附录 A）
- **M1** ✅ host 插件：登录（30 天免登 cookie）/ my-work 三接口 / v1 详情 / loopback RPC；冒烟测试 + host 端到端测试全绿（`test/smoke.mjs`、`test/host.mjs`）
- **M2** ✅ client 侧边栏：悬浮「禅道」按钮 + 右滑面板（任务/Bug/需求标签页、卡片、详情、原地址链接、登录表单）；待真实 DSH Desktop 环境验证
- **M3** ⏳ 插入输入框（初版实现：composer textarea/contenteditable + 剪贴板兜底）+ 新会话下发
- **M4** ⏳ 打磨

## 测试

```bash
DSH_HOME=/tmp/zt-smoke node test/smoke.mjs   # 直连真实禅道验证 client/service
DSH_HOME=/tmp/zt-host  node test/host.mjs    # apply() + RPC wire 协议端到端
```

（测试内置禅道地址与账号——本机开发用途；发布前需参数化。）

## 安装（本地开发）

```bash
DSH="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"
"$DSH" plugin --profile desktop add /path/to/dsh-zentao-panel
```

重启 DSH Desktop 生效。

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

详见《计划书.md》附录 A。

## License

MIT
