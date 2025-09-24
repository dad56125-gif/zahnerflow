import { Module } from '@nestjs/common';
import { WorkflowGateway } from '../../gateways/workflow.gateway';

@Module({
  providers: [WorkflowGateway],
  exports: [WorkflowGateway],
})
export class GatewayModule {}