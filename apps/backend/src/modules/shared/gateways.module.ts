import { Module } from '@nestjs/common';
import { WorkflowGateway } from '../../gateways/workflow.gateway';
import { ConsoleDisplayManager } from '../../common/console-display-manager.service';

@Module({
  providers: [WorkflowGateway, ConsoleDisplayManager],
  exports: [WorkflowGateway, ConsoleDisplayManager],
})
export class GatewaysModule {}