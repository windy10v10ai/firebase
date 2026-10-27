#!/bin/bash
# 校验发布用的 Mac 安装包：结构、版本、架构、签名，与应用内更新要求的条件一致
set -euo pipefail
ZIP="${1:?Usage: verify-package.sh <zip> <version>}"
VERSION="${2:?Usage: verify-package.sh <zip> <version>}"
fail() { echo "verify-package: $*" >&2; exit 1; }

if unzip -Z1 "$ZIP" | grep -v '^Windy10v10AI\.app/' | grep -q .; then fail "zip has entries outside Windy10v10AI.app"; fi
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
ditto -x -k "$ZIP" "$WORK"
APP="$WORK/Windy10v10AI.app"
[ -d "$APP" ] || fail "Windy10v10AI.app missing"

for key in CFBundleShortVersionString CFBundleVersion; do
    actual=$(/usr/libexec/PlistBuddy -c "Print :$key" "$APP/Contents/Info.plist")
    [ "$actual" = "$VERSION" ] || fail "$key is $actual, expected $VERSION"
done

# 地图更新辅助程序是 x86_64，靠 Rosetta 运行，所以只检查启动器本体与引擎
for binary in Contents/MacOS/WindyMac Contents/Resources/engine/WindyMacEngine; do
    archs=$(lipo -archs "$APP/$binary")
    [ "$archs" = "arm64" ] || fail "$binary is $archs, expected arm64"
done

codesign --verify --deep --strict "$APP"
# grep -q 提前退出会让上游因 SIGPIPE 失败，先落到变量里
details=$(codesign -dv "$APP" 2>&1)
[[ "$details" == *"Signature=adhoc"* ]] || fail "not ad hoc signed"

strings_json=$("$APP/Contents/Resources/engine/WindyMacEngine" --strings en-US)
[[ "$strings_json" == *'"UpdateFailed"'* ]] || fail "engine did not start"

echo "sha256: $(shasum -a 256 "$ZIP" | cut -d' ' -f1)"
echo "verified $ZIP ($VERSION)"
