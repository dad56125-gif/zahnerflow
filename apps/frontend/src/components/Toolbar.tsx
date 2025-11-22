import React from 'react';
import { WorkstationType } from '../types/nodes';
import { useCanvasStore } from '../services/stores/canvasStore';
import { FilePathManagerUI, FilePathConfig } from './FilePathManagerUI';
import './FilePathManagerUI.css';

interface ToolbarProps {
  onRunFlow: () => void;
  onStopFlow: () => void;
  selectedWorkstation: WorkstationType | null;
  onToggleWorkflowManager?: () => void;
  showWorkflowManager?: boolean;
  showFilePathManager?: boolean;
  onToggleFilePathManager?: () => void;
  onFilePathSave?: (config: FilePathConfig) => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  onRunFlow,
  onStopFlow,
  selectedWorkstation,
  onToggleWorkflowManager,
  showWorkflowManager = false,
  showFilePathManager = false,
  onToggleFilePathManager,
  onFilePathSave
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
    <>
      <div className="positioned_container glass h_toolbar flex items-center justify-between gap_md">
        {/* 左侧：文件操作 */}
        <div className="flex items-center gap_sm">
          <div className="flex gap_xs">
            <button
              className="btn_base btn_layout btn_style_common btn_mini glass btn-primary"
              onClick={clearCanvas}
              title="新建流程"
            >
              <span className="btn-icon">📄</span>
              <span className="btn-text">新建</span>
            </button>

            <label className="btn_layout">
              <input
                type="file"
                accept=".json"
                className="file-input"
                onChange={handleFileOpen}
              />
              <span className="btn_base btn_layout btn_style_common btn_mini glass btn-secondary" title="打开文件">
                <span className="btn-icon">📂</span>
                <span className="btn-text">打开</span>
              </span>
            </label>

            <button
              className="btn_base btn_layout btn_style_common btn_mini glass btn-accent"
              onClick={handleFileSave}
              title="保存文件"
            >
              <span className="btn-icon">💾</span>
              <span className="btn-text">保存</span>
            </button>
          </div>
        </div>

        {/* 中间：文件路径管理 */}
        <div className="flex items-center gap_sm">
            {onToggleFilePathManager && (
              <button
                className={`btn_base btn_layout btn_style_common btn_mini glass ${showFilePathManager ? 'btn-primary' : 'btn-secondary'}`}
                onClick={onToggleFilePathManager}
                title={showFilePathManager ? "关闭文件路径管理" : "打开文件路径管理"}
              >
                <span className="btn-icon">📁</span>
                <span className="btn-text">文件路径</span>
              </button>
            )}
        </div>

        {/* 右侧：运行和设置 */}
        <div className="flex items-center gap_sm">
            <button
              className="btn_base btn_layout btn_style_common btn_mini glass btn-primary"
              onClick={onRunFlow}
              title="运行流程 (F5)"
            >
              <span className="btn-icon">▶️</span>
              <span className="btn-text">运行</span>
            </button>

            <button
              className="btn_base btn_layout btn_style_common btn_mini glass btn-secondary"
              onClick={onStopFlow}
              title="停止运行"
            >
              <span className="btn-icon">⏹️</span>
              <span className="btn-text">停止</span>
            </button>

            {onToggleWorkflowManager && (
              <button
                className={`btn_base btn_layout btn_style_common btn_mini glass ${showWorkflowManager ? 'btn-primary' : 'btn-secondary'}`}
                onClick={onToggleWorkflowManager}
                title={showWorkflowManager ? "关闭工作流管理" : "打开工作流管理"}
              >
                <span className="btn-icon">{showWorkflowManager ? '📋' : '📄'}</span>
                <span className="btn-text">工作流</span>
              </button>
            )}
        </div>
      </div>

      {/* 文件路径管理器覆盖层 */}
      {showFilePathManager && onToggleFilePathManager && onFilePathSave && (
        <FilePathManagerUI
          onClose={onToggleFilePathManager}
          onSave={onFilePathSave}
        />
      )}
    </>
  );
};