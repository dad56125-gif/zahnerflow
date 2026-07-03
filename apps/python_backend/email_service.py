"""
邮件通知服务
从 user_settings 读取 SMTP 配置，发送工作流完成/失败/警告邮件。
包含速率限制（4小时内最多3封警告邮件，相同内容最多2封）。
"""
import json
import time
import asyncio
import logging
from datetime import datetime
from database import db

logger = logging.getLogger("EmailService")

# 速率限制配置
RATE_LIMIT_WINDOW_S = 4 * 3600  # 4小时
MAX_WARNINGS_PER_WINDOW = 3
MAX_DUPLICATE_WARNINGS = 2


class EmailService:
    def __init__(self):
        # key: user, value: [{timestamp, content}]
        self._warning_history: dict[str, list[dict]] = {}

    # ---------- 公开接口 ----------

    async def send_workflow_notification(
        self,
        type_: str,  # 'completed' | 'failed' | 'warning'
        workflow_id: str | None,
        user: str | None = None,
        details: dict | None = None,
    ):
        """发送工作流通知邮件"""
        if not user:
            return

        config = self._get_user_notification_config(user)
        if not config or not config.get("enabled"):
            return
        if not config.get("email"):
            return
        if not config.get("smtpServer") or not config.get("smtpUser") or not config.get("smtpPassword"):
            return

        # 检查是否启用此类型通知
        if type_ == "completed" and not config.get("onComplete"):
            return
        if type_ == "failed" and not config.get("onError"):
            return
        if type_ == "warning" and not config.get("onWarning"):
            return

        # 警告邮件速率限制
        if type_ == "warning":
            content = (details or {}).get("message") or (details or {}).get("error") or "Unknown warning"
            allowed, reason = self._should_send_warning(user, content)
            if not allowed:
                logger.warning(f"Warning email rate-limited: {reason}")
                return

        subject, html = self._build_email(type_, workflow_id, details or {})

        try:
            await self._send_email(config, subject, html)
            logger.log(logging.INFO if type_ != "warning" else logging.WARNING,
                       f"Email sent -> {config['email']} [{type_}]")
            if type_ == "warning":
                self._record_warning(user, content)
        except Exception as e:
            logger.error(f"Email send failed: {e}")

    async def send_test_email(self, user: str) -> dict:
        """发送测试邮件"""
        config = self._get_user_notification_config(user)
        if not config:
            return {"success": False, "message": "No notification config found"}
        if not config.get("smtpServer") or not config.get("smtpUser") or not config.get("smtpPassword"):
            return {"success": False, "message": "SMTP config incomplete"}
        if not config.get("email"):
            return {"success": False, "message": "No email address configured"}

        subject = "🔧 ZahnerFlow 邮件测试"
        html = f"""
        <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h2>✅ 邮件配置测试成功</h2>
            <p>您的 ZahnerFlow 邮件通知已正确配置。</p>
            <table style="border-collapse: collapse; margin-top: 15px;">
                <tr>
                    <td style="border: 1px solid #ddd; padding: 8px; background: #f8f9fa;">SMTP 服务器</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">{config['smtpServer']}:{config.get('smtpPort', 465)}</td>
                </tr>
                <tr>
                    <td style="border: 1px solid #ddd; padding: 8px; background: #f8f9fa;">发件人</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">{config['smtpUser']}</td>
                </tr>
            </table>
            <p style="color: #6c757d; font-size: 12px; margin-top: 20px;">
                测试时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
            </p>
        </div>
        """
        try:
            await self._send_email(config, subject, html)
            return {"success": True, "message": "测试邮件已发送"}
        except Exception as e:
            return {"success": False, "message": str(e)}

    # ---------- 速率限制 ----------

    def _should_send_warning(self, user: str, content: str) -> tuple[bool, str | None]:
        now = time.time()
        cutoff = now - RATE_LIMIT_WINDOW_S
        history = self._warning_history.get(user, [])
        recent = [h for h in history if h["timestamp"] > cutoff]

        if len(recent) >= MAX_WARNINGS_PER_WINDOW:
            return False, f"4h limit reached ({MAX_WARNINGS_PER_WINDOW})"

        dup_count = sum(1 for h in recent if h["content"] == content)
        if dup_count >= MAX_DUPLICATE_WARNINGS:
            return False, f"Duplicate limit reached ({MAX_DUPLICATE_WARNINGS})"

        return True, None

    def _record_warning(self, user: str, content: str):
        if user not in self._warning_history:
            self._warning_history[user] = []
        self._warning_history[user].append({"timestamp": time.time(), "content": content})
        # 清理过期记录
        cutoff = time.time() - RATE_LIMIT_WINDOW_S
        self._warning_history[user] = [h for h in self._warning_history[user] if h["timestamp"] > cutoff]

    # ---------- 邮件构建 ----------

    def _build_email(self, type_: str, wf_id: str | None, details: dict) -> tuple[str, str]:
        wf_name = details.get("workflowName") or wf_id or "未知工作流"

        if type_ == "completed":
            subject = f"✅ 工作流执行成功 - {wf_name}"
            color, icon, status = "#28a745", "✅", "成功"
        elif type_ == "warning":
            subject = f"⚠️ 测量超时警告 - {wf_name}"
            color, icon, status = "#ffc107", "⚠️", "警告"
        else:
            subject = f"❌ 工作流执行失败 - {wf_name}"
            color, icon, status = "#dc3545", "❌", "失败"

        dur = details.get("duration")
        if dur:
            dur_text = f"{dur // 60000} 分钟 {(dur % 60000) // 1000} 秒"
        else:
            dur_text = "未知"

        html = f"""
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px;">
            <h2 style="color: {color};">{icon} 工作流{'执行成功' if type_ == 'completed' else '测量超时警告' if type_ == 'warning' else '执行失败'}</h2>
            <table style="border-collapse: collapse; width: 100%; margin-top: 20px;">
                <tr>
                    <td style="border: 1px solid #ddd; padding: 10px; background: #f8f9fa;"><strong>工作流名称</strong></td>
                    <td style="border: 1px solid #ddd; padding: 10px;">{wf_name}</td>
                </tr>
                {'<tr><td style="border: 1px solid #ddd; padding: 10px; background: #f8f9fa;"><strong>工作流 ID</strong></td><td style="border: 1px solid #ddd; padding: 10px;">' + wf_id + '</td></tr>' if wf_id else ''}
                <tr>
                    <td style="border: 1px solid #ddd; padding: 10px; background: #f8f9fa;"><strong>状态</strong></td>
                    <td style="border: 1px solid #ddd; padding: 10px;">{status}</td>
                </tr>
                <tr>
                    <td style="border: 1px solid #ddd; padding: 10px; background: #f8f9fa;"><strong>执行时长</strong></td>
                    <td style="border: 1px solid #ddd; padding: 10px;">{dur_text}</td>
                </tr>
                {'<tr><td style="border: 1px solid #ddd; padding: 10px; background: #f8f9fa;"><strong>消息</strong></td><td style="border: 1px solid #ddd; padding: 10px; color: ' + color + ';">' + details.get("message", "") + '</td></tr>' if details.get("message") else ''}
                {'<tr><td style="border: 1px solid #ddd; padding: 10px; background: #f8f9fa;"><strong>错误信息</strong></td><td style="border: 1px solid #ddd; padding: 10px; color: #dc3545;">' + details.get("error", "") + '</td></tr>' if details.get("error") else ''}
            </table>
            <p style="margin-top: 20px; color: #6c757d; font-size: 12px;">
                发送时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} | ZahnerFlow 自动通知
            </p>
        </div>
        """
        return subject, html

    # ---------- 底层发送 ----------

    async def _send_email(self, config: dict, subject: str, html: str):
        import aiosmtplib
        from email.mime.text import MIMEText
        from email.mime.multipart import MIMEMultipart

        msg = MIMEMultipart("alternative")
        msg["From"] = f"ZahnerFlow <{config['smtpUser']}>"
        msg["To"] = config["email"]
        msg["Subject"] = subject
        msg.attach(MIMEText(html, "html", "utf-8"))

        await aiosmtplib.send(
            msg,
            hostname=config["smtpServer"],
            port=config.get("smtpPort", 465),
            username=config["smtpUser"],
            password=config["smtpPassword"],
            use_tls=config.get("smtpSecure", True),
        )

    # ---------- 配置读取 ----------

    def _get_user_notification_config(self, user: str) -> dict | None:
        if not user:
            return None
        row = db.conn.execute(
            "SELECT settings_json FROM user_settings WHERE user = ?", (user,)
        ).fetchone()
        if row:
            try:
                settings = json.loads(row["settings_json"])
                return settings.get("notification")
            except Exception:
                pass
        return None


# 单例
email_service = EmailService()
