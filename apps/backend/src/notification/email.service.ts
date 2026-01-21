import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { DbService } from '../db/db.service';

interface UserNotificationConfig {
  email: string;
  enabled: boolean;
  on_complete: boolean;
  on_error: boolean;
  on_warning: boolean;  // 新增：警告通知
  smtp_server: string;
  smtp_port: number;
  smtp_user: string;
  smtp_password: string;
  smtp_secure: boolean;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly db: DbService) {
    this.logger.log('[EmailService] 初始化完成，使用用户配置的 SMTP 设置');
  }

  /**
   * 从 user_settings 表读取用户通知配置
   */
  private getUserNotificationConfig(user: string): UserNotificationConfig | null {
    if (!user) return null;

    try {
      const row = this.db.prepare(`
                SELECT settings_json FROM user_settings WHERE user = ?
            `).get(user) as { settings_json: string } | undefined;

      if (row?.settings_json) {
        const settings = JSON.parse(row.settings_json);
        return settings.notification || null;
      }
    } catch (e) {
      this.logger.warn(`[EmailService] 无法读取用户 ${user} 的通知配置`);
    }
    return null;
  }

  /**
   * 为用户创建邮件发送器
   */
  private createTransporter(config: UserNotificationConfig): nodemailer.Transporter | null {
    if (!config.smtp_server || !config.smtp_user || !config.smtp_password) {
      return null;
    }

    try {
      return nodemailer.createTransport({
        host: config.smtp_server,
        port: config.smtp_port || 465,
        secure: config.smtp_secure !== false, // 默认为 true
        auth: {
          user: config.smtp_user,
          pass: config.smtp_password,
        },
      });
    } catch (e: any) {
      this.logger.error(`[EmailService] 创建 SMTP 连接失败: ${e.message}`);
      return null;
    }
  }

  /**
   * 发送工作流通知邮件
   * @param type 'completed' | 'failed' | 'warning'
   * @param workflowId 工作流ID
   * @param user 用户名（用于读取用户配置）
   * @param details 详细信息
   */
  async sendWorkflowNotification(
    type: 'completed' | 'failed' | 'warning',
    workflowId: string | null,
    user?: string,
    details?: { duration?: number; error?: string; workflowName?: string; message?: string; elapsed?: number }
  ): Promise<void> {
    if (!user) {
      this.logger.log('[EmailService] 未提供用户名，跳过邮件通知');
      return;
    }

    // 获取用户通知配置
    const userConfig = this.getUserNotificationConfig(user);

    // 检查用户是否启用了通知
    if (!userConfig?.enabled) {
      this.logger.log(`[EmailService] 用户 ${user} 未启用邮件通知`);
      return;
    }

    // 检查用户邮箱是否配置
    if (!userConfig.email) {
      this.logger.warn(`[EmailService] 用户 ${user} 启用了通知但未配置邮箱地址`);
      return;
    }

    // 检查 SMTP 配置
    if (!userConfig.smtp_server || !userConfig.smtp_user || !userConfig.smtp_password) {
      this.logger.warn(`[EmailService] 用户 ${user} 未配置 SMTP 服务器信息`);
      return;
    }

    // 检查是否应该发送此类型的通知
    if (type === 'completed' && !userConfig.on_complete) {
      this.logger.log(`[EmailService] 用户 ${user} 未启用完成通知`);
      return;
    }
    if (type === 'failed' && !userConfig.on_error) {
      this.logger.log(`[EmailService] 用户 ${user} 未启用失败通知`);
      return;
    }
    if (type === 'warning' && !userConfig.on_warning) {
      this.logger.log(`[EmailService] 用户 ${user} 未启用警告通知`);
      return;
    }

    // 创建邮件发送器
    const transporter = this.createTransporter(userConfig);
    if (!transporter) {
      this.logger.error(`[EmailService] 无法创建邮件发送器`);
      return;
    }

    const workflowDisplayName = details?.workflowName || workflowId || '未知工作流';

    // 根据类型生成邮件主题和样式
    let subject: string;
    let headerColor: string;
    let headerIcon: string;
    let statusText: string;

    switch (type) {
      case 'completed':
        subject = `✅ 工作流执行成功 - ${workflowDisplayName}`;
        headerColor = '#28a745';
        headerIcon = '✅';
        statusText = '成功';
        break;
      case 'warning':
        subject = `⚠️ 测量超时警告 - ${workflowDisplayName}`;
        headerColor = '#ffc107';
        headerIcon = '⚠️';
        statusText = '警告';
        break;
      case 'failed':
      default:
        subject = `❌ 工作流执行失败 - ${workflowDisplayName}`;
        headerColor = '#dc3545';
        headerIcon = '❌';
        statusText = '失败';
        break;
    }

    const durationText = details?.duration
      ? `${Math.floor(details.duration / 60000)} 分钟 ${Math.floor((details.duration % 60000) / 1000)} 秒`
      : details?.elapsed
        ? `${Math.floor(details.elapsed / 60000)} 分钟`
        : '未知';

    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px;">
        <h2 style="color: ${headerColor};">
          ${headerIcon} ${type === 'completed' ? '工作流执行成功' : type === 'warning' ? '测量超时警告' : '工作流执行失败'}
        </h2>
        <table style="border-collapse: collapse; width: 100%; margin-top: 20px;">
          <tr>
            <td style="border: 1px solid #ddd; padding: 10px; background: #f8f9fa;"><strong>工作流名称</strong></td>
            <td style="border: 1px solid #ddd; padding: 10px;">${workflowDisplayName}</td>
          </tr>
          ${workflowId ? `
          <tr>
            <td style="border: 1px solid #ddd; padding: 10px; background: #f8f9fa;"><strong>工作流 ID</strong></td>
            <td style="border: 1px solid #ddd; padding: 10px;">${workflowId}</td>
          </tr>
          ` : ''}
          <tr>
            <td style="border: 1px solid #ddd; padding: 10px; background: #f8f9fa;"><strong>状态</strong></td>
            <td style="border: 1px solid #ddd; padding: 10px;">${statusText}</td>
          </tr>
          <tr>
            <td style="border: 1px solid #ddd; padding: 10px; background: #f8f9fa;"><strong>执行时长</strong></td>
            <td style="border: 1px solid #ddd; padding: 10px;">${durationText}</td>
          </tr>
          ${details?.message ? `
          <tr>
            <td style="border: 1px solid #ddd; padding: 10px; background: #f8f9fa;"><strong>消息</strong></td>
            <td style="border: 1px solid #ddd; padding: 10px; color: ${headerColor};">${details.message}</td>
          </tr>
          ` : ''}
          ${details?.error ? `
          <tr>
            <td style="border: 1px solid #ddd; padding: 10px; background: #f8f9fa;"><strong>错误信息</strong></td>
            <td style="border: 1px solid #ddd; padding: 10px; color: #dc3545;">${details.error}</td>
          </tr>
          ` : ''}
        </table>
        <p style="margin-top: 20px; color: #6c757d; font-size: 12px;">
          发送时间: ${new Date().toLocaleString('zh-CN')} | ZahnerFlow 自动通知
        </p>
      </div>
    `;

    try {
      await transporter.sendMail({
        from: `ZahnerFlow <${userConfig.smtp_user}>`,
        to: userConfig.email,
        subject,
        html,
      });
      this.logger.log(`[EmailService] 邮件发送成功 -> ${userConfig.email}`);
    } catch (error: any) {
      this.logger.error(`[EmailService] 邮件发送失败: ${error.message}`);
    } finally {
      transporter.close();
    }
  }

  /**
   * 发送测试邮件（验证配置）
   */
  async sendTestEmail(email: string, smtpConfig?: {
    smtp_server: string;
    smtp_port: number;
    smtp_user: string;
    smtp_password: string;
    smtp_secure: boolean;
  }): Promise<{ success: boolean; message: string }> {
    if (!smtpConfig) {
      return { success: false, message: 'SMTP 配置不完整' };
    }

    if (!smtpConfig.smtp_server || !smtpConfig.smtp_user || !smtpConfig.smtp_password) {
      return { success: false, message: 'SMTP 服务器、用户名和密码不能为空' };
    }

    const transporter = this.createTransporter({
      email,
      enabled: true,
      on_complete: true,
      on_error: true,
      on_warning: true,
      ...smtpConfig
    });

    if (!transporter) {
      return { success: false, message: '无法创建 SMTP 连接' };
    }

    try {
      await transporter.sendMail({
        from: `ZahnerFlow <${smtpConfig.smtp_user}>`,
        to: email,
        subject: '🔧 ZahnerFlow 邮件测试',
        html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px;">
                        <h2>✅ 邮件配置测试成功</h2>
                        <p>您的 ZahnerFlow 邮件通知已正确配置。</p>
                        <table style="border-collapse: collapse; margin-top: 15px;">
                            <tr>
                                <td style="border: 1px solid #ddd; padding: 8px; background: #f8f9fa;">SMTP 服务器</td>
                                <td style="border: 1px solid #ddd; padding: 8px;">${smtpConfig.smtp_server}:${smtpConfig.smtp_port}</td>
                            </tr>
                            <tr>
                                <td style="border: 1px solid #ddd; padding: 8px; background: #f8f9fa;">发件人</td>
                                <td style="border: 1px solid #ddd; padding: 8px;">${smtpConfig.smtp_user}</td>
                            </tr>
                        </table>
                        <p style="color: #6c757d; font-size: 12px; margin-top: 20px;">
                            测试时间: ${new Date().toLocaleString('zh-CN')}
                        </p>
                    </div>
                `,
      });
      this.logger.log(`[EmailService] 测试邮件发送成功 -> ${email}`);
      return { success: true, message: '测试邮件已发送' };
    } catch (error: any) {
      this.logger.error(`[EmailService] 测试邮件发送失败: ${error.message}`);
      return { success: false, message: error.message };
    } finally {
      transporter.close();
    }
  }
}
