# AMT 1.1.0 发布验收

此文件记录 1.1.0 候选版的放行条件。创建 Tag 或发布 Release 前逐项读回验证，不以本地编译代替真实客户端验收。

## 必须先解决的外部条件

- [ ] 确认继承代码、翻译、图标和其他素材的版权归属。原项目与本仓库当前均使用 CC BY-NC-SA 4.0；在取得所需许可或完成独立替换前，不得将全部代码改标为允许商业使用的许可证，也不得宣称已采用 OSI 开源许可证。
- [ ] 确认内置 Google OAuth 客户端的归属及公开分发使用权限。现有客户端并非本项目可证明持有；PKCE 增强授权码安全，但不能保证该客户端长期有效，也不能代替平台授权。
- [ ] 以安全渠道配置 `TAURI_SIGNING_PRIVATE_KEY`、`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`、`APPLE_CERTIFICATE`、`APPLE_CERTIFICATE_PASSWORD`、`APPLE_ID`、`APPLE_PASSWORD`、`APPLE_TEAM_ID`。不得把值写进仓库、日志或 Issue。

2026-09-23 只读核对：本仓库有 40 个当前文件与原项目同路径文件字节一致，其中 17 个是源码；内置 OAuth 客户端也与原项目相同。已从候选分支移除未确认应用分发许可的 Effra 字体，但旧 Git 历史仍包含该资产。GitHub 的两项 Tauri 更新签名 Secret 已配置，五项 Apple 签名/公证配置缺失；用户确认目前没有 Apple Developer 账号。当前 Release 工作流因此会阻止 macOS 正式发布。

## 自动门禁

- [ ] `node scripts/check-version.mjs 1.1.0`、`npm ci --legacy-peer-deps`、`npm run build` 通过。
- [ ] `cargo fmt -- --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-features`、`cargo check` 在 CI 目标平台通过。
- [ ] Release 工作流的 CI 复用检查和所有构建矩阵通过；`prepare-release.mjs` 确认所有声明的安装包与五个更新签名齐全，生成 `updater.json` 和 `SHA256SUMS`。
- [ ] macOS 正式产物通过 Developer ID 签名和公证检查；Windows、Linux 安装包的下载哈希与 `SHA256SUMS` 一致。

## 真实验收（仅使用已明确授权的账号）

- [x] 2026-09-23 在本机 macOS / Antigravity 2.15.1 使用已获授权的现有账号完成 c*** → k*** 往返切换；两次均在 Antigravity 设置页读回目标邮箱，最终 AMT 当前账号恢复为原 k***。`storage.json` 保持有效 JSON 与 `0600` 权限，生成两份完整备份。此项只覆盖当前本机版本与已有账号切换。
- [ ] Antigravity 主程序现行版本：OAuth、已有账号导入、配额刷新、推荐接力与手动切换各走通一次。
- [ ] 切换后在 Antigravity 客户端核对实际登录邮箱；覆盖 Keyring 写入失败、SQLite 写入失败、客户端重启失败和 Token 失效。
- [ ] macOS Intel/Apple Silicon、Windows x64、Linux x64/ARM 的发布包分别完成安装与启动；升级路径至少覆盖当前公开的 1.0.1。
- [ ] 验证 5 小时与周配额未知、耗尽、过期状态；设备身份恢复和数据目录迁移使用测试副本验证。
- [ ] 对已有安装检查 `device_original.json` 的来源；旧版本可能把新生成身份记作基线，不能据此宣称已恢复首次安装身份。
- [ ] 核对 Release 所有下载 URL 返回预期文件，并在目标平台验证自动更新的签名与安装流程。

## 发布顺序

1. 完成上述外部条件和验收后，审查干净的 1.1.0 提交并按仓库发布授权创建 `v1.1.0` Tag。
2. Release 工作流只在所有平台产物与签名齐全时发布。不得通过关闭门禁或上传部分产物规避失败。
3. 从正式 Release 下载 `SHA256SUMS`，执行 `node scripts/update-cask-digests.mjs 1.1.0 SHA256SUMS`，核对两种 macOS DMG 的 SHA-256 后单独提交 Cask 更新。
4. 核对 README、安装脚本、Cask 和自动更新所指的版本及平台范围；记录正式产物和真实设备验收结果。
