import React from 'react';
import { WorkstationType } from '../nodes/types';
import { useCanvasStore } from '../stores/canvasStore';

interface ToolbarProps {
  onRunFlow: () => void;
  onStopFlow: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  selectedWorkstation: WorkstationType | null;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  onRunFlow,
  onStopFlow,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  selectedWorkstation
}) => {
  const {
    nodes,
    connections,
    clearCanvas,
    setNodes,
    setConnections
  } = useCanvasStore();

  const handleFileOpen = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target?.result as string);
          // TODO: Add more robust validation
          if (data.nodes) setNodes(data.nodes);
          if (data.connections) setConnections(data.connections);
        } catch (error) {
          console.error('文件解析失败:', error);
        }
      };
      reader.readAsText(file);
    }
  };

  const handleFileSave = () => {
    const data = {
        nodes,
        connections,
        metadata: {
          version: '2.0.0',
          layout: '1d', // 一维布局
          workstation: selectedWorkstation,
          workstationName: selectedWorkstation === 'zahner-zennium' ? 'Zahner Zennium' : 'PP242',
          createdAt: new Date(),
          exportedAt: new Date()
        }
      };

    if (data) {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
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
            className="btn btn-floating-toolbar glass btn-primary" 
            onClick={clearCanvas} 
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
            <span className="btn btn-floating-toolbar glass btn-secondary" title="打开文件">
              <span className="btn-icon">📂</span>
              <span className="btn-text">打开</span>
            </span>
          </label>
          
          <button 
            className="btn btn-floating-toolbar glass btn-accent" 
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
          <div className="divider" />
          
          <button 
            className="btn btn-floating-toolbar glass" 
            onClick={onZoomOut} 
            title="缩小视图"
          >
            <span className="btn-icon">➖</span>
            <span className="btn-text">缩小</span>
          </button>
          
          <button 
            className="btn btn-floating-toolbar glass" 
            onClick={onResetZoom} 
            title="重置缩放"
          >
            <span className="btn-icon">🎯</span>
            <span className="btn-text">100%</span>
          </button>
          
          <button 
            className="btn btn-floating-toolbar glass" 
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
            className="btn btn-floating-toolbar glass btn-primary"
            onClick={onRunFlow}
            title="运行流程 (F5)"
          >
            <span className="btn-icon">▶️</span>
            <span className="btn-text">运行</span>
          </button>
          
          <button
            className="btn btn-floating-toolbar glass btn-secondary"
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