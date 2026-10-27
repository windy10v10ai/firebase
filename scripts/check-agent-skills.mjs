#!/usr/bin/env node
// 三个工具的 skill 目录都只认 frontmatter 里的 name/description，格式写坏不会报错、只会静默消失，
// 所以放在 CI 里统一校验，而不是等某个 agent 调用失败才发现。
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const skillsDir = join(repoRoot, '.claude', 'skills');
const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_NAME_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 1024;

function parseFrontmatter(text) {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) return null;

  const end = normalized.indexOf('\n---', 3);
  if (end === -1) return null;

  const fields = new Map();
  for (const line of normalized.slice(4, end).split('\n')) {
    const match = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (match) fields.set(match[1], match[2].trim().replace(/^(['"])(.*)\1$/, '$2'));
  }
  return fields;
}

const skillNames = readdirSync(skillsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
  .map((entry) => entry.name)
  .sort();

const problems = [];
for (const skillName of skillNames) {
  const skillFile = join(skillsDir, skillName, 'SKILL.md');
  if (!existsSync(skillFile)) {
    problems.push(`${skillName}: 缺少 SKILL.md`);
    continue;
  }

  const fields = parseFrontmatter(readFileSync(skillFile, 'utf8'));
  if (fields === null) {
    problems.push(`${skillName}: SKILL.md 开头缺少 --- 分隔的 YAML frontmatter`);
    continue;
  }

  const name = fields.get('name') ?? '';
  const description = fields.get('description') ?? '';

  if (!name) problems.push(`${skillName}: frontmatter 缺少 name`);
  else if (!NAME_PATTERN.test(name)) problems.push(`${skillName}: name "${name}" 不是 kebab-case`);
  else if (name.length > MAX_NAME_LENGTH)
    problems.push(`${skillName}: name 超过 ${MAX_NAME_LENGTH} 字符`);
  else if (name !== skillName) problems.push(`${skillName}: name "${name}" 与目录名不一致`);

  if (!description) problems.push(`${skillName}: frontmatter 缺少 description`);
  else if (description.length > MAX_DESCRIPTION_LENGTH) {
    problems.push(`${skillName}: description 超过 ${MAX_DESCRIPTION_LENGTH} 字符`);
  }
}

if (skillNames.length === 0) problems.push('没有找到任何 skill');

if (problems.length > 0) {
  for (const problem of problems) console.error(`error: ${problem}`);
  console.error(`\n${problems.length} 处问题，共检查 ${skillNames.length} 个 skill`);
  process.exit(1);
}

console.log(`已检查 ${skillNames.length} 个 skill，frontmatter 均有效`);
