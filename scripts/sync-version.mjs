import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const version = readFileSync(resolve(root, 'VERSION'), 'utf8').trim();
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error(`VERSION 不是有效的语义化版本号: ${version}`);
}

const packageFiles = [
  'package.json',
  'apps/frontend/package.json',
  'apps/desktop/package.json',
  'packages/types/package.json',
];
for (const relativePath of packageFiles) {
  const path = resolve(root, relativePath);
  const pkg = JSON.parse(readFileSync(path, 'utf8'));
  pkg.version = version;
  writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`);
}

const pyprojectPath = resolve(root, 'pyproject.toml');
const pyproject = readFileSync(pyprojectPath, 'utf8');
const nextPyproject = pyproject.replace(/(^version\s*=\s*)"[^"]+"/m, `$1"${version}"`);
if (!/^version\s*=\s*"[^"]+"/m.test(pyproject)) throw new Error('pyproject.toml 未找到项目 version');
writeFileSync(pyprojectPath, nextPyproject);

// uv.lock 的根项目版本是 VERSION 的派生值，第三方依赖条目保持不变。
const lockPath = resolve(root, 'uv.lock');
const lock = readFileSync(lockPath, 'utf8');
const rootPackagePattern = /(name = "zahnerflow-runtime"\r?\nversion = )"[^"]+"/;
if (!rootPackagePattern.test(lock)) throw new Error('uv.lock 未找到根项目版本');
writeFileSync(lockPath, lock.replace(rootPackagePattern, `$1"${version}"`));

const generatedFiles = [
  ['apps/python_backend/version.py', `APP_VERSION = ${JSON.stringify(version)}\n`],
  ['apps/frontend/src/generated/appVersion.ts', `export const APP_VERSION = ${JSON.stringify(version)} as const;\n`],
  ['apps/desktop/src/generated/appVersion.ts', `export const APP_VERSION = ${JSON.stringify(version)} as const;\n`],
];
for (const [relativePath, content] of generatedFiles) {
  const path = resolve(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

console.log(`已同步应用版本 ${version}`);
