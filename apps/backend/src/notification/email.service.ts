import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
    private readonly logger = new Logger(EmailService.name);
    private transporter: nodemailer.Transporter | null = null;

    // 从环境变量读取配置
    private readonly config = {
        enabled: process.env.EMAIL_ENABLED === 'true',
        smtpServer: process.env.EMAIL_SMTP_SERVER || 'smtp.qq.com',
        smtpPort: parseInt(process.env.EMAIL_SMTP_PORT || '465', 10),
        sender: process.env.EMAIL_SENDER || '',
        password: process.env.EMAIL_PASSWORD || '',
        receiver: process.env.EMAIL_RECEIVER || '',
    };

    constructor() {
        if (this.config.enabled && this.config.sender && this.config.password) {
            this.transporter = nodemailer.createTransport({
                host: this.config.smtpServer,
                port: this.config.smtpPort,
                secure: this.config.smtpPort === 465, // SSL for port 465
                auth: {
                    user: this.config.sender,
                    pass: this.config.password,
                },
            });
            this.logger.log(`[EmailService] 邮件服务已启用 - SMTP: ${this.config.smtpServer}:${this.config.smtpPort}`);
        } else {
            this.logger.warn(`[EmailService] 邮件服务未启用 (EMAIL_ENABLED=${this.config.enabled})`);
        }
    }

    /**
     * 发送工作流通知邮件
     * @param type 'completed' | 'failed'
     * @param workflowId 工作流ID
     * @param details 详细信息
     */
    async sendWorkflowNotification(
        type: 'completed' | 'failed',
        workflowId: string,
        details?: { duration?: number; error?: string }
    ): Promise<void> {
        if (!this.transporter || !this.config.receiver) {
            return; // 邮件服务未配置
        }

        const isSuccess = type === 'completed';
        const subject = isSuccess
            ? `✅ 工作流执行成功 - ${workflowId}`
            : `❌ 工作流执行失败 - ${workflowId}`;

        const durationText = details?.duration
            ? `${Math.floor(details.duration / 60000)} 分钟 ${Math.floor((details.duration % 60000) / 1000)} 秒`
            : '未知';

        const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px;">
        <h2 style="color: ${isSuccess ? '#28a745' : '#dc3545'};">
          ${isSuccess ? '✅ 工作流执行成功' : '❌ 工作流执行失败'}
        </h2>
        <table style="border-collapse: collapse; width: 100%; margin-top: 20px;">
          <tr>
            <td style="border: 1px solid #ddd; padding: 10px; background: #f8f9fa;"><strong>工作流 ID</strong></td>
            <td style="border: 1px solid #ddd; padding: 10px;">${workflowId}</td>
          </tr>
          <tr>
            <td style="border: 1px solid #ddd; padding: 10px; background: #f8f9fa;"><strong>状态</strong></td>
            <td style="border: 1px solid #ddd; padding: 10px;">${isSuccess ? '成功' : '失败'}</td>
          </tr>
          <tr>
            <td style="border: 1px solid #ddd; padding: 10px; background: #f8f9fa;"><strong>执行时长</strong></td>
            <td style="border: 1px solid #ddd; padding: 10px;">${durationText}</td>
          </tr>
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
            await this.transporter.sendMail({
                from: `ZahnerFlow <${this.config.sender}>`,
                to: this.config.receiver,
                subject,
                html,
            });
            this.logger.log(`[EmailService] 邮件发送成功 -> ${this.config.receiver}`);
        } catch (error: any) {
            this.logger.error(`[EmailService] 邮件发送失败: ${error.message}`);
        }
    }
}
