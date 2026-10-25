#!/usr/bin/env node
// Claude Code 只读 .claude/skills，Codex 与 DSH 读仓库下的 .agents/skills；
// 用一次链接让两者共用同一份文件，避免维护两份内容一致、迟早漂移的 skill。
import { existsSync, lstatSync, mkdirSync, realpathSync, symlinkSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const skillsDir = join(repoRoot, '.claude', 'skills');
const agentsDir = join(repoRoot, '.agents');
const linkPath = join(agentsDir, 'skills');

if (!existsSync(skillsDir)) {
  console.error(`${skillsDir} 不存在`);
  process.exit(1);
}

let existing = null;
try {
  existing = lstatSync(linkPath);
} catch {
  // 还没建过，正常路径
}

if (existing !== null) {
  const current = existing.isSymbolicLink() ? realpathSync(linkPath) : null;
  if (current === realpathSync(skillsDir)) {
    console.log(`已存在链接：${linkPath}`);
    process.exit(0);
  }
  console.error(
    current === null
      ? `${linkPath} 是一个真实目录，请先删除它再运行本脚本`
      : `${linkPath} 指向 ${current}，请先删除该链接再运行本脚本`,
  );
  process.exit(1);
}

mkdirSync(agentsDir, { recursive: true });
if (process.platform === 'win32') {
  symlinkSync(skillsDir, linkPath, 'junction');
} else {
  symlinkSync(relative(agentsDir, skillsDir), linkPath, 'dir');
}

console.log(`已创建 ${linkPath} -> ${skillsDir}`);
console.log('Codex 与 DSH 下次读取目录时即可发现这些 skill；该链接不进 git。');
