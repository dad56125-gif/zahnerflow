# 控制台管理模块 (ConsoleManagement)

## 设计原则 (Design Principles)

- **集中管理**: 统一管理所有模块的日志输出，避免日志混乱
- **灵活控制**: 支持全局和模块级别的日志级别动态调整
- **性能优化**: 通过日志级别控制减少不必要的日志输出，提升系统性能
- **开发友好**: 提供便捷的API接口，便于开发和调试时快速切换日志模式

## 对外接口 (Public API)

### 核心服务接口
- `ConsoleDisplayManager` - 控制台显示管理服务
- `ConsoleDisplayController` - 控制台管理REST API控制器

### REST API接口
- `GET /api/console/config` - 获取当前配置
- `POST /api/console/global` - 设置全局日志级别
- `POST /api/console/module/:moduleName` - 设置特定模块日志级别
- `POST /api/console/debug/:enable` - 切换debug模式
- `POST /api/console/quiet` - 启用静默模式
- `POST /api/console/verbose` - 启用详细模式
- `DELETE /api/console/reset` - 重置到默认配置

### 日志级别接口
- `setDisplayLevel(level: LogLevel)` - 设置显示级别
- `setModuleDisplay(module: string, enabled: boolean)` - 设置模块显示开关
- `shouldDisplayLog(source: string, level: string)` - 判断是否应该显示日志
- `log(source: string, level: string, message: string, metadata?: any)` - 统一日志输出

## 主要功能列表 (Key Functions)

1. **日志级别控制**
   - 全局日志级别设置
   - 模块级别日志开关
   - 动态日志级别调整

2. **预设模式管理**
   - 静默模式（仅显示错误和警告）
   - 调试模式（显示所有日志）
   - 详细模式（显示详细信息）
   - 快速模式（优化性能）

3. **配置管理**
   - 配置信息持久化
   - 默认配置重置
   - 配置状态查询

4. **日志过滤**
   - 基于来源的日志过滤
   - 基于级别的日志过滤
   - 自定义过滤规则

## 核心数据模型 (Core Data Model)

### 日志级别模型
```typescript
enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
  VERBOSE = 'verbose'
}
```

### 配置模型
```typescript
interface ConsoleConfig {
  globalLevel: LogLevel;
  moduleSettings: Record<string, ModuleSetting>;
  quickMode: boolean;
  timestamp: Date;
}

interface ModuleSetting {
  enabled: boolean;
  debugEnabled: boolean;
  customLevel?: LogLevel;
}
```

### 日志条目模型
```typescript
interface LogEntry {
  source: string;
  level: LogLevel;
  message: string;
  metadata?: any;
  timestamp: Date;
}
```

## 模块依赖关系 (Dependencies)

### 外部依赖
- **NestJS**: 后端框架
- **TypeScript**: 类型系统

### 内部依赖
- **EventBus**: 事件总线模块（日志输出消费者）
- 所有业务模块（日志输出生产者）

## 典型端到端工作流程 (Typical Workflow)

1. **静默模式切换流程**
   ```
   API调用 → 验证请求 → 更新全局配置 → 通知所有模块 → 应用新的日志级别
   ```

2. **模块级日志控制流程**
   ```
   指定模块设置 → 更新模块配置 → 模块重新应用设置 → 生效新的日志输出规则
   ```

3. **日志输出决策流程**
   ```
   模块调用log() → 检查全局级别 → 检查模块设置 → 决定是否输出 → 格式化输出
   ```

4. **配置重置流程**
   ```
   重置请求 → 恢复默认配置 → 清除自定义设置 → 通知所有模块 → 应用默认设置
   ```