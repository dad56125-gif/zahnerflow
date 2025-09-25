import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
  Index
} from 'typeorm';
import { WorkflowStatus } from './enums';
import { User } from './user.entity';
import { WorkflowVersion } from './workflow-version.entity';

@Entity('workflows')
@Index(['name', 'status'])
export class Workflow {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'jsonb' })
  definition: {
    nodes: any[];
    edges: any[];
    config: Record<string, any>;
    parameters: Record<string, any>;
  };

  @Column({
    type: 'enum',
    enum: WorkflowStatus,
    default: WorkflowStatus.DRAFT
  })
  status: WorkflowStatus;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: {
    tags: string[];
    category?: string;
    version?: string;
    author?: string;
  };

  @OneToMany(() => WorkflowVersion, version => version.workflow)
  versions: WorkflowVersion[];

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  deletedAt: Date;
}