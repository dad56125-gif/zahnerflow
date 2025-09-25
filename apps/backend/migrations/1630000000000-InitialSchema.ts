import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1630000000000 implements MigrationInterface {
    name = 'InitialSchema1630000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 创建用户表
        await queryRunner.query(`
            CREATE TABLE "users" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "email" character varying NOT NULL,
                "password" character varying NOT NULL,
                "firstName" character varying NOT NULL,
                "lastName" character varying NOT NULL,
                "avatar" character varying,
                "role" character varying NOT NULL DEFAULT 'viewer',
                "isActive" boolean NOT NULL DEFAULT true,
                "preferences" jsonb,
                "permissions" text array,
                "lastLoginAt" timestamp,
                "lastLoginIp" character varying,
                "createdAt" timestamp NOT NULL DEFAULT now(),
                "updatedAt" timestamp NOT NULL DEFAULT now(),
                "deletedAt" timestamp,
                CONSTRAINT "UQ_97672ac8f969004c9117cbb09b5" UNIQUE ("email"),
                CONSTRAINT "PK_a3ffb1c0c8416b9fc6f904b7672" PRIMARY KEY ("id")
            )
        `);

        // 创建设备表
        await queryRunner.query(`
            CREATE TABLE "devices" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "name" character varying NOT NULL,
                "type" character varying NOT NULL,
                "serialNumber" character varying NOT NULL,
                "model" character varying NOT NULL,
                "manufacturer" character varying NOT NULL,
                "status" character varying NOT NULL DEFAULT 'offline',
                "capabilities" jsonb NOT NULL,
                "configuration" jsonb,
                "endpoint" character varying,
                "lastSeen" timestamp with time zone,
                "health" jsonb,
                "createdAt" timestamp NOT NULL DEFAULT now(),
                "updatedAt" timestamp NOT NULL DEFAULT now(),
                "deletedAt" timestamp,
                CONSTRAINT "UQ_0204e4a2b5c8e1e9e9d5a0b4f5d" UNIQUE ("name"),
                CONSTRAINT "UQ_6d4e8a8c8b4a7c6f9a2b5c4e8f" UNIQUE ("serialNumber"),
                CONSTRAINT "PK_e7c0e4b0b5c8e1e9e9d5a0b4f5d6" PRIMARY KEY ("id")
            )
        `);

        // 创建设备校准表
        await queryRunner.query(`
            CREATE TABLE "device_calibrations" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "deviceId" uuid NOT NULL,
                "calibrationDate" timestamp with time zone NOT NULL,
                "performedBy" character varying,
                "results" jsonb NOT NULL,
                "nextCalibrationDate" timestamp with time zone,
                "certificate" text,
                "notes" jsonb,
                "createdAt" timestamp NOT NULL DEFAULT now(),
                CONSTRAINT "PK_4e8a8c8b4a7c6f9a2b5c4e8f6d7" PRIMARY KEY ("id"),
                CONSTRAINT "FK_d4e8a8c8b4a7c6f9a2b5c4e8f6d7" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE
            )
        `);

        // 创建工作流表
        await queryRunner.query(`
            CREATE TABLE "workflows" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "name" character varying NOT NULL,
                "description" text,
                "definition" jsonb NOT NULL,
                "status" character varying NOT NULL DEFAULT 'draft',
                "metadata" jsonb,
                "createdById" uuid,
                "createdAt" timestamp NOT NULL DEFAULT now(),
                "updatedAt" timestamp NOT NULL DEFAULT now(),
                "deletedAt" timestamp,
                CONSTRAINT "UQ_9c72ac8f969004c9117cbb09b56" UNIQUE ("name"),
                CONSTRAINT "PK_d4e8a8c8b4a7c6f9a2b5c4e8f6d8" PRIMARY KEY ("id"),
                CONSTRAINT "FK_e4e8a8c8b4a7c6f9a2b5c4e8f6d9" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL
            )
        `);

        // 创建工作流版本表
        await queryRunner.query(`
            CREATE TABLE "workflow_versions" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "workflowId" uuid NOT NULL,
                "version" character varying NOT NULL,
                "changelog" text,
                "definition" jsonb NOT NULL,
                "createdById" uuid,
                "createdAt" timestamp NOT NULL DEFAULT now(),
                "isLatest" boolean NOT NULL DEFAULT true,
                CONSTRAINT "PK_f4e8a8c8b4a7c6f9a2b5c4e8f6da" PRIMARY KEY ("id"),
                CONSTRAINT "FK_g4e8a8c8b4a7c6f9a2b5c4e8f6db" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_h4e8a8c8b4a7c6f9a2b5c4e8f6dc" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL
            )
        `);

        // 创建执行记录表
        await queryRunner.query(`
            CREATE TABLE "executions" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "workflowId" uuid NOT NULL,
                "workflowVersion" character varying NOT NULL,
                "status" character varying NOT NULL DEFAULT 'pending',
                "parameters" jsonb,
                "context" jsonb,
                "errorMessage" text,
                "startedAt" timestamp,
                "completedAt" timestamp,
                "duration" bigint,
                "startedById" uuid,
                "createdAt" timestamp NOT NULL DEFAULT now(),
                "updatedAt" timestamp NOT NULL DEFAULT now(),
                CONSTRAINT "PK_i4e8a8c8b4a7c6f9a2b5c4e8f6dd" PRIMARY KEY ("id"),
                CONSTRAINT "FK_j4e8a8c8b4a7c6f9a2b5c4e8f6de" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_k4e8a8c8b4a7c6f9a2b5c4e8f6df" FOREIGN KEY ("startedById") REFERENCES "users"("id") ON DELETE SET NULL
            )
        `);

        // 创建执行节点表
        await queryRunner.query(`
            CREATE TABLE "execution_nodes" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "executionId" uuid NOT NULL,
                "nodeId" character varying NOT NULL,
                "nodeType" character varying NOT NULL,
                "status" character varying NOT NULL DEFAULT 'pending',
                "config" jsonb NOT NULL,
                "input" jsonb,
                "output" jsonb,
                "errorMessage" text,
                "startedAt" timestamp,
                "completedAt" timestamp,
                "duration" bigint,
                "measurementDataId" uuid,
                "createdAt" timestamp NOT NULL DEFAULT now(),
                "updatedAt" timestamp NOT NULL DEFAULT now(),
                CONSTRAINT "PK_l4e8a8c8b4a7c6f9a2b5c4e8f6dg" PRIMARY KEY ("id"),
                CONSTRAINT "FK_m4e8a8c8b4a7c6f9a2b5c4e8f6dh" FOREIGN KEY ("executionId") REFERENCES "executions"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_n4e8a8c8b4a7c6f9a2b5c4e8f6di" FOREIGN KEY ("measurementDataId") REFERENCES "measurement_data"("id") ON DELETE SET NULL
            )
        `);

        // 创建测量数据表
        await queryRunner.query(`
            CREATE TABLE "measurement_data" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "executionNodeId" uuid,
                "deviceId" uuid,
                "measurementType" character varying NOT NULL,
                "parameters" jsonb NOT NULL,
                "metadata" jsonb,
                "data" jsonb NOT NULL,
                "quality" real,
                "tags" text array,
                "timestamp" timestamp with time zone NOT NULL DEFAULT now(),
                "createdAt" timestamp NOT NULL DEFAULT now(),
                CONSTRAINT "PK_o4e8a8c8b4a7c6f9a2b5c4e8f6dj" PRIMARY KEY ("id"),
                CONSTRAINT "FK_p4e8a8c8b4a7c6f9a2b5c4e8f6dk" FOREIGN KEY ("executionNodeId") REFERENCES "execution_nodes"("id") ON DELETE SET NULL,
                CONSTRAINT "FK_q4e8a8c8b4a7c6f9a2b5c4e8f6dl" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE SET NULL
            )
        `);

        // 创建索引
        await queryRunner.query(`
            CREATE INDEX "IDX_users_email" ON "users" ("email");
        `);

        await queryRunner.query(`
            CREATE INDEX "IDX_devices_status_seen" ON "devices" ("status", "lastSeen");
        `);

        await queryRunner.query(`
            CREATE INDEX "IDX_workflows_status_updated" ON "workflows" ("status", "updatedAt");
        `);

        await queryRunner.query(`
            CREATE INDEX "IDX_executions_workflow_status" ON "executions" ("workflowId", "status", "startedAt");
        `);

        await queryRunner.query(`
            CREATE INDEX "IDX_execution_nodes_execution_status" ON "execution_nodes" ("executionId", "status");
        `);

        await queryRunner.query(`
            CREATE INDEX "IDX_measurement_device_time" ON "measurement_data" ("deviceId", "timestamp");
        `);

        await queryRunner.query(`
            CREATE INDEX "IDX_measurement_execution_node" ON "measurement_data" ("executionNodeId", "measurementType");
        `);

        // 创建TimescaleDB扩展（如果使用PostgreSQL）
        if (queryRunner.connection.options.type === 'postgres') {
            try {
                await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS timescaledb;`);

                // 将测量数据表转换为超表
                await queryRunner.query(`
                    SELECT create_hypertable('measurement_data', 'timestamp',
                                          chunk_time_interval => INTERVAL '1 day');
                `);

                // 设置数据保留策略
                await queryRunner.query(`
                    SELECT add_retention_policy('measurement_data', INTERVAL '6 months');
                `);
            } catch (error) {
                console.log('TimescaleDB extension not available, skipping hypertable creation');
            }
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // 按照依赖关系反向删除表
        await queryRunner.query(`DROP TABLE "execution_nodes"`);
        await queryRunner.query(`DROP TABLE "measurement_data"`);
        await queryRunner.query(`DROP TABLE "executions"`);
        await queryRunner.query(`DROP TABLE "workflow_versions"`);
        await queryRunner.query(`DROP TABLE "workflows"`);
        await queryRunner.query(`DROP TABLE "device_calibrations"`);
        await queryRunner.query(`DROP TABLE "devices"`);
        await queryRunner.query(`DROP TABLE "users"`);

        // 删除TimescaleDB扩展
        if (queryRunner.connection.options.type === 'postgres') {
            try {
                await queryRunner.query(`DROP EXTENSION IF EXISTS timescaledb;`);
            } catch (error) {
                // 忽略错误
            }
        }
    }
}