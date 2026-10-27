#!/bin/bash
# 把 .app 打成拖拽安装的 DMG（App 与「应用程序」快捷方式并排），并挂载核对内容
set -euo pipefail
APP="${1:?Usage: make-dmg.sh <app> <dmg> <version>}"
DMG="${2:?Usage: make-dmg.sh <app> <dmg> <version>}"
VERSION="${3:?Usage: make-dmg.sh <app> <dmg> <version>}"
fail() { echo "make-dmg: $*" >&2; exit 1; }

MOUNT=$(mktemp -d)
trap 'hdiutil detach "$MOUNT" -quiet 2>/dev/null || true; rm -rf "$MOUNT"' EXIT
command -v dmgbuild >/dev/null || fail "dmgbuild not found (pip3 install dmgbuild)"
HERE="$(cd "$(dirname "$0")" && pwd)"
# 背景图与窗口布局由 dmgbuild 直接写入 .DS_Store，不依赖 Finder，CI 上也能跑
rm -f "$DMG"
dmgbuild -s "$HERE/dmg-settings.py" -D "app=$APP" -D "background=$HERE/Native/dmg-background.tiff" "Windy10v10AI $VERSION" "$DMG" >/dev/null

hdiutil attach "$DMG" -readonly -nobrowse -mountpoint "$MOUNT" -quiet
[ "$(readlink "$MOUNT/Applications")" = "/Applications" ] || fail "Applications shortcut missing"
[ -f "$MOUNT/.background.tiff" ] || fail "background image missing"
[ -f "$MOUNT/.DS_Store" ] || fail "window layout missing"
[ -f "$MOUNT/.VolumeIcon.icns" ] || fail "volume icon missing"
codesign --verify --deep --strict "$MOUNT/Windy10v10AI.app"
actual=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$MOUNT/Windy10v10AI.app/Contents/Info.plist")
[ "$actual" = "$VERSION" ] || fail "app version is $actual, expected $VERSION"
echo "sha256: $(shasum -a 256 "$DMG" | cut -d' ' -f1)"
echo "verified $DMG ($VERSION)"
