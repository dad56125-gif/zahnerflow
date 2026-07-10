import React, { useMemo, useState } from 'react';
import { useCanvasStore } from '../state/canvasStore';
import { useWorkflowStore } from '../state/currentWorkflowStore';
import { deriveExecutionUiState, useExecutionStore } from '../state/executionStateBridge';
import { UnrollViewModal } from './UnrollViewModal';
import type { RunFlowHandler } from '../types/executionControl';

interface ToolbarProps {
  onRunFlow: RunFlowHandler;
  onResetFlow?: () => void;
  selectedWorkstation: string | null;
  isRunning: boolean;
  isCancelling?: boolean;
  hasError: boolean;
  workflowBlockRunBlocked?: boolean;
  onGenerateReport?: () => void;
  onUnrollViewOpenChange?: (open: boolean) => void;
  autoStartupConfig?: Record<string, any>;
  runMetadataWarning?: string | null;
}

type PrimaryAction = 'run' | 'reset';
type ToolbarIconName = 'clear' | 'expand' | 'records' | 'reset' | 'start';

const ToolbarIcon: React.FC<{ name: ToolbarIconName }> = ({ name }) => {
  const commonProps = {
    className: 'btn-svg-icon',
    viewBox: '0 0 24 24',
    'aria-hidden': true,
    focusable: false,
  } as const;

  switch (name) {
    case 'clear':
      return (
        <svg {...commonProps}>
          <rect className="btn-svg-icon__primary" x="7" y="3.69" width="10" height="16.63" rx="1" transform="translate(-4.97 12) rotate(-45.01)" />
          <path className="btn-svg-icon__secondary" d="M20.71,13.64,17.17,10.1l-7.06,7.07,3.53,3.54a1,1,0,0,0,1.41,0l5.66-5.66A1,1,0,0,0,20.71,13.64ZM6,21h8" />
        </svg>
      );
    case 'records':
      return (
        <svg {...commonProps}>
          <path className="btn-svg-icon__primary" d="M14,5h3a1,1,0,0,1,1,1v9" />
          <path className="btn-svg-icon__primary" d="M8,5H5A1,1,0,0,0,4,6V20a1,1,0,0,0,1,1h7" />
          <path className="btn-svg-icon__secondary" d="M14,4a1,1,0,0,0-1-1H9A1,1,0,0,0,8,4V7h6ZM8,17h4M8,13h6m2,6h4" />
        </svg>
      );
    case 'expand':
      return (
        <svg {...commonProps}>
          <circle className="btn-svg-icon__primary" cx="10.5" cy="10.5" r="5.5" />
          <path className="btn-svg-icon__secondary" d="M14.5,14.5,20,20" />
          <path className="btn-svg-icon__primary" d="M10.5,8v5M8,10.5h5" />
        </svg>
      );
    case 'reset':
      return (
        <svg {...commonProps}>
          <path className="btn-svg-icon__primary" d="M4,12A8,8,0,0,1,18.93,8" />
          <path className="btn-svg-icon__primary" d="M20,12A8,8,0,0,1,5.07,16" />
          <polyline className="btn-svg-icon__secondary" points="14 8 19 8 19 3" />
          <polyline className="btn-svg-icon__secondary" points="10 16 5 16 5 21" />
        </svg>
      );
    case 'start':
      return (
        <svg {...commonProps}>
          <polygon className="btn-svg-icon__secondary" points="16 12 10 16 10 8 16 12" />
          <circle className="btn-svg-icon__primary" cx="12" cy="12" r="9" />
        </svg>
      );
  }
};

export const Toolbar: React.FC<ToolbarProps> = ({
  onRunFlow,
  onResetFlow,
  selectedWorkstation,
  isRunning,
  isCancelling = false,
  hasError,
  workflowBlockRunBlocked = false,
  onGenerateReport,
  onUnrollViewOpenChange,
  autoStartupConfig,
  runMetadataWarning,
}) => {
  const { clearCanvas, nodes } = useCanvasStore();
  const { setDraftWorkflowName } = useWorkflowStore();
  const executionSnapshot = useExecutionStore(state => state.lastSnapshot);
  const executionStoreIsRunning = useExecutionStore(state => state.isRunning);
  const executionStoreIsPaused = useExecutionStore(state => state.isPaused);
  const executionError = useExecutionStore(state => state.error);
  const executionUi = useMemo(
    () => deriveExecutionUiState(executionSnapshot, {
      isRunning: executionStoreIsRunning,
      isPaused: executionStoreIsPaused,
      error: executionError,
    }),
    [executionError, executionSnapshot, executionStoreIsPaused, executionStoreIsRunning],
  );
  const [showUnrollView, setShowUnrollView] = useState(false);

  const getButtonStates = () => {
    if (!selectedWorkstation) {
      return {
        fileOperationsDisabled: true,
        workflowDisabled: true,
        primaryButtonDisabled: true,
        primaryButtonText: '运行',
        primaryButtonVariant: 'btn--primary' as const,
        primaryButtonIcon: 'start' as const,
        primaryAction: 'run' as PrimaryAction
      };
    }

    if (executionUi.isCancelling) {
      return {
        fileOperationsDisabled: true,
        workflowDisabled: true,
        primaryButtonDisabled: true,
        primaryButtonText: executionUi.label,
        primaryButtonVariant: 'btn--warning' as const,
        primaryButtonIcon: 'start' as const,
        primaryAction: 'run' as PrimaryAction
      };
    }

    if (executionUi.isActive) {
      return {
        fileOperationsDisabled: true,
        workflowDisabled: true,
        primaryButtonDisabled: true,
        primaryButtonText: executionUi.label,
        primaryButtonVariant: 'btn--primary' as const,
        primaryButtonIcon: 'start' as const,
        primaryAction: 'run' as PrimaryAction
      };
    }

    if (hasError || executionUi.canReset) {
      return {
        fileOperationsDisabled: true,
        workflowDisabled: true,
        primaryButtonDisabled: false,
        primaryButtonText: '重置',
        primaryButtonVariant: hasError ? 'btn--warning' as const : 'btn--secondary' as const,
        primaryButtonIcon: 'reset' as const,
        primaryAction: 'reset' as PrimaryAction
      };
    }

    if (workflowBlockRunBlocked) {
      return {
        fileOperationsDisabled: false,
        workflowDisabled: false,
        primaryButtonDisabled: true,
        primaryButtonText: '不可运行',
        primaryButtonVariant: 'btn--secondary' as const,
        primaryButtonIcon: 'start' as const,
        primaryAction: 'run' as PrimaryAction
      };
    }

    return {
      fileOperationsDisabled: false,
      workflowDisabled: false,
      primaryButtonDisabled: false,
      primaryButtonText: '运行',
      primaryButtonVariant: 'btn--primary' as const,
      primaryButtonIcon: 'start' as const,
      primaryAction: 'run' as PrimaryAction
    };
  };

  const buttonStates = getButtonStates();

  const setUnrollViewOpen = (open: boolean) => {
    setShowUnrollView(open);
    onUnrollViewOpenChange?.(open);
  };

  const handlePrimaryAction = () => {
    if (buttonStates.primaryAction === 'reset') {
      onResetFlow?.();
      return;
    }
    void onRunFlow();
  };

  const handleClearCanvas = () => {
    clearCanvas();
    setDraftWorkflowName(null);
  };

  return (
    <>
      <div className="toolbar" aria-label="画布工具栏">
        <div className="toolbar__group toolbar__group--top-left">
          <button
            className={`btn btn--md btn--icon btn--round glass btn--primary ${buttonStates.fileOperationsDisabled ? 'disabled' : ''}`}
            onClick={handleClearCanvas}
            title="清空画布"
            aria-label="清空画布"
            disabled={buttonStates.fileOperationsDisabled}
          >
            <span className="btn-icon"><ToolbarIcon name="clear" /></span>
          </button>

          {onGenerateReport && (
            <button
              className="btn btn--md btn--icon btn--round glass btn--accent"
              onClick={onGenerateReport}
              title="查看实验记录"
              aria-label="查看实验记录"
            >
              <span className="btn-icon"><ToolbarIcon name="records" /></span>
            </button>
          )}
        </div>

        <div className="toolbar__group toolbar__group--top-right">
          {runMetadataWarning && buttonStates.primaryAction === 'run' && (
            <div className="toolbar-run-warning" role="status" aria-live="polite">
              <span className="toolbar-run-warning__marker">!</span>
              <span className="toolbar-run-warning__message">{runMetadataWarning}</span>
            </div>
          )}
          <button
            className={`btn btn--md btn--icon btn--round glass ${buttonStates.primaryButtonVariant} ${buttonStates.primaryButtonDisabled ? 'disabled' : ''}`}
            onClick={handlePrimaryAction}
            title={workflowBlockRunBlocked ? '工作流块未选择子工作流，或子工作流包含嵌套工作流块' : buttonStates.primaryButtonText === '运行' ? '运行流程 (F5)' : buttonStates.primaryButtonText}
            aria-label={buttonStates.primaryButtonText}
            disabled={buttonStates.primaryButtonDisabled}
          >
            <span className="btn-icon"><ToolbarIcon name={buttonStates.primaryButtonIcon} /></span>
          </button>
        </div>

        <div className="toolbar__group toolbar__group--bottom-right">
          <button
            className={`btn btn--md btn--icon btn--round glass ${buttonStates.workflowDisabled || nodes.length === 0 ? 'disabled' : 'btn--secondary'}`}
            onClick={() => setUnrollViewOpen(true)}
            title="查看展开后的所有执行步骤"
            aria-label="查看展开后的所有执行步骤"
            disabled={buttonStates.workflowDisabled || nodes.length === 0}
          >
            <span className="btn-icon"><ToolbarIcon name="expand" /></span>
          </button>
        </div>
      </div>

      <UnrollViewModal
        isOpen={showUnrollView}
        onClose={() => setUnrollViewOpen(false)}
        nodes={nodes}
        autoStartupConfig={autoStartupConfig}
        canRunFromStep={!buttonStates.primaryButtonDisabled && buttonStates.primaryAction === 'run'}
        runMetadataWarning={runMetadataWarning}
        onRunFromStep={(startFromUnrolledIndex) => onRunFlow({ startFromUnrolledIndex })}
      />

    </>
  );
};
