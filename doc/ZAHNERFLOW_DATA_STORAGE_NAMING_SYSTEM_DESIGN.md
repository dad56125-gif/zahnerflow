# ZahnerFlow 数据存储与命名管理系统设计文档

## 概述

基于项目结构文档分析，本文档详细设计数据库存储、解耦文件存储和全局命名管理系统的实现方案，为下一阶段的开发提供全局指导。

## 1. 项目结构分析

### 1.1 当前架构中的参数/变量/输出文件/节点/工作流相关内容

**参数和变量系统**:
- 节点参数存储在 `node.data.parameters` 中
- 循环变量通过 `${variable_name}` 语法进行替换
- 变量作用域管理通过 `LoopContextManager` 实现
- 输出路径通过 `output_path` 参数动态生成

**输出文件管理**:
- 当前使用时间戳命名：`outputs\measurement_${timestamp}`
- 文件路径硬编码在执行逻辑中
- 缺乏统一的文件命名和存储策略

**节点系统**:
- 节点类型定义在 `apps/frontend/src/nodes/types.ts`
- 节点配置在 `NODE_CONFIGS` 中统一管理
- 节点执行通过 `ExecutionService` 处理
- 节点命名通过 `generateExecutionNodeName` 生成后缀

**工作流管理**:
- 工作流存储在 `workflow-storage.service.ts` 中
- 工作流包含节点数组、连接数组和执行状态
- 工作流执行通过 `ExecutionService` 控制

## 2. 数据库存储系统设计

### 2.1 数据库选择
使用 **SQLite** 作为主要数据库：
- 轻量级，无需额外服务
- 适合本地应用和开发环境
- 支持事务和复杂查询
- 易于备份和维护

### 2.2 数据库架构

```typescript
// 数据库表结构设计
interface DatabaseSchema {
  // 项目表
  projects: {
    id: string;                    // 项目唯一标识
    name: string;                  // 项目名称
    description?: string;          // 项目描述
    created_at: Date;              // 创建时间
    updated_at: Date;              // 更新时间
    settings: JSON;                // 项目设置 (JSON格式)
  };

  // 工作流表 (一对多关系：1个项目 → N个工作流)
  workflows: {
    id: string;                    // 工作流唯一标识
    project_id: string;           // 所属项目ID (外键)
    name: string;                  // 工作流名称
    version: number;               // 版本号
    description?: string;          // 工作流描述
    nodes: JSON;                   // 节点数组 (JSON格式)
    edges: JSON;                   // 连接数组 (JSON格式)
    settings: JSON;                // 工作流设置
    created_at: Date;              // 创建时间
    updated_at: Date;              // 更新时间
  };

  // 节点模板表
  node_templates: {
    id: string;                    // 模板ID
    type: string;                  // 节点类型
    name: string;                  // 模板名称
    parameters: JSON;              // 默认参数
    description?: string;          // 描述
    is_system: boolean;            // 是否系统模板
    created_at: Date;              // 创建时间
  };

  // 数据设置表
  data_settings: {
    id: string;                    // 设置ID
    category: string;              // 设置类别
    key: string;                   // 设置键
    value: JSON;                   // 设置值 (JSON格式)
    description?: string;          // 描述
    project_id?: string;           // 项目ID (可选)
    is_global: boolean;            // 是否全局设置
    created_at: Date;              // 创建时间
    updated_at: Date;              // 更新时间
  };

  // 文件存储表
  file_storage: {
    id: string;                    // 文件ID
    filename: string;              // 文件名
    original_name: string;         // 原始文件名
    file_path: string;             // 文件路径
    file_size: number;             // 文件大小
    mime_type: string;             // MIME类型
    category: string;              // 文件类别
    project_id?: string;           // 所属项目ID
    workflow_id?: string;          // 所属工作流ID
    node_id?: string;              // 关联节点ID
    sequence_id?: string;          // 序列ID
    metadata: JSON;                // 元数据 (JSON格式)
    created_at: Date;              // 创建时间
  };

  // 命名序列表
  naming_sequences: {
    id: string;                    // 序列ID
    project_id: string;           // 所属项目ID
    sequence_type: string;         // 序列类型 (project/workflow/node/output)
    prefix: string;                // 前缀
    current_number: number;        // 当前序号
    format: string;                // 格式模板
    padding: number;               // 填充长度
    separator: string;             // 分隔符
    is_active: boolean;            // 是否激活
    created_at: Date;              // 创建时间
    updated_at: Date;              // 更新时间
  };

  // 系统设置表
  system_settings: {
    key: string;                   // 设置键
    value: JSON;                   // 设置值
    description?: string;          // 描述
    data_type: string;             // 数据类型
    is_readonly: boolean;          // 是否只读
    created_at: Date;              // 创建时间
    updated_at: Date;              // 更新时间
  };
}
```

### 2.3 实体和仓库概念说明

**实体 (Entity)**：
- 数据库表的结构和约束定义
- 相当于数据库表的TypeScript类定义
- 包含字段定义、类型、关系映射
- 例如：`Project`实体对应`projects`表，定义id、name、description等字段

**仓库 (Repository)**：
- 数据库操作的抽象层
- 封装CRUD操作（创建、读取、更新、删除）
- 实现业务逻辑和数据访问的分离
- 例如：`ProjectRepository`提供项目数据的保存、查询、更新方法

**数据库迁移作用**：
- **版本控制**：跟踪数据库架构变更历史
- **团队协作**：确保所有开发者使用相同的数据库结构
- **部署自动化**：自动应用数据库架构变更
- **回滚能力**：可以撤销不成功的变更
- **数据安全**：在变更前备份数据

### 2.4 数据库服务设计

**需要创建的文件**:
```
apps/backend/src/modules/database/
├── database.module.ts            # 数据库模块
├── database.service.ts           # 数据库服务
├── entities/                    # 实体定义
│   ├── project.entity.ts         # 项目实体
│   ├── workflow.entity.ts        # 工作流实体
│   ├── node-template.entity.ts   # 节点模板实体
│   ├── data-setting.entity.ts    # 数据设置实体
│   ├── file-storage.entity.ts    # 文件存储实体
│   ├── naming-sequence.entity.ts # 命名序列实体
│   └── system-setting.entity.ts  # 系统设置实体
├── repositories/                 # 数据仓库
│   ├── project.repository.ts     # 项目仓库
│   ├── workflow.repository.ts    # 工作流仓库
│   ├── data-setting.repository.ts # 数据设置仓库
│   ├── file-storage.repository.ts # 文件存储仓库
│   └── naming-sequence.repository.ts # 命名序列仓库
└── migrations/                  # 数据库迁移
    ├── 001-initial-schema.ts    # 初始化架构
    └── 002-add-indexes.ts       # 添加索引
```

## 3. 解耦文件存储系统设计

### 3.1 简化文件存储架构 (KISS原则)

**文件存储服务设计**:
```typescript
// 简化的文件存储服务
interface FileStorageService {
  // 基础文件操作
  storeFile(file: File, projectId: string, category: string, options?: FileOptions): Promise<FileInfo>;
  getFile(filePath: string): Promise<Buffer>;
  deleteFile(filePath: string): Promise<boolean>;

  // 文件路径生成
  generateOutputPath(projectId: string, workflowId?: string, nodeId?: string): string;

  // 统一工作站数据导出
  exportWorkstationData(projectId: string, data: any, metadata?: any): Promise<string>;
}

// 文件选项
interface FileOptions {
  workflowId?: string;
  nodeId?: string;
  preserveOriginalName?: boolean;
  metadata?: Record<string, any>;
}
```

### 3.2 简化存储目录结构

**统一导出目录结构**:
```
workspace/
├── projects/              # 项目文件
│   ├── {project_id}/      # 项目目录
│   │   ├── workflows/     # 工作流文件
│   │   │   ├── {workflow_id}/  # 工作流目录
│   │   │   │   ├── nodes/     # 节点文件
│   │   │   │   └── outputs/   # 输出文件
│   │   │   └── exports/   # 导出文件
│   │   └── measurements/  # 测量数据
│   └── templates/         # 模板文件
├── logs/                  # 日志文件
└── temp/                  # 临时文件
```

**文件类别简化**:
- `measurement`: 测量数据文件
- `export`: 导出数据文件
- `log`: 日志文件
- `config`: 配置文件
- `temp`: 临时文件

### 3.3 文件存储服务实现

**需要创建的文件**:
```
apps/backend/src/modules/file-storage/
├── file-storage.module.ts    # 文件存储模块
├── file-storage.service.ts   # 文件存储服务
├── file-storage.controller.ts # 文件存储控制器
├── strategies/              # 存储策略
│   ├── local.strategy.ts    # 本地存储策略
│   └── ftp.strategy.ts      # FTP存储策略 (可选)
├── providers/              # 提供者
│   ├── file-namer.provider.ts # 文件命名器
│   └── path-resolver.provider.ts # 路径解析器
└── utils/                  # 工具函数
    ├── file-utils.ts        # 文件工具
    └── storage-utils.ts     # 存储工具
```

## 4. 全局命名管理系统设计

### 4.1 命名管理架构

```typescript
// 命名管理器接口
interface NamingManager {
  // 项目命名
  generateProjectName(options: NamingOptions): Promise<string>;
  getNextProjectSequence(): Promise<number>;

  // 工作流命名
  generateWorkflowName(projectId: string, options: NamingOptions): Promise<string>;
  getNextWorkflowSequence(projectId: string): Promise<number>;

  // 节点命名
  generateNodeName(workflowId: string, nodeType: string, options: NamingOptions): Promise<string>;
  generateExecutionNodeName(originalNodeId: string, nodeName: string): Promise<string>;

  // 输出文件命名
  generateOutputFilename(projectId: string, workflowId: string, nodeId: string, options: NamingOptions): Promise<string>;
  getNextOutputSequence(projectId: string): Promise<number>;

  // 序列管理
  createSequence(options: SequenceOptions): Promise<NamingSequence>;
  updateSequence(sequenceId: string, updates: Partial<NamingSequence>): Promise<void>;
  deleteSequence(sequenceId: string): Promise<void>;
}

// 命名选项
interface NamingOptions {
  prefix?: string;           // 前缀
  suffix?: string;           // 后缀
  separator?: string;        // 分隔符
  padding?: number;          // 填充长度
  includeTimestamp?: boolean; // 包含时间戳
  includeDate?: boolean;     // 包含日期
  format?: string;           // 自定义格式
  useSequence?: boolean;     // 使用序列号
}
```

### 4.2 命名规则设计

**项目命名规则**:
- 格式: `PROJECT_{序列号:04d}`
- 示例: `PROJECT_0001`, `PROJECT_0002`
- 可选前缀: `{客户缩写}_PROJECT_{序列号:04d}`

**工作流命名规则**:
- 格式: `WF_{项目序列号:04d}_{工作流序列号:03d}`
- 示例: `WF_0001_001`, `WF_0001_002`
- 可选描述: `WF_{项目序列号:04d}_{工作流序列号:03d}_{描述}`

**节点命名规则**:
- 格式: `{节点类型缩写}_{项目序列号:04d}_{工作流序列号:03d}_{节点序列号:02d}`
- 示例: `EIS_0001_001_01`, `CV_0001_001_02`
- 执行时: `{节点类型缩写}_{项目序列号:04d}_{工作流序列号:03d}_{节点序列号:02d}_{迭代序列号:02d}`

**输出文件命名规则**:
- 格式: `{项目缩写}_{工作流序号}_{节点序号}_{日期}_{时间}_{序列号}`
- 示例: `EIS_0001_001_01_20250922_143055_01.csv`
- 压缩文件: `{项目缩写}_{工作流序号}_{节点序号}_{日期}_archive_{序列号}.zip`

### 4.3 命名管理服务实现

**需要创建的文件**:
```
apps/backend/src/modules/naming/
├── naming.module.ts          # 命名管理模块
├── naming.service.ts         # 命名管理服务
├── naming.controller.ts      # 命名管理控制器
├── strategies/              # 命名策略
│   ├── project-namer.ts     # 项目命名器
│   ├── workflow-namer.ts    # 工作流命名器
│   ├── node-namer.ts        # 节点命名器
│   └── output-namer.ts      # 输出命名器
├── generators/              # 命名生成器
│   ├── sequence-generator.ts # 序列生成器
│   ├── timestamp-generator.ts # 时间戳生成器
│   └── format-generator.ts  # 格式生成器
├── validators/              # 验证器
│   ├── name-validator.ts    # 名称验证器
│   ├── format-validator.ts  # 格式验证器
│   └── sequence-validator.ts # 序列验证器
└── types/                   # 类型定义
    ├── naming.types.ts      # 命名类型
    └── sequence.types.ts    # 序列类型
```

## 5. 现有文件修改分析

### 5.1 需要修改的后端文件

**apps/backend/src/modules/execution/execution.service.ts**:
- 修改 `buildExecutionPlanWithLoops` 方法，集成数据库存储
- 修改 `processVariables` 方法，使用全局命名系统
- 添加文件存储服务注入
- 修改输出路径生成逻辑

**apps/backend/src/modules/workflow/workflow.service.ts**:
- 集成数据库存储服务
- 修改工作流保存逻辑
- 添加版本管理功能

**apps/backend/src/modules/workflow/workflow-storage.service.ts**:
- 重构为使用数据库存储
- 添加文件存储集成
- 添加命名管理集成

**apps/backend/src/app.module.ts**:
- 添加新的模块导入 (DatabaseModule, FileStorageModule, NamingModule)

**apps/backend/src/main.ts**:
- 添加数据库初始化逻辑

### 5.2 需要修改的前端文件

**apps/frontend/src/services/LoopContextManager.ts**:
- 集成全局命名系统
- 修改节点命名逻辑

**apps/frontend/src/nodes/types.ts**:
- 添加数据库相关类型定义
- 添加文件存储相关类型定义

**apps/frontend/src/App.tsx**:
- 集成新的API服务
- 添加文件管理功能

**apps/frontend/src/services/api.ts**:
- 添加数据库相关API调用
- 添加文件存储相关API调用
- 添加命名管理相关API调用

### 5.3 需要修改的配置文件

**package.json**:
- 添加新的依赖包 (sqlite3, typeorm, multer等)

**apps/backend/package.json**:
- 添加数据库相关依赖
- 添加文件处理相关依赖

**apps/frontend/package.json**:
- 添加文件上传相关依赖

## 6. 需要创建的新文件

### 6.1 数据库模块文件
- `apps/backend/src/modules/database/database.module.ts`
- `apps/backend/src/modules/database/database.service.ts`
- `apps/backend/src/modules/database/entities/` (所有实体文件)
- `apps/backend/src/modules/database/repositories/` (所有仓库文件)
- `apps/backend/src/modules/database/migrations/` (迁移文件)

### 6.2 文件存储模块文件
- `apps/backend/src/modules/file-storage/file-storage.module.ts`
- `apps/backend/src/modules/file-storage/file-storage.service.ts`
- `apps/backend/src/modules/file-storage/file-storage.controller.ts`
- `apps/backend/src/modules/file-storage/strategies/` (存储策略文件)
- `apps/backend/src/modules/file-storage/providers/` (提供者文件)
- `apps/backend/src/modules/file-storage/utils/` (工具文件)

### 6.3 命名管理模块文件
- `apps/backend/src/modules/naming/naming.module.ts`
- `apps/backend/src/modules/naming/naming.service.ts`
- `apps/backend/src/modules/naming/naming.controller.ts`
- `apps/backend/src/modules/naming/strategies/` (命名策略文件)
- `apps/backend/src/modules/naming/generators/` (生成器文件)
- `apps/backend/src/modules/naming/validators/` (验证器文件)
- `apps/backend/src/modules/naming/types/` (类型定义文件)

### 6.4 前端新增文件
- `apps/frontend/src/services/database.service.ts`
- `apps/frontend/src/services/file-storage.service.ts`
- `apps/frontend/src/services/naming.service.ts`
- `apps/frontend/src/components/FileManager.tsx`
- `apps/frontend/src/components/ProjectManager.tsx`
- `apps/frontend/src/components/NamingSettings.tsx`

### 6.5 类型定义文件
- `packages/types/src/database.types.ts`
- `packages/types/src/file-storage.types.ts`
- `packages/types/src/naming.types.ts`

## 7. 实施计划

### 阶段1: 数据库基础架构
1. 创建数据库模块和服务
2. 定义实体和仓库
3. 创建数据库迁移
4. 实现基础的CRUD操作

### 阶段2: 文件存储系统
1. 创建文件存储模块
2. 实现本地存储策略
3. 创建文件命名器和路径解析器
4. 实现文件上传和下载功能

### 阶段3: 命名管理系统
1. 创建命名管理模块
2. 实现各种命名策略
3. 创建序列管理器
4. 集成命名系统到现有功能

### 阶段4: 系统集成
1. 修改现有服务以使用新系统
2. 更新前端界面
3. 添加新的API端点
4. 测试和优化

## 8. Python设备库重构建议

### 8.1 重构目标
将zahner_device.py重构为纯API提供者，不实现具体的参数设置和实例产生。

### 8.2 当前问题
- 混合了API提供和参数设置
- 缺乏清晰的层次结构
- 业务逻辑与通信层耦合

### 8.3 建议重构结构

```python
# 纯API提供层
class ZahnerDeviceAPI:
    """Zahner设备API通信层 - 只负责通信"""

    def __init__(self):
        self.connection = None

    # 基础通信方法
    def connect(self, device_address: str) -> bool:
        """连接设备"""
        pass

    def disconnect(self) -> bool:
        """断开连接"""
        pass

    def send_command(self, command: str, params: dict = None) -> dict:
        """发送命令并返回结果"""
        pass

    def get_device_info(self) -> dict:
        """获取设备信息"""
        pass

    def check_connection(self) -> bool:
        """检查连接状态"""
        pass

# 参数设置和业务逻辑移到NestJS后端处理
```

### 8.4 重构优势
- **单一职责**: 只负责设备通信
- **易于测试**: 可以mock API调用
- **易于维护**: 清晰的接口定义
- **业务逻辑集中**: 参数设置在NestJS中统一管理

## 9. 技术依赖 (简化版)

### 9.1 后端依赖
- `@nestjs/typeorm`: TypeORM集成
- `typeorm`: ORM框架
- `sqlite3`: SQLite数据库驱动
- `multer`: 文件上传处理
- `uuid`: UUID生成
- `moment`: 日期处理

### 9.2 前端依赖
- `axios`: HTTP客户端
- `file-saver`: 文件保存
- `moment`: 日期处理
- `uuid`: UUID生成

## 10. 风险评估

### 10.1 技术风险
- 数据库迁移可能导致数据丢失
- 文件存储路径变更可能影响现有功能
- 命名规则变更可能影响现有工作流

### 10.2 实施风险
- 系统复杂度增加
- 开发周期较长
- 测试工作量较大

### 10.3 缓解措施
- 完善的备份策略
- 渐进式迁移
- 充分的测试覆盖

## 11. 结论

本文档详细设计了数据库存储、解耦文件存储和全局命名管理系统的实现方案。通过分阶段实施，可以系统性地改进ZahnerFlow的数据管理能力，提高系统的可维护性和扩展性。实施过程中需要注意向后兼容性和数据安全。

---

*文档生成日期: 2025-09-22*
*文档版本: 1.0.0*
*维护者: ZahnerFlow Development Team*