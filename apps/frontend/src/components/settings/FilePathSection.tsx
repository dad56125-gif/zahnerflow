import React, { useRef, useState, useEffect } from 'react';
import { Dropdown } from '../shared/Dropdown';
import { useDropdownPosition } from '../shared/useDropdownPosition';
import { runtimeClient } from '../../runtimeClient';
import { selectDesktopDirectory } from '../../desktopBridge';

interface FilePathSettings {
    basePath: string;
    projectName: string;
    individualName: string;
}

interface FilePathSectionProps {
    settings: FilePathSettings;
    currentUser: string | null;
    onChange: (field: keyof FilePathSettings, value: string) => void;
}

const BrowseFolderIcon: React.FC = () => (
    <svg className="btn-svg-icon path-input__browse-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path className="btn-svg-icon__primary" d="M3,20V5A1,1,0,0,1,4,4H8a1,1,0,0,1,.71.29l2.41,2.42a1,1,0,0,0,.71.29H17a1,1,0,0,1,1,1v3" />
        <polygon className="btn-svg-icon__secondary" points="18 20 21 11 7 11 3 20 18 20" />
        <circle className="path-input__dot" cx="20.25" cy="4.65" r="1.85" />
    </svg>
);

export const FilePathSection: React.FC<FilePathSectionProps> = ({
    settings,
    currentUser,
    onChange
}) => {
    // 项目列表状态
    const [projects, setProjects] = useState<string[]>([]);
    const projectDropdownButtonRef = useRef<HTMLButtonElement>(null);
    const projectDropdownRef = useRef<HTMLDivElement>(null);

    const projectDropdown = useDropdownPosition({
        triggerRef: projectDropdownButtonRef,
        dropdownRef: projectDropdownRef,
        offset: 4,
        minWidth: 200
    });

    // 字段错误状态
    const [fieldErrors, setFieldErrors] = useState<{
        basePath?: string;
        projectName?: string;
        individualName?: string;
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
        const realTimeErrors: typeof fieldErrors = {};

        if (settings.basePath && !validateBasePath(settings.basePath)) {
            realTimeErrors.basePath = '路径包含无效字符（<>"|?*）';
        }

        if (settings.projectName && !validateProjectName(settings.projectName)) {
            realTimeErrors.projectName = '只能包含英文、数字和下划线';
        }

        if (settings.individualName && !validateIndividualName(settings.individualName)) {
            realTimeErrors.individualName = '只能包含英文、数字和下划线';
        }

        setFieldErrors(realTimeErrors);
    }, [settings.basePath, settings.projectName, settings.individualName]);

    // 加载项目列表
    const loadProjects = async () => {
        if (!currentUser) return;
        try {
            const response = await runtimeClient.files.projects(currentUser);
            const list = response.projects || [];
            setProjects(list);
        } catch (err) {
            console.error('Failed to load projects:', err);
        }
    };

    // 删除项目
    const handleDeleteProject = async (projectName: string) => {
        if (!currentUser) return;

        if (!window.confirm(`确定要删除项目 "${projectName}" 吗？`)) {
            return;
        }

        try {
            await runtimeClient.files.deleteProject(projectName, currentUser);
            setProjects(prev => prev.filter(p => p !== projectName));
            if (settings.projectName === projectName) {
                onChange('projectName', '');
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
                onChange('basePath', desktopSelection.path);
                return;
            }
            if (desktopSelection?.canceled) {
                return;
            }

            const response = await runtimeClient.files.browseSystemPath();
            if (response?.path) {
                onChange('basePath', response.path);
            }
        } catch (err) {
            console.error('Failed to browse path:', err);
        }
    };

    return (
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
                        value={settings.basePath}
                        onChange={(e) => onChange('basePath', e.target.value)}
                        placeholder="C:\data\archive"
                        className={fieldErrors.basePath ? 'input input--error' : 'input'}
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
                                projectDropdown.toggle();
                                if (!projectDropdown.isOpen && projects.length === 0) {
                                    loadProjects();
                                }
                            }}
                        >
                            <span>{settings.projectName || '选择项目...'}</span>
                            <svg className={`dropdown__arrow ${projectDropdown.isOpen ? 'is-rotated' : ''}`} viewBox="-10 -6 20 12" width="12" height="12">
                                <path d="M -8 -3 L 0 5 L 8 -3" fill="none" stroke="var(--text-secondary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </button>
                        <Dropdown
                            isOpen={projectDropdown.isOpen}
                            isHiding={projectDropdown.isHiding}
                            onClose={() => projectDropdown.startClose()}
                            position={projectDropdown.position}
                        >
                            <div ref={projectDropdownRef}>
                                {projects.length > 0 ? (
                                    projects.map(p => (
                                        <div
                                            key={p}
                                            className={`dropdown__option ${p === settings.projectName ? 'is-selected' : ''}`}
                                        >
                                            <span
                                                className="project__name"
                                                onClick={() => {
                                                    onChange('projectName', p);
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
                                    <div className="dropdown__empty">暂无已有项目</div>
                                )}
                            </div>
                        </Dropdown>
                    </div>
                    <input
                        type="text"
                        value={settings.projectName}
                        onChange={(e) => onChange('projectName', e.target.value)}
                        placeholder="或输入新项目名"
                        className={fieldErrors.projectName ? 'input input--error' : 'input'}
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
                    value={settings.individualName}
                    onChange={(e) => onChange('individualName', e.target.value)}
                    placeholder="输入样品编号"
                    className={fieldErrors.individualName ? 'input input--error' : 'input'}
                />
            </div>

            <div className="path-preview">
                <label>预览路径：</label>
                <code>
                    {settings.basePath || 'C:\\data\\archive'}
                    \{settings.projectName || '{project}'}
                    \{settings.individualName || '{individual}'}
                    \{'{test_type}'}
                </code>
            </div>
        </div>
    );
};
