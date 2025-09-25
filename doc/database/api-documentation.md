# ZAHNERFLOW 数据库 API 文档

## 概述

本文档描述了 ZAHNERFLOW 数据库模块的 API 接口。数据库模块提供了对工作流、执行记录、测量数据和设备管理的完整数据访问层。

## 快速开始

### 安装依赖

```bash
# 安装 TypeORM 和相关依赖
npm install @nestjs/typeorm typeorm pg @nestjs/cache-manager cache-manager-redis-store

# 开发环境使用 SQLite
npm install sqlite3
```

### 配置

```typescript
// apps/backend/src/app.module.ts
import { DatabaseModule } from './database/database.module';

@Module({
  imports: [
    DatabaseModule,
    // ... 其他模块
  ],
})
export class AppModule {}
```

### 使用示例

```typescript
@Injectable()
export class WorkflowService {
  constructor(
    private readonly databaseService: DatabaseService,
  ) {}

  async createWorkflow(data: CreateWorkflowDto, userId: string) {
    return await this.databaseService.createWorkflow(data, userId);
  }

  async getWorkflows(options?: GetWorkflowsOptions) {
    return await this.databaseService.getWorkflows(options);
  }
}
```

## API 接口

### DatabaseService

数据库服务，提供统一的数据访问接口。

#### 方法

##### createWorkflow(data, userId?)

创建工作流。

**参数:**
- `data: CreateWorkflowDto` - 工作流数据
- `userId?: string` - 创建者ID

**返回:** `Promise<Workflow>`

**示例:**
```typescript
const workflow = await databaseService.createWorkflow({
  name: 'EIS Test',
  description: 'Electrochemical Impedance Spectroscopy',
  definition: {
    nodes: [...],
    edges: [...],
    config: {...}
  }
}, userId);
```

##### getWorkflows(options?)

获取工作流列表。

**参数:**
- `options?: GetWorkflowsOptions`
  - `page?: number` - 页码，默认1
  - `limit?: number` - 每页数量，默认10
  - `status?: WorkflowStatus` - 状态筛选
  - `search?: string` - 搜索关键词

**返回:** `Promise<{ data: Workflow[]; total: number }>`

##### createExecution(workflowId, workflowVersion, userId?)

创建执行记录。

**参数:**
- `workflowId: string` - 工作流ID
- `workflowVersion: string` - 工作流版本
- `userId?: string` - 执行者ID

**返回:** `Promise<Execution>`

##### getExecutions(options?)

获取执行记录列表。

**参数:**
- `options?: GetExecutionsOptions`
  - `workflowId?: string` - 工作流ID筛选
  - `status?: ExecutionStatus` - 状态筛选
  - `startDate?: Date` - 开始时间
  - `endDate?: Date` - 结束时间
  - `page?: number` - 页码
  - `limit?: number` - 每页数量

**返回:** `Promise<{ data: Execution[]; total: number }>`

##### createMeasurement(data)

创建测量数据。

**参数:**
- `data: Partial<MeasurementData>` - 测量数据

**返回:** `Promise<MeasurementData>`

##### getMeasurements(options?)

获取测量数据列表。

**参数:**
- `options?: GetMeasurementsOptions`
  - `deviceId?: string` - 设备ID筛选
  - `measurementType?: MeasurementType` - 测量类型
  - `startDate?: Date` - 开始时间
  - `endDate?: Date` - 结束时间
  - `tags?: string[]` - 标签筛选
  - `page?: number` - 页码
  - `limit?: number` - 每页数量

**返回:** `Promise<{ data: MeasurementData[]; total: number }>`

##### healthCheck()

数据库健康检查。

**返回:** `Promise<{ status: string; database: string; cache: string; timestamp: Date }>`

### WorkflowRepository

工作流数据仓库。

#### 方法

##### create(createWorkflowDto, userId?)

创建工作流。

##### findAll(page, limit, status?, search?)

分页查询工作流列表。

##### findOne(id)

根据ID获取工作流详情。

##### update(id, updateWorkflowDto)

更新工作流。

##### remove(id)

软删除工作流。

##### restore(id)

恢复软删除的工作流。

##### findActiveWorkflows()

获取所有活跃的工作流。

##### duplicate(id, newName, userId?)

复制工作流。

### ExecutionRepository

执行记录数据仓库。

#### 方法

##### create(workflowId, workflowVersion, userId?)

创建执行记录。

##### findAll(options?)

分页查询执行记录。

##### findOne(id)

获取执行记录详情。

##### updateStatus(id, status, errorMessage?)

更新执行状态。

##### findRunningExecutions()

获取所有运行中的执行记录。

##### getExecutionStatistics(workflowId?)

获取执行统计信息。

### MeasurementRepository

测量数据仓库。

#### 方法

##### create(measurementData)

创建测量数据。

##### findAll(options?)

分页查询测量数据。

##### findByTimeRange(deviceId, startDate, endDate, measurementType?)

根据时间范围查询测量数据。

##### getAggregatedData(deviceId, timeRange, startDate?, endDate?)

获取聚合数据。

##### getDataQualityStats(deviceId?, startDate?, endDate?)

获取数据质量统计。

##### exportData(format, filters?)

导出数据为 JSON 或 CSV 格式。

## 事件和订阅

数据库模块会发布以下事件：

- `workflow.created` - 工作流创建
- `workflow.updated` - 工作流更新
- `workflow.deleted` - 工作流删除
- `execution.started` - 执行开始
- `execution.completed` - 执行完成
- `execution.failed` - 执行失败
- `measurement.created` - 测量数据创建

### 事件订阅示例

```typescript
@EventBus()
export class WorkflowEventHandler {
  @SubscribeTo('workflow.created')
  handleWorkflowCreated(event: WorkflowCreatedEvent) {
    console.log(`Workflow created: ${event.workflowId}`);
    // 发送通知、更新缓存等
  }
}
```

## 高级用法

### 复杂查询

```typescript
// 使用查询构建器
const results = await this.workflowRepository
  .createQueryBuilder('workflow')
  .leftJoinAndSelect('workflow.versions', 'versions')
  .leftJoinAndSelect('workflow.executions', 'executions')
  .where('workflow.status = :status', { status: WorkflowStatus.ACTIVE })
  .andWhere('executions.status = :execStatus', { execStatus: ExecutionStatus.COMPLETED })
  .orderBy('executions.completedAt', 'DESC')
  .getMany();
```

### 事务处理

```typescript
async transferWorkflowOwnership(workflowId: string, newUserId: string) {
  await this.dataSource.transaction(async (transactionalEntityManager) => {
    // 更新工作流
    await transactionalEntityManager.update(Workflow, workflowId, {
      createdBy: { id: newUserId }
    });

    // 创建版本记录
    await transactionalEntityManager.insert(WorkflowVersion, {
      workflowId,
      version: '1.0.1',
      changelog: 'Ownership transferred',
      definition: await this.getWorkflowDefinition(workflowId),
    });
  });
}
```

### 原生查询

```typescript
// 获取设备统计
const stats = await this.dataSource.query(`
  SELECT
    d.id,
    d.name,
    COUNT(m.id) as measurement_count,
    MAX(m.timestamp) as last_measurement
  FROM devices d
  LEFT JOIN measurement_data m ON d.id = m.device_id
  GROUP BY d.id, d.name
`);
```

## 错误处理

数据库模块会抛出以下异常：

- `EntityNotFoundError` - 实体未找到
- `QueryFailedError` - 查询失败
- `ValidationError` - 数据验证失败

```typescript
try {
  const workflow = await this.databaseService.getWorkflows({ id: workflowId });
} catch (error) {
  if (error instanceof EntityNotFoundError) {
    throw new NotFoundException('Workflow not found');
  }
  throw error;
}
```

## 性能优化建议

1. **使用缓存**: 对频繁访问的数据使用缓存
2. **批量操作**: 大量数据操作使用批量处理
3. **延迟加载**: 使用关系时注意N+1查询问题
4. **索引优化**: 确保查询字段有适当的索引
5. **连接池**: 配置合适的连接池大小

## 配置选项

### 环境变量

- `DB_TYPE`: 数据库类型 (postgres | sqlite)
- `DB_HOST`: 数据库主机
- `DB_PORT`: 数据库端口
- `DB_USERNAME`: 数据库用户名
- `DB_PASSWORD`: 数据库密码
- `DB_DATABASE`: 数据库名称
- `DB_SSL`: 是否使用SSL (true | false)
- `REDIS_HOST`: Redis主机
- `REDIS_PORT`: Redis端口
- `REDIS_PASSWORD`: Redis密码

### 配置示例

```yaml
# .env
# 开发环境
DB_TYPE=sqlite
DB_DATABASE=./data/zahnerflow.db

# 生产环境
DB_TYPE=postgres
DB_HOST=prod-db.example.com
DB_PORT=5432
DB_USERNAME=zahnerflow
DB_PASSWORD=secure_password
DB_DATABASE=zahnerflow_prod
DB_SSL=true

REDIS_HOST=redis.example.com
REDIS_PORT=6379
REDIS_PASSWORD=redis_password
```