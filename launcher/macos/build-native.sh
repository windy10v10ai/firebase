#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
NATIVE_OUT="${1:?Usage: build-native.sh <output-directory>}"
mkdir -p "$NATIVE_OUT"
swiftc -swift-version 5 -target arm64-apple-macosx13.0 -O Native/Launcher.swift -o "$NATIVE_OUT/WindyMac" -framework Cocoa
clang -arch x86_64 -mmacosx-version-min=13.0 -O2 Native/WorkshopUpdate.c -o "$NATIVE_OUT/WorkshopUpdate"
