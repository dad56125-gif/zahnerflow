import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index
} from 'typeorm';
import { UserRole } from './enums';
import { Workflow } from './workflow.entity';

@Entity('users')
@Index(['email'])
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ select: false })
  password: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ nullable: true })
  avatar?: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.VIEWER
  })
  role: UserRole;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'jsonb', nullable: true })
  preferences?: {
    theme?: 'light' | 'dark';
    language?: string;
    notifications: {
      email: boolean;
      browser: boolean;
      workflow: boolean;
      device: boolean;
    };
  };

  @Column({ type: 'simple-array', nullable: true })
  permissions?: string[];

  @Column({ nullable: true })
  lastLoginAt: Date;

  @Column({ type: 'text', nullable: true })
  lastLoginIp?: string;

  @OneToMany(() => Workflow, workflow => workflow.createdBy)
  workflows: Workflow[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  deletedAt: Date;
}