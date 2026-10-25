# Agent instructions

Before making changes in this repository, read and follow [CLAUDE.md](.claude/CLAUDE.md). It is the canonical source for repository conventions, development commands, testing requirements, branch naming, and pull-request workflow.

## Skills

Reusable task instructions live in `.claude/skills/<name>/SKILL.md`. Read the matching file before starting a task its description covers — player data migration, game data sync, launcher release, cheat handling, feedback review, debugging, docs.

- Claude Code reads `.claude/skills` directly.
- Codex and DSH discover project skills at `.agents/skills`. Run `npm run skills:link` once per checkout to create that link; it stays out of git.
- Run `npm run skills:check` after adding or editing a skill.
