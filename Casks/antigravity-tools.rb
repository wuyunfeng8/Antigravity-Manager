cask "antigravity-tools" do
  version "1.0.1"
  sha256 :no_check

  name "AMT"
  desc "Antigravity account quota radar and relay manager"
  homepage "https://github.com/wuyunfeng8/Antigravity-Manager"

  on_macos do
    arch intel: "x64", arm: "aarch64"

    url "https://github.com/wuyunfeng8/Antigravity-Manager/releases/download/v#{version}/AMT_#{version}_#{arch}.dmg"

    app "AMT.app"

    postflight_steps do
      run "/usr/bin/xattr",
          args:         ["-rd", "com.apple.quarantine", "{{appdir}}/AMT.app"],
          must_succeed: false
    end

    zap trash: [
      "~/Library/Application Support/com.lbjlaq.antigravity-tools",
      "~/Library/Caches/com.lbjlaq.antigravity-tools",
      "~/Library/Preferences/com.lbjlaq.antigravity-tools.plist",
      "~/Library/Saved Application State/com.lbjlaq.antigravity-tools.savedState",
    ]
  end

  on_linux do
    arch arm: "aarch64", intel: "amd64"

    url "https://github.com/wuyunfeng8/Antigravity-Manager/releases/download/v#{version}/AMT_#{version}_#{arch}.AppImage"
    binary "AMT_#{version}_#{arch}.AppImage", target: "amt"

    preflight_steps do
      set_permissions "AMT_{{version}}_{{arch}}.AppImage", "0755"
    end
  end
end
