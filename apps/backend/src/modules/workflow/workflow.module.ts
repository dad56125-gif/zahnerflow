import { Module } from '@nestjs/common';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';
import { WorkflowStorageService } from './workflow-storage.service';
import { DbModule } from '../../db/db.module';

@Module({
  imports: [DbModule], // 导入 DbModule 以便注入 DbService
  controllers: [WorkflowController],
  providers: [
    WorkflowService,        // 业务逻辑
    WorkflowStorageService  // 这里的关键：注册新的存储服务
  ],
  exports: [WorkflowService], // 导出给别的模块用
})
export class WorkflowModule {}