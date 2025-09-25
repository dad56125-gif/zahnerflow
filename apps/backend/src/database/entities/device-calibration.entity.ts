import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index
} from 'typeorm';
import { Device } from './device.entity';

@Entity('device_calibrations')
@Index(['deviceId', 'calibrationDate'])
export class DeviceCalibration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  deviceId: string;

  @Column({ type: 'timestamp with time zone' })
  calibrationDate: Date;

  @Column({ nullable: true })
  performedBy: string;

  @Column({ type: 'jsonb' })
  results: Record<string, any>;

  @Column({ type: 'timestamp with time zone', nullable: true })
  nextCalibrationDate: Date;

  @Column({ type: 'text', nullable: true })
  certificate?: string;

  @Column({ type: 'jsonb', nullable: true })
  notes?: {
    conditions?: string;
    recommendations?: string;
  };

  @ManyToOne(() => Device)
  @JoinColumn({ name: 'device_id' })
  device: Device;

  @CreateDateColumn()
  createdAt: Date;
}