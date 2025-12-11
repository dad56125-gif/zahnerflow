import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Portal } from './Portal';
import { useAppStore } from '../state/appStore';

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NotificationPanel: React.FC<NotificationPanelProps> = ({ isOpen, onClose }) => {
  // ✅ 直接从 appStore 订阅通知数据
  const notifications = useAppStore(state => state.notifications);
  const removeNotification = useAppStore(state => state.removeNotification);
  const clearNotifications = useAppStore(state => state.clearNotifications);

  const [isHiding, setIsHiding] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // 开始关闭动画
  const startClose = useCallback(() => {
    setIsHiding(true);
  }, []);

  // 处理关闭动画结束
  useEffect(() => {
    if (!isHiding) return;

    const panel = panelRef.current;
    if (!panel) return;

    let animationCompleted = false;
    const fallbackTimer = setTimeout(() => {
      if (!animationCompleted) {
        setIsHiding(false);
        onClose();
      }
    }, 300);

    const handleAnimationEnd = (e: AnimationEvent) => {
      if (e.animationName === 'dropdownOut') {
        animationCompleted = true;
        clearTimeout(fallbackTimer);
        setIsHiding(false);
        onClose();
      }
    };

    const timer = setTimeout(() => {
      panel.addEventListener('animationend', handleAnimationEnd);
    }, 0);

    return () => {
      clearTimeout(timer);
      clearTimeout(fallbackTimer);
      panel.removeEventListener('animationend', handleAnimationEnd);
    };
  }, [isHiding, onClose]);

  const getNotificationIcon = (type: 'info' | 'success' | 'warning' | 'error') => {
    switch (type) {
      case 'success': return '✅';
      case 'error': return '❌';
      case 'warning': return '⚠️';
      case 'info': return 'ℹ️';
      default: return '📢';
    }
  };

  const getNotificationColor = (type: 'info' | 'success' | 'warning' | 'error') => {
    switch (type) {
      case 'success': return 'var(--color-success)';
      case 'error': return 'var(--color-error)';
      case 'warning': return 'var(--color-warning)';
      case 'info': return 'var(--color-info)';
      default: return 'var(--color-primary)';
    }
  };

  // 格式化时间戳 (appStore 存储的是 ISO string)
  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  return (
    <Portal isOpen={isOpen || isHiding} onClose={startClose} pointerEvents="none">
      {/* ✅ 遮罩层：覆盖视口 */}
      <div
        onClick={startClose}
        style={{ position: 'fixed', inset: 0, zIndex: 9999 }}
      >
        {/* ✅ 内容区：阻止冒泡 */}
        <div
          ref={panelRef}
          className={`overlay_base notification-panel ${isHiding ? 'hiding' : 'show'}`}
          onClick={e => e.stopPropagation()}
        >
          <div className="notification-panel-header">
            <div className="notification-panel-title">
              <span>通知中心</span>
              {notifications.length > 0 && (
                <span className="notification-badge">{notifications.length}</span>
              )}
            </div>
            <div className="notification-panel-actions">
              <button
                className="notification-action-btn"
                onClick={clearNotifications}
                title="清空所有通知"
              >
                🗑️
              </button>
              <button
                className="notification-action-btn"
                onClick={startClose}
                title="关闭"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="notification-panel-content">
            {notifications.length === 0 ? (
              <div className="notification-empty">
                <div className="notification-empty-icon">📭</div>
                <div className="notification-empty-text">暂无通知</div>
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`notification-item type-${notification.type} ${notification.read ? '' : 'unread'}`}
                >
                  <div className="notification-icon" style={{ color: getNotificationColor(notification.type) }}>
                    {getNotificationIcon(notification.type)}
                  </div>
                  <div className="notification-content">
                    <div className="notification-title">{notification.title}</div>
                    <div className="notification-message">{notification.message}</div>
                    <div className="notification-time">
                      {formatTimestamp(notification.timestamp)}
                    </div>
                  </div>
                  <button
                    className="notification-delete-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeNotification(notification.id);
                    }}
                    title="删除"
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
};