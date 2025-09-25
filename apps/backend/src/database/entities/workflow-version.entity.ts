import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index
} from 'typeorm';
import { Workflow } from './workflow.entity';
import { User } from './user.entity';

@Entity('workflow_versions')
@Index(['workflowId', 'version'])
export class WorkflowVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  workflowId: string;

  @Column()
  version: string;

  @Column({ type: 'text' })
  changelog?: string;

  @Column({ type: 'jsonb' })
  definition: any;

  @ManyToOne(() => Workflow, workflow => workflow.versions)
  @JoinColumn({ name: 'workflow_id' })
  workflow: Workflow;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy: User;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ default: true })
  isLatest: boolean;
}