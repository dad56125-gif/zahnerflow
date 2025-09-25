import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index
} from 'typeorm';
import { MeasurementType } from './enums';
import { ExecutionNode } from './execution-node.entity';
import { Device } from './device.entity';

// 时序数据表 - 使用TimescaleDB超表
@Entity('measurement_data')
@Index(['executionNodeId', 'measurementType'])
@Index(['deviceId', 'timestamp'])
export class MeasurementData {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  executionNodeId: string;

  @Column({ nullable: true })
  deviceId: string;

  @ManyToOne(() => ExecutionNode)
  @JoinColumn({ name: 'execution_node_id' })
  executionNode: ExecutionNode;

  @ManyToOne(() => Device)
  @JoinColumn({ name: 'device_id' })
  device: Device;

  @Column({
    type: 'enum',
    enum: MeasurementType
  })
  measurementType: MeasurementType;

  @Column({ type: 'jsonb' })
  parameters: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: {
    sampleId?: string;
    temperature?: number;
    humidity?: number;
    notes?: string;
  };

  @Column({ type: 'jsonb' })
  data: {
    time: number[];
    frequency?: number[];
    impedance?: { real: number[]; imag: number[] };
    potential?: number[];
    current?: number[];
    [key: string]: any;
  };

  @Column({ type: 'float', nullable: true })
  quality?: number; // 0-1 数据质量评分

  @Column({ type: 'simple-array', nullable: true })
  tags?: string[];

  @Column({ type: 'timestamp with time zone', default: () => 'CURRENT_TIMESTAMP' })
  timestamp: Date;

  @CreateDateColumn()
  createdAt: Date;
}