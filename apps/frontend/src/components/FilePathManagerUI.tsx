import React, { useState, useEffect, useRef } from 'react';
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
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [isProjectHiding, setIsProjectHiding] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const panelRef = useRef<HTMLDivElement>(null);
  const projectSelectRef = useRef<HTMLDivElement>(null);
  const projectDropdownRef = useRef<HTMLDivElement>(null);

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

  const handleSave = async () => {
    if (!config.project_name.trim() || !config.individual_name.trim()) {
      setError('项目名和样品编号不能为空');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response: any = await api.post('/files/path-config', {
        user: currentUser,
        ...config,
        test_type: 'eis'
      });

      if (response?.success) {
        onSave(config);
        onClose();
      } else {
        setError(response?.message || '保存失败');
      }
    } catch (error) {
      setError('保存配置失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const handleBrowseDirectory = () => {
    const input = document.createElement('input');
    input.type = 'file';
    (input as any).webkitdirectory = true;
    input.multiple = true;

    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files.length > 0) {
        const firstFile = files[0] as any;
        const path = firstFile.webkitRelativePath?.split('/')?.[0] || '';
        if (path) {
          setConfig({ ...config, base_path: path });
        }
      }
    };

    input.click();
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
            <label htmlFor="base_path">基础路径:</label>
            <div className="path-input-group">
              <input
                id="base_path"
                type="text"
                value={config.base_path}
                onChange={(e) => setConfig({ ...config, base_path: e.target.value })}
                placeholder="选择或输入基础路径"
              />
              <button
                type="button"
                className="browse-btn"
                onClick={handleBrowseDirectory}
                title="浏览文件夹"
              >
                📁
              </button>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="project_select">项目名</label>
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
                onChange={(e) => setConfig({ ...config, project_name: e.target.value })}
                placeholder="或输入新项目名"
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="individual_name">样品编号:</label>
            <input
              id="individual_name"
              type="text"
              value={config.individual_name}
              onChange={(e) => setConfig({ ...config, individual_name: e.target.value })}
              placeholder="输入样品编号"
            />
          </div>

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}
        </div>

        <div className="panel-footer">
          <button
            className="btn btn-secondary"
            onClick={onClose}
            disabled={loading}
          >
            取消
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={loading}
          >
            {loading ? '保存中...' : '确定'}
          </button>
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
