// 人工复核阶段清单 → Git 证据与发布图；不自动推断修复或迁移。
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const lines = s => s ? s.split('\n') : [];
const fail = message => { throw new Error(message); };
const input = process.argv[2];
const output = process.argv[3];
if (!input || !output) fail('用法：node scripts/release-update-tree.mjs 阶段清单.json 输出目录');
const config = JSON.parse(readFileSync(resolve(input), 'utf8').replace(/^\uFEFF/, ''));
const full = sha => git('rev-parse', `${sha}^{commit}`);
config.baseline = full(config.baseline);
config.target = full(config.target);
git('merge-base', '--is-ancestor', config.baseline, config.target);
const version = sha => git('show', `${sha}:VERSION`);
if (version(config.baseline) !== config.baselineVersion || version(config.target) !== config.targetVersion)
  fail('版本与固定源码提交不一致');
const all = lines(git('rev-list', '--reverse', '--topo-order', `${config.baseline}..${config.target}`));
const allSet = new Set(all);
if (!all.length) fail('发布范围为空');
if (!config.baselineNote || !config.targetNote) fail('必须说明基线证据和发布验收边界');
const assigned = new Map();
const allowed = new Set(['UI', 'Bug', '功能', '数据／契约', '文档', '合并', '工程']);
const stages = config.stages.map(stage => {
  if (!stage.types.length || stage.types.some(t => !allowed.has(t)) || !stage.data) fail(`阶段分类缺失：${stage.id}`);
  if (assigned.has(`stage:${stage.id}`)) fail(`重复阶段：${stage.id}`);
  assigned.set(`stage:${stage.id}`, true);
  const commits = lines(git('rev-list', '--reverse', ...(stage.firstParent ? ['--first-parent'] : []), `${full(stage.from)}..${full(stage.to)}`));
  if (!commits.length) fail(`空阶段：${stage.id}`);
  for (const sha of commits) {
    if (!allSet.has(sha)) fail(`范围外提交：${sha}`);
    if (assigned.has(sha)) fail(`重复覆盖：${sha}`);
    assigned.set(sha, stage.id);
  }
  return { ...stage, commits, count: commits.length };
});
for (const sha of all) if (!assigned.has(sha)) fail(`遗漏提交：${sha}`);
const nodes = all.map(sha => {
  const [parents, date, title] = git('show', '-s', '--format=%P%n%aI%n%s', sha).split('\n');
  return { hash: sha, short: sha.slice(0, 7), parents: parents ? parents.split(' ') : [], date, title,
    version: version(sha), stage: assigned.get(sha),
    files: lines(git('diff-tree', '--no-commit-id', '--name-only', '-r', sha, ...(parents.includes(' ') ? ['-m'] : []))) };
});
for (const stage of stages.filter(s => s.branchFrom)) {
  if (!stages.some(s => s.mergeFrom === stage.id)) fail(`缺少支线汇入阶段：${stage.id}`);
  const fork = full(stage.branchFrom);
  if (nodes.find(n => n.hash === stage.commits[0]).parents[0] !== fork) fail(`分支起点错误：${stage.id}`);
  const forkStage = stages.find(s => s.id === stage.forkStage);
  if (!forkStage || !forkStage.commits.includes(fork)) fail(`分出阶段不包含真实起点：${stage.id}`);
}
for (const stage of stages.filter(s => s.mergeFrom)) {
  const branch = stages.find(s => s.id === stage.mergeFrom);
  const merge = nodes.find(n => n.hash === full(stage.mergeCommit));
  if (!branch || !merge || !stage.commits.includes(merge.hash) || !merge.parents.slice(1).includes(full(branch.to)))
    fail(`合并父提交不匹配：${stage.id}`);
}
let excluded = null;
if (config.excludedBranch) {
  excluded = { name: config.excludedBranch, hash: full(config.excludedBranch) };
  if (allSet.has(excluded.hash)) fail('排除分支已计入发布范围');
  try { git('merge-base', '--is-ancestor', excluded.hash, config.target); fail('排除分支已合并'); }
  catch (error) { if (error.status !== 1) throw error; }
}
const recent = config.recentBaseline ? full(config.recentBaseline) : config.baseline;
git('merge-base', '--is-ancestor', config.baseline, recent);
git('merge-base', '--is-ancestor', recent, config.target);
if (config.recentVersion && version(recent) !== config.recentVersion) fail('最近发布基线版本错误');
const recentCommits = lines(git('rev-list', `${recent}..${config.target}`));
const data = { ...config, stages, nodes, excluded, count: all.length,
  mergeCount: nodes.filter(n => n.parents.length > 1).length, recentCommits };
mkdirSync(resolve(output), { recursive: true });
const template = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'release-update-tree.html'), 'utf8');
const json = JSON.stringify(data).replaceAll('<', '\\u003c');
writeFileSync(resolve(output, 'release-update-tree.html'), template.replace('RELEASE_TREE_DATA', json));
writeFileSync(resolve(output, 'commits.json'), JSON.stringify(data, null, 2) + '\n');
console.log(JSON.stringify({ count: data.count, merges: data.mergeCount, recent: recentCommits.length,
  stages: stages.map(s => [s.id, s.count]), target: config.target, excluded }, null, 2));
