"""生成可离线打开的截图总览，并把产物下载链接写入 Actions 摘要。"""

import argparse
import html
import os
from pathlib import Path
from urllib.parse import quote


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--artifact-url")
    args = parser.parse_args()
    directory = args.directory.resolve()
    screenshots = sorted(directory.rglob("*.png"))
    logs = sorted(directory.rglob("*.log"))
    if not screenshots:
        raise SystemExit("No screenshots were generated; inspect the capture step and logs")

    if args.artifact_url is not None:
        if not args.artifact_url:
            raise SystemExit("Screenshot artifact upload did not return a download URL")
        summary = os.environ.get("GITHUB_STEP_SUMMARY")
        if summary:
            with open(summary, "a", encoding="utf-8") as stream:
                stream.write(
                    f"### Launcher UI previews\n\n"
                    f"{len(screenshots)} screenshots, {len(logs)} logs.\n\n"
                    f"[Download screenshots, logs and overview]({args.artifact_url})\n\n"
                    "Extract the archive and open `index.html` to inspect all screenshots.\n"
                )
        return

    tiles = []
    for path in screenshots:
        relative = path.relative_to(directory).as_posix()
        name = html.escape(relative)
        url = quote(relative)
        tiles.append(
            f'<figure><a href="{url}"><img src="{url}" alt="{name}" loading="lazy"></a>'
            f"<figcaption>{name}</figcaption></figure>"
        )
    overview = (
        '<!doctype html><html lang="en"><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<title>Launcher UI previews</title><style>'
        'body{font-family:system-ui;margin:24px;background:#171512;color:#eee7e0}'
        'main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr));gap:24px}'
        'figure{margin:0}img{max-width:100%;height:auto}figcaption{overflow-wrap:anywhere}'
        'a{color:inherit}</style>'
        f"<h1>Launcher UI previews</h1><p>{len(screenshots)} screenshots; click to inspect the original.</p>"
        f'<main>{"".join(tiles)}</main></html>'
    )
    (directory / "index.html").write_text(overview, encoding="utf-8")
    report = ["# Launcher UI previews", "", f"Screenshots: {len(screenshots)}", f"Logs: {len(logs)}", ""]
    report.extend(
        f"- [{path.relative_to(directory).as_posix()}]({quote(path.relative_to(directory).as_posix())})"
        for path in screenshots + logs
    )
    (directory / "report.md").write_text("\n".join(report) + "\n", encoding="utf-8")
    print(f"Prepared overview for {len(screenshots)} screenshots")


if __name__ == "__main__":
    main()
