import React from 'react';
import { WorkstationType } from '../nodes/types';

interface ToolbarProps {
  onNewFlow: () => void;
  onOpenFlow: (data: any) => void;
  onSaveFlow: () => any;
  onRunFlow: () => void;
  onStopFlow: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  canUndo: boolean;
  canRedo: boolean;
  selectedWorkstation: WorkstationType | null;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  onNewFlow,
  onOpenFlow,
  onSaveFlow,
  onRunFlow,
  onStopFlow,
  onUndo,
  onRedo,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  canUndo,
  canRedo,
  selectedWorkstation
}) => {
  const handleFileOpen = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target?.result as string);
          onOpenFlow(data);
        } catch (error) {
          console.error('文件解析失败:', error);
        }
      };
      reader.readAsText(file);
    }
  };

  const handleFileSave = () => {
    const data = onSaveFlow();
    if (data) {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      // 根据工作站生成文件名
      const workstationPrefix = selectedWorkstation === 'zahner-zennium' ? 'zahner_zennium' : 'zahnerflow';
      
      a.download = `${workstationPrefix}_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="floating-toolbar glass">
      {/* 左侧：文件操作 */}
      <div className="toolbar-section">
        <div className="menu">
          <button 
            className="btn glass btn-primary" 
            onClick={onNewFlow} 
            title="新建流程"
          >
            <span className="btn-icon">📄</span>
            <span className="btn-text">新建</span>
          </button>
          
          <label className="file-input-label">
            <input
              type="file"
              accept=".json"
              className="file-input"
              onChange={handleFileOpen}
            />
            <span className="btn glass btn-secondary" title="打开文件">
              <span className="btn-icon">📂</span>
              <span className="btn-text">打开</span>
            </span>
          </label>
          
          <button 
            className="btn glass btn-accent" 
            onClick={handleFileSave} 
            title="保存文件"
          >
            <span className="btn-icon">💾</span>
            <span className="btn-text">保存</span>
          </button>
        </div>
      </div>

      {/* 中间：编辑操作 */}
      <div className="toolbar-section">
        <div className="edit-controls">
          <button
            className={`btn glass ${!canUndo ? 'disabled' : ''}`}
            onClick={onUndo}
            disabled={!canUndo}
            title="撤销 (Ctrl+Z)"
          >
            <span className="btn-icon">↶</span>
            <span className="btn-text">撤销</span>
          </button>
          
          <button
            className={`btn glass ${!canRedo ? 'disabled' : ''}`}
            onClick={onRedo}
            disabled={!canRedo}
            title="重做 (Ctrl+Y)"
          >
            <span className="btn-icon">↷</span>
            <span className="btn-text">重做</span>
          </button>
          
          <div className="divider" />
          
          <button 
            className="btn glass" 
            onClick={onZoomOut} 
            title="缩小视图"
          >
            <span className="btn-icon">➖</span>
            <span className="btn-text">缩小</span>
          </button>
          
          <button 
            className="btn glass" 
            onClick={onResetZoom} 
            title="重置缩放"
          >
            <span className="btn-icon">🎯</span>
            <span className="btn-text">100%</span>
          </button>
          
          <button 
            className="btn glass" 
            onClick={onZoomIn} 
            title="放大视图"
          >
            <span className="btn-icon">➕</span>
            <span className="btn-text">放大</span>
          </button>
        </div>
      </div>

      {/* 右侧：运行和设置 */}
      <div className="toolbar-section">
        <div className="run-controls">
          <button
            className="btn glass btn-primary"
            onClick={onRunFlow}
            title="运行流程 (F5)"
          >
            <span className="btn-icon">▶️</span>
            <span className="btn-text">运行</span>
          </button>
          
          <button
            className="btn glass btn-secondary"
            onClick={onStopFlow}
            title="停止运行"
          >
            <span className="btn-icon">⏹️</span>
            <span className="btn-text">停止</span>
          </button>
          
          </div>
      </div>
    </div>
  );
};