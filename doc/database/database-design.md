# ZAHNERFLOW 数据库设计方案

## 1. 架构概述

### 1.1 技术栈
- **ORM**: TypeORM 0.3.x
- **主数据库**: PostgreSQL 14+
- **时序数据库**: TimescaleDB (PostgreSQL扩展)
- **缓存**: Redis 6+
- **连接池**: pg-pool

### 1.2 数据库模式
- 开发环境: SQLite (便于开发)
- 测试环境: PostgreSQL + TimescaleDB
- 生产环境: PostgreSQL + TimescaleDB + Redis

## 2. 数据库配置

### 2.1 TypeORM 配置

```typescript
// apps/backend/src/config/database.config.ts
export const databaseConfig = {
  type: process.env.DB_TYPE || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || 'zahnerflow',

  entities: [
    '**/*.entity{.ts,.js}'
  ],

  migrations: [
    'dist/apps/backend/migrations/*{.ts,.js}'
  ],

  migrationsTableName: 'typeorm_migrations',

  logging: process.env.NODE_ENV === 'development',

  // 生产环境优化
  extra: {
    connectionLimit: 20,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
  },

  // 时序数据配置
  timescale: {
    enabled: true,
    hypertables: {
      measurement_data: {
        timeColumn: 'timestamp',
        chunkInterval: '1 day'
      }
    }
  }
};
```

### 2.2 多环境配置

```yaml
# apps/backend/.env
# 开发环境
DB_TYPE=sqlite
DB_DATABASE=./data/zahnerflow.db

# 测试/生产环境
DB_TYPE=postgres
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=zahnerflow
DB_PASSWORD=secure_password
DB_DATABASE=zahnerflow_prod
DB_SSL=true

# Redis配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
```

## 3. 数据库优化策略

### 3.1 索引设计

```sql
-- 工作流查询优化
CREATE INDEX CONCURRENTLY idx_workflows_status_updated
ON workflows(status, updated_at DESC);

-- 执行记录查询优化
CREATE INDEX CONCURRENTLY idx_executions_workflow_status
ON executions(workflow_id, status, started_at DESC);

-- 时序数据分区和索引
-- TimescaleDB 自动创建时间分区索引
CREATE INDEX CONCURRENTLY idx_measurement_device_time
ON measurement_data(device_id, timestamp DESC);

-- 设备状态监控
CREATE INDEX CONCURRENTLY idx_devices_status_seen
ON devices(status, last_seen DESC);
```

### 3.2 查询优化

```typescript
// 使用QueryBuilder优化查询
async getRecentExecutions(workflowId: string, limit = 10) {
  return this.executionRepository
    .createQueryBuilder('execution')
    .leftJoinAndSelect('execution.workflow', 'workflow')
    .leftJoinAndSelect('execution.nodes', 'nodes')
    .leftJoinAndSelect('nodes.measurementData', 'measurementData')
    .where('execution.workflowId = :workflowId', { workflowId })
    .orderBy('execution.startedAt', 'DESC')
    .limit(limit)
    .getMany();
}

// 时序数据聚合查询
async getMeasurementStats(deviceId: string, timeRange: { start: Date; end: Date }) {
  return this.measurementRepository
    .createQueryBuilder('measurement')
    .select('measurement.measurementType', 'type')
    .addSelect('COUNT(*)', 'count')
    .addSelect('AVG(measurement.quality)', 'avgQuality')
    .where('measurement.deviceId = :deviceId', { deviceId })
    .andWhere('measurement.timestamp BETWEEN :start AND :end', timeRange)
    .groupBy('measurement.measurementType')
    .getRawMany();
}
```

### 3.3 数据分区策略

```sql
-- TimescaleDB 超表创建
SELECT create_hypertable('measurement_data', 'timestamp',
                         chunk_time_interval => INTERVAL '1 day');

-- 设置数据保留策略
SELECT add_retention_policy('measurement_data',
                          INTERVAL '6 months',
                          drop_after => true);

-- 旧数据压缩
SELECT add_compression_policy('measurement_data',
                            INTERVAL '3 months');
```

## 4. 缓存策略

### 4.1 Redis缓存层

```typescript
// apps/backend/src/cache/redis-cache.service.ts
@Injectable()
export class RedisCacheService {
  constructor(@Inject('REDIS_CLIENT') private redis: RedisClient) {}

  // 工作流定义缓存
  async getWorkflow(workflowId: string): Promise<Workflow> {
    const cacheKey = `workflow:${workflowId}`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    const workflow = await this.workflowRepository.findOne({
      where: { id: workflowId },
      relations: ['versions']
    });

    await this.redis.setex(cacheKey, 3600, JSON.stringify(workflow));
    return workflow;
  }

  // 设备状态缓存
  async updateDeviceStatus(deviceId: string, status: DeviceStatus) {
    const cacheKey = `device:status:${deviceId}`;
    await this.redis.setex(cacheKey, 300, JSON.stringify({
      status,
      timestamp: new Date()
    }));
  }
}
```

### 4.2 缓存策略

- **工作流定义**: 缓存1小时
- **设备状态**: 缓存5分钟
- **用户会话**: 缓存24小时
- **查询结果**: 根据查询复杂度缓存5-30分钟

## 5. 数据迁移和版本控制

### 5.1 迁移文件示例

```typescript
// apps/backend/migrations/1630000000000-InitialSchema.ts
import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1630000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // 创建核心表
        await queryRunner.query(`
            CREATE TABLE users (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                firstName VARCHAR(100) NOT NULL,
                lastName VARCHAR(100) NOT NULL,
                role VARCHAR(20) DEFAULT 'viewer',
                isActive BOOLEAN DEFAULT true,
                preferences JSONB,
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 创建TimescaleDB扩展和超表
        await queryRunner.query(`
            CREATE EXTENSION IF NOT EXISTS timescaledb;
        `);

        await queryRunner.query(`
            CREATE TABLE measurement_data (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                execution_node_id UUID,
                device_id UUID,
                measurement_type VARCHAR(50) NOT NULL,
                parameters JSONB NOT NULL,
                metadata JSONB,
                data JSONB NOT NULL,
                quality FLOAT,
                tags TEXT[],
                timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await queryRunner.query(`
            SELECT create_hypertable('measurement_data', 'timestamp');
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // 回滚操作
        await queryRunner.query(`DROP TABLE IF EXISTS measurement_data CASCADE;`);
        await queryRunner.query(`DROP EXTENSION IF EXISTS timescaledb;`);
    }
}
```

### 5.2 数据种子

```typescript
// apps/backend/src/database/seeds/index.ts
export async function runSeeds(dataSource: DataSource) {
  // 创建默认管理员用户
  const userRepository = dataSource.getRepository(User);
  const adminExists = await userRepository.findOne({ where: { email: 'admin@zahnerflow.com' } });

  if (!adminExists) {
    const admin = userRepository.create({
      email: 'admin@zahnerflow.com',
      password: await hashPassword('admin123'),
      firstName: 'System',
      lastName: 'Administrator',
      role: UserRole.ADMIN
    });
    await userRepository.save(admin);
  }

  // 创建示例设备
  const deviceRepository = dataSource.getRepository(Device);
  // ... 创建设备数据
}
```

## 6. 监控和维护

### 6.1 性能监控

```sql
-- 慢查询日志
ALTER SYSTEM SET log_min_duration_statement = '100ms';
ALTER SYSTEM SET log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h ';

-- 统计信息收集
ALTER SYSTEM SET track_activities = on;
ALTER SYSTEM SET track_counts = on;
ALTER SYSTEM SET track_io_timing = on;
```

### 6.2 定期维护脚本

```sql
-- vacuum分析
VACUUM ANALYZE;

-- 更新统计信息
ANALYZE VERBOSE;

-- 重建碎片化索引
REINDEX TABLE CONCURRENTLY measurement_data;

-- 清理过期数据
DELETE FROM executions
WHERE status IN ('completed', 'failed')
AND completed_at < NOW() - INTERVAL '1 year';
```