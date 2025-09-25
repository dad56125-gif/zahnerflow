# ZAHNERFLOW 数据库实体关系图

## 核心实体关系

```
User (用户)
├── id (PK)
├── email (Unique)
├── firstName
├── lastName
├── role (enum: admin, operator, viewer)
├── preferences (JSONB)
└── createdAt, updatedAt
    ↓ 1:N
Workflow (工作流)
├── id (PK)
├── name (Unique)
├── description
├── definition (JSONB) - 工作流节点和边
├── status (enum: draft, active, archived)
├── metadata (JSONB)
├── created_by (FK → User.id)
└── createdAt, updatedAt
    ↓ 1:N
WorkflowVersion (工作流版本)
├── id (PK)
├── workflow_id (FK → Workflow.id)
├── version
├── changelog
├── definition (JSONB)
├── created_by (FK → User.id)
└── isLatest (boolean)
    ↓ 1:N
Execution (执行记录)
├── id (PK)
├── workflow_id (FK → Workflow.id)
├── workflow_version (string)
├── status (enum: pending, running, completed, failed)
├── parameters (JSONB)
├── context (JSONB)
├── started_by (FK → User.id)
├── startedAt, completedAt
└── duration (bigint)
    ↓ 1:N
ExecutionNode (执行节点)
├── id (PK)
├── execution_id (FK → Execution.id)
├── nodeId (工作流节点ID)
├── nodeType
├── status (enum: pending, running, completed, failed)
├── config (JSONB)
├── input/output (JSONB)
├── startedAt, completedAt
├── duration (bigint)
└── measurementDataId (FK → MeasurementData.id)
    ↓ 1:1
MeasurementData (测量数据 - 时序数据)
├── id (PK)
├── execution_node_id (FK → ExecutionNode.id)
├── device_id (FK → Device.id)
├── measurementType (enum: eis, potentiostatic, etc.)
├── parameters (JSONB)
├── metadata (JSONB)
├── data (JSONB) - 实际测量数据
├── quality (float)
├── tags (array)
└── timestamp (timestamptz)

Device (设备)
├── id (PK)
├── name (Unique)
├── type
├── serialNumber (Unique)
├── model, manufacturer
├── status (enum: offline, online, busy, error)
├── capabilities (array)
├── configuration (JSONB)
├── endpoint (URL)
├── lastSeen (timestamptz)
└── health (JSONB)
    ↓ 1:N
DeviceCalibration (设备校准)
├── id (PK)
├── device_id (FK → Device.id)
├── calibrationDate
├── performedBy
├── results (JSONB)
├── nextCalibrationDate
└── certificate (optional)
```

## 关键设计特点

### 1. **时序数据优化**
- MeasurementData 表使用 TimescaleDB 超表(hypertable)
- 自动分区按时间戳
- 优化查询性能和数据生命周期管理

### 2. **灵活的数据结构**
- 大量使用 JSONB 类型存储动态配置和元数据
- 支持不同类型的电化学实验参数和结果

### 3. **版本控制**
- WorkflowVersion 表实现工作流版本管理
- 保留历史版本，支持回滚

### 4. **索引策略**
- 在所有外键和常用查询字段上创建索引
- 复合索引优化常见查询模式

### 5. **软删除**
- 使用 deletedAt 字段实现软删除
- 保留历史数据便于审计和分析