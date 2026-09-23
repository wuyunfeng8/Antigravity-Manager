cask "antigravity-tools" do
  version "1.0.1"

  name "AMT"
  desc "Antigravity account quota radar and relay manager"
  homepage "https://github.com/wuyunfeng8/Antigravity-Manager"

  on_macos do
    arch intel: "x64", arm: "aarch64"
    sha256 arm: "a388ee3f9ede0cb827069dc62a9aeeb99bb63950a526cb8f3951fe0d67f3da3a",
           intel: "5a9831589110f3c788ceeb892b82edae721efb7bc53ae4a9e151f3b2d1cc09af"

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
