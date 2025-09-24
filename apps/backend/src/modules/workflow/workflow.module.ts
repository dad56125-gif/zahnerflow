import { Module } from '@nestjs/common';
import { WorkflowService } from './workflow.service';
import { WorkflowController } from './workflow.controller';
import { WorkflowStorageService } from './workflow-storage.service';

@Module({
  imports: [],
  controllers: [WorkflowController],
  providers: [WorkflowService, WorkflowStorageService],
  exports: [WorkflowService],
})
export class WorkflowModule {}