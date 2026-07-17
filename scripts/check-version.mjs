import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const version = readFileSync(resolve(root, 'VERSION'), 'utf8').trim();
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`VERSION 不是有效的语义化版本号: ${version}`);

const errors = [];
for (const relativePath of ['package.json', 'apps/frontend/package.json', 'apps/desktop/package.json', 'packages/types/package.json']) {
  const path = resolve(root, relativePath);
  const actual = JSON.parse(readFileSync(path, 'utf8')).version;
  if (actual !== version) errors.push(`${relativePath}: ${actual} !== ${version}`);
}
const pyproject = readFileSync(resolve(root, 'pyproject.toml'), 'utf8');
const pyprojectVersion = pyproject.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
if (pyprojectVersion !== version) errors.push(`pyproject.toml: ${pyprojectVersion} !== ${version}`);
const generated = [
  ['apps/python_backend/version.py', `APP_VERSION = ${JSON.stringify(version)}`],
  ['apps/frontend/src/generated/appVersion.ts', `APP_VERSION = ${JSON.stringify(version)}`],
  ['apps/desktop/src/generated/appVersion.ts', `APP_VERSION = ${JSON.stringify(version)}`],
];
for (const [relativePath, marker] of generated) {
  if (!readFileSync(resolve(root, relativePath), 'utf8').includes(marker)) errors.push(`${relativePath}: 未同步 ${version}`);
}
if (errors.length) {
  console.error(['版本一致性检查失败：', ...errors.map(error => `- ${error}`)].join('\n'));
  process.exit(1);
}
console.log(`版本一致性检查通过: ${version}`);
