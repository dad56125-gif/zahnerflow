#!/usr/bin/env node

/**
 * ZahnerFlow Monorepo Setup Script
 * 初始化 monorepo 构建环境
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔧 Setting up ZahnerFlow monorepo...\n');

// 检查并创建必要的目录
const requiredDirs = [
  'scripts',
  'logs',
  'temp'
];

requiredDirs.forEach(dir => {
  const dirPath = path.join(process.cwd(), dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`✓ Created directory: ${dir}`);
  }
});

// 构建 types 包
console.log('\n📦 Building @zahnerflow/types package...');
try {
  execSync('pnpm --filter @zahnerflow/types build', {
    stdio: 'inherit',
    cwd: process.cwd()
  });
  console.log('✓ @zahnerflow/types built successfully');
} catch (error) {
  console.error('❌ Failed to build @zahnerflow/types:', error.message);
  process.exit(1);
}

// 验证构建结果
const typesDistPath = path.join(process.cwd(), 'packages/types/dist');
if (fs.existsSync(typesDistPath)) {
  const files = fs.readdirSync(typesDistPath);
  const hasIndexJs = files.includes('index.js');
  const hasIndexDts = files.includes('index.d.ts');

  if (hasIndexJs && hasIndexDts) {
    console.log('✓ Type definitions are properly built');
  } else {
    console.error('❌ Type definitions are incomplete');
    process.exit(1);
  }
} else {
  console.error('❌ Types dist directory not found');
  process.exit(1);
}

// 检查依赖链接
console.log('\n🔗 Checking workspace dependencies...');
try {
  execSync('pnpm --filter zahnerflow-flowgram list @zahnerflow/types', {
    stdio: 'inherit',
    cwd: process.cwd()
  });
  console.log('✓ Workspace dependencies are properly linked');
} catch (error) {
  console.warn('⚠️  Warning: Could not verify workspace dependency linking');
}

console.log('\n🎉 ZahnerFlow monorepo setup completed successfully!');
console.log('\nNext steps:');
console.log('  - Run "pnpm dev" to start development servers');
console.log('  - Run "pnpm build" to build all packages');
console.log('  - Run "pnpm test" to run tests');