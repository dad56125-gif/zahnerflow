import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Workflow, Execution, Device } from './entities';
import { WorkflowRepository } from './repositories/workflow.repository';
import { ExecutionRepository } from './repositories/execution.repository';
import { MeasurementRepository } from './repositories/measurement.repository';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

@Injectable()
export class DatabaseService implements OnModuleInit {
  constructor(
    private readonly workflowRepository: WorkflowRepository,
    private readonly executionRepository: ExecutionRepository,
    private readonly measurementRepository: MeasurementRepository,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
  ) {}

  async onModuleInit() {
    // 初始化数据库连接检查
    try {
      const deviceCount = await this.deviceRepository.count();
      console.log(`Database connected successfully. Found ${deviceCount} devices.`);
    } catch (error) {
      console.error('Database connection failed:', error);
    }
  }

  // Workflow operations
  async createWorkflow(data: any, userId?: string) {
    const workflow = await this.workflowRepository.create(data, userId);
    // Clear cache
    await this.cacheManager.del('workflows:all');
    return workflow;
  }

  async getWorkflows(options?: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
  }) {
    const cacheKey = `workflows:${JSON.stringify(options || {})}`;
    const cached = await this.cacheManager.get(cacheKey);

    if (cached) {
      return cached;
    }

    const result = await this.workflowRepository.findAll(
      options?.page,
      options?.limit,
      options?.status as any,
      options?.search,
    );

    // Cache for 5 minutes
    await this.cacheManager.set(cacheKey, result, 300);
    return result;
  }

  // Execution operations
  async createExecution(workflowId: string, workflowVersion: string, userId?: string) {
    return await this.executionRepository.create(workflowId, workflowVersion, userId);
  }

  async getExecutions(options?: {
    workflowId?: string;
    status?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }) {
    return await this.executionRepository.findAll(
      options?.workflowId,
      options?.status as any,
      options?.startDate,
      options?.endDate,
      options?.page,
      options?.limit,
    );
  }

  async getExecutionStatistics(workflowId?: string) {
    return await this.executionRepository.getExecutionStatistics(workflowId);
  }

  // Measurement operations
  async createMeasurement(data: any) {
    return await this.measurementRepository.create(data);
  }

  async getMeasurements(options?: {
    deviceId?: string;
    measurementType?: string;
    startDate?: Date;
    endDate?: Date;
    tags?: string[];
    page?: number;
    limit?: number;
  }) {
    return await this.measurementRepository.findAll(
      options?.deviceId,
      options?.measurementType as any,
      options?.startDate,
      options?.endDate,
      options?.tags,
      options?.page,
      options?.limit,
    );
  }

  async getMeasurementStats(deviceId?: string, startDate?: Date, endDate?: Date) {
    return await this.measurementRepository.getDataQualityStats(deviceId, startDate, endDate);
  }

  // Health check
  async healthCheck() {
    try {
      // Check database connection
      await this.deviceRepository.query('SELECT 1');

      // Check cache
      await this.cacheManager.set('health-check', 'ok', 5);

      return {
        status: 'healthy',
        database: 'connected',
        cache: 'connected',
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date(),
      };
    }
  }

  // Cleanup operations
  async cleanupOldData() {
    const cleanedMeasurements = await this.measurementRepository.cleanupOldData();
    const cleanedExecutions = await this.executionRepository.cleanupOldExecutions();

    return {
      measurementsCleaned: cleanedMeasurements,
      executionsCleaned: cleanedExecutions,
    };
  }
}