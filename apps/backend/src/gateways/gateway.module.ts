import { Module, forwardRef } from '@nestjs/common';
import { WorkflowGateway } from './workflow.gateway';
import { CommonModule } from '../common/common.module';
import { ExecutionModule } from '../modules/execution/execution.module';

@Module({
  imports: [
    CommonModule,
    forwardRef(() => ExecutionModule),
  ],
  providers: [WorkflowGateway],
  exports: [WorkflowGateway],
})
export class GatewayModule {}