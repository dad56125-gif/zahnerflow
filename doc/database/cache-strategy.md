# ZAHNERFLOW 缓存策略和性能优化方案

## 1. 缓存架构设计

### 1.1 多层缓存策略

```
客户端缓存
    ↓ (HTTP Cache-Control)
CDN缓存 (静态资源)
    ↓
Redis缓存 (应用层)
    ↓
数据库缓存 (PostgreSQL)
    ↓
持久化存储
```

### 1.2 缓存层级说明

1. **客户端缓存**: 利用浏览器缓存和HTTP缓存头
2. **Redis缓存**: 应用层缓存，存储频繁访问的数据
3. **数据库缓存**: PostgreSQL自身缓存机制

## 2. Redis缓存策略

### 2.1 缓存键设计规范

```
{entity}:{id}:{version}          # 实体缓存
{entity}:list:{filters}          # 列表缓存
{entity}:stats:{id}:{period}     # 统计数据缓存
{device}:status:{id}             # 设备状态缓存
{user}:session:{token}           # 用户会话缓存
{api}:rate:{ip}:{endpoint}       # API限流缓存
```

### 2.2 缓存TTL策略

| 数据类型 | TTL | 说明 |
|---------|-----|------|
| 工作流定义 | 1小时 | 变化频率低 |
| 设备状态 | 5分钟 | 实时性要求高 |
| 执行记录 | 30分钟 | 历史数据查询 |
| 统计数据 | 15分钟 | 聚合数据 |
| 用户会话 | 24小时 | 认证信息 |
| API限流 | 1分钟 | 限流窗口 |

### 2.3 缓存模式

#### 2.3.1 Cache-Aside (Lazy Loading)

```typescript
async getWorkflow(id: string) {
  const cacheKey = `workflow:${id}`;
  let workflow = await this.cacheManager.get(cacheKey);

  if (!workflow) {
    workflow = await this.workflowRepository.findOne(id);
    if (workflow) {
      await this.cacheManager.set(cacheKey, workflow, 3600); // 1 hour
    }
  }

  return workflow;
}

async updateWorkflow(id: string, data: any) {
  // 更新数据库
  await this.workflowRepository.update(id, data);

  // 使缓存失效
  await this.cacheManager.del(`workflow:${id}`);
  await this.cacheManager.del('workflows:all');
}
```

#### 2.3.2 Write-Through

```typescript
async createMeasurement(data: any) {
  // 写入数据库
  const measurement = await this.measurementRepository.create(data);

  // 同步写入缓存
  await this.cacheManager.set(
    `measurement:${measurement.id}`,
    measurement,
    1800 // 30 minutes
  );

  // 更新相关统计缓存
  await this.updateMeasurementStats(measurement.deviceId);

  return measurement;
}
```

#### 2.3.3 Read-Through

```typescript
async getMeasurementWithStats(deviceId: string) {
  const cacheKey = `device:measurements:${deviceId}`;

  return await this.cacheManager.wrap(cacheKey, async () => {
    // 缓存未命中时执行
    const measurements = await this.measurementRepository.find({
      where: { deviceId },
      take: 100,
      order: { timestamp: 'DESC' }
    });

    const stats = await this.calculateStats(measurements);

    return {
      measurements,
      stats,
      cachedAt: new Date()
    };
  }, 1800); // 30 minutes
}
```

## 3. 性能优化策略

### 3.1 数据库优化

#### 3.1.1 查询优化

```typescript
// 使用查询构建器优化
async getRecentExecutions(workflowId: string) {
  return this.executionRepository
    .createQueryBuilder('execution')
    .leftJoinAndSelect('execution.workflow', 'workflow')
    .leftJoinAndSelect('execution.nodes', 'nodes')
    .where('execution.workflowId = :workflowId', { workflowId })
    .orderBy('execution.startedAt', 'DESC')
    .take(10)
    .getMany();
}

// 使用原生查询处理复杂聚合
async getDeviceAnalytics(deviceId: string) {
  return this.dataSource.query(`
    SELECT
      DATE_TRUNC('day', timestamp) as day,
      measurement_type,
      COUNT(*) as count,
      AVG(quality) as avg_quality
    FROM measurement_data
    WHERE device_id = $1
      AND timestamp >= NOW() - INTERVAL '30 days'
    GROUP BY day, measurement_type
    ORDER BY day DESC
  `, [deviceId]);
}
```

#### 3.1.2 批量操作

```typescript
async bulkInsertMeasurements(measurements: any[]) {
  // 分批插入，避免大事务
  const batchSize = 1000;
  const results = [];

  for (let i = 0; i < measurements.length; i += batchSize) {
    const batch = measurements.slice(i, i + batchSize);
    const result = await this.measurementRepository
      .createQueryBuilder()
      .insert()
      .into(MeasurementData)
      .values(batch)
      .execute();

    results.push(result);

    // 清理相关缓存
    for (const measurement of batch) {
      await this.cacheManager.del(`device:stats:${measurement.deviceId}`);
    }
  }

  return results;
}
```

### 3.2 连接池优化

```typescript
// apps/backend/src/config/database.config.ts
export const connectionPoolConfig = {
  // 连接池配置
  pool: {
    min: 2,
    max: 20,
    idle: 30000,
    acquire: 60000,
  },

  // 查询超时
  query_timeout: 30000,

  // 语句超时
  statement_timeout: 25000,
};
```

### 3.3 分页优化

```typescript
// 使用游标分页处理大数据集
async getMeasurementsByCursor(
  deviceId: string,
  limit: number = 100,
  cursor?: string
) {
  const queryBuilder = this.measurementRepository
    .createQueryBuilder('measurement')
    .where('measurement.deviceId = :deviceId', { deviceId })
    .orderBy('measurement.timestamp', 'DESC')
    .take(limit + 1); // 多取一条判断是否有下一页

  if (cursor) {
    const [timestamp, id] = cursor.split('_');
    queryBuilder.andWhere(
      '(measurement.timestamp < :timestamp OR (measurement.timestamp = :timestamp AND measurement.id < :id))',
      { timestamp: new Date(timestamp), id }
    );
  }

  const measurements = await queryBuilder.getMany();

  const hasNextPage = measurements.length > limit;
  if (hasNextPage) {
    measurements.pop();
  }

  const nextCursor = hasNextPage
    ? `${measurements[measurements.length - 1].timestamp.toISOString()}_${measurements[measurements.length - 1].id}`
    : null;

  return {
    measurements,
    nextCursor,
    hasNextPage,
  };
}
```

## 4. 监控和维护

### 4.1 缓存监控

```typescript
// 缓存命中率监控
@Injectable()
export class CacheMonitorService {
  private readonly metrics = {
    hits: 0,
    misses: 0,
    operations: 0,
  };

  incrementHit() {
    this.metrics.hits++;
    this.metrics.operations++;
  }

  incrementMiss() {
    this.metrics.misses++;
    this.metrics.operations++;
  }

  getHitRate() {
    return this.metrics.operations > 0
      ? this.metrics.hits / this.metrics.operations
      : 0;
  }

  getMetrics() {
    return {
      ...this.metrics,
      hitRate: this.getHitRate(),
    };
  }
}
```

### 4.2 定期清理任务

```typescript
// 定时清理过期数据
@Cron('0 2 * * *') // 每天凌晨2点执行
async cleanupOldData() {
  // 清理90天前的执行记录
  const executionResult = await this.executionRepository.delete({
    status: In([ExecutionStatus.COMPLETED, ExecutionStatus.FAILED]),
    completedAt: LessThan(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)),
  });

  // 清理180天前的测量数据
  const measurementResult = await this.measurementRepository.delete({
    timestamp: LessThan(new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)),
  });

  console.log(`Cleanup completed: ${executionResult.affected} executions, ${measurementResult.affected} measurements`);
}
```

## 5. 扩展性考虑

### 5.1 分片策略

```typescript
// 基于设备ID的分片
function getShardKey(deviceId: string): number {
  // 使用一致性哈希
  const hash = crypto.createHash('md5').update(deviceId).digest('hex');
  return parseInt(hash.substr(0, 8), 16) % SHARD_COUNT;
}

// 分片查询
async getMeasurementsFromShard(deviceId: string, timeRange: TimeRange) {
  const shardKey = getShardKey(deviceId);
  const shardRepository = this.getShardRepository(shardKey);

  return shardRepository.find({
    where: {
      deviceId,
      timestamp: Between(timeRange.start, timeRange.end),
    },
  });
}
```

### 5.2 读写分离

```typescript
// 主从配置
const masterDataSource = new DataSource({
  type: 'postgres',
  host: 'master-db.example.com',
  // ... master配置
});

const slaveDataSource = new DataSource({
  type: 'postgres',
  host: 'slave-db.example.com',
  // ... slave配置
});

// 根据操作类型选择数据源
function getDataSource(isWriteOperation: boolean): DataSource {
  return isWriteOperation ? masterDataSource : slaveDataSource;
}
```