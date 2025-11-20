import { Module } from '@nestjs/common';
import { WorkflowGateway } from './workflow.gateway';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    CommonModule,
  ],
  providers: [WorkflowGateway],
  exports: [WorkflowGateway],
})
export class GatewayModule {}