<div align="center">
  <img src="public/icon.png" width="112" height="112" alt="AMT Logo">

  # AMT

  **Multi-account quota radar and relay manager for Antigravity**

  Real quotas, recommended relay accounts, and isolated device identities. Switch accounts with one click instead of another sign-in cycle.

  [![Release](https://img.shields.io/github/v/release/wuyunfeng8/Antigravity-Manager?style=flat-square&color=16a34a)](https://github.com/wuyunfeng8/Antigravity-Manager/releases)
  [![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-0f172a?style=flat-square)](#installation)
  [![License](https://img.shields.io/badge/license-CC%20BY--NC--SA%204.0-64748b?style=flat-square)](LICENSE)

  [简体中文](README.md) · **English**
</div>

---

## What is AMT?

AMT is a desktop account hub for Google Antigravity users. It brings account onboarding, real quota monitoring, device identity management, and native client switching into one focused interface, reducing interruptions caused by quota exhaustion and repeated authorization flows.

> AMT is a local desktop account manager. It does not expose OpenAI-, Anthropic-, or Gemini-compatible API proxy endpoints and has no HTTP gateway or Docker headless mode.

## Three core capabilities

| Capability | How it works | Why it matters |
| --- | --- | --- |
| **Real quota radar** | Reads and consolidates Antigravity's actual quota buckets | Shows useful Claude, Gemini Pro, and Gemini Flash capacity, cycles, and account problems without duplicate model noise |
| **One-click account relay** | Writes the selected account to the Antigravity desktop app's credential store or compatible SQLite state, then restarts the app | Replaces the manual sign-out, sign-in, and authorization cycle when quota runs low |
| **Isolated device identities** | Stores and applies separate `machineId`, `macMachineId`, `devDeviceId`, and `sqmId` values per account | Reduces the correlation risk of multiple accounts sharing one long-lived client identity |

## Workflow

```text
Add accounts  →  Inspect real quotas  →  Pick a recommended account  →  Relay
 OAuth            5-hour / weekly         Health and capacity             Credentials + device identity
 Token
 Database import
```

1. Add accounts through Google OAuth, refresh tokens, or an existing database.
2. Inspect the current account, the complete account pool, and 5-hour/weekly quota windows.
3. When capacity runs low, choose the recommended relay account or any healthy account.

## Features

- Current and recommended relay accounts visible at a glance.
- Consolidated Claude, Gemini Pro, and Gemini Flash quota families.
- 5-hour sliding-window and weekly quota views.
- FREE, PRO, and ULTRA subscription-tier detection.
- Google OAuth, refresh-token, legacy database, and custom `state.vscdb` import.
- Account switching for the Antigravity desktop app.
- Device identity generation, binding, history, and saved-baseline restoration; older baselines may not represent the first-install state.
- Clear account verification, 403, and OAuth-expiration states.
- System tray, compact quota view, scheduled refresh, and weekly quota warmup.
- Data-directory migration, client cache cleanup, network proxy, and debug console.
- Interface languages: Simplified Chinese and English.

## Installation

### Download a release

Open [GitHub Releases](https://github.com/wuyunfeng8/Antigravity-Manager/releases) and choose the package for your platform:

- macOS: `.dmg`
- Windows: `.exe`
- Linux: `.deb` / `.rpm` / `.AppImage`

### macOS / Linux install script

```bash
curl -fsSL https://raw.githubusercontent.com/wuyunfeng8/Antigravity-Manager/main/install.sh | bash
```

### Windows PowerShell

```powershell
irm https://raw.githubusercontent.com/wuyunfeng8/Antigravity-Manager/main/install.ps1 | iex
```

### Homebrew (macOS)

```bash
brew tap wuyunfeng8/antigravity-manager https://github.com/wuyunfeng8/Antigravity-Manager
brew install --cask antigravity-tools
```

## Data and security

- Default data directory: `~/.antigravity_tools`
- Move the data directory from **Settings → Maintenance**.
- Account data is written atomically; sensitive configuration files use `0600` permissions on Unix.
- Exported account JSON contains refresh tokens. Never upload, forward, or commit it.
- Device identity isolation can reduce client-environment correlation risk, but it cannot guarantee account safety or any platform risk-control outcome.

## Technology

- Desktop: Tauri 2
- Frontend: React 19, TypeScript, Vite, Zustand, Tailwind CSS, shadcn/ui
- Backend: Rust, Tokio, SQLite, native credential stores

## Development

```bash
git clone git@github.com:wuyunfeng8/Antigravity-Manager.git
cd Antigravity-Manager
npm install
npm run tauri dev
```

Pre-flight checks:

```bash
npm run build
cd src-tauri
cargo fmt -- --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-features
cargo check
```

## License

Licensed under [CC BY-NC-SA 4.0](LICENSE).

AMT independently evolved while learning from and referencing [lbjlaq/Antigravity-Manager](https://github.com/lbjlaq/Antigravity-Manager), with sincere appreciation.
