---
name: dsh-zentao-panel-release
description: 执行 dsh-zentao-panel 仓库的完整发版流程（截图入仓与 README 维护、CHANGELOG 切版、跑离线测试、打 tag 推送、CI 信任发布后用 gh/npm view 核对、按需同步 awesome-dsh-plugin 列表条目），适用于用户要求"发版""切版""发布 npm""更新 awesome 列表条目"，或 release.yml 失败、版本闸门报错时排查。
disable-model-invocation: true
---

# dsh-zentao-panel 发版流程（CI 全自动，2026-10-30 起）

本技能随仓库走（`.dsh/skills/`）：在 DSH 里以本仓库为工作区打开会话时自动载入；
`disable-model-invocation: true` 表示需要显式调用。**npm 发布不在本机执行**——推 `v*` tag 后由
`.github/workflows/release.yml` 用信任发布（OIDC）完成。

## Steps

1. **截图入仓与 README 维护**：真实截图（如 `docs/*.webp`）放入仓库并在 README 顶部引用（相对路径即可，
   npm 会重写为 GitHub raw 地址）；用 curl 验证 GitHub raw URL 返回 200。README 同步补近期提交对应的功能说明。
2. **CHANGELOG 切版与升版本号**：`## [Unreleased]` → `## [X.Y.Z] - <今日日期>`，条目沿用 `### 新增/修复/维护`；
   `package.json` 的 `version` 同步升到该版本——**tag 与它不一致时 CI 直接 fail**（release.yml 的版本闸门）。
3. **跑离线测试**（发布前必须全绿；smoke/host 需真实禅道凭据，默认跳过）：
   ```bash
   node test/client.mjs 2>&1 | tail -3
   node test/multi.mjs 2>&1 | tail -3
   node test/protocol.mjs 2>&1 | tail -3
   ```
4. **提交、打 tag、推送**（推送 tag 才触发发布）：
   ```bash
   git commit -am "release: vX.Y.Z — <摘要>"
   git tag vX.Y.Z
   git push origin master
   git push origin vX.Y.Z          # 或用 git push --tags；--follow-tags 只推送附注标签
   git ls-remote --tags origin | tail -5   # 核对远端已出现该 tag
   ```
5. **核对 CI 发布结果**（不再本机 `npm publish`）：
   ```bash
   gh run list --workflow=release.yml --limit 3
   gh run watch "$(gh run list --workflow=release.yml --limit 1 --json databaseId --jq '.[0].databaseId')" --exit-status
   gh release view vX.Y.Z --json name,tagName,url
   npm view dsh-zentao-panel version dist-tags --cache "$PWD/.npm-cache-tmp"
   ```
6. **同步 awesome-dsh-plugin 条目**（仅当本版有用户可见变化时；见下节「awesome 条目」）：
   ```bash
   gh api -X POST repos/big-li99/awesome-dsh-plugin/merge-upstream -f branch=main --jq .message
   gh api repos/awesome-dsh-plugin/awesome-dsh-plugin/contents/data/plugins/big-li99__dsh-zentao-panel.yml --jq '.content, .sha'
   # 改完本地 yml 后（保持单引号转义 ''，含 ": " 必须加引号）：
   gh api -X POST repos/big-li99/awesome-dsh-plugin/git/refs -f ref=refs/heads/update-zentao-entry -f sha=<fork main sha>
   gh api -X PUT repos/big-li99/awesome-dsh-plugin/contents/data/plugins/big-li99__dsh-zentao-panel.yml \
     -f message="Update big-li99/dsh-zentao-panel description for vX.Y.Z" -f branch=update-zentao-entry \
     -f sha=<上游该文件 blob sha> -f content="$(base64 -i entry.yml)"
   gh api -X POST repos/awesome-dsh-plugin/awesome-dsh-plugin/pulls \
     -f title="Update big-li99/dsh-zentao-panel entry (vX.Y.Z)" -f head=big-li99:update-zentao-entry -f base=main -f body="$(cat body.md)"
   ```
7. **收尾**：
   ```bash
   rm -rf .npm-cache-tmp && git status --short
   ```

## awesome 条目（`awesome-dsh-plugin` 列表）

插件已收录在 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)：
数据文件 `data/plugins/big-li99__dsh-zentao-panel.yml`（分类 `workflow`）。
**两个 README 由 `data/plugins/*.yml` 生成，绝不手改** —— 只改那一个 yml 再提 PR。

- **何时改**：只有**用户可见**的能力/行为变化才值得提。纯内部修复（如 0.4.1 把陈旧清理宽限期
  72h→8h）或 CI/发版流程调整**不改描述**——贡献指南写的是「描述必须属实并会被对着代码核对」，
  无谓改动只会增加被打回的概率，且条目也不带版本号，不需要「跟版本号」。
- **提 PR**：先 `merge-upstream` 把 fork `big-li99/awesome-dsh-plugin` 同步到上游 main（长期不用的
  fork 会落后上千个提交，直接开分支会把陈旧历史带进 PR），再从上游该文件的 blob sha 出发 PUT 新内容。
  PR **只允许动自己那一个文件**（贡献指南第 6 条：动到别人的条目会被追问）。
- **格式红线**：`description.en` 必填且以句号结尾；含 `: `（冒号+空格）必须整体加引号；单引号字符串里
  的 `'` 要写成 `''`；一个 PR 最多 3 条；`dsh.bundle` 必须仍在 `package.json` 里（只声明 `dsh.client`
  会被 gate 直接拒）。
- **历史 PR**：#9242（首次收录，2026-10-26）、#9886（按 v0.4.0 更新）、#11589（v0.4.1 补两项能力）。
- 发版后核对：`gh pr checks <n>` 的 Submission gate 绿 → 合并后 `main` 上的 README 会重新生成
  （`curl -s https://raw.githubusercontent.com/awesome-dsh-plugin/awesome-dsh-plugin/main/README.md | grep -c 'big-li99/dsh-zentao-panel'`）。

## CI 行为（核对时按这条对）

- `release` job：从 CHANGELOG 抽 `## [X.Y.Z]` 小节建 GitHub Release；已存在则 `gh release edit`（幂等，重跑不报错）；
  抽不到小节时正文回落到一句 CHANGELOG 链接。
- `publish` job：校验 tag == `package.json` version（不等直接 fail）→ `npm view` 查该版本是否已在 registry
  （在则跳过）→ `-rc.N` 之类预发布发 `next`，正式版发 `latest`。
- 鉴权靠 npmjs.com 包设置里的 trusted publisher（owner `big-li99` / repo `dsh-zentao-panel` / 工作流文件名必须是
  `release.yml`），**配好后 2 天内必须完成首次发布，否则配置过期需删掉重建**。

## Pitfalls

- **沙箱下 `~/.npm` 不可写**：只影响本机跑 npm 命令（如第 5 步的 `npm view` 核对）——报
  "Log files were not written… ~/.npm/_logs" 时用工作区临时缓存 `--cache "$PWD/.npm-cache-tmp"` 绕开，用完删掉。
  这条**与发布令牌无关**。
- **不要本机 `npm publish`**：CI 已接管发布，本机发布会绕过版本闸门与 provenance，还可能用错 dist-tag。
  旧技能里"whoami 401 + publish PUT 404 = 令牌失效"的排查已不适用——真遇到 401/404 先确认是不是有人在本机发，
  再查 trusted publisher 配置。
- **tag 与版本不一致**：CI 报 `tag vX.Y.Z 与 package.json version … 不一致` → 改 `package.json` 后重打 tag 再推
  （`git tag -f` + 强制推，或删远端 tag 重打），不要靠重跑 workflow 绕。
- **轻量 tag 不随 `--follow-tags` 推送**：`git tag vX.Y.Z` 建的是轻量标签，`--follow-tags` 只带附注标签；
  要么显式 `git push origin vX.Y.Z`，要么 `git push --tags`。
- **重跑是安全的**：Release 用 edit 幂等、registry 已有该版本会跳过；修好配置后直接 `gh run rerun` 或重推 tag。
- **预发布别抢 latest**：`0.5.0-rc.1` 走 `next`，安装要写 `dsh-zentao-panel@next`。

## Verification

- `node test/client.mjs` / `test/multi.mjs` / `test/protocol.mjs` 输出"全部通过"。
- `git ls-remote --tags origin` 含新 tag，且指向 `git log --oneline -1` 的 commit。
- `gh run list --workflow=release.yml` 最近一次 `success`；`gh release view vX.Y.Z` 存在且正文来自 CHANGELOG。
- `npm view dsh-zentao-panel version` 等于新版本号（正式版时 `dist-tags.latest` 也是它）。
- 收尾 `git status --short` 干净，`.npm-cache-tmp` 已删除。
- 有用户可见变化的版本：awesome 列表 PR 的 `compare/main...big-li99:<branch>` 里 `files` 只有
  `data/plugins/big-li99__dsh-zentao-panel.yml` 一个；`gh pr checks <n>` 的 Submission gate 通过。
  纯内部修复的版本**不需要**这条。
