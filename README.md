<div align="center">
  <img src="public/icon.png" width="112" height="112" alt="AMT Logo">

  # AMT

  **Antigravity 多账号配额雷达与接力管理器**

  真实配额、推荐接力、独立设备身份。让账号切换回到一次点击，而不是一轮重新登录。

  [![Release](https://img.shields.io/github/v/release/wuyunfeng8/Antigravity-Manager?style=flat-square&color=16a34a)](https://github.com/wuyunfeng8/Antigravity-Manager/releases)
  [![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-0f172a?style=flat-square)](#安装)
  [![License](https://img.shields.io/badge/license-CC%20BY--NC--SA%204.0-64748b?style=flat-square)](LICENSE)

  **简体中文** · [English](README_EN.md)
</div>

---

## AMT 是什么

AMT 是面向 Google Antigravity 用户的桌面账号中枢。它把账号入库、真实配额监控、设备身份管理与客户端切换集中在一个轻量界面中，减少额度耗尽后退出账号、重新登录和再次授权造成的工作中断。

> AMT 是本地桌面账号管理工具，不提供 OpenAI、Anthropic 或 Gemini API 代理服务，也不包含 HTTP 网关与 Docker Headless 模式。

## 三个核心能力

| 能力 | 工作方式 | 带来的价值 |
| --- | --- | --- |
| **真实配额雷达** | 读取并聚合 Antigravity 的真实配额桶 | 只展示 Claude、Gemini Pro、Gemini Flash 等核心余量、周期和异常状态 |
| **一键账号接力** | 写入系统凭据库、CLI Keyring 或 Antigravity SQLite 状态，并重新启动目标客户端 | 不再手工退出、登录和授权，配额不足时快速切换到健康账号 |
| **独立设备身份** | 为账号保存并应用独立的 `machineId`、`macMachineId`、`devDeviceId` 与 `sqmId` | 降低多个账号长期共用同一客户端身份产生的关联风险 |

## 使用流程

```text
添加账号  →  查看真实配额  →  选择推荐账号  →  一键接力
 OAuth        5H / 周配额       健康度与余量       凭据 + 设备身份
 Token
 数据库导入
```

1. 使用 Google OAuth、Refresh Token 或已有数据库导入账号。
2. 在主页查看当前主力、全账号池以及 5 小时/周配额状态。
3. 当前账号余量不足时，点击“立即接力”或切换到任意健康账号。

## 功能概览

- 当前主力账号与推荐接力账号一屏呈现。
- Claude、Gemini Pro、Gemini Flash 三类核心配额聚合。
- 5 小时滑动窗口与周配额切换。
- FREE、PRO、ULTRA 订阅等级识别。
- Google OAuth、Refresh Token、旧数据库与自定义 `state.vscdb` 导入。
- Antigravity Classic、Antigravity IDE 与 `agy` CLI 切换。
- 设备身份生成、绑定、历史版本和原始状态恢复。
- 账号验证异常、403 和 OAuth 失效状态提示。
- 托盘常驻、迷你配额视图、定时刷新与周配额预热。
- 数据目录迁移、客户端缓存清理、网络代理与调试控制台。

## 安装

### 从 Releases 下载

前往 [GitHub Releases](https://github.com/wuyunfeng8/Antigravity-Manager/releases)，选择对应平台的安装包：

- macOS：`.dmg`
- Windows：`.exe` / `.msi`
- Linux：`.deb` / `.rpm` / `.AppImage`

### macOS / Linux 安装脚本

```bash
curl -fsSL https://raw.githubusercontent.com/wuyunfeng8/Antigravity-Manager/main/install.sh | bash
```

### Windows PowerShell

```powershell
irm https://raw.githubusercontent.com/wuyunfeng8/Antigravity-Manager/main/install.ps1 | iex
```

### Homebrew

```bash
brew tap wuyunfeng8/antigravity-manager https://github.com/wuyunfeng8/Antigravity-Manager
brew install --cask antigravity-tools
```

## 数据与安全

- 默认数据目录：`~/.antigravity_tools`
- 可在“设置 → 维护工具”中迁移数据目录。
- 账号数据采用原子写入；Unix 系统中的敏感配置文件使用 `0600` 权限。
- 导出的账号 JSON 包含 Refresh Token，请勿上传、转发或提交到 Git。
- 设备身份隔离只能降低客户端环境关联风险，不构成账号安全或平台风控结果保证。

## 技术栈

- 桌面：Tauri 2
- 前端：React 19、TypeScript、Vite、Zustand、Tailwind CSS、shadcn/ui
- 后端：Rust、Tokio、SQLite、原生系统凭据库

## 本地开发

```bash
git clone git@github.com:wuyunfeng8/Antigravity-Manager.git
cd Antigravity-Manager
npm install
npm run tauri dev
```

提交前检查：

```bash
npm run build
cd src-tauri
cargo fmt -- --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-features
cargo check
```

## License

本项目采用 [CC BY-NC-SA 4.0](LICENSE) 许可。

本项目在学习和参考 [lbjlaq/Antigravity-Manager](https://github.com/lbjlaq/Antigravity-Manager) 的基础上独立演进，谨致谢意。
