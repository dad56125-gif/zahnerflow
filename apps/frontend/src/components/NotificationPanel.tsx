import React, { useState, useEffect } from 'react';
import { Portal } from './common/Portal';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: Date;
  source: string;
}

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NotificationPanel: React.FC<NotificationPanelProps> = ({ isOpen, onClose }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // 监听WebSocket通知
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handleNotification = (event: CustomEvent) => {
        const notification = event.detail;

        const formattedNotification: Notification = {
          id: notification.id,
          title: notification.title,
          message: notification.message,
          type: notification.type || 'info',
          timestamp: new Date(notification.timestamp),
          source: notification.source || 'system'
        };
        
        setNotifications(prev => [formattedNotification, ...prev]);
      };

      window.addEventListener('notification', handleNotification as EventListener);
      
      return () => {
        window.removeEventListener('notification', handleNotification as EventListener);
      };
    }
  }, [notifications]);

  const deleteNotification = (id: string) => {
    setNotifications(prev => prev.filter(notification => notification.id !== id));
  };

  const clearAllNotifications = () => {
    setNotifications([]);
  };

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'success': return '✅';
      case 'error': return '❌';
      case 'warning': return '⚠️';
      case 'info': return 'ℹ️';
      default: return '📢';
    }
  };

  const getNotificationColor = (type: Notification['type']) => {
    switch (type) {
      case 'success': return 'var(--color-success)';
      case 'error': return 'var(--color-error)';
      case 'warning': return 'var(--color-warning)';
      case 'info': return 'var(--color-info)';
      default: return 'var(--color-primary)';
    }
  };

  return (
    <Portal isOpen={isOpen} onClose={onClose} pointerEvents="none">
      {/* ✅ 遮罩层：覆盖视口 */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 9999 }}
      >
        {/* ✅ 内容区：阻止冒泡 */}
        <div
          className="overlay_base notification-panel"
          onClick={e => e.stopPropagation()}
          style={{ position: 'absolute', top: '50px', right: '20px' }}
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
                onClick={clearAllNotifications}
                title="清空所有通知"
              >
                🗑️
              </button>
              <button
                className="notification-action-btn"
                onClick={onClose}
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
                    className="notification-item"
                  >
                    <div className="notification-icon" style={{ color: getNotificationColor(notification.type) }}>
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="notification-content">
                      <div className="notification-title">{notification.title}</div>
                      <div className="notification-message">{notification.message}</div>
                      <div className="notification-time">
                        {notification.timestamp.toLocaleTimeString()}
                      </div>
                      <div className="notification-source">
                        来源: {notification.source}
                      </div>
                    </div>
                    <button
                      className="notification-delete-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteNotification(notification.id);
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