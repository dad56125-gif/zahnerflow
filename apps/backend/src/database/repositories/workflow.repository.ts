import { EntityRepository, Repository } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Workflow, WorkflowStatus } from '../entities';
import { CreateWorkflowDto, UpdateWorkflowDto } from '../dto/workflow.dto';

@Injectable()
export class WorkflowRepository {
  constructor(
    @InjectRepository(Workflow)
    private readonly repository: Repository<Workflow>,
  ) {}

  async create(createWorkflowDto: CreateWorkflowDto, userId?: string): Promise<Workflow> {
    const workflow = this.repository.create({
      ...createWorkflowDto,
      createdBy: userId ? { id: userId } as any : undefined,
    });
    return await this.repository.save(workflow);
  }

  async findAll(
    page = 1,
    limit = 10,
    status?: WorkflowStatus,
    search?: string,
  ): Promise<{ data: Workflow[]; total: number }> {
    const queryBuilder = this.repository.createQueryBuilder('workflow')
      .leftJoinAndSelect('workflow.createdBy', 'createdBy')
      .leftJoinAndSelect('workflow.versions', 'versions')
      .orderBy('workflow.updatedAt', 'DESC');

    if (status) {
      queryBuilder.andWhere('workflow.status = :status', { status });
    }

    if (search) {
      queryBuilder.andWhere(
        '(workflow.name ILIKE :search OR workflow.description ILIKE :search)',
        { search: `%${search}%` }
      );
    }

    const [data, total] = await queryBuilder
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total };
  }

  async findOne(id: string): Promise<Workflow> {
    return await this.repository.findOne({
      where: { id },
      relations: ['versions', 'createdBy'],
    });
  }

  async update(id: string, updateWorkflowDto: UpdateWorkflowDto): Promise<Workflow> {
    await this.repository.update(id, updateWorkflowDto);
    return await this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    // Soft delete
    await this.repository.softDelete(id);
  }

  async restore(id: string): Promise<Workflow> {
    await this.repository.restore(id);
    return await this.findOne(id);
  }

  async findActiveWorkflows(): Promise<Workflow[]> {
    return await this.repository.find({
      where: { status: WorkflowStatus.ACTIVE },
      order: { updatedAt: 'DESC' },
    });
  }

  async duplicate(id: string, newName: string, userId?: string): Promise<Workflow> {
    const original = await this.findOne(id);
    if (!original) {
      throw new Error(`Workflow with id ${id} not found`);
    }

    const duplicated = this.repository.create({
      name: newName,
      description: `${original.description} (复制)`,
      definition: original.definition,
      status: WorkflowStatus.DRAFT,
      createdBy: userId ? { id: userId } as any : undefined,
    });

    return await this.repository.save(duplicated);
  }
}