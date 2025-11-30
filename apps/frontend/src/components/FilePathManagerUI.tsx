import React, { useState, useEffect, useRef, useMemo } from 'react';
import { api } from '../services/api';
import { useUser } from '../contexts/UserContext';
import { useOnClickOutside } from '../services/hooks/useOnClickOutside';
import Portal from '../components/Portal';

export interface FilePathConfig {
  base_path: string;
  project_name: string;
  individual_name: string;
}

interface FilePathManagerUIProps {
  onClose: () => void;
  onSave: (config: FilePathConfig) => void;
}

export const FilePathManagerUI: React.FC<FilePathManagerUIProps> = ({
  onClose,
  onSave
}) => {
  const { currentUser } = useUser();
  const [config, setConfig] = useState<FilePathConfig>({
    base_path: 'C:\\data\\archive',
    project_name: '',
    individual_name: ''
  });

  const [projects, setProjects] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 各字段单独的错误状态
  const [fieldErrors, setFieldErrors] = useState<{
    base_path?: string;
    project_name?: string;
    individual_name?: string;
    general?: string;
  }>({});
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [isProjectHiding, setIsProjectHiding] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const panelRef = useRef<HTMLDivElement>(null);
  const projectSelectRef = useRef<HTMLButtonElement>(null);
  const projectDropdownRef = useRef<HTMLDivElement>(null);

  // 输入验证函数
  const validateBasePath = (path: string): boolean => {
    // 文件夹路径允许字母、数字、反斜杠、斜杠、下划线、连字符、冒号（用于Windows盘符）
    const validPattern = /^[a-zA-Z0-9\\/:_-]*$/;
    // 不允许Windows文件系统禁止的特殊字符（除了冒号，因为冒号是盘符必需的）
    const hasInvalidChars = /[<>"|?*]/.test(path);
    return validPattern.test(path) && !hasInvalidChars;
  };

  const validateProjectName = (name: string): boolean => {
    // 项目名必须是英文/数字/下划线，不允许其他字符
    const validPattern = /^[a-zA-Z0-9_]*$/;
    return validPattern.test(name);
  };

  const validateIndividualName = (name: string): boolean => {
    // 样品编号必须是英文/数字/下划线
    const validPattern = /^[a-zA-Z0-9_]*$/;
    return validPattern.test(name);
  };

  // 使用 useOnClickOutside 实现点击外部关闭
  useOnClickOutside(panelRef, onClose);

  // 处理项目下拉菜单点击外部关闭
  useEffect(() => {
    if (!projectDropdownOpen && !isProjectHiding) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;

      // 如果点击在项目选择器上，不关闭
      if (projectSelectRef.current?.contains(target)) return;

      // 如果点击在下拉菜单上，不关闭
      if (projectDropdownRef.current?.contains(target)) return;

      // 点击在其他地方，开始关闭动画
      setIsProjectHiding(true);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [projectDropdownOpen, isProjectHiding]);

  // 处理项目下拉菜单动画结束事件
  useEffect(() => {
    if (!isProjectHiding) return;

    const dropdown = projectDropdownRef.current;
    if (!dropdown) return;

    let animationCompleted = false;
    const fallbackTimer = setTimeout(() => {
      if (!animationCompleted) {
        setProjectDropdownOpen(false);
        setIsProjectHiding(false);
      }
    }, 300);

    const handleAnimationEnd = (e: AnimationEvent) => {
      if (e.animationName === 'dropdownOut') {
        animationCompleted = true;
        clearTimeout(fallbackTimer);
        setProjectDropdownOpen(false);
        setIsProjectHiding(false);
      }
    };

    const timer = setTimeout(() => {
      dropdown.addEventListener('animationend', handleAnimationEnd);
    }, 0);

    return () => {
      clearTimeout(timer);
      clearTimeout(fallbackTimer);
      dropdown.removeEventListener('animationend', handleAnimationEnd);
    };
  }, [isProjectHiding]);

  useEffect(() => {
    if (currentUser) {
      loadProjects();
    }
  }, [currentUser]);

  const loadProjects = async () => {
    try {
      const response: any = await api.get(`/files/projects?user=${currentUser}`);
      if (response?.success) {
        const list = Array.isArray(response.projects)
          ? (response.projects as string[])
          : (Array.isArray(response.data) ? (response.data as string[]) : []);
        setProjects(list);
      }
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  };

  // 计算项目下拉菜单位置
  const updateProjectDropdownPosition = () => {
    if (!projectSelectRef.current) return;

    const selectRect = projectSelectRef.current.getBoundingClientRect();
    setDropdownPosition({
      top: selectRect.bottom + 8,
      left: selectRect.left,
      width: Math.max(280, selectRect.width)
    });
  };

  // 打开项目下拉菜单时更新位置
  useEffect(() => {
    if (projectDropdownOpen) {
      updateProjectDropdownPosition();

      const handleResize = () => updateProjectDropdownPosition();
      const handleScroll = () => updateProjectDropdownPosition();

      window.addEventListener('resize', handleResize);
      window.addEventListener('scroll', handleScroll, true);

      return () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('scroll', handleScroll, true);
      };
    }
  }, [projectDropdownOpen]);

  // 实时错误检查
  useEffect(() => {
    const realTimeErrors: typeof fieldErrors = {};

    // 实时验证基础路径
    if (config.base_path && !validateBasePath(config.base_path)) {
      realTimeErrors.base_path = '文件夹路径包含无效字符（<>"|?*）';
    }

    // 实时验证项目名
    if (config.project_name && !validateProjectName(config.project_name)) {
      realTimeErrors.project_name = '项目名只能包含英文、数字和下划线';
    }

    // 实时验证样品编号
    if (config.individual_name && !validateIndividualName(config.individual_name)) {
      realTimeErrors.individual_name = '样品编号只能包含英文、数字和下划线';
    }

    // 只更新实时验证的错误，保留用户未输入的字段状态
    setFieldErrors(prev => ({
      ...prev,
      base_path: realTimeErrors.base_path || (prev.base_path && config.base_path ? undefined : prev.base_path),
      project_name: realTimeErrors.project_name || (prev.project_name && config.project_name ? undefined : prev.project_name),
      individual_name: realTimeErrors.individual_name || (prev.individual_name && config.individual_name ? undefined : prev.individual_name)
    }));
  }, [config.base_path, config.project_name, config.individual_name]);

  // 实时计算预览路径 - 支持三种模式
  const previewPath = useMemo(() => {
    const basePath = config.base_path?.trim() || 'C:\\data\\archive';
    const project = config.project_name?.trim() || '';
    const individual = config.individual_name?.trim() || '';
    const testType = '{test_type}'; // 占位符，实际保存时由后端确定
    const timestamp = new Date().toISOString().slice(2, 16).replace(/[-:]/g, '').replace('T', '_'); // 例如: 241129_1430

    // 实时验证基础路径是否有效
    const isBasePathValid = !config.base_path || validateBasePath(config.base_path);
    // 实时验证项目名是否有效
    const isProjectValid = !project || validateProjectName(project);
    // 实时验证样品编号是否有效
    const isIndividualValid = !individual || validateIndividualName(individual);

    // 如果基础路径有验证错误，使用默认基础路径
    const effectiveBasePath = isBasePathValid ? basePath : 'C:\\data\\archive';

    // 模式1: 完整配置 (标准归档模式) - 所有字段都有效
    if (project && individual && isProjectValid && isIndividualValid) {
      return `${effectiveBasePath}\\${project}\\${individual}\\${testType}`;
    }

    // 模式2: 只有项目名 (项目默认模式) - 项目名有效
    if (project && !individual && isProjectValid) {
      return `${effectiveBasePath}\\${project}\\default\\${timestamp}\\${testType}`;
    }

    // 模式3: 纯工作流 (临时模式) - 没有项目名或项目名无效
    if (!project || !isProjectValid) {
      return `C:\\data\\archive\\workflow_${timestamp}\\${testType}`;
    }

    // 部分信息的情况
    return '请填写完整信息以显示路径';
  }, [config.base_path, config.project_name, config.individual_name]);

  // 自动保存逻辑 - 当配置有效时自动保存
  useEffect(() => {
    const autoSave = async () => {
      // 检查是否满足自动保存条件：至少有项目名
      if (!config.project_name.trim()) return;

      // 验证所有字段
      const errors: typeof fieldErrors = {};

      if (config.base_path && !validateBasePath(config.base_path)) {
        errors.base_path = '文件夹路径包含无效字符（<>"|?*）';
      }

      if (config.project_name && !validateProjectName(config.project_name)) {
        errors.project_name = '项目名只能包含英文、数字和下划线';
      }

      if (config.individual_name && !validateIndividualName(config.individual_name)) {
        errors.individual_name = '样品编号只能包含英文、数字和下划线';
      }

      // 如果有验证错误，不自动保存
      if (Object.keys(errors).length > 0) return;

      setLoading(true);
      try {
        const response: any = await api.post('/files/path-config', {
          user: currentUser,
          ...config,
          test_type: 'eis'
        });

        if (response?.success) {
          onSave(config);
        } else {
          setFieldErrors({ general: response?.message || '自动保存失败' });
        }
      } catch (error) {
        console.error('自动保存失败:', error);
        // 自动保存失败不显示错误给用户，避免干扰
      } finally {
        setLoading(false);
      }
    };

    // 使用防抖避免频繁保存
    const timeoutId = setTimeout(autoSave, 1000);
    return () => clearTimeout(timeoutId);
  }, [config.base_path, config.project_name, config.individual_name, currentUser, onSave]);

  const handleBrowseDirectory = async () => {
    // 防止用户重复点击
    setLoading(true);
    setError('');
    try {
      // 请求后端打开弹窗
      const response: any = await api.get('/files/browse-system-path');

      if (response?.success && response.path) {
        // 拿到后端传回来的真实绝对路径！
        setConfig({ ...config, base_path: response.path });
      } else {
        // 使用清晰的状态码检测
        if (response?.message === 'USER_CANCELLED') {
          // 用户取消选择，不显示错误消息
        } else {
          // 真正的错误才显示
          setError(response?.message || '无法打开系统对话框');
        }
      }
    } catch (error) {
      console.error('打开文件夹选择器失败', error);
      // 网络错误等异常情况才显示错误消息
      setError('无法连接到服务器，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Portal>
      <div className="file-path-manager-overlay">
        <div ref={panelRef} className="file-path-manager-panel">
          <div className="panel-header">
            <h2>文件路径配置</h2>
            <button className="close-btn" onClick={onClose}>×</button>
          </div>

        <div className="panel-content">
          <div className="form-group">
            <div className="kit_row">
              <div className="kit_row_left">
                <label htmlFor="base_path">基础路径:</label>
              </div>
              <div className="kit_row_right">
                {fieldErrors.base_path && (
                  <span className="field-error" style={{ color: 'var(--color-danger)', fontSize: 'var(--size-xs)' }}>
                    {fieldErrors.base_path}
                  </span>
                )}
              </div>
            </div>
            <div className="path-input-group">
              <input
                id="base_path"
                type="text"
                value={config.base_path}
                onChange={(e) => {
                  setConfig({ ...config, base_path: e.target.value });
                  // 清除该字段的错误
                  if (fieldErrors.base_path) {
                    setFieldErrors(prev => ({ ...prev, base_path: undefined }));
                  }
                }}
                placeholder="选择或输入基础路径"
              />
              <button
                type="button"
                className="browse-btn"
                onClick={handleBrowseDirectory}
                disabled={loading}
                title="打开系统文件夹选择器"
                style={{
                  cursor: loading ? 'wait' : 'pointer',
                  opacity: loading ? 0.7 : 1
                }}
              >
                {loading ? '⏳' : '📁'}
              </button>
            </div>
          </div>

          <div className="form-group">
            <div className="kit_row">
              <div className="kit_row_left">
                <label htmlFor="project_select">项目名</label>
              </div>
              <div className="kit_row_right">
                {fieldErrors.project_name && (
                  <span className="field-error" style={{ color: 'var(--color-danger)', fontSize: 'var(--size-xs)' }}>
                    {fieldErrors.project_name}
                  </span>
                )}
              </div>
            </div>
            <div className="project-input-group">
              <button
                ref={projectSelectRef}
                type="button"
                className="btn btn_secondary btn_small"
                onClick={() => {
                  if (projectDropdownOpen) {
                    setProjectDropdownOpen(false);
                    setIsProjectHiding(true);
                  } else {
                    setProjectDropdownOpen(true);
                    if (!config.project_name && projects.length === 0) {
                      loadProjects();
                    }
                  }
                }}
              >
                <span className="user-display">
                  {config.project_name || '选择已有项目...'}
                </span>
                <svg className={`dropdown-arrow ${projectDropdownOpen ? 'rotated' : ''}`} viewBox="-10 -6 20 12" width="12" height="12">
                  <path
                    d="M -8 -3 L 0 5 L 8 -3"
                    fill="none"
                    stroke="rgba(255,255,255,0.8)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <input
                type="text"
                value={config.project_name}
                onChange={(e) => {
                  setConfig({ ...config, project_name: e.target.value });
                  // 清除该字段的错误
                  if (fieldErrors.project_name) {
                    setFieldErrors(prev => ({ ...prev, project_name: undefined }));
                  }
                }}
                placeholder="或输入新项目名"
              />
            </div>
          </div>

          <div className="form-group">
            <div className="kit_row">
              <div className="kit_row_left">
                <label htmlFor="individual_name">样品编号:</label>
              </div>
              <div className="kit_row_right">
                {fieldErrors.individual_name && (
                  <span className="field-error" style={{ color: 'var(--color-danger)', fontSize: 'var(--size-xs)' }}>
                    {fieldErrors.individual_name}
                  </span>
                )}
              </div>
            </div>
            <input
              id="individual_name"
              type="text"
              value={config.individual_name}
              onChange={(e) => {
                setConfig({ ...config, individual_name: e.target.value });
                // 清除该字段的错误
                if (fieldErrors.individual_name) {
                  setFieldErrors(prev => ({ ...prev, individual_name: undefined }));
                }
              }}
              placeholder="输入样品编号（可选）"
            />
          </div>

          <div className="form-group">
            <div className="kit_row">
              <div className="kit_row_left">
                <label>当前保存路径:</label>
              </div>
              <div className="kit_row_right">
                {!config.project_name.trim() ? (
                  <span className="field-error" style={{ color: 'var(--color-warning)', fontSize: 'var(--size-xs)' }}>
                    未设置项目名，使用默认保存路径
                  </span>
                ) : ((config.base_path && !validateBasePath(config.base_path)) ||
                       (config.individual_name && !validateIndividualName(config.individual_name))) && (
                  <span className="field-error" style={{ color: 'var(--color-danger)', fontSize: 'var(--size-xs)' }}>
                    配置错误，使用默认保存路径
                  </span>
                )}
              </div>
            </div>
            <div className="path-preview">
              {previewPath}
            </div>
          </div>

          {fieldErrors.general && (
            <div className="error-message">
              {fieldErrors.general}
            </div>
          )}
        </div>
      </div>

        {/* 项目下拉菜单 - 使用Portal渲染到body下 */}
        <Portal>
          {(projectDropdownOpen || isProjectHiding) && (
            <div
              ref={projectDropdownRef}
              className={`dropdown_base overlay_base ${isProjectHiding ? 'hiding' : 'show'}`}
              style={{
                top: `${dropdownPosition.top}px`,
                left: `${dropdownPosition.left}px`,
                width: `${dropdownPosition.width}px`
              } as React.CSSProperties}
            >
              <div className="dropdown_list">
                {projects.length > 0 ? (
                  projects.map(project => (
                    <div
                      key={project}
                      className={`dropdown_option ${project === config.project_name ? 'selected' : ''}`}
                      onClick={() => {
                        setConfig({ ...config, project_name: project });
                        setIsProjectHiding(true);
                      }}
                    >
                      {project}
                    </div>
                  ))
                ) : (
                  <div className="dropdown_empty">暂无项目</div>
                )}
              </div>
            </div>
          )}
        </Portal>
      </div>
    </Portal>
  );
};
