/**
 * Example implementation of wait/delay execution logic
 * This would be integrated into the execution.service.ts file
 */

import { Injectable, Logger } from '@nestjs/common';
import { NotificationService } from '../../notification/notification.service';

@Injectable()
export class WaitDelayService {
  private readonly logger = new Logger(WaitDelayService.name);

  // Map to track active waits for cancellation
  private activeWaits = new Map<string, { endTime: number; allowCancel: boolean }>();

  constructor(private readonly notificationService: NotificationService) {}

  /**
   * Execute a wait/delay operation
   * @param executionId The execution ID for tracking
   * @param config Wait configuration
   * @returns Promise that resolves when wait is complete
   */
  async executeWait(executionId: string, config: {
    duration: number;
    description?: string;
    allow_cancel?: boolean;
  }): Promise<void> {
    const duration = config.duration || 1.0;
    const description = config.description || 'Waiting';
    const allowCancel = config.allow_cancel !== false;

    // Validate duration
    if (duration <= 0) {
      throw new Error('Wait duration must be greater than 0');
    }

    if (duration > 86400) { // 24 hours
      this.logger.warn(`Long wait duration detected: ${duration}s`);
    }

    const endTime = Date.now() + (duration * 1000);

    // Register the wait for potential cancellation
    this.activeWaits.set(executionId, { endTime, allowCancel });

    this.logger.log(`Starting wait/delay for execution ${executionId}: ${duration}s - ${description}`);

    // Send start notification
    this.notificationService.notifyExecutionDetail(
      `Wait/Delay started: ${duration}s`,
      `Execution: ${executionId} - ${description}`
    );

    const startTime = Date.now();
    let lastProgressUpdate = startTime;

    try {
      // Wait loop with progress reporting
      while (Date.now() < endTime) {
        const remaining = endTime - Date.now();

        // Check if execution was cancelled
        if (allowCancel && this.isExecutionCancelled(executionId)) {
          this.activeWaits.delete(executionId);
          throw new Error('Wait cancelled by user');
        }

        // Progress reporting for long waits (> 10s)
        if (duration > 10 && Date.now() - lastProgressUpdate > 1000) {
          const progress = ((duration - remaining / 1000) / duration) * 100;
          this.notificationService.notifyExecutionDetail(
            `Wait progress: ${progress.toFixed(1)}%`,
            `Execution: ${executionId} - ${description} - ${(remaining / 1000).toFixed(1)}s remaining`
          );
          lastProgressUpdate = Date.now();
        }

        // Sleep for 100ms (configurable)
        await this.sleep(100);
      }

      // Send completion notification
      this.notificationService.notifyExecutionDetail(
        `Wait/Delay completed: ${duration}s`,
        `Execution: ${executionId} - ${description}`
      );

      this.logger.log(`Wait/delay completed for execution ${executionId}: ${duration}s`);

    } finally {
      // Clean up wait tracking
      this.activeWaits.delete(executionId);
    }
  }

  /**
   * Cancel an active wait
   * @param executionId The execution to cancel
   * @returns true if wait was cancelled, false if not found or not cancellable
   */
  cancelWait(executionId: string): boolean {
    const waitInfo = this.activeWaits.get(executionId);

    if (waitInfo && waitInfo.allowCancel) {
      this.activeWaits.delete(executionId);
      this.logger.log(`Wait cancelled for execution ${executionId}`);
      return true;
    }

    return false;
  }

  /**
   * Check if a wait is currently active
   * @param executionId The execution ID to check
   * @returns true if wait is active
   */
  isWaitActive(executionId: string): boolean {
    return this.activeWaits.has(executionId);
  }

  /**
   * Get remaining time for an active wait
   * @param executionId The execution ID
   * @returns Remaining time in seconds, or 0 if not active
   */
  getRemainingWaitTime(executionId: string): number {
    const waitInfo = this.activeWaits.get(executionId);
    if (!waitInfo) return 0;

    const remaining = waitInfo.endTime - Date.now();
    return Math.max(0, remaining / 1000);
  }

  /**
   * Helper function to sleep
   * @param ms Milliseconds to sleep
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if execution was cancelled
   * This would integrate with the execution service's pause/cancel functionality
   */
  private isExecutionCancelled(executionId: string): boolean {
    // This would check with the execution service if the execution was cancelled
    // For now, return false as a placeholder
    return false;
  }
}