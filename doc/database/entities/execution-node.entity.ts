import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index
} from 'typeorm';
import { NodeStatus } from './enums';
import { Execution } from './execution.entity';
import { MeasurementData } from './measurement-data.entity';

@Entity('execution_nodes')
@Index(['executionId', 'status'])
export class ExecutionNode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  executionId: string;

  @Column()
  nodeId: string; // workflow node id

  @Column()
  nodeType: string;

  @ManyToOne(() => Execution)
  @JoinColumn({ name: 'execution_id' })
  execution: Execution;

  @Column({
    type: 'enum',
    enum: NodeStatus,
    default: NodeStatus.PENDING
  })
  status: NodeStatus;

  @Column({ type: 'jsonb', nullable: true })
  config: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  input?: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  output?: Record<string, any>;

  @Column({ type: 'text', nullable: true })
  errorMessage?: string;

  @Column({ nullable: true })
  startedAt: Date;

  @Column({ nullable: true })
  completedAt: Date;

  @Column({ type: 'bigint', nullable: true })
  duration?: number; // in milliseconds

  @Column({ nullable: true })
  measurementDataId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}