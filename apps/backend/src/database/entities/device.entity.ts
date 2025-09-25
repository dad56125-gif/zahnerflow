import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index
} from 'typeorm';
import { DeviceStatus } from './enums';
import { DeviceCalibration } from './device-calibration.entity';

@Entity('devices')
@Index(['type', 'status'])
export class Device {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column()
  type: string;

  @Column({ unique: true })
  serialNumber: string;

  @Column()
  model: string;

  @Column()
  manufacturer: string;

  @Column({
    type: 'enum',
    enum: DeviceStatus,
    default: DeviceStatus.OFFLINE
  })
  status: DeviceStatus;

  @Column({ type: 'jsonb' })
  capabilities: string[];

  @Column({ type: 'jsonb', nullable: true })
  configuration: Record<string, any>;

  @Column({ type: 'text', nullable: true })
  endpoint?: string;

  @Column({ type: 'timestamp with time zone', nullable: true })
  lastSeen?: Date;

  @Column({ type: 'jsonb', nullable: true })
  health?: {
    uptime: number;
    temperature?: number;
    errors: string[];
  };

  @OneToMany(() => DeviceCalibration, calibration => calibration.device)
  calibrations: DeviceCalibration[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  deletedAt: Date;
}