/**
 * 工作流管理UI组件 - 简化版本
 *
 * 移除违背单一数据源原则的ParameterStore依赖
 * 模板功能由后端提供，前端仅展示历史工作流
 */

import React, { useState, useRef, useEffect } from 'react';
import { useOnClickOutside } from '../shared/useOnClickOutside';
import { useUser } from '../shared/UserContext';
import { Portal } from './Portal';
import { useWorkflowHistory } from './useWorkflowHistory';
import { HistoryListItem } from './HistoryListItem';

// 工作流管理UI属性接口
export interface WorkflowManagerUIProps {
  className?: string;
  style?: React.CSSProperties;
  onClose?: () => void;
}

// WorkflowHistory 类型从 hook 导入

/**
 * 工作流管理UI组件 - 简化版本
 */
export const WorkflowManagerUI: React.FC<WorkflowManagerUIProps> = ({
  className = '',
  style = {},
  onClose
}) => {
  const { currentUser } = useUser();
  const [activeTab, setActiveTab] = useState<'history' | 'favorites'>('history');
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);
  const [isProjectDropdownHiding, setIsProjectDropdownHiding] = useState(false);
  const [projectDropdownPosition, setProjectDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const panelRef = useRef<HTMLDivElement>(null);
  const projectDropdownButtonRef = useRef<HTMLButtonElement>(null);
  const projectDropdownRef = useRef<HTMLDivElement>(null);

  // 使用提取的历史记录 Hook
  const {
    workflowHistory,
    favoriteWorkflows,
    loadingHistory,
    historyError,
    projects,
    deletingItemId,
    loadWorkflowHistory,
    loadHistoryWorkflow,
    deleteHistoryWorkflow,
    showDeleteConfirm,
    cancelDelete,
    toggleFavorite,
  } = useWorkflowHistory({
    currentUser,
    selectedProject,
    activeTab
  });

  // 使用 useOnClickOutside 实现点击外部关闭
  useOnClickOutside(panelRef, () => {
    if (onClose) onClose();
  });

  // 项目下拉菜单点击外部关闭处理
  useEffect(() => {
    if (!isProjectDropdownOpen && !isProjectDropdownHiding) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;

      // 如果点击在按钮上，不关闭
      if (projectDropdownButtonRef.current?.contains(target)) return;

      // 如果点击在下拉菜单上，不关闭
      if (projectDropdownRef.current?.contains(target)) return;

      // 点击在其他地方，开始关闭动画
      setIsProjectDropdownHiding(true);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isProjectDropdownOpen, isProjectDropdownHiding]);

  // 处理项目下拉菜单动画结束事件
  useEffect(() => {
    if (!isProjectDropdownHiding) return;

    const dropdown = projectDropdownRef.current;
    if (!dropdown) return;

    let animationCompleted = false;
    const fallbackTimer = setTimeout(() => {
      if (!animationCompleted) {
        setIsProjectDropdownOpen(false);
        setIsProjectDropdownHiding(false);
      }
    }, 300);

    const handleAnimationEnd = (e: AnimationEvent) => {
      if (e.animationName === 'dropdownOut') {
        animationCompleted = true;
        clearTimeout(fallbackTimer);
        setIsProjectDropdownOpen(false);
        setIsProjectDropdownHiding(false);
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
  }, [isProjectDropdownHiding]);

  // 计算项目下拉菜单位置
  const updateProjectDropdownPosition = () => {
    if (!projectDropdownButtonRef.current) return;

    const buttonRect = projectDropdownButtonRef.current.getBoundingClientRect();
    setProjectDropdownPosition({
      top: buttonRect.bottom + 8, // 按钮底部 + 小间距
      left: buttonRect.left,
      width: Math.max(200, buttonRect.width)
    });
  };

  // 打开项目下拉菜单时更新位置
  useEffect(() => {
    if (isProjectDropdownOpen) {
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
  }, [isProjectDropdownOpen]);

  return (
    <Portal pointerEvents="auto">
      <div className="workflow-manager-overlay">
        <div
          ref={panelRef}
          className={`workflow-manager-ui ${className}`}
          style={style}
        >
          <div className="panel-header">
            <h2>工作流管理</h2>
            <button className="close-btn" onClick={onClose} title="关闭">✕</button>
          </div>

          {/* 标签导航 */}
          <div className="tab-navigation">
            <button
              className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
              onClick={() => setActiveTab('history')}
            >
              历史记录
            </button>
            <button
              className={`tab-btn ${activeTab === 'favorites' ? 'active' : ''}`}
              onClick={() => setActiveTab('favorites')}
            >
              收藏
            </button>
          </div>

          {/* 标签内容 */}
          <div className="tab-content">

            {/* 历史记录标签 */}
            {activeTab === 'history' && (
              <div className="history-tab">
                <div className="history-header">
                  {/* 项目筛选器 - 自定义下拉菜单 */}
                  <div className="history-filter">
                    <button
                      ref={projectDropdownButtonRef}
                      className="btn btn_secondary btn_small"
                      onClick={() => {
                        if (isProjectDropdownOpen) {
                          setIsProjectDropdownOpen(false);
                          setIsProjectDropdownHiding(true);
                        } else {
                          setIsProjectDropdownOpen(true);
                        }
                      }}
                    >
                      <span className="user-display">{selectedProject || '请选择项目'}</span>
                      <svg className={`dropdown-arrow ${isProjectDropdownOpen ? 'rotated' : ''}`} viewBox="-10 -6 20 12" width="12" height="12">
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
                  </div>
                </div>

                {historyError && (
                  <div className="history-error alert alert_danger">
                    <div className="alert_message">{historyError}</div>
                    <button
                      onClick={loadWorkflowHistory}
                      className="retry-btn btn btn_warning btn_small"
                      disabled={loadingHistory}
                    >
                      重试
                    </button>
                  </div>
                )}

                {loadingHistory ? (
                  <div className="history-loading">
                    <div className="loading-spinner spinner"></div>
                    <div>正在加载历史工作流...</div>
                  </div>
                ) : workflowHistory.length === 0 ? (
                  <div className="history-empty">
                    <div className="empty-icon">📋</div>
                    <div className="empty-text">暂无历史工作流</div>
                    <div className="empty-hint">
                      {selectedProject
                        ? `项目 "${selectedProject}" 中没有找到历史工作流`
                        : '应用工作流设置后会自动创建历史记录'
                      }
                    </div>
                  </div>
                ) : (
                  <div className="history-list">
                    {workflowHistory.map((item) => (
                      <HistoryListItem
                        key={item.id}
                        item={item}
                        isDeleting={deletingItemId === item.id}
                        onLoad={loadHistoryWorkflow}
                        onDelete={deleteHistoryWorkflow}
                        onShowDeleteConfirm={showDeleteConfirm}
                        onCancelDelete={cancelDelete}
                        onToggleFavorite={toggleFavorite}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 收藏标签 */}
            {activeTab === 'favorites' && (
              <div className="favorites-tab">
                {loadingHistory ? (
                  <div className="history-loading">
                    <div className="loading-spinner spinner"></div>
                    <div>正在加载收藏工作流...</div>
                  </div>
                ) : favoriteWorkflows.length === 0 ? (
                  <div className="history-empty">
                    <div className="empty-icon">⭐</div>
                    <div className="empty-text">暂无收藏</div>
                    <div className="empty-hint">
                      点击工作流列表项中的☆按钮即可收藏
                    </div>
                  </div>
                ) : (
                  <div className="history-list">
                    {favoriteWorkflows.map((item) => (
                      <HistoryListItem
                        key={item.id}
                        item={item}
                        isDeleting={deletingItemId === item.id}
                        onLoad={loadHistoryWorkflow}
                        onDelete={deleteHistoryWorkflow}
                        onShowDeleteConfirm={showDeleteConfirm}
                        onCancelDelete={cancelDelete}
                        onToggleFavorite={toggleFavorite}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 项目下拉菜单 - 使用Portal渲染 */}
      <Portal>
        {(isProjectDropdownOpen || isProjectDropdownHiding) && (
          <div
            ref={projectDropdownRef}
            className={`dropdown_base overlay_base ${isProjectDropdownHiding ? 'hiding' : 'show'}`}
            style={{
              top: `${projectDropdownPosition.top}px`,
              left: `${projectDropdownPosition.left}px`,
              width: `${projectDropdownPosition.width}px`
            } as React.CSSProperties}
          >
            <div className="dropdown_list">
              {projects.length > 0 ? (
                projects.map(project => (
                  <div
                    key={project}
                    className={`dropdown_option ${project === selectedProject ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedProject(project);
                      setIsProjectDropdownHiding(true);
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
    </Portal>
  );
};

export default WorkflowManagerUI;
