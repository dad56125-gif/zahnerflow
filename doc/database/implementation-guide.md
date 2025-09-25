# ZAHNERFLOW 数据库实现指南

## 1. 环境准备

### 1.1 安装依赖

```bash
# 核心依赖
npm install typeorm @nestjs/typeorm reflect-metadata rxjs

# 数据库驱动
npm install pg sqlite3

# 缓存
npm install @nestjs/cache-manager cache-manager cache-manager-redis-store

# 开发依赖
npm install @types/node --save-dev
```

### 1.2 环境配置

创建 `.env` 文件：

```bash
# 开发环境 (SQLite)
cp .env.example .env.development

# 生产环境 (PostgreSQL)
cp .env.example .env.production
```

## 2. 数据库设置

### 2.1 PostgreSQL 生产环境

```bash
# 使用 Docker 启动 PostgreSQL 和 TimescaleDB
docker run -d \
  --name timescaledb \
  -p 5432:5432 \
  -e POSTGRES_DB=zahnerflow \
  -e POSTGRES_USER=zahnerflow \
  -e POSTGRES_PASSWORD=your_password \
  timescale/timescaledb:latest-pg14

# 使用 Docker 启动 Redis
docker run -d \
  --name redis \
  -p 6379:6379 \
  redis:6-alpine
```

### 2.2 SQLite 开发环境

```bash
# 创建数据目录
mkdir -p apps/backend/data

# SQLite 会自动创建数据库文件
```

## 3. 集成步骤

### 3.1 导入数据库模块

```typescript
// apps/backend/src/app.module.ts
import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';

@Module({
  imports: [
    DatabaseModule,
    // ... 其他模块
  ],
})
export class AppModule {}
```

### 3.2 在服务中使用数据库

```typescript
// apps/backend/src/workflow/workflow.service.ts
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class WorkflowService {
  constructor(
    private readonly databaseService: DatabaseService,
  ) {}

  async createWorkflow(createWorkflowDto: CreateWorkflowDto, userId: string) {
    return await this.databaseService.createWorkflow(createWorkflowDto, userId);
  }

  async getWorkflow(id: string) {
    const workflow = await this.databaseService.getWorkflows();
    return workflow.data.find(w => w.id === id);
  }
}
```

## 4. 运行迁移

### 4.1 开发环境

```bash
# 自动同步数据库结构（仅限开发）
npm run start:dev

# 手动运行迁移
npm run typeorm:migration:run

# 创建新迁移
npm run typeorm:migration:generate -- -n MigrationName
```

### 4.2 生产环境

```bash
# 构建项目
npm run build

# 运行迁移
npm run typeorm:migration:run -- -d dist/apps/backend/database/database.service.js
```

## 5. 最佳实践

### 5.1 错误处理

```typescript
@Injectable()
export class EnhancedDatabaseService extends DatabaseService {
  async createWorkflow(data: any, userId?: string) {
    try {
      const workflow = await super.createWorkflow(data, userId);

      // 发布事件
      this.eventBus.emit('workflow.created', { workflow });

      return workflow;
    } catch (error) {
      // 记录错误
      this.logger.error('Failed to create workflow', error.stack);

      // 重新抛出特定异常
      if (error.code === '23505') { // 唯一约束违反
        throw new ConflictException('Workflow already exists');
      }
      throw error;
    }
  }
}
```

### 5.2 性能优化

```typescript
// 使用缓存装饰器
@Injectable()
export class CachedWorkflowService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly cacheManager: Cache,
  ) {}

  @Cacheable({ key: 'workflows', ttl: 300 })
  async getActiveWorkflows() {
    return this.databaseService.getWorkflows({
      status: WorkflowStatus.ACTIVE
    });
  }

  @CacheEvict('workflows')
  async updateWorkflow(id: string, data: any) {
    return this.databaseService.updateWorkflow(id, data);
  }
}
```

### 5.3 数据验证

```typescript
// 使用 class-validator
import { IsString, IsOptional, IsEnum } from 'class-validator';

export class CreateWorkflowDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(WorkflowStatus)
  status?: WorkflowStatus;

  @ValidateNested()
  definition: WorkflowDefinition;
}
```

## 6. 监控和日志

### 6.1 数据库监控

```typescript
@Injectable()
export class DatabaseMetricsService {
  constructor(
    private readonly dataSource: DataSource,
  ) {}

  async getConnectionMetrics() {
    const { query } = this.dataSource.driver;

    // PostgreSQL 查询
    if (this.dataSource.options.type === 'postgres') {
      const [stats] = await query(`
        SELECT
          count(*) as active_connections,
          count(*) filter (where state = 'active') as active_queries
        FROM pg_stat_activity
        WHERE datname = current_database()
      `);
      return stats;
    }
  }

  async getSlowQueries(threshold = 1000) {
    if (this.dataSource.options.type === 'postgres') {
      return this.dataSource.query(`
        SELECT
          query,
          mean_time,
          calls
        FROM pg_stat_statements
        WHERE mean_time > $1
        ORDER BY mean_time DESC
        LIMIT 10
      `, [threshold]);
    }
  }
}
```

### 6.2 查询日志

```typescript
// TypeORM 日志配置
export const databaseConfig = {
  logging: true,
  logger: 'advanced-console',
  logNotifications: true,

  // 仅记录慢查询
  maxQueryExecutionTime: 1000,
};
```

## 7. 测试

### 7.1 单元测试

```typescript
// workflow.repository.spec.ts
describe('WorkflowRepository', () => {
  let repository: WorkflowRepository;
  let dataSource: DataSource;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [WorkflowRepository],
    }).compile();

    repository = module.get<WorkflowRepository>(WorkflowRepository);
    dataSource = module.get<DataSource>(DataSource);
  });

  it('should create a workflow', async () => {
    const workflow = await repository.create({
      name: 'Test Workflow',
      definition: { nodes: [], edges: [], config: {} },
    });

    expect(workflow).toBeDefined();
    expect(workflow.id).toBeDefined();
  });
});
```

### 7.2 集成测试

```typescript
// database.service.integration.spec.ts
describe('DatabaseService (Integration)', () => {
  let service: DatabaseService;
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [Workflow, Execution, MeasurementData],
          synchronize: true,
        }),
        DatabaseModule,
      ],
    }).compile();

    service = module.get<DatabaseService>(DatabaseService);
  });

  it('should create and retrieve workflows', async () => {
    const created = await service.createWorkflow({
      name: 'Integration Test',
      definition: { nodes: [], edges: [], config: {} },
    });

    const result = await service.getWorkflows();
    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe('Integration Test');
  });
});
```

## 8. 部署

### 8.1 Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build: .
    depends_on:
      - db
      - redis
    environment:
      DB_HOST: db
      REDIS_HOST: redis

  db:
    image: timescale/timescaledb:latest-pg14
    environment:
      POSTGRES_DB: zahnerflow
      POSTGRES_USER: zahnerflow
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:6-alpine
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

### 8.2 Kubernetes

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: zahnerflow-backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: zahnerflow-backend
  template:
    metadata:
      labels:
        app: zahnerflow-backend
    spec:
      containers:
      - name: backend
        image: zahnerflow/backend:latest
        env:
        - name: DB_HOST
          valueFrom:
            configMapKeyRef:
              name: zahnerflow-config
              key: db-host
        - name: REDIS_HOST
          valueFrom:
            configMapKeyRef:
              name: zahnerflow-config
              key: redis-host
```

## 9. 维护

### 9.1 数据备份

```bash
# PostgreSQL 备份
pg_dump -h localhost -U zahnerflow zahnerflow > backup.sql

# 恢复
psql -h localhost -U zahnerflow zahnerflow < backup.sql

# 使用 pgBackRest 进行增量备份
pgbackrest --stanza=main backup
```

### 9.2 定期维护

```sql
-- PostgreSQL 维护查询
-- 更新统计信息
ANALYZE VERBOSE;

-- 重建索引
REINDEX DATABASE zahnerflow;

-- 清理过期数据
DELETE FROM executions
WHERE completed_at < NOW() - INTERVAL '90 days';

-- 清理表碎片
VACUUM (VERBOSE, ANALYZE);
```

### 9.3 性能调优

```sql
-- PostgreSQL 配置调整
ALTER SYSTEM SET shared_preload_libraries = 'timescaledb';
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET maintenance_work_mem = '64MB';
ALTER SYSTEM SET checkpoint_completion_target = 0.9;

-- 重启使配置生效
SELECT pg_reload_conf();
```