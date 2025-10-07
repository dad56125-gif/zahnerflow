import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ExecutionService } from './execution.service';

@Controller('api/hooks')
export class HooksController {
  constructor(private readonly executionService: ExecutionService) {}

  @Get('rules')
  @HttpCode(HttpStatus.OK)
  getHookRules() {
    return { items: this.executionService.getLoadedHookRules() };
  }
}

