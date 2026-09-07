import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const styles = resolve(root, 'apps/frontend/src/styles');
const errors = [];
const tokenSource = readFileSync(resolve(styles, '_tokens.scss'), 'utf8');
const tokens = new Set([...tokenSource.matchAll(/(--[\w-]+)\s*:/g)].map(match => match[1]));
const adopted = new Set(['_unroll.scss', '_avatar-crop.scss', '_node-icons.scss']);
for (const name of readdirSync(styles).filter(name => name.endsWith('.scss'))) {
  const content = readFileSync(resolve(styles, name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  if (/@import\b/.test(content)) errors.push(`${name}: 禁止旧 Sass @import`);
  if (name !== '_tokens.scss' && name !== '_base.scss') {
    for (const match of content.matchAll(/(--[\w-]+)\s*:/g)) {
      if (tokens.has(match[1])) errors.push(`${name}: 核心令牌 ${match[1]} 只能在 _tokens.scss 定义，布局响应式例外位于 _base.scss`);
    }
  }
  if (adopted.has(name) && /#[\da-f]{3,8}\b|rgba?\(|hsla?\(/i.test(content)) errors.push(`${name}: 已统一组件禁止原始颜色，请引用语义令牌`);
}
if (errors.length) { process.stderr.write(errors.join('\n') + '\n'); process.exit(1); }
process.stdout.write(`设计规范检查通过：${tokens.size} 个核心令牌，Sass 模块入口，已统一组件颜色。\n`);
