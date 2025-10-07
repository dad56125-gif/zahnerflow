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

    // 解析 source 字段，格式应为 文件:函数
    let sourceFile = 'postman';
    let sourceFunction = 'deliverNotification';

    if (notification.source && notification.source.includes(':')) {
      [sourceFile, sourceFunction] = notification.source.split(':');
    } else if (notification.source) {
      sourceFile = notification.source;
    }

    // 走外部通知通道
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
