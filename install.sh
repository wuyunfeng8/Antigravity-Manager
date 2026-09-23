#!/usr/bin/env bash
# AMT Install Script (Linux + macOS)
# Usage: curl -fsSL https://raw.githubusercontent.com/wuyunfeng8/Antigravity-Manager/main/install.sh | bash
#
# Environment variables:
#   VERSION     - Install specific version (e.g., "4.1.20"), default: latest
#   DRY_RUN     - Set to "1" to print commands without executing

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

REPO="wuyunfeng8/Antigravity-Manager"
APP_NAME="AMT"
APP_ID="com.lbjlaq.antigravity-tools"
GITHUB_API="https://api.github.com/repos/${REPO}/releases"

# Helper functions
info() { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1" >&2; exit 1; }

run() {
    if [[ "${DRY_RUN:-0}" == "1" ]]; then
        echo -e "${YELLOW}[DRY-RUN]${NC} $*"
    else
        "$@"
    fi
}

# Show help
show_help() {
    cat << EOF
${APP_NAME} Install Script

Usage:
    curl -fsSL https://raw.githubusercontent.com/${REPO}/main/install.sh | bash

    # Install specific version
    curl -fsSL https://raw.githubusercontent.com/${REPO}/main/install.sh | VERSION=4.3.3 bash

Options:
    --help      Show this help message
    --version   Show script version

Environment Variables:
    VERSION     Install specific version (default: latest)
    DRY_RUN     Set to "1" to preview commands without executing

Supported Platforms:
    - Current release: macOS x86_64 and arm64 (.dmg)
    - Older releases may still have Linux packages when VERSION is specified.

EOF
    exit 0
}

# Detect OS and architecture
detect_platform() {
    OS="$(uname -s)"
    ARCH="$(uname -m)"

    case "$OS" in
        Linux)  PLATFORM="linux" ;;
        Darwin) PLATFORM="macos" ;;
        *)      error "Unsupported OS: $OS. Use install.ps1 for Windows." ;;
    esac

    case "$ARCH" in
        x86_64|amd64)   ARCH_LABEL="x86_64"; DEB_ARCH="amd64"; RPM_ARCH="x86_64" ;;
        aarch64|arm64)  ARCH_LABEL="aarch64"; DEB_ARCH="arm64"; RPM_ARCH="aarch64" ;;
        *)              error "Unsupported architecture: $ARCH" ;;
    esac

    info "Detected: $PLATFORM ($ARCH_LABEL)"
}

# Detect Linux package manager
detect_linux_distro() {
    if [[ "$PLATFORM" != "linux" ]]; then
        return
    fi

    if command -v apt-get &>/dev/null; then
        PKG_MANAGER="apt"
        PKG_EXT="deb"
    elif command -v dnf &>/dev/null; then
        PKG_MANAGER="dnf"
        PKG_EXT="rpm"
    elif command -v yum &>/dev/null; then
        PKG_MANAGER="yum"
        PKG_EXT="rpm"
    else
        PKG_MANAGER="appimage"
        PKG_EXT="AppImage"
        warn "No supported package manager found, using AppImage"
    fi

    info "Package manager: $PKG_MANAGER ($PKG_EXT)"
}

# Get latest or specific version
get_version() {
    # Validate that a version string looks like a semver (X.Y.Z or X.Y.Z.W)
    _is_valid_version() { [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+ ]]; }

    if [[ -n "${VERSION:-}" ]]; then
        RELEASE_VERSION="$VERSION"
        info "Using specified version: v$RELEASE_VERSION"
        return
    fi

    info "Fetching latest version..."

    # Method 1: Try GitHub API (returns JSON with tag_name)
    local response
    if response=$(curl -fsSL --max-time 10 -H "User-Agent: Antigravity-Installer" "${GITHUB_API}/latest" 2>/dev/null); then
        RELEASE_VERSION=$(echo "$response" | grep '"tag_name"' | head -n1 | sed -E 's/.*"tag_name"[[:space:]]*:[[:space:]]*"v?([^"]+)".*/\1/' | tr -d '[:space:]\r\n')
        if _is_valid_version "${RELEASE_VERSION:-}"; then
            info "Latest version: v$RELEASE_VERSION"
            return
        fi
        warn "API returned unexpected version format ('${RELEASE_VERSION:-empty}'), trying fallback..."
        RELEASE_VERSION=""
    fi

    # Method 2: Fallback - follow redirect and extract version from final URL
    info "Using fallback method (redirect URL)..."
    local final_url
    final_url=$(curl -fsSL --max-time 10 -o /dev/null -w '%{url_effective}' "https://github.com/${REPO}/releases/latest" 2>/dev/null | tr -d '[:space:]\r\n')

    if [[ -n "$final_url" ]]; then
        RELEASE_VERSION=$(echo "$final_url" | sed -E 's|.*/tag/v?([0-9][^/]*).*|\1|' | tr -d '[:space:]\r\n')
    fi

    if ! _is_valid_version "${RELEASE_VERSION:-}"; then
        error "Failed to fetch a valid version (got: '${RELEASE_VERSION:-empty}'). Try specifying: VERSION=x.x.x bash install.sh"
    fi

    info "Latest version: v$RELEASE_VERSION"
}

# Build download URL based on platform and package manager
build_download_url() {
    local base_url="https://github.com/${REPO}/releases/download/v${RELEASE_VERSION}"

    case "$PLATFORM" in
        linux)
            case "$PKG_EXT" in
                deb)
                    DOWNLOAD_URL="${base_url}/AMT_${RELEASE_VERSION}_${DEB_ARCH}.deb"
                    FILENAME="AMT_${RELEASE_VERSION}_${DEB_ARCH}.deb"
                    ;;
                rpm)
                    DOWNLOAD_URL="${base_url}/AMT-${RELEASE_VERSION}-1.${RPM_ARCH}.rpm"
                    FILENAME="AMT-${RELEASE_VERSION}-1.${RPM_ARCH}.rpm"
                    ;;
                AppImage)
                    local appimage_arch
                    if [[ "$ARCH_LABEL" == "x86_64" ]]; then
                        appimage_arch="amd64"
                    else
                        appimage_arch="aarch64"
                    fi
                    DOWNLOAD_URL="${base_url}/AMT_${RELEASE_VERSION}_${appimage_arch}.AppImage"
                    FILENAME="AMT_${RELEASE_VERSION}_${appimage_arch}.AppImage"
                    ;;
            esac
            ;;
        macos)
            local mac_arch
            if [[ "$ARCH_LABEL" == "x86_64" ]]; then
                mac_arch="x64"
            else
                mac_arch="aarch64"
            fi
            DOWNLOAD_URL="${base_url}/AMT_${RELEASE_VERSION}_${mac_arch}.dmg"
            FILENAME="AMT_${RELEASE_VERSION}_${mac_arch}.dmg"
            ;;
    esac

    info "Download URL: $DOWNLOAD_URL"
}

# Download installer
download_installer() {
    TEMP_DIR=$(mktemp -d)
    DOWNLOAD_PATH="${TEMP_DIR}/${FILENAME}"

    info "Downloading ${APP_NAME} v${RELEASE_VERSION}..."
    run curl -fSL --progress-bar -o "$DOWNLOAD_PATH" "$DOWNLOAD_URL"

    if [[ "${DRY_RUN:-0}" != "1" ]] && [[ ! -f "$DOWNLOAD_PATH" ]]; then
        error "Download failed. Check your network or try a different version."
    fi

    local checksums_url="https://github.com/${REPO}/releases/download/v${RELEASE_VERSION}/SHA256SUMS"
    if [[ "${DRY_RUN:-0}" == "1" ]]; then
        info "Would verify SHA-256 from $checksums_url"
        return
    fi
    curl -fSL --max-time 30 -o "${TEMP_DIR}/SHA256SUMS" "$checksums_url"
    local expected actual
    expected=$(awk -v file="$FILENAME" '$2 == file { print $1 }' "${TEMP_DIR}/SHA256SUMS")
    [[ "$expected" =~ ^[0-9a-fA-F]{64}$ ]] || error "Release checksum for $FILENAME is missing or invalid."
    if [[ "$PLATFORM" == "macos" ]]; then
        actual=$(shasum -a 256 "$DOWNLOAD_PATH" | awk '{print $1}')
    else
        actual=$(sha256sum "$DOWNLOAD_PATH" | awk '{print $1}')
    fi
    [[ "$actual" == "$expected" ]] || error "Download checksum mismatch; installation stopped."

    success "Downloaded and verified $DOWNLOAD_PATH"
}

# Install on Linux
install_linux() {
    info "Installing ${APP_NAME}..."

    case "$PKG_MANAGER" in
        apt)
            run sudo dpkg -i "$DOWNLOAD_PATH"
            run sudo apt-get install -f -y  # Fix dependencies if needed
            ;;
        dnf)
            run sudo dnf install -y "$DOWNLOAD_PATH"
            ;;
        yum)
            run sudo yum install -y "$DOWNLOAD_PATH"
            ;;
        appimage)
            local install_dir="${HOME}/.local/bin"
            run mkdir -p "$install_dir"
            run chmod +x "$DOWNLOAD_PATH"
            run cp "$DOWNLOAD_PATH" "${install_dir}/antigravity-tools"

            if [[ ":$PATH:" != *":${install_dir}:"* ]]; then
                warn "Add ${install_dir} to your PATH to run antigravity-tools from anywhere"
            fi
            ;;
    esac

    success "${APP_NAME} installed successfully!"
}

# Install on macOS
install_macos() {
    info "Installing ${APP_NAME}..."

    if [[ "${DRY_RUN:-0}" == "1" ]]; then
        echo -e "${YELLOW}[DRY-RUN]${NC} hdiutil attach $DOWNLOAD_PATH -nobrowse -noautoopen"
        echo -e "${YELLOW}[DRY-RUN]${NC} cp -R <mount>/${APP_NAME}.app /Applications/"
        echo -e "${YELLOW}[DRY-RUN]${NC} hdiutil detach <mount>"
        return
    fi

    # Mount DMG
    local mount_output mount_point
    mount_output=$(hdiutil attach "$DOWNLOAD_PATH" -nobrowse -noautoopen 2>&1)
    mount_point=$(echo "$mount_output" | grep -o '/Volumes/.*' | head -n1)

    if [[ -z "$mount_point" ]]; then
        error "Failed to mount DMG. Output: $mount_output"
    fi

    # Stage the new app before replacing the existing installation.
    local staged_app="/Applications/.${APP_NAME}.app.install.$$"
    local backup_app="/Applications/.${APP_NAME}.app.backup.$$"
    if ! cp -R "${mount_point}/${APP_NAME}.app" "$staged_app"; then
        hdiutil detach "$mount_point" -quiet 2>/dev/null || true
        error "Failed to stage the new app. The existing installation is unchanged."
    fi
    if [[ -d "/Applications/${APP_NAME}.app" ]]; then
        mv "/Applications/${APP_NAME}.app" "$backup_app"
    fi
    if ! mv "$staged_app" "/Applications/${APP_NAME}.app"; then
        if [[ -d "$backup_app" ]]; then mv "$backup_app" "/Applications/${APP_NAME}.app"; fi
        hdiutil detach "$mount_point" -quiet 2>/dev/null || true
        error "Failed to install the new app. The previous installation was restored."
    fi
    if [[ -d "$backup_app" ]]; then rm -rf "$backup_app"; fi

    # Unmount DMG
    hdiutil detach "$mount_point" -quiet 2>/dev/null || true

    success "${APP_NAME} installed to /Applications!"
    if [[ "$RELEASE_VERSION" == "1.1.0" ]]; then
        warn "AMT 1.1.0 is not Developer ID signed or Apple notarized. If macOS blocks the first launch, verify the download source and follow Apple's Open Anyway steps in System Settings > Privacy & Security."
    fi
}

# Cleanup
cleanup() {
    if [[ -n "${TEMP_DIR:-}" ]] && [[ -d "$TEMP_DIR" ]]; then
        rm -rf "$TEMP_DIR"
    fi
}

# Main
main() {
    for arg in "$@"; do
        case "$arg" in
            --help|-h)    show_help ;;
            --version|-v) echo "install.sh v1.0.0"; exit 0 ;;
        esac
    done

    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}    ${APP_NAME} Installer${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""

    trap cleanup EXIT

    detect_platform
    detect_linux_distro
    get_version
    if [[ "$PLATFORM" == "linux" && "$RELEASE_VERSION" == "1.1.0" ]]; then
        error "AMT 1.1.0 provides macOS packages only. Specify an older release with VERSION for a Linux package."
    fi
    build_download_url
    download_installer

    case "$PLATFORM" in
        linux) install_linux ;;
        macos) install_macos ;;
    esac

    echo ""
    success "Installation complete!"
    echo ""
    info "Launch '${APP_NAME}' from your application menu or launcher."
    echo ""
}

main "$@"
