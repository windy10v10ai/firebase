#!/bin/bash
# 把 .app 打成拖拽安装的 DMG（App 与「应用程序」快捷方式并排），并挂载核对内容
set -euo pipefail
APP="${1:?Usage: make-dmg.sh <app> <dmg> <version>}"
DMG="${2:?Usage: make-dmg.sh <app> <dmg> <version>}"
VERSION="${3:?Usage: make-dmg.sh <app> <dmg> <version>}"
fail() { echo "make-dmg: $*" >&2; exit 1; }

STAGE=$(mktemp -d)
MOUNT=$(mktemp -d)
trap 'hdiutil detach "$MOUNT" -quiet 2>/dev/null || true; rm -rf "$STAGE" "$MOUNT"' EXIT
ditto "$APP" "$STAGE/Windy10v10AI.app"
ln -s /Applications "$STAGE/Applications"
rm -f "$DMG"
hdiutil create -volname "Windy10v10AI $VERSION" -srcfolder "$STAGE" -ov -format UDZO "$DMG" -quiet

hdiutil attach "$DMG" -readonly -nobrowse -mountpoint "$MOUNT" -quiet
[ "$(readlink "$MOUNT/Applications")" = "/Applications" ] || fail "Applications shortcut missing"
codesign --verify --deep --strict "$MOUNT/Windy10v10AI.app"
actual=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$MOUNT/Windy10v10AI.app/Contents/Info.plist")
[ "$actual" = "$VERSION" ] || fail "app version is $actual, expected $VERSION"
echo "sha256: $(shasum -a 256 "$DMG" | cut -d' ' -f1)"
echo "verified $DMG ($VERSION)"
