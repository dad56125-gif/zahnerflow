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

  // 警告邮件发送历史记录（用于限流）
  // key: user, value: 发送记录数组
  private warningEmailHistory: Map<string, Array<{ timestamp: number; content: string }>> = new Map();

  // 速率限制配置
  private readonly RATE_LIMIT_WINDOW_MS = 4 * 60 * 60 * 1000; // 4小时
  private readonly MAX_WARNINGS_PER_WINDOW = 3; // 4小时内最多3封
  private readonly MAX_DUPLICATE_WARNINGS = 2; // 相同内容最多2封

  constructor(private readonly db: DbService) {
    this.logger.log('[EmailService] 初始化完成，使用用户配置的 SMTP 设置');
    // 每小时清理一次过期的历史记录
    setInterval(() => this.cleanupExpiredHistory(), 60 * 60 * 1000);
  }

  /**
   * 清理过期的警告邮件历史记录
   */
  private cleanupExpiredHistory(): void {
    const now = Date.now();
    const cutoff = now - this.RATE_LIMIT_WINDOW_MS;

    for (const [user, history] of this.warningEmailHistory.entries()) {
      const validRecords = history.filter(record => record.timestamp > cutoff);
      if (validRecords.length === 0) {
        this.warningEmailHistory.delete(user);
      } else if (validRecords.length < history.length) {
        this.warningEmailHistory.set(user, validRecords);
      }
    }
  }

  /**
   * 检查是否应该发送警告邮件（速率限制）
   * @param user 用户名
   * @param content 警告内容（用于去重）
   * @returns 是否允许发送
   */
  private shouldSendWarningEmail(user: string, content: string): { allowed: boolean; reason?: string } {
    const now = Date.now();
    const cutoff = now - this.RATE_LIMIT_WINDOW_MS;

    // 获取该用户的历史记录
    const history = this.warningEmailHistory.get(user) || [];

    // 过滤出4小时内的记录
    const recentWarnings = history.filter(record => record.timestamp > cutoff);

    // 检查1: 4小时内是否已发送3封警告邮件
    if (recentWarnings.length >= this.MAX_WARNINGS_PER_WINDOW) {
      return {
        allowed: false,
        reason: `已达到速率限制：4小时内最多发送${this.MAX_WARNINGS_PER_WINDOW}封警告邮件`
      };
    }

    // 检查2: 相同内容的警告是否已发送2次
    const duplicateCount = recentWarnings.filter(record => record.content === content).length;
    if (duplicateCount >= this.MAX_DUPLICATE_WARNINGS) {
      return {
        allowed: false,
        reason: `已达到重复限制：相同警告内容最多发送${this.MAX_DUPLICATE_WARNINGS}次`
      };
    }

    return { allowed: true };
  }

  /**
   * 记录已发送的警告邮件
   * @param user 用户名
   * @param content 警告内容
   */
  private recordWarningEmail(user: string, content: string): void {
    const history = this.warningEmailHistory.get(user) || [];
    history.push({ timestamp: Date.now(), content });
    this.warningEmailHistory.set(user, history);

    this.logger.debug(`[EmailService] 记录警告邮件: 用户=${user}, 当前4小时内警告数=${history.length}`);
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

    // 警告邮件速率限制检查
    if (type === 'warning') {
      const warningContent = details?.message || details?.error || 'Unknown warning';
      const rateLimitCheck = this.shouldSendWarningEmail(user, warningContent);

      if (!rateLimitCheck.allowed) {
        this.logger.warn(`[EmailService] 警告邮件被速率限制阻止: ${rateLimitCheck.reason}`);
        return;
      }
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

      // 如果是警告邮件，记录发送历史（用于速率限制）
      if (type === 'warning') {
        const warningContent = details?.message || details?.error || 'Unknown warning';
        this.recordWarningEmail(user, warningContent);
      }
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
