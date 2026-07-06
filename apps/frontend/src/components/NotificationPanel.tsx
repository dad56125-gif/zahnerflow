import React from 'react';
import { ModalLayer } from './shared/OverlayLayer';
import { useAppStore } from '../state/appStore';
import { UiIconSvg } from './shared/UiIconSvg';
import type { UiIconName } from './shared/uiIcons';

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NotificationPanel: React.FC<NotificationPanelProps> = ({ isOpen, onClose }) => {
  // ✅ 直接从 appStore 订阅通知数据
  const notifications = useAppStore(state => state.notifications);
  const removeNotification = useAppStore(state => state.removeNotification);
  const clearNotifications = useAppStore(state => state.clearNotifications);

  const getNotificationIcon = (type: string): UiIconName => {
    switch (type) {
      case 'success': return 'check';
      case 'error': return 'error';
      case 'warning': return 'warning';
      case 'info': return 'info';
      default: return 'megaphone';
    }
  };

  const getNotificationColor = (type: string) => {
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

  const formatDetails = (details: unknown) => {
    if (details == null) {
      return null;
    }

    return typeof details === 'string' ? details : JSON.stringify(details, null, 2);
  };

  return (
    <ModalLayer
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      id="notification-panel-overlay"
      blur={false}
    >
      {({ state, close }) => {
        const isHiding = state === 'closing';
        return (
        <div
          className={`overlay-base notification ${isHiding ? 'is-hiding' : 'is-visible'}`}
        >
          <div className="notification__header">
            <div className="notification__title">
              <span>通知中心</span>
              {notifications.length > 0 && (
                <span className="notification__badge">{notifications.length}</span>
              )}
            </div>
            <div className="notification__actions">
              <button
                className="btn btn--sm btn--ghost btn--icon btn--rounded notification__action-btn"
                onClick={clearNotifications}
                title="清空所有通知"
              >
                <UiIconSvg name="trash" />
              </button>
              <button
                className="btn btn--sm btn--ghost btn--icon btn--rounded notification__action-btn"
                onClick={close}
                title="关闭"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="notification__content">
            {notifications.length === 0 ? (
              <div className="notification__empty">
                <div className="notification__empty-icon"><UiIconSvg name="inbox" /></div>
                <div className="notification__empty-text">暂无通知</div>
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`notification__item notification__item--${notification.type} ${notification.read ? '' : 'is-unread'}`}
                >
                  <div className="notification__icon" style={{ color: getNotificationColor(notification.type) }}>
                    <UiIconSvg name={getNotificationIcon(notification.type)} />
                  </div>
                    <div className="notification__body">
                      <div className="notification__item-title">{notification.title}</div>
                      <div className="notification__message">{notification.message}</div>
                      {notification.details != null && (
                        <pre className="notification__details">{formatDetails(notification.details)}</pre>
                      )}
                      <div className="notification__time">
                        {formatTimestamp(notification.timestamp)}
                      </div>
                  </div>
                  <button
                    className="btn btn--xs btn--ghost btn--icon btn--rounded notification__delete-btn"
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
        );
      }}
    </ModalLayer>
  );
};
