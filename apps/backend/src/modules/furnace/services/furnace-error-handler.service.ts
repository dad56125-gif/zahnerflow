import { Injectable, Logger, HttpStatus } from '@nestjs/common';

@Injectable()
export class FurnaceErrorHandlerService {
  private readonly logger = new Logger(FurnaceErrorHandlerService.name);

  async execute<T>(operation: () => Promise<T>, context: string = 'op'): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      this.logger.error(`[${context}] Failed: ${error.message}`);
      throw error;
    }
  }
  // Compat stubs
  getErrorStats() { return {}; }
  resetCircuitBreaker() { return true; }
  resetAllCircuitBreakers() {}
  getRecentErrors() { return []; }
  exportErrorData() { return []; }
  clearErrorLogs() {}
}