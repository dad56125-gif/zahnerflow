import React from 'react';
import { ModalLayer } from './shared/OverlayLayer';
import { useAppStore } from '../state/appStore';
import { UiIconSvg } from './shared/UiIconSvg';
import type { UiIconName } from './shared/uiIcons';
import { DiagnosticExportButton } from './diagnostics/DiagnosticExportButton';

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

  const temperatureFacts = (details: Record<string, unknown>) => {
    const parameters = details.parameters && typeof details.parameters === 'object'
      ? details.parameters as Record<string, unknown> : {};
    const facts: string[] = [];
    if (typeof parameters.targetTemperature === 'number' && Number.isFinite(parameters.targetTemperature)) facts.push(`目标 ${parameters.targetTemperature} °C`);
    if (typeof details.pv === 'number' && Number.isFinite(details.pv)) facts.push(`最近温度 ${details.pv} °C`);
    if (typeof details.elapsedSeconds === 'number' && Number.isFinite(details.elapsedSeconds)) facts.push(`已等待 ${Math.round(details.elapsedSeconds)} 秒`);
    return facts.join(' · ');
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
            <div className="notification__diagnostics"><DiagnosticExportButton label="导出当前诊断日志" /></div>
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
                      <div className={`notification__message${notification.failure ? ' notification__message--failure' : ''}`}>{notification.message}</div>
                      {notification.failure ? (
                        <div className="notification__failure">
                          <div className="notification__command-fact">
                            {({ not_sent: '启动命令尚未发送', partial: '部分参数已写入，启动命令尚未确认', acknowledged: '启动命令已收到设备回执', unknown: '启动命令结果未知，炉子可能已运行' } as const)[notification.failure.commandOutcome]}
                          </div>
                          {temperatureFacts(notification.failure.details) && <div className="notification__suggestion">{temperatureFacts(notification.failure.details)}</div>}
                          <div className="notification__suggestion">{notification.failure.suggestion}</div>
                          <DiagnosticExportButton executionId={notification.executionId} />
                          <details className="notification__technical">
                            <summary>查看技术详情</summary>
                            <pre className="notification__details">{formatDetails({ code: notification.failure.code, stage: notification.failure.stage, originalError: notification.failure.originalError, ...notification.failure.details })}</pre>
                          </details>
                        </div>
                      ) : notification.details != null && (
                        <details className="notification__technical">
                          <summary>查看详情</summary>
                          <pre className="notification__details">{formatDetails(notification.details)}</pre>
                        </details>
                      )}
                      {!notification.failure && notification.type === 'error' && notification.executionId && <DiagnosticExportButton executionId={notification.executionId} />}
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
