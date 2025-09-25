import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import * as redisStore from 'cache-manager-redis-store';
import {
  Workflow,
  WorkflowVersion,
  Execution,
  ExecutionNode,
  MeasurementData,
  Device,
  DeviceCalibration,
  User
} from './entities';
import { WorkflowRepository } from './repositories/workflow.repository';
import { ExecutionRepository } from './repositories/execution.repository';
import { MeasurementRepository } from './repositories/measurement.repository';
import { DatabaseService } from './database.service';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: configService.get<string>('DB_TYPE', 'sqlite') as any,
        host: configService.get<string>('DB_HOST'),
        port: configService.get<number>('DB_PORT'),
        username: configService.get<string>('DB_USERNAME'),
        password: configService.get<string>('DB_PASSWORD'),
        database: configService.get<string>('DB_DATABASE'),

        entities: [
          Workflow,
          WorkflowVersion,
          Execution,
          ExecutionNode,
          MeasurementData,
          Device,
          DeviceCalibration,
          User
        ],

        migrations: ['dist/apps/backend/migrations/*{.ts,.js}'],
        migrationsTableName: 'typeorm_migrations',

        logging: configService.get<string>('NODE_ENV') === 'development',

        // SQLite specific settings
        synchronize: configService.get<string>('NODE_ENV') === 'development' &&
                    configService.get<string>('DB_TYPE') === 'sqlite',

        // PostgreSQL specific settings
        extra: configService.get<string>('DB_TYPE') === 'postgres' ? {
          connectionLimit: 20,
          ssl: configService.get<boolean>('DB_SSL') ? { rejectUnauthorized: false } : false
        } : undefined,
      }),
    }),

    TypeOrmModule.forFeature([
      Workflow,
      WorkflowVersion,
      Execution,
      ExecutionNode,
      MeasurementData,
      Device,
      DeviceCalibration,
      User
    ]),

    CacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        store: redisStore,
        host: configService.get<string>('REDIS_HOST', 'localhost'),
        port: configService.get<number>('REDIS_PORT', 6379),
        password: configService.get<string>('REDIS_PASSWORD'),
        ttl: 60, // default TTL in seconds
        isGlobal: true,
      }),
    }),
  ],
  providers: [
    DatabaseService,
    WorkflowRepository,
    ExecutionRepository,
    MeasurementRepository,
  ],
  exports: [
    DatabaseService,
    WorkflowRepository,
    ExecutionRepository,
    MeasurementRepository,
    TypeOrmModule,
    CacheModule,
  ],
})
export class DatabaseModule {}