import React from 'react';
import { WorkstationType } from '../types/nodes';
import { useCanvasStore } from '../services/stores/canvasStore';
import { FilePathManagerUI } from './FilePathManagerUI';
import { FilePathConfig } from '../contexts/UserContext';
import './FilePathManagerUI.css';

interface ToolbarProps {
  onRunFlow: () => void;
  onStopFlow: () => void;
  onResetFlow?: () => void;  // --- ✅ 确保传入此回调 ---
  selectedWorkstation: WorkstationType | null;
  isRunning: boolean;
  hasError: boolean;
  onToggleWorkflowManager?: () => void;
  showWorkflowManager?: boolean;
  showFilePathManager?: boolean;
  onToggleFilePathManager?: () => void;
  onFilePathSave?: (config: FilePathConfig) => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  onRunFlow,
  onStopFlow,
  onResetFlow, // 解构出 reset 回调
  selectedWorkstation,
  isRunning,
  hasError,
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

  // 计算按钮状态 - 基于四种状态模式
  const getButtonStates = () => {
    // 1. 初始化状态：未选择工作站
    if (!selectedWorkstation) {
      return {
        fileOperationsDisabled: true,
        filePathDisabled: true,
        workflowDisabled: true,
        runButtonDisabled: true,
        runButtonText: '运行',
        stopButtonDisabled: true,
        stopButtonText: '停止',
        stopButtonVariant: 'btn_secondary' as const,
        isResetMode: false // 标记当前是否为重置模式
      };
    }

    // 2. 出错状态 -> 显示重置 (原有逻辑)
    if (hasError) {
      return {
        fileOperationsDisabled: true,
        filePathDisabled: true,
        workflowDisabled: true,
        runButtonDisabled: true,
        runButtonText: '运行',
        stopButtonDisabled: false,
        stopButtonText: '重置',
        stopButtonVariant: 'btn_warning' as const,
        isResetMode: true // ✅ 是重置模式
      };
    }

    // 3. 运行中状态 -> 显示停止 (原有逻辑)
    if (isRunning) {
      return {
        fileOperationsDisabled: true,
        filePathDisabled: true,
        workflowDisabled: true,
        runButtonDisabled: true,
        runButtonText: '运行中',
        stopButtonDisabled: false,
        stopButtonText: '停止',
        stopButtonVariant: 'btn_danger' as const,
        isResetMode: false // 是停止模式
      };
    }

    // 4. 空闲状态：已选择工作站，未运行
    // --- 💡 改进：允许在此状态下重置，以便清除上一轮运行的成功(绿色)状态 ---
    return {
      fileOperationsDisabled: false,
      filePathDisabled: false,
      workflowDisabled: false,
      runButtonDisabled: false,
      runButtonText: '运行',
      stopButtonDisabled: false, // ✅ 改为 false，允许点击
      stopButtonText: '重置',    // ✅ 改为 '重置'，允许用户手动清空状态
      stopButtonVariant: 'btn_secondary' as const,
      isResetMode: true          // ✅ 是重置模式
    };
  };

  const buttonStates = getButtonStates();

  // --- 处理点击逻辑：根据模式分发给 Stop 或 Reset ---
  const handleStopOrReset = () => {
    if (buttonStates.isResetMode) {
      // 如果是重置模式，调用重置 (如果传入了)
      if (onResetFlow) onResetFlow();
    } else {
      // 否则调用停止
      onStopFlow();
    }
  };

  const handleFileOpen = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target?.result as string);
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
    // ... (保持原有代码不变)
    const data = {
        nodes,
        connections,
        metadata: {
          version: '2.0.0',
          layout: '1d',
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
      <div className="toolbar glass">
        {/* 左侧：文件操作 (保持不变) */}
        <div className="flex items-center gap_sm">
          <div className="flex gap_xs">
            <button
              className={`btn_base btn_layout btn_style_common btn_mini glass btn-primary ${
                buttonStates.fileOperationsDisabled ? 'disabled' : ''
              }`}
              onClick={clearCanvas}
              title="新建流程"
              disabled={buttonStates.fileOperationsDisabled}
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
                disabled={buttonStates.fileOperationsDisabled}
              />
              <span className={`btn_base btn_layout btn_style_common btn_mini glass btn-secondary ${
                buttonStates.fileOperationsDisabled ? 'disabled' : ''
              }`} title="打开文件">
                <span className="btn-icon">📂</span>
                <span className="btn-text">打开</span>
              </span>
            </label>

            <button
              className={`btn_base btn_layout btn_style_common btn_mini glass btn-accent ${
                buttonStates.fileOperationsDisabled ? 'disabled' : ''
              }`}
              onClick={handleFileSave}
              title="保存文件"
              disabled={buttonStates.fileOperationsDisabled}
            >
              <span className="btn-icon">💾</span>
              <span className="btn-text">保存</span>
            </button>
          </div>
        </div>

        {/* 中间：文件路径管理 (保持不变) */}
        <div className="flex items-center gap_sm">
            {onToggleFilePathManager && (
              <button
                className={`btn_base btn_layout btn_style_common btn_mini glass ${
                  buttonStates.filePathDisabled ? 'disabled' : (showFilePathManager ? 'btn-primary' : 'btn-secondary')
                }`}
                onClick={onToggleFilePathManager}
                title={showFilePathManager ? "关闭文件路径管理" : "打开文件路径管理"}
                disabled={buttonStates.filePathDisabled}
              >
                <span className="btn-icon">📁</span>
                <span className="btn-text">文件路径</span>
              </button>
            )}
        </div>

        {/* 右侧：运行和设置 */}
        <div className="flex items-center gap_sm">
            <button
              className={`btn_base btn_layout btn_style_common btn_mini glass btn-primary ${
                buttonStates.runButtonDisabled ? 'disabled' : ''
              }`}
              onClick={onRunFlow}
              title="运行流程 (F5)"
              disabled={buttonStates.runButtonDisabled}
            >
              <span className="btn-icon">▶️</span>
              <span className="btn-text">{buttonStates.runButtonText}</span>
            </button>

            {/* --- ✅ 修复点：动态绑定点击事件 --- */}
            <button
              className={`btn_base btn_layout btn_style_common btn_mini glass ${buttonStates.stopButtonVariant} ${
                buttonStates.stopButtonDisabled ? 'disabled' : ''
              }`}
              onClick={handleStopOrReset} 
              title={buttonStates.stopButtonText === '重置' ? "重置系统" : "停止运行"}
              disabled={buttonStates.stopButtonDisabled}
            >
              <span className="btn-icon">{buttonStates.stopButtonText === '重置' ? '🔄' : '⏹️'}</span>
              <span className="btn-text">{buttonStates.stopButtonText}</span>
            </button>

            {onToggleWorkflowManager && (
              <button
                className={`btn_base btn_layout btn_style_common btn_mini glass ${
                  buttonStates.workflowDisabled ? 'disabled' : (showWorkflowManager ? 'btn-primary' : 'btn-secondary')
                }`}
                onClick={onToggleWorkflowManager}
                title={showWorkflowManager ? "关闭工作流管理" : "打开工作流管理"}
                disabled={buttonStates.workflowDisabled}
              >
                <span className="btn-icon">{showWorkflowManager ? '📋' : '📄'}</span>
                <span className="btn-text">工作流</span>
              </button>
            )}
        </div>
      </div>

      {/* 文件路径管理器覆盖层 (保持不变) */}
      {showFilePathManager && onToggleFilePathManager && onFilePathSave && (
        <FilePathManagerUI
          onClose={onToggleFilePathManager}
          onSave={onFilePathSave}
        />
      )}
    </>
  );
};