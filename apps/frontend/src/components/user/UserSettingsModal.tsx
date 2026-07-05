import React, { useState, useEffect, useRef } from 'react';
import { ModalLayer } from '../shared/OverlayLayer';
import { useUser } from '../shared/UserContext';
import { runtimeClient } from '../../runtimeClient';
import { Dropdown } from '../shared/Dropdown';
import { useDropdownPosition } from '../shared/useDropdownPosition';
import { selectDesktopDirectory } from '../../desktopBridge';
import { SpacedCjkText } from '../common/SpacedCjkText';

interface UserSettings {
    filePath: {
        basePath: string;
        projectName: string;
        individualName: string;
    };
    notification: {
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
    };
    cloud: {
        provider: string;
        syncEnabled: boolean;
        endpoint?: string;
        bucket?: string;
    };
}

interface UserSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type SettingsSection = 'filePath' | 'notification' | 'cloud';

const SECTION_LABELS: Record<SettingsSection, { label: string }> = {
    filePath: { label: '文件路径' },
    notification: { label: '通知设置' },
    cloud: { label: '云同步' }
};

const SettingsSectionIcon: React.FC<{ section: SettingsSection }> = ({ section }) => {
    const commonProps = {
        className: 'settings__nav-svg btn-svg-icon',
        viewBox: '0 0 24 24',
        'aria-hidden': true,
        focusable: false,
    } as const;

    switch (section) {
        case 'filePath':
            return (
                <svg {...commonProps}>
                    <path className="btn-svg-icon__primary" d="M3,20V5A1,1,0,0,1,4,4H8a1,1,0,0,1,.71.29l2.41,2.42a1,1,0,0,0,.71.29H17a1,1,0,0,1,1,1v3" />
                    <polygon className="btn-svg-icon__secondary" points="18 20 21 11 7 11 3 20 18 20" />
                </svg>
            );
        case 'notification':
            return (
                <svg {...commonProps}>
                    <path className="btn-svg-icon__secondary" d="M15,18H9a3,3,0,0,0,3,3h0A3,3,0,0,0,15,18Z" />
                    <path className="btn-svg-icon__primary" d="M18,9v4l1.38,1.38A2.12,2.12,0,0,1,17.88,18H6.12a2.12,2.12,0,0,1-1.5-3.62L6,13V9a6,6,0,0,1,6-6,6,6,0,0,1,2.88.73" />
                    <path className="btn-svg-icon__secondary" d="M14,6a3,3,0,0,0,3,3h0a3,3,0,0,0,3-3h0a3,3,0,0,0-3-3h0a3,3,0,0,0-3,3Z" />
                </svg>
            );
        case 'cloud':
            return (
                <svg {...commonProps}>
                    <path className="btn-svg-icon__primary" d="M19.94,13.71A4,4,0,0,0,17,7a4.08,4.08,0,0,0-.93.12,5,5,0,0,0-9,2.09A3,3,0,1,0,6,15H7.18" />
                    <path className="btn-svg-icon__secondary" d="M18,13a3.17,3.17,0,0,0-.53.05,4,4,0,0,0-6.94,0A3.17,3.17,0,0,0,10,13a3,3,0,0,0,0,6h8a3,3,0,0,0,0-6Z" />
                </svg>
            );
    }
};

const SettingsTitleIcon: React.FC = () => (
    <svg className="settings__title-svg btn-svg-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path className="btn-svg-icon__primary" d="M14,6.5A3.44,3.44,0,0,0,15.06,9H5.5a2.5,2.5,0,1,1,0-5h9.56A3.44,3.44,0,0,0,14,6.5Z" />
        <path className="btn-svg-icon__secondary" d="M21,6.2A3.49,3.49,0,0,0,15.06,4a3.5,3.5,0,0,0,2.44,6A3.49,3.49,0,0,0,21,6.8a1.51,1.51,0,0,0,0-.3A1.51,1.51,0,0,0,21,6.2Z" />
        <path className="btn-svg-icon__primary" d="M10,17.5A3.44,3.44,0,0,0,8.94,15H18.5a2.5,2.5,0,1,1,0,5H8.94A3.44,3.44,0,0,0,10,17.5Z" />
        <path className="btn-svg-icon__secondary" d="M3,17.8A3.49,3.49,0,0,0,8.94,20,3.5,3.5,0,0,0,6.5,14,3.49,3.49,0,0,0,3,17.2a2.26,2.26,0,0,0,0,.6Z" />
    </svg>
);

const BrowseFolderIcon: React.FC = () => (
    <svg className="btn-svg-icon path-input__browse-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path className="btn-svg-icon__primary" d="M3,20V5A1,1,0,0,1,4,4H8a1,1,0,0,1,.71.29l2.41,2.42a1,1,0,0,0,.71.29H17a1,1,0,0,1,1,1v3" />
        <polygon className="btn-svg-icon__secondary" points="18 20 21 11 7 11 3 20 18 20" />
        <circle className="path-input__dot" cx="20.25" cy="4.65" r="1.85" />
    </svg>
);

export const UserSettingsModal: React.FC<UserSettingsModalProps> = ({
    isOpen,
    onClose
}) => {
    const { currentUser, setFilePathConfig } = useUser();

    const [activeSection, setActiveSection] = useState<SettingsSection>('filePath');
    const [settings, setSettings] = useState<UserSettings | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    // 项目列表状态
    const [projects, setProjects] = useState<string[]>([]);
    const projectDropdownButtonRef = useRef<HTMLButtonElement>(null);
    const projectDropdownPanelRef = useRef<HTMLDivElement>(null);

    // 字段错误状态
    const [fieldErrors, setFieldErrors] = useState<{
        basePath?: string;
        projectName?: string;
        individualName?: string;
    }>({});

    const projectDropdown = useDropdownPosition({
        triggerRef: projectDropdownButtonRef,
        dropdownRef: projectDropdownPanelRef,
        offset: 8,
        minWidth: 220,
    });

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

        if (settings.filePath.basePath && !validateBasePath(settings.filePath.basePath)) {
            realTimeErrors.basePath = '路径包含无效字符（<>"|?*）';
        }

        if (settings.filePath.projectName && !validateProjectName(settings.filePath.projectName)) {
            realTimeErrors.projectName = '只能包含英文、数字和下划线';
        }

        if (settings.filePath.individualName && !validateIndividualName(settings.filePath.individualName)) {
            realTimeErrors.individualName = '只能包含英文、数字和下划线';
        }

        setFieldErrors(realTimeErrors);
    }, [settings?.filePath]);

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
            const response: any = await runtimeClient.users.getSettings(currentUser);
            if (response?.success && response?.settings) {
                // 兼容旧配置：确保 smtpSecure 和 onWarning 有默认值
                if (response.settings.notification && response.settings.notification.smtpSecure !== true) {
                    response.settings.notification.smtpSecure = true;
                }
                if (response.settings.notification && response.settings.notification.onWarning === undefined) {
                    response.settings.notification.onWarning = false; // 默认不启用警告通知
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
            const response: any = await runtimeClient.files.projects(currentUser);
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
            const response: any = await runtimeClient.files.deleteProject(projectName, currentUser);
            if (response?.success) {
                // 从列表中移除
                setProjects(prev => prev.filter(p => p !== projectName));
                // 如果删除的是当前选中的项目，清空选择
                if (settings?.filePath.projectName === projectName) {
                    updateFilePath('projectName', '');
                }
            }
        } catch (err) {
            console.error('Failed to delete project:', err);
        }
    };

    // 打开系统文件夹选择器
    const handleBrowsePath = async () => {
        try {
            const desktopSelection = await selectDesktopDirectory();
            if (desktopSelection?.path) {
                updateFilePath('basePath', desktopSelection.path);
                return;
            }
            if (desktopSelection?.canceled) {
                return;
            }

            const response: any = await runtimeClient.files.browseSystemPath();
            if (response?.success && response?.path) {
                updateFilePath('basePath', response.path);
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
            const response: any = await runtimeClient.users.saveSettings(currentUser, settings);
            if (response?.success) {
                // 同步文件路径到 UserContext（保持兼容）
                setFilePathConfig(settings.filePath);
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

    const updateFilePath = (field: keyof UserSettings['filePath'], value: string) => {
        if (!settings) return;
        setSettings({
            ...settings,
            filePath: { ...settings.filePath, [field]: value }
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

    const sectionOrder = Object.keys(SECTION_LABELS) as SettingsSection[];
    const activeSectionIndex = sectionOrder.indexOf(activeSection);
    const tabListStyle = {
        '--device-tab-index': Math.max(0, activeSectionIndex),
        '--device-tab-count': sectionOrder.length,
    } as React.CSSProperties;

    return (
        <ModalLayer
            open={isOpen}
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
            centered
            id="user-settings-overlay"
        >
            {({ close }) => (
                <div className="settings">
                    {/* 头部 */}
                    <div className="settings__header modal__header">
                        <h3 className="device-title" aria-label="用户配置">
                            <span className="settings__title-icon"><SettingsTitleIcon /></span>
                            <SpacedCjkText text="用户配置" className="device-title__name cjk-spaced" />
                        </h3>
                        <div className="tabs">
                            <div className="tabs__list" style={tabListStyle}>
                                {sectionOrder.map(section => (
                                    <button
                                        key={section}
                                        className={`btn btn--secondary btn--sm tabs__trigger ${activeSection === section ? 'is-active' : ''}`}
                                        onClick={() => setActiveSection(section)}
                                    >
                                        <span className="settings__nav-icon"><SettingsSectionIcon section={section} /></span>
                                        <SpacedCjkText text={SECTION_LABELS[section].label} />
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="settings__header-actions">
                            <span className="current-user__badge">{currentUser}</span>
                            <button className="btn btn--sm btn--ghost btn--icon btn--rounded modal__close" onClick={close} title="关闭">✕</button>
                        </div>
                    </div>

                    <div className="settings__body">
                        {/* 右侧内容 */}
                        <div className="settings__content">
                            {loading ? (
                                <div className="settings__loading">加载中...</div>
                            ) : error ? (
                                <div className="settings__error">{error}</div>
                            ) : settings ? (
                                <>
                                    {/* 文件路径配置 */}
                                    {activeSection === 'filePath' && (
                                        <div className="settings__section-content">

                                            <div className="settings__form-group">
                                                <div className="settings__form-label-row">
                                                    <label>基础路径</label>
                                                    {fieldErrors.basePath && (
                                                        <span className="settings__field-error">{fieldErrors.basePath}</span>
                                                    )}
                                                </div>
                                                <div className="path-input__group">
                                                    <input
                                                        type="text"
                                                        value={settings.filePath.basePath}
                                                        onChange={(e) => updateFilePath('basePath', e.target.value)}
                                                        placeholder="C:\data\archive"
                                                        className={`input ${fieldErrors.basePath ? 'input--error' : ''}`}
                                                    />
                                                    <button
                                                        type="button"
                                                        className="btn btn--md btn--secondary btn--icon btn--round path-input__browse-btn"
                                                        onClick={handleBrowsePath}
                                                        title="浏览文件夹"
                                                    >
                                                        <span className="btn-icon"><BrowseFolderIcon /></span>
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="settings__form-group">
                                                <div className="settings__form-label-row">
                                                    <label>项目名称</label>
                                                    {fieldErrors.projectName && (
                                                        <span className="settings__field-error">{fieldErrors.projectName}</span>
                                                    )}
                                                </div>
                                                <div className="project-input__group">
                                                    <div className="project__dropdown-wrapper">
                                                        <button
                                                            ref={projectDropdownButtonRef}
                                                            type="button"
                                                            className="btn btn--sm btn--secondary btn--rounded project__select-btn"
                                                            onClick={() => {
                                                                const willOpen = !projectDropdown.isOpen;
                                                                projectDropdown.toggle();
                                                                if (willOpen && projects.length === 0) {
                                                                    loadProjects();
                                                                }
                                                            }}
                                                        >
                                                            <span>{settings.filePath.projectName || '选择项目...'}</span>
                                                            <svg className={`dropdown__arrow ${projectDropdown.isOpen ? 'is-rotated' : ''}`} viewBox="-10 -6 20 12" width="12" height="12">
                                                                <path d="M -8 -3 L 0 5 L 8 -3" fill="none" stroke="var(--text-secondary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                                            </svg>
                                                        </button>
                                                        <Dropdown
                                                            isOpen={projectDropdown.isOpen}
                                                            isHiding={projectDropdown.isHiding}
                                                            onClose={projectDropdown.startClose}
                                                            position={{ ...projectDropdown.position, id: 'settings-project-dropdown' }}
                                                            pointerEvents="none"
                                                            triggerRef={projectDropdownButtonRef}
                                                        >
                                                            <div ref={projectDropdownPanelRef}>
                                                                {projects.length > 0 ? (
                                                                    projects.map(p => (
                                                                        <div
                                                                            key={p}
                                                                            className={`project__dropdown-item ${p === settings.filePath.projectName ? 'is-active' : ''}`}
                                                                        >
                                                                            <span
                                                                                className="project__name"
                                                                                onClick={() => {
                                                                                    updateFilePath('projectName', p);
                                                                                    projectDropdown.startClose();
                                                                                }}
                                                                            >
                                                                                {p}
                                                                            </span>
                                                                            <button
                                                                                className="btn btn--xs btn--ghost btn--icon btn--rounded project__delete-btn"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    handleDeleteProject(p);
                                                                                }}
                                                                                title="删除项目"
                                                                            >
                                                                                <span className="btn-icon">✕</span>
                                                                            </button>
                                                                        </div>
                                                                    ))
                                                                ) : (
                                                                    <div className="project__dropdown-empty">暂无已有项目</div>
                                                                )}
                                                            </div>
                                                        </Dropdown>
                                                    </div>
                                                    <input
                                                        type="text"
                                                        value={settings.filePath.projectName}
                                                        onChange={(e) => updateFilePath('projectName', e.target.value)}
                                                        placeholder="或输入新项目名"
                                                        className={`input ${fieldErrors.projectName ? 'input--error' : ''}`}
                                                    />
                                                </div>
                                            </div>

                                            <div className="settings__form-group">
                                                <div className="settings__form-label-row">
                                                    <label>样品编号</label>
                                                    {fieldErrors.individualName && (
                                                        <span className="settings__field-error">{fieldErrors.individualName}</span>
                                                    )}
                                                </div>
                                                <input
                                                    type="text"
                                                    value={settings.filePath.individualName}
                                                    onChange={(e) => updateFilePath('individualName', e.target.value)}
                                                    placeholder="输入样品编号"
                                                    className={`input ${fieldErrors.individualName ? 'input--error' : ''}`}
                                                />
                                            </div>

                                            <div className="path-preview">
                                                <label>预览路径：</label>
                                                <code>
                                                    {settings.filePath.basePath || 'C:\\data\\archive'}
                                                    \{settings.filePath.projectName || '{project}'}
                                                    \{settings.filePath.individualName || '{individual}'}
                                                    \{'{test_type}'}
                                                </code>
                                            </div>
                                        </div>
                                    )}

                                    {/* 通知配置 */}
                                    {activeSection === 'notification' && (
                                        <div className="settings__section-content">
                                            <div className="settings__notification-row">
                                                <div className="settings__toggle-row">
                                                    <span className="settings__smtp-title">
                                                        启用
                                                    </span>
                                                    <label className="setting-toggle">
                                                        <input
                                                            type="checkbox"
                                                            checked={settings.notification.enabled}
                                                            onChange={(e) => updateNotification('enabled', e.target.checked)}
                                                            aria-label="启用通知"
                                                        />
                                                        <div className="toggle-track">
                                                            <div className="toggle-thumb"></div>
                                                        </div>
                                                    </label>
                                                </div>

                                                <div className="settings__timing-row">
                                                    <span className="settings__smtp-title">
                                                        发送时机
                                                    </span>

                                                    <div className="settings__toggle-group">
                                                        <label className="setting-toggle">
                                                            <input
                                                                type="checkbox"
                                                                checked={settings.notification.onComplete}
                                                                onChange={(e) => updateNotification('onComplete', e.target.checked)}
                                                            />
                                                            <div className="toggle-track">
                                                                <div className="toggle-thumb"></div>
                                                            </div>
                                                            <span className="toggle-label sub-toggle">完成时</span>
                                                        </label>

                                                        <label className="setting-toggle">
                                                            <input
                                                                type="checkbox"
                                                                checked={settings.notification.onError}
                                                                onChange={(e) => updateNotification('onError', e.target.checked)}
                                                            />
                                                            <div className="toggle-track">
                                                                <div className="toggle-thumb"></div>
                                                            </div>
                                                            <span className="toggle-label sub-toggle">失败时</span>
                                                        </label>

                                                        <label className="setting-toggle">
                                                            <input
                                                                type="checkbox"
                                                                checked={settings.notification.onWarning}
                                                                onChange={(e) => updateNotification('onWarning', e.target.checked)}
                                                            />
                                                            <div className="toggle-track">
                                                                <div className="toggle-thumb"></div>
                                                            </div>
                                                            <span className="toggle-label sub-toggle">警告时</span>
                                                        </label>
                                                    </div>
                                                </div>
                                            </div>

                                            {settings.notification.enabled && (
                                                <div className="settings__smtp-section">
                                                    <div className="settings__form-row">
                                                        <div className="settings__form-group settings__form-group--flex-1">
                                                            <label>SMTP 服务器</label>
                                                            <input
                                                                type="text"
                                                                value={settings.notification.smtpServer || ''}
                                                                onChange={(e) => updateNotification('smtpServer', e.target.value)}
                                                                placeholder="smtp.qq.com"
                                                                className="input"
                                                            />
                                                        </div>
                                                        <div className="settings__form-group settings__form-group--flex-1">
                                                            <label>SMTP 用户名（发件邮箱）</label>
                                                            <input
                                                                type="text"
                                                                value={settings.notification.smtpUser || ''}
                                                                onChange={(e) => updateNotification('smtpUser', e.target.value)}
                                                                placeholder="your@qq.com"
                                                                className="input"
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="settings__form-row settings__form-row--no-margin">
                                                        <div className="settings__form-group settings__form-group--flex-2">
                                                            <label>SMTP 密码/授权码</label>
                                                            <input
                                                                type="password"
                                                                value={settings.notification.smtpPassword || ''}
                                                                onChange={(e) => updateNotification('smtpPassword', e.target.value)}
                                                                placeholder="授权码（非邮箱密码）"
                                                                className="input"
                                                            />
                                                        </div>
                                                        <div className="settings__form-group settings__form-group--flex-1">
                                                            <label>端口</label>
                                                            <input
                                                                type="number"
                                                                value={settings.notification.smtpPort || 465}
                                                                onChange={(e) => updateNotification('smtpPort', parseInt(e.target.value) || 465)}
                                                                placeholder="465"
                                                                className="input"
                                                            />
                                                        </div>
                                                    </div>
                                                    <p className="settings__hint-text">
                                                        QQ邮箱请使用授权码，可在 设置 → 账户 → POP3/SMTP服务 获取
                                                    </p>


                                                    <div className="settings__form-group">
                                                        <label>收件邮箱地址</label>
                                                        <input
                                                            type="email"
                                                            value={settings.notification.email}
                                                            onChange={(e) => updateNotification('email', e.target.value)}
                                                            placeholder="your@email.com"
                                                            className="input"
                                                        />
                                                    </div>

                                                    {/* 测试邮件按钮 */}
                                                    <div className="settings__smtp-action-row">
                                                        <button
                                                            type="button"
                                                            className="btn btn--sm btn--secondary test-email-btn"
                                                            onClick={async () => {
                                                                if (!settings.notification.email) {
                                                                    alert('请先填写收件邮箱地址');
                                                                    return;
                                                                }
                                                                if (!settings.notification.smtpServer || !settings.notification.smtpUser || !settings.notification.smtpPassword) {
                                                                    alert('请先填写完整的 SMTP 配置');
                                                                    return;
                                                                }
                                                                try {
                                                                    await runtimeClient.users.saveSettings(currentUser, settings);
                                                                    const response: any = await runtimeClient.users.testEmail(currentUser);
                                                                    if (response?.success) {
                                                                        alert('测试邮件已发送，请检查收件箱');
                                                                    } else {
                                                                        alert(`发送失败: ${response?.message || '未知错误'}`);
                                                                    }
                                                                } catch (err: any) {
                                                                    alert(`发送失败: ${err.message || '网络错误'}`);
                                                                }
                                                            }}
                                                            disabled={!settings.notification.email || !settings.notification.smtpUser}
                                                        >
                                                            发送测试邮件
                                                        </button>
                                                        <p className="settings__hint-text settings__hint-text--no-margin">
                                                            点击后会使用上方配置发送测试邮件
                                                        </p>
                                                    </div>

                                                </div>
                                            )}

                                        </div>
                                    )}

                                    {/* 云同步配置 */}
                                    {activeSection === 'cloud' && (
                                        <div className="settings__section-content">

                                            <div className="settings__form-group">
                                                <label>云服务提供商</label>
                                                <select
                                                    value={settings.cloud.provider}
                                                    onChange={(e) => updateCloud('provider', e.target.value)}
                                                    className="select"
                                                >
                                                    <option value="none">不使用云同步</option>
                                                    <option value="aliyun">阿里云 OSS</option>
                                                    <option value="aws">AWS S3</option>
                                                    <option value="azure">Azure Blob</option>
                                                </select>
                                            </div>

                                            {settings.cloud.provider !== 'none' && (
                                                <>
                                                    <div className="settings__form-group checkbox__group">
                                                        <label className="checkbox__label">
                                                            <input
                                                                type="checkbox"
                                                                checked={settings.cloud.syncEnabled}
                                                                onChange={(e) => updateCloud('syncEnabled', e.target.checked)}
                                                            />
                                                            <span>启用自动同步</span>
                                                        </label>
                                                    </div>

                                                    <div className="settings__form-group">
                                                        <label>服务端点 (Endpoint)</label>
                                                        <input
                                                            type="text"
                                                            value={settings.cloud.endpoint || ''}
                                                            onChange={(e) => updateCloud('endpoint', e.target.value)}
                                                            placeholder="oss-cn-hangzhou.aliyuncs.com"
                                                            className="input"
                                                        />
                                                    </div>

                                                    <div className="settings__form-group">
                                                        <label>存储桶名称 (Bucket)</label>
                                                        <input
                                                            type="text"
                                                            value={settings.cloud.bucket || ''}
                                                            onChange={(e) => updateCloud('bucket', e.target.value)}
                                                            placeholder="your-bucket-name"
                                                            className="input"
                                                        />
                                                    </div>

                                                    <div className="settings__cloud-note">
                                                        <p>💡 API 密钥等敏感信息请在服务器端配置，不在客户端存储。</p>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="settings__empty">请先选择用户</div>
                            )}

                            <div className="settings__save-indicator">
                                {saving ? (
                                    <span className="save-status saving">保存中...</span>
                                ) : (
                                    <span className="save-status saved">✓ 自动保存</span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </ModalLayer>
    );
};
