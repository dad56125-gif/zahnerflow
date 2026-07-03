import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import * as sass from 'sass';

const args = new Set(process.argv.slice(2));
const jsonMode = args.has('--json');
const failMode = args.has('--fail');

const cwd = process.cwd();
const root = fs.existsSync(path.join(cwd, 'src/styles/main.scss'))
  ? cwd
  : path.join(cwd, 'apps/frontend');
const srcRoot = path.join(root, 'src');
const mainScss = path.join(srcRoot, 'styles/main.scss');

function walk(dir, extensions, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, extensions, out);
    } else if (extensions.includes(path.extname(entry.name))) {
      out.push(fullPath);
    }
  }
  return out;
}

function lineOf(text, pos) {
  return text.slice(0, pos).split(/\r?\n/).length;
}

function extractClassTokens(value) {
  return [...new Set(
    value
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean)
      .filter((token) => /^[A-Za-z_][A-Za-z0-9_-]*$/.test(token))
  )];
}

function collectStrings(node, out = []) {
  if (!node) return out;

  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    out.push(node.text);
  } else if (ts.isTemplateExpression(node)) {
    out.push(node.head.text);
    for (const span of node.templateSpans) {
      out.push(span.literal.text);
      collectStrings(span.expression, out);
    }
  } else if (ts.isConditionalExpression(node)) {
    collectStrings(node.whenTrue, out);
    collectStrings(node.whenFalse, out);
  } else if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    collectStrings(node.left, out);
    collectStrings(node.right, out);
  } else if (ts.isArrayLiteralExpression(node)) {
    for (const element of node.elements) collectStrings(element, out);
  } else if (ts.isCallExpression(node)) {
    for (const arg of node.arguments) collectStrings(arg, out);
  } else if (ts.isParenthesizedExpression(node) || ts.isJsxExpression(node)) {
    collectStrings(node.expression, out);
  } else if (ts.isObjectLiteralExpression(node)) {
    for (const prop of node.properties) {
      if (ts.isPropertyAssignment(prop)) {
        collectStrings(prop.name, out);
        collectStrings(prop.initializer, out);
      }
    }
  }

  return out;
}

function collectClassUses() {
  const classUses = new Map();
  const tsFiles = walk(srcRoot, ['.tsx', '.ts']).filter((file) => !file.endsWith('.d.ts'));
  let classNameAttributeCount = 0;

  function add(token, file, text, pos) {
    if (!classUses.has(token)) classUses.set(token, []);
    classUses.get(token).push({
      file: path.relative(root, file),
      line: lineOf(text, pos),
    });
  }

  for (const file of tsFiles) {
    const text = fs.readFileSync(file, 'utf8');
    const sourceFile = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

    function visit(node) {
      if (ts.isJsxAttribute(node) && node.name.text === 'className') {
        classNameAttributeCount += 1;
        const strings = [];
        collectStrings(node.initializer, strings);
        for (const value of strings) {
          for (const token of extractClassTokens(value)) {
            add(token, file, text, node.pos);
          }
        }
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }

  return { classUses, tsFileCount: tsFiles.length, classNameAttributeCount };
}

function collectCssClasses() {
  const compiled = sass.compile(mainScss, {
    style: 'expanded',
    loadPaths: [path.join(srcRoot, 'styles')],
    logger: {
      warn() {},
      debug() {},
    },
  });

  const cssClasses = new Set();
  for (const match of compiled.css.matchAll(/\.(-?[_a-zA-Z]+[_a-zA-Z0-9-]*)/g)) {
    const className = match[1];
    if (!className.startsWith('-')) cssClasses.add(className);
  }

  return cssClasses;
}

function candidateBemTargets(className, cssClasses) {
  const parts = className.split('-');
  const candidates = [];

  for (let i = 1; i < parts.length; i += 1) {
    candidates.push(`${parts.slice(0, i).join('-')}__${parts.slice(i).join('-')}`);
    candidates.push(`${parts.slice(0, i).join('-')}--${parts.slice(i).join('-')}`);
  }

  const remaps = [
    ['notification-panel', 'notification'],
    ['progress-bar', 'progress-bar'],
    ['schedule-runner', 'schedule-runner'],
    ['device-connection', 'device-connection'],
    ['data-viewer', 'data-viewer'],
    ['chart-modal', 'chart-modal'],
    ['loop-boundary', 'loop-boundary'],
    ['connection', 'connection'],
    ['console', 'console'],
    ['mfc', 'mfc'],
    ['node', 'node'],
  ];

  for (const [oldBlock, newBlock] of remaps) {
    if (className === oldBlock) candidates.push(newBlock);
    if (className.startsWith(`${oldBlock}-`)) {
      candidates.push(`${newBlock}__${className.slice(oldBlock.length + 1)}`);
    }
  }

  return [...new Set(candidates)].filter((candidate) => cssClasses.has(candidate));
}

const { classUses, tsFileCount, classNameAttributeCount } = collectClassUses();
const cssClasses = collectCssClasses();
const usedClasses = [...classUses.keys()].sort();
const usedButUnstyled = usedClasses.filter((className) => !cssClasses.has(className));
const oldUnderscoreUses = usedClasses.filter(
  (className) => /(^|[a-z0-9])_[a-z0-9]/i.test(className) && !className.includes('__'),
);
const mappedBemTargets = usedButUnstyled
  .map((className) => ({
    className,
    targets: candidateBemTargets(className, cssClasses),
    uses: classUses.get(className).slice(0, 8),
  }))
  .filter((entry) => entry.targets.length > 0);

const result = {
  root,
  summary: {
    tsFileCount,
    classNameAttributeCount,
    usedClassCount: usedClasses.length,
    cssClassCount: cssClasses.size,
    usedButUnstyledCount: usedButUnstyled.length,
    mappedBemTargetCount: mappedBemTargets.length,
    oldUnderscoreUseCount: oldUnderscoreUses.length,
  },
  oldUnderscoreUses,
  mappedBemTargets,
};

if (jsonMode) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log('BEM audit summary');
  console.log(`root: ${result.root}`);
  for (const [key, value] of Object.entries(result.summary)) {
    console.log(`${key}: ${value}`);
  }
  console.log('');
  console.log('Old underscore class uses:');
  console.log(oldUnderscoreUses.length ? oldUnderscoreUses.join(', ') : 'none');
  console.log('');
  console.log('Mapped legacy class -> existing BEM target:');
  for (const entry of mappedBemTargets) {
    const locations = entry.uses.map((use) => `${use.file}:${use.line}`).join(', ');
    console.log(`- ${entry.className} -> ${entry.targets.join(', ')} (${locations})`);
  }
}

if (failMode && (mappedBemTargets.length > 0 || oldUnderscoreUses.length > 0)) {
  process.exitCode = 1;
}
