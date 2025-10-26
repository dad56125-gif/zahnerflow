# ZahnerFlow 依赖安装指南

> **重要提示**: 本程序仅支持 Windows 10/11 操作系统，不支持 Linux 或 macOS。

## 系统要求

### 必需环境
- **操作系统**: Windows 10/11
- **Node.js**: >= 18.0.0
- **pnpm**: >= 8.0.0
- **Python**: 3.8+ (用于某些原生模块编译)
- **Windows Build Tools**: (用于编译原生模块)

### 安装步骤

#### 1. 安装基础环境

**Windows 环境:**
```bash
# 安装 Node.js (从官网下载 https://nodejs.org/)
# 安装 pnpm
npm install -g pnpm

# 安装 Python (从官网下载 https://python.org/)
# 安装 Windows Build Tools (用于编译原生模块)
npm install -g --global windows-build-tools
```

> **注意**: 本程序仅支持 Windows 10/11 操作系统，不支持 Linux 或 macOS。

#### 2. 项目依赖安装

在项目根目录执行：

```bash
# 安装所有 monorepo 依赖
pnpm install
```

## 依赖结构说明

### 根目录依赖 (package.json)
**开发依赖:**
- `@vitest/coverage-v8` - 测试覆盖率工具
- `@vitest/ui` - 测试UI界面
- `concurrently` - 并行执行命令
- `prettier` - 代码格式化
- `typescript` - TypeScript编译器
- `vitest` - 测试框架

**生产依赖:**
- `@nestjs/platform-ws` - NestJS WebSocket支持
- `serialport` - 串口通信（需要编译原生模块）

### Frontend 依赖 (apps/frontend)
**React 生态:**
- `react` ^18.2.0
- `react-dom` ^18.2.0
- `@types/react` ^18.2.0
- `@types/react-dom` ^18.2.0

**UI 框架:**
- `tailwindcss` ^3.3.0
- `autoprefixer` ^10.4.0
- `postcss` ^8.4.0

**图表和可视化:**
- `echarts` ^5.5.0
- `echarts-for-react` ^3.0.2

**工具库:**
- `socket.io-client` ^4.8.1
- `sweetalert2` ^11.10.0
- `clsx` ^2.0.0

**开发工具:**
- `vite` ^5.0.0
- `@vitejs/plugin-react` ^4.0.0
- `electron` ^38.0.0
- `electron-builder` ^26.0.12
- `@playwright/test` ^1.55.0
- ESLint 相关包

### Backend 依赖 (apps/backend)
**NestJS 核心:**
- `@nestjs/common` ^11.1.6
- `@nestjs/core` ^11.1.6
- `@nestjs/platform-express` ^11.1.6
- `@nestjs/platform-socket.io` ^11.1.6
- `@nestjs/websockets` ^11.1.6
- `@nestjs/config` ^4.0.2
- `@nestjs/axios` ^4.0.1

**工具库:**
- `rxjs` ^7.8.2
- `class-transformer` ^0.5.1
- `class-validator` ^0.14.2
- `socket.io` ^4.8.1

**开发工具:**
- `@nestjs/cli` ^11.0.10
- `@nestjs/schematics` ^11.0.7
- `ts-node` ^10.9.2

### Types 包 (packages/types)
- `typescript` ^5.0.0

## 常见问题

### 1. pnpm 依赖安装问题
```bash
# 清除 pnpm 缓存
pnpm store prune

# 强制重新安装依赖
pnpm install --force

# 如果遇到构建脚本问题，批准构建脚本
pnpm approve-builds
# 或者选择性地批准特定的构建脚本
```

### 2. 后端项目编译失败
```bash
# 检查 nest CLI 是否存在
ls apps/backend/node_modules/.bin/nest*

# 直接使用 nest CLI 构建
cd apps/backend
node_modules/.bin/nest build

# 或者使用 pnpm 脚本
cd ../..
pnpm --filter backend build
```

### 3. serialport 编译失败
```bash
# 清除缓存重新安装
pnpm store prune
rm -rf node_modules pnpm-lock.yaml
pnpm install --force

# 如果仍有问题，尝试指定 Python 版本
npm config set python python3
pnpm install --force
```

### 4. Electron 相关问题
```bash
# 重新安装 Electron
pnpm --filter frontend reinstall electron

# 检查 Electron 版本兼容性
pnpm --filter frontend why electron
```

### 5. Windows 权限问题
```bash
# 使用管理员权限运行 PowerShell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# 如果遇到权限问题，以管理员身份运行命令提示符或 PowerShell
```

## 验证安装

```bash
# 检查依赖是否安装完成
pnpm list --depth=0

# 检查后端 nest CLI 是否正常
ls apps/backend/node_modules/.bin/nest*

# 运行后端编译测试
cd apps/backend
node_modules/.bin/nest build
cd ../..

# 运行类型检查
pnpm type-check

# 运行代码检查
pnpm lint

# 启动开发环境
pnpm dev
```

## 开发环境端口配置

### 默认端口分配
- **Frontend (Vite)**: http://localhost:8083
- **Backend (NestJS)**: http://localhost:3001
- **FastAPI Device Service**: http://localhost:8000
- **Database (PostgreSQL)**: localhost:5432

### 端口配置文件
端口配置位于项目根目录的 `.env` 文件中：
```bash
# 应用配置
PORT=3001                    # Backend端口

# FastAPI设备服务
FASTAPI_PORT=8000           # FastAPI端口

# WebSocket配置
WS_PORT=3001                # WebSocket端口（与Backend共享）

# CORS配置
CORS_ORIGIN=http://localhost:8083  # 前端端口
```

### 端口冲突处理
如果遇到端口冲突，可以：
1. 修改 `.env` 文件中的端口配置
2. 或者在启动时指定不同端口：
```bash
# 前端自定义端口
cd apps/frontend
npm run dev -- --port 3000

# 后端自定义端口
cd apps/backend
npm run start:dev -- --port 4000
```

## 故障排除指南

### 完全重置依赖安装
```bash
# 1. 清理所有缓存
pnpm store prune

# 2. 删除所有 node_modules 和锁文件
rm -rf node_modules
rm -rf apps/*/node_modules
rm -rf packages/*/node_modules
rm -f pnpm-lock.yaml

# 3. 重新安装依赖
pnpm install --force

# 4. 批准构建脚本（如果有）
pnpm approve-builds

# 5. 验证安装
pnpm --filter backend build
```

### Windows 环境特殊问题
```bash
# 使用管理员权限运行 PowerShell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# 检查 Node.js 和 pnpm 版本
node --version
pnpm --version

# 如果版本不兼容，重新安装
npm uninstall -g pnpm
npm install -g pnpm@latest

# 检查环境变量设置
echo $env:PATH
where node
where pnpm
```

## 性能优化

### pnpm 配置优化
在项目根目录创建 `.npmrc` 文件：
```
# 使用淘宝镜像加速
registry=https://registry.npmmirror.com/

# 启用严格模式
strict-peer-dependencies=false

# 共享依赖
shared-workspace-lockfile=true
```

### 缓存清理
```bash
# 清理 pnpm 缓存
pnpm store prune

# 清理构建产物
pnpm clean
```

## Windows 生产环境部署

```bash
# 构建生产版本
pnpm build

# 安装生产依赖
pnpm install --prod

# 启动生产服务
pnpm --filter backend start:prod

# 或者使用 Windows 服务方式运行
# 在生产环境中，建议使用 PM2 或 NSSM 将 Node.js 应用注册为 Windows 服务
```