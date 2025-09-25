import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThan } from 'typeorm';
import { Execution, ExecutionStatus, MeasurementData } from '../entities';

@Injectable()
export class ExecutionRepository {
  constructor(
    @InjectRepository(Execution)
    private readonly repository: Repository<Execution>,
    @InjectRepository(MeasurementData)
    private readonly measurementRepository: Repository<MeasurementData>,
  ) {}

  async create(workflowId: string, workflowVersion: string, userId?: string): Promise<Execution> {
    const execution = this.repository.create({
      workflowId,
      workflowVersion,
      status: ExecutionStatus.PENDING,
      startedBy: userId ? { id: userId } as any : undefined,
    });
    return await this.repository.save(execution);
  }

  async findAll(
    workflowId?: string,
    status?: ExecutionStatus,
    startDate?: Date,
    endDate?: Date,
    page = 1,
    limit = 10,
  ): Promise<{ data: Execution[]; total: number }> {
    const queryBuilder = this.repository.createQueryBuilder('execution')
      .leftJoinAndSelect('execution.workflow', 'workflow')
      .leftJoinAndSelect('execution.nodes', 'nodes')
      .leftJoinAndSelect('execution.startedBy', 'startedBy')
      .leftJoinAndSelect('nodes.measurementData', 'measurementData')
      .orderBy('execution.createdAt', 'DESC');

    if (workflowId) {
      queryBuilder.andWhere('execution.workflowId = :workflowId', { workflowId });
    }

    if (status) {
      queryBuilder.andWhere('execution.status = :status', { status });
    }

    if (startDate && endDate) {
      queryBuilder.andWhere('execution.createdAt BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });
    }

    const [data, total] = await queryBuilder
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total };
  }

  async findOne(id: string): Promise<Execution> {
    return await this.repository.findOne({
      where: { id },
      relations: ['workflow', 'nodes', 'nodes.measurementData', 'startedBy'],
    });
  }

  async updateStatus(id: string, status: ExecutionStatus, errorMessage?: string): Promise<void> {
    const updateData: any = { status };

    if (status === ExecutionStatus.RUNNING) {
      updateData.startedAt = new Date();
    } else if (status === ExecutionStatus.COMPLETED || status === ExecutionStatus.FAILED) {
      updateData.completedAt = new Date();

      // Calculate duration
      const execution = await this.findOne(id);
      if (execution && execution.startedAt) {
        updateData.duration = Date.now() - execution.startedAt.getTime();
      }
    }

    if (errorMessage) {
      updateData.errorMessage = errorMessage;
    }

    await this.repository.update(id, updateData);
  }

  async findRunningExecutions(): Promise<Execution[]> {
    return await this.repository.find({
      where: { status: ExecutionStatus.RUNNING },
      relations: ['workflow'],
    });
  }

  async getExecutionStatistics(workflowId?: string): Promise<{
    total: number;
    completed: number;
    failed: number;
    averageDuration: number;
  }> {
    const queryBuilder = this.repository.createQueryBuilder('execution')
      .select('COUNT(*)', 'total')
      .addSelect('SUM(CASE WHEN status = :completed THEN 1 ELSE 0 END)', 'completed')
      .addSelect('SUM(CASE WHEN status = :failed THEN 1 ELSE 0 END)', 'failed')
      .addSelect('AVG(duration)', 'averageDuration');

    const params = {
      completed: ExecutionStatus.COMPLETED,
      failed: ExecutionStatus.FAILED,
    };

    if (workflowId) {
      queryBuilder.where('execution.workflowId = :workflowId', { workflowId });
    }

    const result = await queryBuilder.setParameters(params).getRawOne();

    return {
      total: parseInt(result.total) || 0,
      completed: parseInt(result.completed) || 0,
      failed: parseInt(result.failed) || 0,
      averageDuration: parseFloat(result.averageDuration) || 0,
    };
  }

  async getRecentExecutions(limit = 10): Promise<Execution[]> {
    return await this.repository.find({
      relations: ['workflow'],
      order: { startedAt: 'DESC' },
      take: limit,
    });
  }

  async cleanupOldExecutions(daysToKeep = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await this.repository.delete({
      status: ExecutionStatus.COMPLETED,
      completedAt: MoreThan(cutoffDate),
    });

    return result.affected || 0;
  }
}