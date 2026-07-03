import React from 'react';
import { runtimeClient } from '../../runtimeClient';
import { useUser } from '../shared/UserContext';

interface NotificationSettings {
    email: string;
    enabled: boolean;
    onComplete: boolean;
    onError: boolean;
    onWarning: boolean;
    smtpServer: string;
    smtpPort: number;
    smtpUser: string;
    smtpPassword: string;
    smtpSecure: boolean;
}

interface NotificationSectionProps {
    settings: NotificationSettings;
    onChange: (field: keyof NotificationSettings, value: any) => void;
}

export const NotificationSection: React.FC<NotificationSectionProps> = ({
    settings,
    onChange
}) => {
    const { currentUser } = useUser();

    const handleTestEmail = async () => {
        if (!currentUser) {
            alert('请先选择用户');
            return;
        }
        if (!settings.email) {
            alert('请先填写收件邮箱地址');
            return;
        }
        if (!settings.smtpServer || !settings.smtpUser || !settings.smtpPassword) {
            alert('请先填写完整的 SMTP 配置');
            return;
        }
        try {
            await runtimeClient.users.saveSettingsSection(currentUser, 'notification', settings);
            const response: any = await runtimeClient.users.testEmail(currentUser);
            if (response?.success) {
                alert('测试邮件已发送，请检查收件箱');
            } else {
                alert(`发送失败: ${response?.message || '未知错误'}`);
            }
        } catch (err: any) {
            alert(`发送失败: ${err.message || '网络错误'}`);
        }
    };

    return (
        <div className="settings__section-content">
            <div className="settings__form-group">
                <label className="switch">
                    <input
                        type="checkbox"
                        checked={settings.enabled}
                        onChange={(e) => onChange('enabled', e.target.checked)}
                    />
                    <div className="switch__track">
                        <div className="switch__thumb"></div>
                    </div>
                    <span className="switch__label">
                        {settings.enabled ? '启用' : '不启用'}
                    </span>
                </label>
            </div>

            {settings.enabled && (
                <div className="settings__smtp-section">
                    <div className="settings__form-row">
                        <div className="settings__form-group settings__form-group--flex-1">
                            <label>SMTP 服务器</label>
                            <input
                                className="input"
                                type="text"
                                value={settings.smtpServer || ''}
                                onChange={(e) => onChange('smtpServer', e.target.value)}
                                placeholder="smtp.qq.com"
                            />
                        </div>
                        <div className="settings__form-group settings__form-group--flex-1">
                            <label>SMTP 用户名（发件邮箱）</label>
                            <input
                                className="input"
                                type="text"
                                value={settings.smtpUser || ''}
                                onChange={(e) => onChange('smtpUser', e.target.value)}
                                placeholder="your@qq.com"
                            />
                        </div>
                    </div>

                    <div className="settings__form-row settings__form-row--no-margin">
                        <div className="settings__form-group settings__form-group--flex-2">
                            <label>SMTP 密码/授权码</label>
                            <input
                                className="input"
                                type="password"
                                value={settings.smtpPassword || ''}
                                onChange={(e) => onChange('smtpPassword', e.target.value)}
                                placeholder="授权码（非邮箱密码）"
                            />
                        </div>
                        <div className="settings__form-group settings__form-group--flex-1">
                            <label>端口</label>
                            <input
                                className="input"
                                type="number"
                                value={settings.smtpPort || 465}
                                onChange={(e) => onChange('smtpPort', parseInt(e.target.value, 10) || 465)}
                                placeholder="465"
                            />
                        </div>
                    </div>
                    <p className="settings__hint-text">
                        QQ邮箱请使用授权码，可在 设置 → 账户 → POP3/SMTP服务 获取
                    </p>

                    <div className="settings__form-group">
                        <label>收件邮箱地址</label>
                        <input
                            className="input"
                            type="email"
                            value={settings.email}
                            onChange={(e) => onChange('email', e.target.value)}
                            placeholder="your@email.com"
                        />
                    </div>

                    <div className="settings__smtp-action-row">
                        <button
                            type="button"
                            className="btn btn--sm btn--primary"
                            onClick={handleTestEmail}
                            disabled={!settings.email || !settings.smtpUser}
                        >
                            📧 发送测试邮件
                        </button>
                        <p className="settings__hint-text settings__hint-text--no-margin">
                            点击后会使用上方配置发送测试邮件
                        </p>
                    </div>

                    <h4 className="settings__smtp-title">
                        发送时机
                    </h4>

                    <div className="settings__toggle-group">
                        <div className="settings__form-group settings__form-group--no-margin">
                            <label className="switch switch--sub">
                                <input
                                    type="checkbox"
                                    checked={settings.onComplete}
                                    onChange={(e) => onChange('onComplete', e.target.checked)}
                                />
                                <div className="switch__track">
                                    <div className="switch__thumb"></div>
                                </div>
                                <span className="switch__label">完成时</span>
                            </label>
                        </div>

                        <div className="settings__form-group settings__form-group--no-margin">
                            <label className="switch switch--sub">
                                <input
                                    type="checkbox"
                                    checked={settings.onError}
                                    onChange={(e) => onChange('onError', e.target.checked)}
                                />
                                <div className="switch__track">
                                    <div className="switch__thumb"></div>
                                </div>
                                <span className="switch__label">失败时</span>
                            </label>
                        </div>

                        <div className="settings__form-group settings__form-group--no-margin">
                            <label className="switch switch--sub">
                                <input
                                    type="checkbox"
                                    checked={settings.onWarning}
                                    onChange={(e) => onChange('onWarning', e.target.checked)}
                                />
                                <div className="switch__track">
                                    <div className="switch__thumb"></div>
                                </div>
                                <span className="switch__label">警告时</span>
                            </label>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
