import { execFileSync } from 'node:child_process';

const base = process.env.RELEASE_BASE || (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : 'HEAD^');
let changed;
try {
  changed = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean);
} catch (error) {
  console.error(`无法读取发布范围 ${base}...HEAD，请提供 RELEASE_BASE: ${error.message}`);
  process.exit(1);
}

const hasRuntimeChange = changed.some((path) =>
  path.startsWith('apps/') || path.startsWith('packages/') || path === 'pyproject.toml' || path === 'package.json'
);
if (hasRuntimeChange) {
  if (!changed.includes('VERSION') || !changed.includes('CHANGELOG.md')) {
    console.error('发布规则检查失败：运行时代码发生变化时，提交必须同时包含 VERSION 和 CHANGELOG.md。');
    process.exit(1);
  }
}
console.log(`发布规则检查通过: ${base}...HEAD`);
