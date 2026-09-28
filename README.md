<div align="center">
  <img src="public/icon.png" width="88" height="88" alt="AMT">
  <h1>AMT</h1>
  <p><strong>Antigravity 多账号配额与接力管理器</strong></p>
  <p>看清配额，从容切换，继续专注。</p>
  <p>
    <a href="https://github.com/wuyunfeng8/Antigravity-Manager/releases"><img src="https://img.shields.io/github/v/release/wuyunfeng8/Antigravity-Manager?style=flat-square&color=059669" alt="Release"></a>
    <img src="https://img.shields.io/badge/platform-macOS-18181b?style=flat-square" alt="macOS">
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-18181b?style=flat-square" alt="MIT License"></a>
  </p>
  <p><strong>简体中文</strong> · <a href="README_EN.md">English</a></p>
  <p><a href="https://github.com/wuyunfeng8/Antigravity-Manager/releases">下载</a> · <a href="CHANGELOG.md">更新记录</a> · <a href="https://github.com/wuyunfeng8/Antigravity-Manager/issues">反馈</a></p>
</div>

![AMT — 当前主力、配额与推荐接力](docs/images/amt-relay-overview.png)

## 功能

- **配额一览** — 查看账号余量、重置时间与健康状态，支持 5H / 周配额视图。
- **一键接力** — 推荐可用账号，切换 Antigravity 主程序，减少重复登录。
- **设备身份** — 按账号绑定设备身份，支持历史管理与已保存基线恢复。
- **轻量常驻** — 托盘、迷你视图、后台刷新与周配额预热，中英文界面。

## 安装

从 [Releases](https://github.com/wuyunfeng8/Antigravity-Manager/releases) 下载适合 Mac 芯片的 `.dmg`：Apple Silicon 选 `aarch64`，Intel 选 `x64`。1.1.0 仅提供 macOS 安装包。

也可使用 Homebrew：

```bash
brew tap wuyunfeng8/antigravity-manager https://github.com/wuyunfeng8/Antigravity-Manager
brew install --cask antigravity-tools
```

> 1.1.0 未经 Apple Developer ID 签名与公证。首次打开若被拦截，请核对来源及 Release 中的 `SHA256SUMS`，再按 [Apple 说明](https://support.apple.com/zh-cn/102445) 选择“仍要打开”。

## 使用

1. 安装并启动一次 Antigravity 主程序。
2. 在 AMT 中添加账号，使用 Google OAuth 授权；也支持 Refresh Token 和数据库导入。
3. 查看配额，选择推荐账号或手动切换。切换会重启客户端，请先保存工作。

账号数据保存在本地 `~/.antigravity_tools`，可在设置中迁移。导出文件包含 Refresh Token，请妥善保管。配额以服务返回为准；设备身份隔离不保证账号安全或平台风控结果。

## 开发

基于 **Tauri 2 · Rust · React · TypeScript · shadcn/ui**。准备 Node.js 22（22.12+）、Rust stable 与平台构建工具；macOS 需要 Xcode Command Line Tools。

```bash
git clone https://github.com/wuyunfeng8/Antigravity-Manager.git
cd Antigravity-Manager
npm ci --legacy-peer-deps
npm run tauri dev
```

开发与验证规范见 [AGENTS.md](AGENTS.md)。

## 许可与致谢

[MIT](LICENSE) · 本项目参考 [lbjlaq/Antigravity-Manager](https://github.com/lbjlaq/Antigravity-Manager) 独立演进，感谢原项目与 [LINUX DO](https://linux.do/) 社区。
