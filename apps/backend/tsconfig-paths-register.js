/**
 * 注册 tsconfig-paths 以在运行时解析 TypeScript 路径别名
 * 用于 NestJS 开发模式 (nest start --watch)
 */
const tsConfigPaths = require('tsconfig-paths');
const tsConfig = require('./tsconfig.json');
const { resolve } = require('path');

const baseUrl = resolve(__dirname, tsConfig.compilerOptions.baseUrl || '.');

tsConfigPaths.register({
    baseUrl,
    paths: tsConfig.compilerOptions.paths
});
