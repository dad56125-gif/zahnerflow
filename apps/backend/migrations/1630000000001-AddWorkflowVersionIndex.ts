import { MigrationInterface, QueryRunner } from "typeorm";

export class AddWorkflowVersionIndex1630000000001 implements MigrationInterface {
    name = 'AddWorkflowVersionIndex1630000000001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 为工作流版本表添加复合索引
        await queryRunner.query(`
            CREATE INDEX "IDX_workflow_versions_workflow_version"
            ON "workflow_versions" ("workflowId", "version");
        `);

        // 为工作流版本表添加最新版本索引
        await queryRunner.query(`
            CREATE INDEX "IDX_workflow_versions_latest"
            ON "workflow_versions" ("workflowId", "isLatest")
            WHERE "isLatest" = true;
        `);

        // 为设备校准表添加复合索引
        await queryRunner.query(`
            CREATE INDEX "IDX_device_calibrations_device_date"
            ON "device_calibrations" ("deviceId", "calibrationDate");
        `);

        // 为测量数据表添加类型索引
        await queryRunner.query(`
            CREATE INDEX "IDX_measurement_type"
            ON "measurement_data" ("measurementType", "timestamp");
        `);

        // 为测量数据表添加质量索引
        await queryRunner.query(`
            CREATE INDEX "IDX_measurement_quality"
            ON "measurement_data" ("quality")
            WHERE "quality" IS NOT NULL;
        `);

        // 为执行节点表添加节点类型索引
        await queryRunner.query(`
            CREATE INDEX "IDX_execution_nodes_type"
            ON "execution_nodes" ("nodeType", "status");
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // 删除索引
        await queryRunner.query(`DROP INDEX "IDX_workflow_versions_workflow_version"`);
        await queryRunner.query(`DROP INDEX "IDX_workflow_versions_latest"`);
        await queryRunner.query(`DROP INDEX "IDX_device_calibrations_device_date"`);
        await queryRunner.query(`DROP INDEX "IDX_measurement_type"`);
        await queryRunner.query(`DROP INDEX "IDX_measurement_quality"`);
        await queryRunner.query(`DROP INDEX "IDX_execution_nodes_type"`);
    }
}