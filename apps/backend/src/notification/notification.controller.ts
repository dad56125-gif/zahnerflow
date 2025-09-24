import { Controller, Post, Body, Get } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { WorkflowGateway } from '../gateways/workflow.gateway';
import { UserNotificationLevel } from '@zahnerflow/types';

interface NotificationDto {
  id?: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  source?: string;
  timestamp: number;
}

@Controller('api/notifications')
export class NotificationController {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly workflowGateway: WorkflowGateway
  ) {}

  @Post()
  async receiveNotification(@Body() notification: NotificationDto) {
    console.log('收到外部通知:', notification);

    // 使用通知服务处理通知
    this.notificationService.notify(
      notification.message,
      UserNotificationLevel.SYSTEM,
      `Received external notification: ${notification.title}`
    );

    return { success: true, message: '通知已处理' };
  }

  @Post('postman')
  async receiveFromPostman(@Body() notification: NotificationDto) {
    console.log('邮递员投递通知:', notification);

    // 邮递员接口，直接进入转发层处理
    // 解析source字段，格式应为"文件名:函数名"
    let sourceFile = 'postman';
    let sourceFunction = 'deliverNotification';

    if (notification.source && notification.source.includes(':')) {
      [sourceFile, sourceFunction] = notification.source.split(':');
    } else if (notification.source) {
      sourceFile = notification.source;
    }

    const notificationMessage = {
      type: notification.type,
      message: notification.message,
      sourceFile: sourceFile,
      sourceFunction: sourceFunction,
      details: notification.title || `Notification from ${sourceFile}:${sourceFunction}`,
      timestamp: new Date(notification.timestamp),
      executionId: `P${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      layerTrace: '[P]' // 邮递员标识
    };

    // 使用通知服务处理邮递员通知
    this.notificationService.notifyExternal(
      notification.message,
      UserNotificationLevel.SYSTEM,
      notification.title || `Notification from ${sourceFile}:${sourceFunction}`,
      sourceFile,
      sourceFunction
    );

    return { success: true, message: '邮递员已投递' };
  }

  @Get('stats')
  getNotificationStats() {
    return this.notificationService.getCacheStats();
  }
}