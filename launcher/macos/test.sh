#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
DOTNET_BIN="${DOTNET_BIN:-dotnet}"
"$DOTNET_BIN" build WindyMac.csproj -c Release
python3 - "$DOTNET_BIN" "$PWD/bin/Release/net10.0/WindyMacEngine.dll" <<'PY'
import subprocess,sys
# 为测试设置超时，避免套接字释放异常使校验无限等待。
result=subprocess.run([sys.argv[1],sys.argv[2],'--self-test'],timeout=45)
sys.exit(result.returncode)
PY
