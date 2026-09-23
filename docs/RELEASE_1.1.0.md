# AMT 1.1.0 发布验收

此文件记录 1.1.0 候选版的放行条件。创建 Tag 或发布 Release 前逐项读回验证，不以本地编译代替真实客户端验收。

## 已知外部限制

- [ ] 确认代码、翻译、图标和其他素材的版权归属及 MIT 再授权范围。仓库层面的许可声明已按项目维护者要求改为 MIT；此项修改本身不证明所有第三方内容已经获得 MIT 授权，发布前仍需完成权利核对或替换。
- [ ] 确认内置 Google OAuth 客户端的归属及公开分发使用权限。现有客户端并非本项目可证明持有；PKCE 增强授权码安全，但不能保证该客户端长期有效，也不能代替平台授权。
- [x] 2026-09-24 用户决定 1.1.0 只发布 macOS Apple Silicon 与 Intel 安装包，接受本版不使用 Apple Developer ID 签名及公证，并要求明确说明 Gatekeeper 首次打开限制。Tauri 自动更新签名仍必须启用；不在安装流程中关闭或绕过系统安全检查。

2026-09-23 只读核对：本仓库有 40 个当前文件与原项目同路径文件字节一致，其中 17 个是源码；内置 OAuth 客户端也与原项目相同。已从候选分支移除未确认应用分发许可的 Effra 字体，但旧 Git 历史仍包含该资产。GitHub 的两项 Tauri 更新签名 Secret 已配置，五项 Apple 签名/公证配置缺失；用户确认目前没有 Apple Developer 账号。2026-09-24 发布方案已改为未使用 Developer ID 签名和公证的 macOS 安装包。

## 自动门禁

- [ ] `node scripts/check-version.mjs 1.1.0`、`npm ci --legacy-peer-deps`、`npm run build` 通过。
- [ ] `cargo fmt -- --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-features`、`cargo check` 在 CI 目标平台通过。
- [ ] Release 工作流的 CI 复用检查和两个 macOS 构建矩阵通过；`prepare-release.mjs` 确认两个 DMG 与两个 Tauri 更新包及签名齐全，生成仅含 macOS 平台的 `updater.json` 和 `SHA256SUMS`。
- [ ] 下载两个 macOS DMG 并核对 SHA-256；在目标机器验证首次打开的 Gatekeeper 提示和启动结果。

## 真实验收（仅使用已明确授权的账号）

- [x] 2026-09-23 在本机 macOS / Antigravity 2.15.1 使用已获授权的现有账号完成 c*** → k*** 往返切换；两次均在 Antigravity 设置页读回目标邮箱，最终 AMT 当前账号恢复为原 k***。`storage.json` 保持有效 JSON 与 `0600` 权限，生成两份完整备份。此项只覆盖当前本机版本与已有账号切换。
- [ ] Antigravity 主程序现行版本：OAuth、已有账号导入、配额刷新、推荐接力与手动切换各走通一次。
- [ ] 切换后在 Antigravity 客户端核对实际登录邮箱；覆盖 Keyring 写入失败、SQLite 写入失败、客户端重启失败和 Token 失效。
- [ ] macOS Intel/Apple Silicon 的发布包分别完成安装与启动；升级路径至少覆盖当前公开的 1.0.1。
- [ ] 验证 5 小时与周配额未知、耗尽、过期状态；设备身份恢复和数据目录迁移使用测试副本验证。
- [ ] 对已有安装检查 `device_original.json` 的来源；旧版本可能把新生成身份记作基线，不能据此宣称已恢复首次安装身份。
- [ ] 核对 Release 所有下载 URL 返回预期文件，并在目标平台验证自动更新的签名与安装流程。

## 发布顺序

1. 完成可执行的 macOS 构建与验收后，审查干净的 1.1.0 提交并按仓库发布授权创建 `v1.1.0` Tag；权利及 OAuth 来源的未核对项如实保留。
2. Release 工作流只在两种 macOS 架构的安装包与 Tauri 更新签名齐全时发布。不得通过关闭更新签名门禁或上传部分产物规避失败。
3. 从正式 Release 下载 `SHA256SUMS`，执行 `node scripts/update-cask-digests.mjs 1.1.0 SHA256SUMS`，核对两种 macOS DMG 的 SHA-256 后单独提交 Cask 更新。
4. 核对 README、安装脚本、Cask 和自动更新所指的版本及平台范围；记录正式产物和真实设备验收结果。
