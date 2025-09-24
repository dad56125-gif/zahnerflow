import { Module } from '@nestjs/common';
import { WorkflowGateway } from './workflow.gateway';
import { ConsoleDisplayManager } from '../common/console-display-manager.service';

@Module({
  imports: [],
  providers: [WorkflowGateway, ConsoleDisplayManager],
  exports: [WorkflowGateway],
})
export class GatewayModule {}