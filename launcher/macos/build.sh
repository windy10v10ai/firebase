#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
DOTNET_BIN="${DOTNET_BIN:-dotnet}"
APP_OUT="${APP_OUT:-dist/Windy10v10AI.app}"
VERSION=$(python3 - <<'PY'
import pathlib, re
source = pathlib.Path('../core/LauncherVersion.cs').read_text()
print(re.search(r'Current = "([^"]+)"', source).group(1))
PY
)
mkdir -p "$APP_OUT/Contents/MacOS" "$APP_OUT/Contents/Resources/engine"
"$DOTNET_BIN" publish WindyMac.csproj -c Release -r osx-arm64 --self-contained true -p:Version="$VERSION" -o "$APP_OUT/Contents/Resources/engine"
for language in zh-CN en-US ru-RU; do
    "$APP_OUT/Contents/Resources/engine/WindyMacEngine" --strings "$language" > "$APP_OUT/Contents/Resources/strings-$language.json"
done
bash build-native.sh "$APP_OUT/Contents/MacOS"
cp ../assets/banner.jpg "$APP_OUT/Contents/Resources/"
cp Native/Info.plist "$APP_OUT/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $VERSION" "$APP_OUT/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $VERSION" "$APP_OUT/Contents/Info.plist"
cp Notices/*.txt "$APP_OUT/Contents/Resources/engine/"
cp ../../LICENSE ../../LICENSE.EXCEPTIONS.md UPSTREAM.md "$APP_OUT/Contents/Resources/"
codesign --force --deep --sign - "$APP_OUT"
codesign --verify --deep --strict "$APP_OUT"
printf 'Built %s (%s)\n' "$APP_OUT" "$VERSION"
