# Agent instructions

Before making changes in this directory, read and follow [CLAUDE.md](CLAUDE.md) here and the repository-wide [CLAUDE.md](../CLAUDE.md).

`next dev` writes a managed `nextjs-agent-rules` block into this file. It picks this file over `CLAUDE.md` whenever it exists, so keeping it here is what stops the block from landing in `CLAUDE.md` on every run. Commit the block as written; only remove this file if that behaviour changes.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
