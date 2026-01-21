import React, { useState, useEffect, useRef } from 'react';
import { Portal } from './Portal';
import { useUser } from '../shared/UserContext';
import { api } from '../shared/api';
import { useOnClickOutside } from '../shared/useOnClickOutside';

interface UserSettings {
    file_path: {
        base_path: string;
        project_name: string;
        individual_name: string;
    };
    notification: {
        email: string;
        enabled: boolean;
        on_complete: boolean;
        on_error: boolean;
        on_warning: boolean;
        smtp_server: string;
        smtp_port: number;
        smtp_user: string;
        smtp_password: string;
        smtp_secure: boolean;
    };
    cloud: {
        provider: string;
        sync_enabled: boolean;
        endpoint?: string;
        bucket?: string;
    };
}

interface UserSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type SettingsSection = 'file_path' | 'notification' | 'cloud';

const SECTION_LABELS: Record<SettingsSection, { icon: string; label: string }> = {
    file_path: { icon: '📁', label: '文件路径' },
    notification: { icon: '🔔', label: '通知设置' },
    cloud: { icon: '☁️', label: '云同步' }
};

export const UserSettingsModal: React.FC<UserSettingsModalProps> = ({
    isOpen,
    onClose
}) => {
    const { currentUser, setFilePathConfig } = useUser();
    const panelRef = useRef<HTMLDivElement>(null);

    const [activeSection, setActiveSection] = useState<SettingsSection>('file_path');
    const [settings, setSettings] = useState<UserSettings | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [isHiding, setIsHiding] = useState(false);

    // 项目列表状态
    const [projects, setProjects] = useState<string[]>([]);
    const [showProjectDropdown, setShowProjectDropdown] = useState(false);

    // 字段错误状态
    const [fieldErrors, setFieldErrors] = useState<{
        base_path?: string;
        project_name?: string;
        individual_name?: string;
    }>({});

    // 验证函数
    const validateBasePath = (path: string): boolean => {
        const validPattern = /^[a-zA-Z0-9\\/:_-]*$/;
        const hasInvalidChars = /[<>"|?*]/.test(path);
        return validPattern.test(path) && !hasInvalidChars;
    };

    const validateProjectName = (name: string): boolean => {
        const validPattern = /^[a-zA-Z0-9_]*$/;
        return validPattern.test(name);
    };

    const validateIndividualName = (name: string): boolean => {
        const validPattern = /^[a-zA-Z0-9_]*$/;
        return validPattern.test(name);
    };

    // 实时验证
    useEffect(() => {
        if (!settings) return;

        const realTimeErrors: typeof fieldErrors = {};

        if (settings.file_path.base_path && !validateBasePath(settings.file_path.base_path)) {
            realTimeErrors.base_path = '路径包含无效字符（<>"|?*）';
        }

        if (settings.file_path.project_name && !validateProjectName(settings.file_path.project_name)) {
            realTimeErrors.project_name = '只能包含英文、数字和下划线';
        }

        if (settings.file_path.individual_name && !validateIndividualName(settings.file_path.individual_name)) {
            realTimeErrors.individual_name = '只能包含英文、数字和下划线';
        }

        setFieldErrors(realTimeErrors);
    }, [settings?.file_path]);

    // 带动画的关闭
    const handleClose = () => {
        // 只有在打开状态时才执行关闭动画
        if (!isOpen || isHiding) return;

        setIsHiding(true);
        setTimeout(() => {
            setIsHiding(false);
            onClose();
        }, 200); // 与动画时长一致
    };

    // 点击外部关闭（只在打开时生效）
    useOnClickOutside(panelRef, isOpen ? handleClose : () => { });

    // 加载用户配置
    useEffect(() => {
        if (isOpen && currentUser) {
            loadSettings();
        }
    }, [isOpen, currentUser]);

    const loadSettings = async () => {
        if (!currentUser) return;

        setLoading(true);
        setError('');
        try {
            const response: any = await api.get(`/users/${encodeURIComponent(currentUser)}/settings`);
            if (response?.success && response?.settings) {
                // 兼容旧配置：确保 smtp_secure 和 on_warning 有默认值
                if (response.settings.notification && response.settings.notification.smtp_secure !== true) {
                    response.settings.notification.smtp_secure = true;
                }
                if (response.settings.notification && response.settings.notification.on_warning === undefined) {
                    response.settings.notification.on_warning = false; // 默认不启用警告通知
                }
                setSettings(response.settings);
            }
        } catch (err) {
            console.error('Failed to load user settings:', err);
            setError('加载配置失败');
        } finally {
            setLoading(false);
        }
    };

    // 加载项目列表
    const loadProjects = async () => {
        if (!currentUser) return;
        try {
            const response: any = await api.get(`/files/projects?user=${encodeURIComponent(currentUser)}`);
            if (response?.success) {
                const list = Array.isArray(response.projects)
                    ? response.projects
                    : (Array.isArray(response.data) ? response.data : []);
                setProjects(list);
            }
        } catch (err) {
            console.error('Failed to load projects:', err);
        }
    };

    // 删除项目
    const handleDeleteProject = async (projectName: string) => {
        if (!currentUser) return;

        // 确认删除
        if (!window.confirm(`确定要删除项目 "${projectName}" 吗？`)) {
            return;
        }

        try {
            const response: any = await api.delete(`/files/projects/${encodeURIComponent(projectName)}?user=${encodeURIComponent(currentUser)}`);
            if (response?.success) {
                // 从列表中移除
                setProjects(prev => prev.filter(p => p !== projectName));
                // 如果删除的是当前选中的项目，清空选择
                if (settings?.file_path.project_name === projectName) {
                    updateFilePath('project_name', '');
                }
                console.log(`[UserSettings] 项目 "${projectName}" 已删除`);
            }
        } catch (err) {
            console.error('Failed to delete project:', err);
        }
    };

    // 打开系统文件夹选择器
    const handleBrowsePath = async () => {
        try {
            const response: any = await api.get('/files/browse-system-path');
            if (response?.success && response?.path) {
                updateFilePath('base_path', response.path);
            } else if (response?.message === 'USER_CANCELLED') {
                // 用户取消，不做任何操作
            } else {
                console.warn('浏览路径失败:', response?.message);
            }
        } catch (err) {
            console.error('Failed to browse path:', err);
        }
    };

    const saveSettings = async () => {
        if (!currentUser || !settings) return;

        setSaving(true);
        setError('');
        try {
            const response: any = await api.put(`/users/${encodeURIComponent(currentUser)}/settings`, settings);
            if (response?.success) {
                // 同步文件路径到 UserContext（保持兼容）
                setFilePathConfig(settings.file_path);
                console.log('[UserSettingsModal] 配置已保存');
            } else {
                setError(response?.message || '保存失败');
            }
        } catch (err) {
            console.error('Failed to save user settings:', err);
            setError('保存配置失败');
        } finally {
            setSaving(false);
        }
    };

    // 自动保存（防抖）
    useEffect(() => {
        if (!settings || !currentUser) return;

        const timeoutId = setTimeout(() => {
            saveSettings();
        }, 800);

        return () => clearTimeout(timeoutId);
    }, [settings]);

    const updateFilePath = (field: keyof UserSettings['file_path'], value: string) => {
        if (!settings) return;
        setSettings({
            ...settings,
            file_path: { ...settings.file_path, [field]: value }
        });
    };

    const updateNotification = (field: keyof UserSettings['notification'], value: any) => {
        if (!settings) return;
        setSettings({
            ...settings,
            notification: { ...settings.notification, [field]: value }
        });
    };

    const updateCloud = (field: keyof UserSettings['cloud'], value: any) => {
        if (!settings) return;
        setSettings({
            ...settings,
            cloud: { ...settings.cloud, [field]: value }
        });
    };

    if (!isOpen && !isHiding) return null;

    return (
        <Portal pointerEvents="auto">
            <div className={`user-settings-overlay ${isHiding ? 'hiding' : ''}`}>
                <div ref={panelRef} className="user-settings-panel">
                    {/* 头部 */}
                    <div className="settings-header">
                        <h2>⚙️ 用户配置</h2>
                        <span className="current-user-badge">{currentUser}</span>
                        <button className="close-btn" onClick={handleClose} title="关闭">✕</button>
                    </div>

                    <div className="settings-body">
                        {/* 左侧导航 */}
                        <div className="settings-nav">
                            {(Object.keys(SECTION_LABELS) as SettingsSection[]).map(section => (
                                <button
                                    key={section}
                                    className={`nav-item ${activeSection === section ? 'active' : ''}`}
                                    onClick={() => setActiveSection(section)}
                                >
                                    <span className="nav-icon">{SECTION_LABELS[section].icon}</span>
                                    <span className="nav-label">{SECTION_LABELS[section].label}</span>
                                </button>
                            ))}
                        </div>

                        {/* 右侧内容 */}
                        <div className="settings-content">
                            {loading ? (
                                <div className="settings-loading">加载中...</div>
                            ) : error ? (
                                <div className="settings-error">{error}</div>
                            ) : settings ? (
                                <>
                                    {/* 文件路径配置 */}
                                    {activeSection === 'file_path' && (
                                        <div className="section-content">

                                            <div className="form-group">
                                                <div className="form-label-row">
                                                    <label>基础路径</label>
                                                    {fieldErrors.base_path && (
                                                        <span className="field-error">{fieldErrors.base_path}</span>
                                                    )}
                                                </div>
                                                <div className="path-input-group">
                                                    <input
                                                        type="text"
                                                        value={settings.file_path.base_path}
                                                        onChange={(e) => updateFilePath('base_path', e.target.value)}
                                                        placeholder="C:\data\archive"
                                                        className={fieldErrors.base_path ? 'input-error' : ''}
                                                    />
                                                    <button
                                                        type="button"
                                                        className="browse-btn"
                                                        onClick={handleBrowsePath}
                                                        title="浏览文件夹"
                                                    >
                                                        📂
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="form-group">
                                                <div className="form-label-row">
                                                    <label>项目名称</label>
                                                    {fieldErrors.project_name && (
                                                        <span className="field-error">{fieldErrors.project_name}</span>
                                                    )}
                                                </div>
                                                <div className="project-input-group">
                                                    <div className="project-dropdown-wrapper">
                                                        <button
                                                            type="button"
                                                            className="project-select-btn"
                                                            onClick={() => {
                                                                setShowProjectDropdown(!showProjectDropdown);
                                                                if (!showProjectDropdown && projects.length === 0) {
                                                                    loadProjects();
                                                                }
                                                            }}
                                                        >
                                                            <span>{settings.file_path.project_name || '选择项目...'}</span>
                                                            <span className="dropdown-arrow-icon">▼</span>
                                                        </button>
                                                        {showProjectDropdown && (
                                                            <div className="project-dropdown-list">
                                                                {projects.length > 0 ? (
                                                                    projects.map(p => (
                                                                        <div
                                                                            key={p}
                                                                            className={`project-dropdown-item ${p === settings.file_path.project_name ? 'active' : ''}`}
                                                                        >
                                                                            <span
                                                                                className="project-name"
                                                                                onClick={() => {
                                                                                    updateFilePath('project_name', p);
                                                                                    setShowProjectDropdown(false);
                                                                                }}
                                                                            >
                                                                                {p}
                                                                            </span>
                                                                            <button
                                                                                className="project-delete-btn"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    handleDeleteProject(p);
                                                                                }}
                                                                                title="删除项目"
                                                                            >
                                                                                ×
                                                                            </button>
                                                                        </div>
                                                                    ))
                                                                ) : (
                                                                    <div className="project-dropdown-empty">暂无已有项目</div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <input
                                                        type="text"
                                                        value={settings.file_path.project_name}
                                                        onChange={(e) => updateFilePath('project_name', e.target.value)}
                                                        placeholder="或输入新项目名"
                                                        className={fieldErrors.project_name ? 'input-error' : ''}
                                                    />
                                                </div>
                                            </div>

                                            <div className="form-group">
                                                <div className="form-label-row">
                                                    <label>样品编号</label>
                                                    {fieldErrors.individual_name && (
                                                        <span className="field-error">{fieldErrors.individual_name}</span>
                                                    )}
                                                </div>
                                                <input
                                                    type="text"
                                                    value={settings.file_path.individual_name}
                                                    onChange={(e) => updateFilePath('individual_name', e.target.value)}
                                                    placeholder="输入样品编号"
                                                    className={fieldErrors.individual_name ? 'input-error' : ''}
                                                />
                                            </div>

                                            <div className="path-preview">
                                                <label>预览路径：</label>
                                                <code>
                                                    {settings.file_path.base_path || 'C:\\data\\archive'}
                                                    \{settings.file_path.project_name || '{project}'}
                                                    \{settings.file_path.individual_name || '{individual}'}
                                                    \{'{test_type}'}
                                                </code>
                                            </div>
                                        </div>
                                    )}

                                    {/* 通知配置 */}
                                    {activeSection === 'notification' && (
                                        <div className="section-content">

                                            <div className="form-group" style={{ marginBottom: '24px', marginTop: '12px' }}>
                                                <label className="setting-toggle">
                                                    <input
                                                        type="checkbox"
                                                        checked={settings.notification.enabled}
                                                        onChange={(e) => updateNotification('enabled', e.target.checked)}
                                                    />
                                                    <div className="toggle-track">
                                                        <div className="toggle-thumb"></div>
                                                    </div>
                                                    <span className="toggle-label" style={{ fontSize: '15px' }}>
                                                        {settings.notification.enabled ? '启用' : '不启用'}
                                                    </span>
                                                </label>
                                            </div>

                                            {settings.notification.enabled && (
                                                <div className="smtp-config-section" style={{ animation: 'fadeIn 0.3s ease-out' }}>
                                                    <div className="form-row" style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                                                        <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                                                            <label>SMTP 服务器</label>
                                                            <input
                                                                type="text"
                                                                value={settings.notification.smtp_server || ''}
                                                                onChange={(e) => updateNotification('smtp_server', e.target.value)}
                                                                placeholder="smtp.qq.com"
                                                            />
                                                        </div>
                                                        <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                                                            <label>SMTP 用户名（发件邮箱）</label>
                                                            <input
                                                                type="text"
                                                                value={settings.notification.smtp_user || ''}
                                                                onChange={(e) => updateNotification('smtp_user', e.target.value)}
                                                                placeholder="your@qq.com"
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="form-row" style={{ display: 'flex', gap: '12px', marginBottom: 0 }}>
                                                        <div className="form-group" style={{ flex: 2, marginBottom: 0 }}>
                                                            <label>SMTP 密码/授权码</label>
                                                            <input
                                                                type="password"
                                                                value={settings.notification.smtp_password || ''}
                                                                onChange={(e) => updateNotification('smtp_password', e.target.value)}
                                                                placeholder="授权码（非邮箱密码）"
                                                            />
                                                        </div>
                                                        <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                                                            <label>端口</label>
                                                            <input
                                                                type="number"
                                                                value={settings.notification.smtp_port || 465}
                                                                onChange={(e) => updateNotification('smtp_port', parseInt(e.target.value) || 465)}
                                                                placeholder="465"
                                                            />
                                                        </div>
                                                    </div>
                                                    <p className="hint-text" style={{ marginBottom: '12px' }}>
                                                        QQ邮箱请使用授权码，可在 设置 → 账户 → POP3/SMTP服务 获取
                                                    </p>


                                                    <div className="form-group" style={{ marginBottom: '12px' }}>
                                                        <label>收件邮箱地址</label>
                                                        <input
                                                            type="email"
                                                            value={settings.notification.email}
                                                            onChange={(e) => updateNotification('email', e.target.value)}
                                                            placeholder="your@email.com"
                                                        />
                                                    </div>

                                                    {/* 测试邮件按钮 */}
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                                                        <button
                                                            type="button"
                                                            className="test-email-btn"
                                                            onClick={async () => {
                                                                if (!settings.notification.email) {
                                                                    alert('请先填写收件邮箱地址');
                                                                    return;
                                                                }
                                                                if (!settings.notification.smtp_server || !settings.notification.smtp_user || !settings.notification.smtp_password) {
                                                                    alert('请先填写完整的 SMTP 配置');
                                                                    return;
                                                                }
                                                                try {
                                                                    const response: any = await api.post('/notifications/test-email', {
                                                                        email: settings.notification.email,
                                                                        smtp_server: settings.notification.smtp_server,
                                                                        smtp_port: settings.notification.smtp_port || 465,
                                                                        smtp_user: settings.notification.smtp_user,
                                                                        smtp_password: settings.notification.smtp_password,
                                                                        smtp_secure: settings.notification.smtp_secure !== false
                                                                    });
                                                                    if (response?.success) {
                                                                        alert('测试邮件已发送，请检查收件箱');
                                                                    } else {
                                                                        alert(`发送失败: ${response?.message || '未知错误'}`);
                                                                    }
                                                                } catch (err: any) {
                                                                    alert(`发送失败: ${err.message || '网络错误'}`);
                                                                }
                                                            }}
                                                            disabled={!settings.notification.email || !settings.notification.smtp_user}
                                                            style={{
                                                                opacity: (settings.notification.email && settings.notification.smtp_user) ? 1 : 0.5
                                                            }}
                                                        >
                                                            📧 发送测试邮件
                                                        </button>
                                                        <p className="hint-text" style={{ margin: 0 }}>
                                                            点击后会使用上方配置发送测试邮件
                                                        </p>
                                                    </div>

                                                    <h4 style={{ marginBottom: '6px', fontSize: '13px', color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>
                                                        发送时机
                                                    </h4>

                                                    <div className="toggle-group">
                                                        <div className="form-group" style={{ marginBottom: 0 }}>
                                                            <label className="setting-toggle">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={settings.notification.on_complete}
                                                                    onChange={(e) => updateNotification('on_complete', e.target.checked)}
                                                                />
                                                                <div className="toggle-track">
                                                                    <div className="toggle-thumb"></div>
                                                                </div>
                                                                <span className="toggle-label sub-toggle">完成时</span>
                                                            </label>
                                                        </div>

                                                        <div className="form-group" style={{ marginBottom: 0 }}>
                                                            <label className="setting-toggle">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={settings.notification.on_error}
                                                                    onChange={(e) => updateNotification('on_error', e.target.checked)}
                                                                />
                                                                <div className="toggle-track">
                                                                    <div className="toggle-thumb"></div>
                                                                </div>
                                                                <span className="toggle-label sub-toggle">失败时</span>
                                                            </label>
                                                        </div>

                                                        <div className="form-group" style={{ marginBottom: 0 }}>
                                                            <label className="setting-toggle">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={settings.notification.on_warning}
                                                                    onChange={(e) => updateNotification('on_warning', e.target.checked)}
                                                                />
                                                                <div className="toggle-track">
                                                                    <div className="toggle-thumb"></div>
                                                                </div>
                                                                <span className="toggle-label sub-toggle">警告时</span>
                                                            </label>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                        </div>
                                    )}

                                    {/* 云同步配置 */}
                                    {activeSection === 'cloud' && (
                                        <div className="section-content">

                                            <div className="form-group">
                                                <label>云服务提供商</label>
                                                <select
                                                    value={settings.cloud.provider}
                                                    onChange={(e) => updateCloud('provider', e.target.value)}
                                                >
                                                    <option value="none">不使用云同步</option>
                                                    <option value="aliyun">阿里云 OSS</option>
                                                    <option value="aws">AWS S3</option>
                                                    <option value="azure">Azure Blob</option>
                                                </select>
                                            </div>

                                            {settings.cloud.provider !== 'none' && (
                                                <>
                                                    <div className="form-group checkbox-group">
                                                        <label className="checkbox-label">
                                                            <input
                                                                type="checkbox"
                                                                checked={settings.cloud.sync_enabled}
                                                                onChange={(e) => updateCloud('sync_enabled', e.target.checked)}
                                                            />
                                                            <span>启用自动同步</span>
                                                        </label>
                                                    </div>

                                                    <div className="form-group">
                                                        <label>服务端点 (Endpoint)</label>
                                                        <input
                                                            type="text"
                                                            value={settings.cloud.endpoint || ''}
                                                            onChange={(e) => updateCloud('endpoint', e.target.value)}
                                                            placeholder="oss-cn-hangzhou.aliyuncs.com"
                                                        />
                                                    </div>

                                                    <div className="form-group">
                                                        <label>存储桶名称 (Bucket)</label>
                                                        <input
                                                            type="text"
                                                            value={settings.cloud.bucket || ''}
                                                            onChange={(e) => updateCloud('bucket', e.target.value)}
                                                            placeholder="your-bucket-name"
                                                        />
                                                    </div>

                                                    <div className="cloud-note">
                                                        <p>💡 API 密钥等敏感信息请在服务器端配置，不在客户端存储。</p>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="settings-empty">请先选择用户</div>
                            )}
                        </div>
                    </div>

                    {/* 底部状态 */}
                    <div className="settings-footer">
                        {saving ? (
                            <span className="save-status saving">保存中...</span>
                        ) : (
                            <span className="save-status saved">✓ 自动保存</span>
                        )}
                    </div>
                </div>
            </div>
        </Portal>
    );
};
