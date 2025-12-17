import { Controller, Post, Body, Get } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { EmailService } from './email.service';
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
    private readonly emailService: EmailService
  ) { }

  @Post()
  async receiveNotification(@Body() notification: NotificationDto) {
    // 将 HTTP 请求转换为内部系统通知
    this.notificationService.notify(
      notification.message,
      UserNotificationLevel.SYSTEM,
      `Received external notification: ${notification.title}`,
      'external-api'
    );

    return { success: true, message: 'Notification processed' };
  }

  @Post('postman')
  async receiveFromPostman(@Body() notification: NotificationDto) {
    // 解析 source 字段 (e.g. "script.py:main")
    let sourceFile = 'postman';

    if (notification.source && notification.source.includes(':')) {
      sourceFile = notification.source.split(':')[0];
    } else if (notification.source) {
      sourceFile = notification.source;
    }

    // 使用服务发送通知
    this.notificationService.notify(
      notification.message,
      UserNotificationLevel.SYSTEM,
      notification.title || `From ${sourceFile}`,
      sourceFile
    );

    return { success: true, message: 'Postman notification delivered' };
  }

  /**
   * 发送测试邮件
   */
  @Post('test-email')
  async sendTestEmail(@Body() body: {
    email: string;
    smtp_server: string;
    smtp_port: number;
    smtp_user: string;
    smtp_password: string;
    smtp_secure: boolean;
  }) {
    if (!body.email) {
      return { success: false, message: '邮箱地址不能为空' };
    }

    const result = await this.emailService.sendTestEmail(body.email, {
      smtp_server: body.smtp_server,
      smtp_port: body.smtp_port,
      smtp_user: body.smtp_user,
      smtp_password: body.smtp_password,
      smtp_secure: body.smtp_secure
    });
    return result;
  }

  @Get('stats')
  getNotificationStats() {
    // 这里的缓存统计已经在 Service 里简化了，如果没有实现 getCacheStats 可以返回空对象
    // 或者如果 NotificationService 保留了 getCacheStats 方法则调用
    if ('getCacheStats' in this.notificationService) {
      return (this.notificationService as any).getCacheStats();
    }
    return { status: 'active' };
  }
}