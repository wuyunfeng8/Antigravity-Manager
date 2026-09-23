cask "antigravity-tools" do
  version "1.1.0"

  name "AMT"
  desc "Antigravity account quota radar and relay manager"
  homepage "https://github.com/wuyunfeng8/Antigravity-Manager"

  on_macos do
    arch intel: "x64", arm: "aarch64"
    sha256 arm: "e96d716cb1be2755e87db7928f816a76b5b0e99d4aa7d41b1efc3bc0219e2afb",
           intel: "817e7582e81bfebcc6459d72dec27e0738b75deedd09ffa559f972c503a09e9b"

    url "https://github.com/wuyunfeng8/Antigravity-Manager/releases/download/v#{version}/AMT_#{version}_#{arch}.dmg"

    app "AMT.app"

    zap trash: [
      "~/Library/Application Support/com.lbjlaq.antigravity-tools",
      "~/Library/Caches/com.lbjlaq.antigravity-tools",
      "~/Library/Preferences/com.lbjlaq.antigravity-tools.plist",
      "~/Library/Saved Application State/com.lbjlaq.antigravity-tools.savedState",
    ]
  end

end
