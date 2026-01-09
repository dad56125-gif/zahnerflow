import React, { useState, useRef, useEffect } from 'react';
import { useCanvasStore } from '../state/canvasStore';
import { useWorkflowStore } from '../state/currentWorkflowStore';
import { ScheduleRunner } from './ScheduleRunner';
import { SaveDropdown } from './SaveDropdown';
import { SaveAsDropdown } from './SaveAsDropdown';
import { UnrollViewModal } from './UnrollViewModal';
import { formatDuration } from '../workflow/timelineCalculator';

interface ToolbarProps {
  onRunFlow: () => void;
  onStopFlow: () => void;
  onResetFlow?: () => void;  // --- ✅ 确保传入此回调 ---
  selectedWorkstation: string | null;
  isRunning: boolean;
  hasError: boolean;
  onToggleWorkflowManager?: () => void;
  showWorkflowManager?: boolean;
  // 新增：报告生成
  onGenerateReport?: () => void;
  canGenerateReport?: boolean;  // 是否有可生成报告的执行记录
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
  onGenerateReport,
  canGenerateReport = false
}) => {
  const {
    clearCanvas,
    nodes
  } = useCanvasStore();

  const {
    setCurrentWorkflow,
    setDraftWorkflowName
  } = useWorkflowStore();

  // 定时运行状态
  const [showScheduler, setShowScheduler] = useState(false);
  const [scheduledTime, setScheduledTime] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState<string>(''); // 倒计时显示
  const scheduleButtonRef = useRef<HTMLButtonElement>(null);
  const scheduleTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 展开视图状态
  const [showUnrollView, setShowUnrollView] = useState(false);

  // 定时触发逻辑
  useEffect(() => {
    // 清除之前的定时器
    if (scheduleTimerRef.current) {
      clearTimeout(scheduleTimerRef.current);
      scheduleTimerRef.current = null;
    }

    if (scheduledTime) {
      const now = new Date();
      const delay = scheduledTime.getTime() - now.getTime();

      if (delay > 0) {
        console.log(`[定时运行] 将在 ${Math.round(delay / 1000)} 秒后执行`);
        scheduleTimerRef.current = setTimeout(() => {
          console.log('[定时运行] 时间到达，开始执行工作流！');
          setScheduledTime(null); // 清除定时状态
          setCountdown(''); // 清除倒计时
          onRunFlow(); // 执行运行
        }, delay);
      } else {
        // 时间已过，立即执行
        console.log('[定时运行] 时间已过，立即执行');
        setScheduledTime(null);
        setCountdown('');
        onRunFlow();
      }
    }

    return () => {
      if (scheduleTimerRef.current) {
        clearTimeout(scheduleTimerRef.current);
      }
    };
  }, [scheduledTime, onRunFlow]);

  // 倒计时显示更新（每秒刷新）
  useEffect(() => {
    if (!scheduledTime) {
      setCountdown('');
      return;
    }

    const updateCountdown = () => {
      const now = Date.now();
      const remaining = Math.max(0, scheduledTime.getTime() - now);

      if (remaining <= 0) {
        setCountdown('');
        return;
      }

      const seconds = Math.floor(remaining / 1000);
      setCountdown(formatDuration(seconds));
    };

    updateCountdown(); // 立即更新一次
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [scheduledTime]);

  // 计算按钮状态 - 基于四种状态模式
  const getButtonStates = () => {
    // 1. 初始化状态：未选择工作站
    if (!selectedWorkstation) {
      return {
        fileOperationsDisabled: true,
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

  // 新建工作流：清空画布 + 重置工作流状态
  const handleNewWorkflow = () => {
    clearCanvas();
    setCurrentWorkflow(null);
    setDraftWorkflowName(null);
  };

  return (
    <>
      <div className="toolbar glass">
        {/* 左侧：文件操作 */}
        <div className="flex items-center gap_sm">
          <div className="flex gap_sm">
            <button
              className={`btn_base btn_layout btn_style_common btn_mini glass btn_primary ${buttonStates.fileOperationsDisabled ? 'disabled' : ''
                }`}
              onClick={handleNewWorkflow}
              title="新建流程"
              disabled={buttonStates.fileOperationsDisabled}
            >
              <span className="btn-icon">📄</span>
              <span className="btn-text">新建</span>
            </button>

            {/* 保存按钮 */}
            <SaveDropdown disabled={buttonStates.fileOperationsDisabled} />

            {/* 另存为按钮 */}
            <SaveAsDropdown disabled={buttonStates.fileOperationsDisabled} />
          </div>
        </div>

        {/* 中间：展开所有 + 工作流管理 + 报告生成 */}
        <div className="flex items-center gap_sm">
          {/* 展开所有按钮 */}
          <button
            className={`btn_base btn_layout btn_style_common btn_mini glass ${buttonStates.workflowDisabled || nodes.length === 0 ? 'disabled' : 'btn_secondary'
              }`}
            onClick={() => setShowUnrollView(true)}
            title="查看展开后的所有执行步骤"
            disabled={buttonStates.workflowDisabled || nodes.length === 0}
          >
            <span className="btn-icon">🔍</span>
            <span className="btn-text">展开所有</span>
          </button>

          {onToggleWorkflowManager && (
            <button
              className={`btn_base btn_layout btn_style_common btn_mini glass ${buttonStates.workflowDisabled ? 'disabled' : (showWorkflowManager ? 'btn_primary' : 'btn_secondary')
                }`}
              onClick={onToggleWorkflowManager}
              title={showWorkflowManager ? "关闭工作流管理" : "打开工作流管理"}
              disabled={buttonStates.workflowDisabled}
            >
              <span className="btn-icon">{showWorkflowManager ? '📋' : '📄'}</span>
              <span className="btn-text">工作流</span>
            </button>
          )}

          {/* 生成报告按钮 */}
          {onGenerateReport && (
            <button
              className={`btn_base btn_layout btn_style_common btn_mini glass ${canGenerateReport ? 'btn_accent' : 'btn_secondary disabled'
                }`}
              onClick={onGenerateReport}
              title={canGenerateReport ? "生成实验报告" : "执行工作流后可生成报告"}
              disabled={!canGenerateReport || isRunning}
            >
              <span className="btn-icon">📊</span>
              <span className="btn-text">报告</span>
            </button>
          )}
        </div>

        {/* 右侧：运行和设置 */}
        <div className="flex items-center gap_sm">
          <button
            className={`btn_base btn_layout btn_style_common btn_mini glass btn_primary ${buttonStates.runButtonDisabled ? 'disabled' : ''
              }`}
            onClick={onRunFlow}
            title="运行流程 (F5)"
            disabled={buttonStates.runButtonDisabled}
          >
            <span className="btn-icon">▶️</span>
            <span className="btn-text">{buttonStates.runButtonText}</span>
          </button>

          {/* 定时运行按钮 */}
          <button
            ref={scheduleButtonRef}
            className={`btn_base btn_layout btn_style_common btn_mini glass ${scheduledTime ? 'btn_warning' : 'btn_secondary'
              } ${buttonStates.runButtonDisabled && !scheduledTime ? 'disabled' : ''}`}
            onClick={() => {
              if (scheduledTime) {
                // 已有定时任务，点击取消
                setScheduledTime(null);
                setCountdown('');
                console.log('[定时运行] 已取消');
              } else {
                setShowScheduler(!showScheduler);
              }
            }}
            title={scheduledTime ? `点击取消定时（${scheduledTime.toLocaleTimeString()}）` : "定时运行"}
            disabled={buttonStates.runButtonDisabled && !scheduledTime}
          >
            <span className="btn-text">
              {scheduledTime && countdown
                ? `启动于 ${countdown}`
                : '定时运行'
              }
            </span>
          </button>

          <button
            className={`btn_base btn_layout btn_style_common btn_mini glass ${buttonStates.stopButtonVariant} ${buttonStates.stopButtonDisabled ? 'disabled' : ''
              }`}
            onClick={handleStopOrReset}
            title={buttonStates.stopButtonText === '重置' ? "重置系统" : "停止运行"}
            disabled={buttonStates.stopButtonDisabled}
          >
            <span className="btn-icon">{buttonStates.stopButtonText === '重置' ? '🔄' : '⏹️'}</span>
            <span className="btn-text">{buttonStates.stopButtonText}</span>
          </button>
        </div>
      </div>



      {/* 定时运行弹窗 */}
      <ScheduleRunner
        isOpen={showScheduler}
        onClose={() => setShowScheduler(false)}
        onSchedule={(time) => {
          setScheduledTime(time);
          console.log(`定时运行设置为: ${time.toLocaleString()}`);
          // TODO: 实现定时触发逻辑
        }}
        anchorRect={scheduleButtonRef.current?.getBoundingClientRect()}
      />

      {/* 展开视图弹窗 */}
      <UnrollViewModal
        isOpen={showUnrollView}
        onClose={() => setShowUnrollView(false)}
        nodes={nodes}
      />
    </>
  );
};