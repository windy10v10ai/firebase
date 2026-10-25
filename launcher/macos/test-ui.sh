#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
python3 - "${1:?Usage: test-ui.sh <screenshot-directory>}" "$PWD/dist/Windy10v10AI.app/Contents/MacOS/WindyMac" <<'PY'
import pathlib
import struct
import subprocess
import sys

output = pathlib.Path(sys.argv[1]).resolve()
executable = pathlib.Path(sys.argv[2])
if not executable.is_file():
    sys.exit("Build the Mac application before running UI previews")
output.mkdir(parents=True, exist_ok=True)
cases = [
    ("host-idle", "on"), ("host-idle", "off"),
    ("host-starting", "on"), ("host", "on"), ("ended", "on"),
    *[(state, checked) for state in ("join-waiting", "join-ready", "join-playing", "join-ended") for checked in ("on", "off")],
    ("join-error", "on"), ("join-left", "on"), ("idle", "on"),
]
failures = []
for language in ("zh-CN", "en-US", "ru-RU"):
    for state, checked in cases:
        name = f"{language}-{state}-{checked}"
        screenshot = output / f"{name}.png"
        screenshot.unlink(missing_ok=True)
        command = [str(executable), "--preview", language, "--preview-state", state,
                   "--preview-auto-enter", checked, "--preview-auto-start", checked,
                   "--screenshot", str(screenshot)]
        try:
            result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=45)
            (output / f"{name}.log").write_bytes(result.stdout)
            if result.returncode:
                raise RuntimeError(f"preview exited with {result.returncode}")
            data = screenshot.read_bytes()
            if len(data) < 24 or data[:8] != b"\x89PNG\r\n\x1a\n" or not all(struct.unpack(">II", data[16:24])):
                raise RuntimeError("preview did not produce a nonempty PNG")
            print(f"PASS {name}", flush=True)
        except (OSError, RuntimeError, subprocess.TimeoutExpired) as error:
            if isinstance(error, subprocess.TimeoutExpired):
                (output / f"{name}.log").write_bytes((error.stdout or b"") + b"\nPreview timed out after 45 seconds\n")
            failures.append(f"{name}: {error}")
            print(f"FAIL {failures[-1]}", flush=True)
if failures:
    sys.exit("\n".join(failures))
print(f"PASS Mac UI previews ({len(cases) * 3} screenshots)")
PY
