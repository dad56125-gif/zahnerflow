import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

export interface FilePathConfig {
  base_path: string;
  project_name: string;
  individual_name: string;
}

interface FilePathManagerUIProps {
  currentUser: string;
  onClose: () => void;
  onSave: (config: FilePathConfig) => void;
}

export const FilePathManagerUI: React.FC<FilePathManagerUIProps> = ({
  currentUser,
  onClose,
  onSave
}) => {
  const [config, setConfig] = useState<FilePathConfig>({
    base_path: 'C:\\data\\archive',
    project_name: '',
    individual_name: ''
  });

  const [projects, setProjects] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (currentUser) {
      loadProjects();
    }
  }, [currentUser]);

  const loadProjects = async () => {
    try {
      const response = await api.get(`/api/files/projects?user=${currentUser}`);
      if (response.success) {
        setProjects(response.projects);
      }
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  };

  const handleSave = async () => {
    if (!config.project_name.trim() || !config.individual_name.trim()) {
      setError('项目名和样品编号不能为空');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await api.post('/api/files/path-config', {
        user: currentUser,
        ...config,
        test_type: 'eis' // Default, will be overridden by actual measurement type
      });

      if (response.success) {
        onSave(config);
        onClose();
      } else {
        setError(response.message || '保存失败');
      }
    } catch (error) {
      setError('保存配置失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const handleBrowseDirectory = () => {
    // Create input element for directory selection
    const input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;
    input.multiple = true;

    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files.length > 0) {
        // Get the directory path from the first file
        const firstFile = files[0];
        const path = firstFile.webkitRelativePath.split('/')[0];
        setConfig({ ...config, base_path: path });
      }
    };

    input.click();
  };

  return (
    <div className="file-path-manager-overlay">
      <div className="file-path-manager-panel">
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
            <label htmlFor="project_select">项目名:</label>
            <div className="project-input-group">
              <select
                id="project_select"
                value={config.project_name}
                onChange={(e) => setConfig({ ...config, project_name: e.target.value })}
                onFocus={(e) => {
                  if (!config.project_name && projects.length === 0) {
                    loadProjects();
                  }
                }}
              >
                <option value="">选择已有项目...</option>
                {projects.map(project => (
                  <option key={project} value={project}>{project}</option>
                ))}
              </select>
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
    </div>
  );
};