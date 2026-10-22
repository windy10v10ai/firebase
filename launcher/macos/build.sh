#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
DOTNET_BIN="${DOTNET_BIN:-dotnet}"
APP_OUT="${APP_OUT:-dist/WindyMac.app}"
mkdir -p "$APP_OUT/Contents/MacOS" "$APP_OUT/Contents/Resources/engine"
"$DOTNET_BIN" publish WindyMac.csproj -c Release -r osx-arm64 --self-contained true -o "$APP_OUT/Contents/Resources/engine"
swiftc -swift-version 5 -target arm64-apple-macosx13.0 -O Native/Launcher.swift -o "$APP_OUT/Contents/MacOS/WindyMac" -framework Cocoa
clang -arch x86_64 -mmacosx-version-min=13.0 -O2 Native/WorkshopUpdate.c -o "$APP_OUT/Contents/MacOS/WorkshopUpdate"
cp Native/Info.plist "$APP_OUT/Contents/Info.plist"
cp Notices/*.txt "$APP_OUT/Contents/Resources/engine/"
cp LICENSE LICENSE.EXCEPTIONS.md UPSTREAM.md "$APP_OUT/Contents/Resources/"
codesign --force --deep --sign - "$APP_OUT"
printf 'Built %s\n' "$APP_OUT"
