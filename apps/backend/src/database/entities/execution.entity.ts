import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index
} from 'typeorm';
import { ExecutionStatus } from './enums';
import { Workflow } from './workflow.entity';
import { User } from './user.entity';
import { ExecutionNode } from './execution-node.entity';

@Entity('executions')
@Index(['workflowId', 'status'])
@Index(['status', 'startedAt'])
export class Execution {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  workflowId: string;

  @Column()
  workflowVersion: string;

  @ManyToOne(() => Workflow)
  @JoinColumn({ name: 'workflow_id' })
  workflow: Workflow;

  @Column({
    type: 'enum',
    enum: ExecutionStatus,
    default: ExecutionStatus.PENDING
  })
  status: ExecutionStatus;

  @Column({ type: 'jsonb', nullable: true })
  parameters?: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  context?: {
    deviceId?: string;
    environment?: Record<string, any>;
    trigger?: 'manual' | 'scheduled' | 'api';
  };

  @OneToMany(() => ExecutionNode, node => node.execution)
  nodes: ExecutionNode[];

  @Column({ type: 'text', nullable: true })
  errorMessage?: string;

  @Column({ nullable: true })
  startedAt: Date;

  @Column({ nullable: true })
  completedAt: Date;

  @Column({ type: 'bigint', nullable: true })
  duration?: number; // in milliseconds

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'started_by' })
  startedBy: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}