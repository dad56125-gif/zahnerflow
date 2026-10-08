import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// 图形生成器，只读取本目录结构化研究输入，不读取或修改产品代码。
const dir = path.dirname(fileURLToPath(import.meta.url));
const graph = JSON.parse(await readFile(path.join(dir, 'graph.json'), 'utf8'));
const template = await readFile(path.join(dir, 'network.template.html'), 'utf8');
if (!template.includes('/*__GRAPH_DATA__*/')) throw new Error('缺少数据占位');
const ids = new Set();
for (const m of graph.modules) {
  if (ids.has(m.id)) throw new Error(`重复模块 ${m.id}`);
  ids.add(m.id);
  for (const f of m.features) {
    if (ids.has(f.id)) throw new Error(`重复功能 ${f.id}`);
    ids.add(f.id);
  }
}
const moduleIds = new Set(graph.modules.map(m => m.id));
for (const m of graph.modules) {
  for (const n of [m, ...m.features]) {
    for (const related of n.related || []) {
      if (!moduleIds.has(related)) throw new Error(`无效关联 ${n.id} → ${related}`);
    }
  }
}
const embedded = JSON.stringify(graph).replace(/</g, '\u003c');
await writeFile(path.join(dir, 'feature-network.html'), template.replace('/*__GRAPH_DATA__*/', embedded), 'utf8');
console.log(`全景图已生成：${graph.modules.length} 模块，${graph.modules.reduce((n,m)=>n+m.features.length,0)} 能力条目；main ${graph.baseline.sha}`);
