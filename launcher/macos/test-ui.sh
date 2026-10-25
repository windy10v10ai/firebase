#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
python3 - "${1:?Usage: test-ui.sh <screenshot-directory> [all|host|join|feedback] [all|zh-CN|en-US|ru-RU]}" "$PWD/dist/Windy10v10AI.app/Contents/MacOS/WindyMac" "${2:-all}" "${3:-all}" <<'PY'
import json
import pathlib
import struct
import subprocess
import sys

output = pathlib.Path(sys.argv[1]).resolve()
executable = pathlib.Path(sys.argv[2])
scope, language = sys.argv[3:5]
languages = ("zh-CN", "en-US", "ru-RU")
if scope not in ("all", "host", "join", "feedback"):
    sys.exit("Scope must be all, host, join, or feedback")
if language != "all" and language not in languages:
    sys.exit("Language must be all, zh-CN, en-US, or ru-RU")
languages = languages if language == "all" else (language,)
if not executable.is_file():
    sys.exit("Build the Mac application before running UI previews")
output.mkdir(parents=True, exist_ok=True)
groups = {
    "host": [("host-idle", "on"), ("host-idle", "off"),
             ("host-starting", "on"), ("host", "on"), ("ended", "on")],
    "join": [*[(state, checked) for state in ("join-checking", "join-waiting", "join-ready", "join-playing", "join-ended") for checked in ("on", "off")],
             ("join-error", "on"), ("join-left", "on")],
    "feedback": [("feedback", "on")],
}
cases = [case for group in groups.values() for case in group] + [("idle", "on")] if scope == "all" else groups[scope]
failures = []
passed = []
for language in languages:
    for state, checked in cases:
        name = f"{language}-{state}-{checked}"
        screenshot = output / f"{name}.png"
        screenshot.unlink(missing_ok=True)
        log = output / f"{name}.log"
        log.unlink(missing_ok=True)
        command = [str(executable), "--preview", language, "--preview-state", state,
                   "--preview-auto-enter", checked, "--preview-auto-start", checked,
                   "--screenshot", str(screenshot)]
        try:
            result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=45)
            log.write_bytes(result.stdout)
            if not result.stdout:
                raise RuntimeError("preview did not produce a nonempty log")
            if result.returncode:
                raise RuntimeError(f"preview exited with {result.returncode}")
            data = screenshot.read_bytes()
            if len(data) < 24 or data[:8] != b"\x89PNG\r\n\x1a\n" or not all(struct.unpack(">II", data[16:24])):
                raise RuntimeError("preview did not produce a nonempty PNG")
            passed.append(name)
            print(f"PASS {name}", flush=True)
        except (OSError, RuntimeError, subprocess.TimeoutExpired) as error:
            if isinstance(error, subprocess.TimeoutExpired):
                log.write_bytes(error.stdout or b"")
            details = (log.read_bytes() if log.exists() else b"") + (f"\nFAIL {name}: {error}\n").encode()
            log.write_bytes(details)
            failures.append(f"{name}: {error}")
            print(f"FAIL {failures[-1]}", flush=True)
(output / "report.json").write_text(json.dumps({"scope": scope, "languages": languages, "planned": len(cases) * len(languages), "passed": passed, "failures": failures}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
if failures:
    sys.exit("\n".join(failures))
print(f"PASS Mac UI previews ({len(cases) * len(languages)} screenshots)")
PY
