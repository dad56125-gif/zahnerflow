import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { NotificationMessage } from '@zahnerflow/types';
import { runtimeSocket } from '../runtimeClient';

type StoredNotification = NotificationMessage & {
  read: boolean;
};

interface AppState {
  leftPanelOpen: boolean;
  notificationPanelOpen: boolean;
  theme: 'light' | 'dark';
  notifications: StoredNotification[];

  toggleLeftPanel: () => void;
  setLeftPanelOpen: (open: boolean) => void;
  toggleNotificationPanel: () => void;
  setNotificationPanelOpen: (open: boolean) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  addNotification: (notification: Omit<StoredNotification, 'id' | 'timestamp' | 'read'> & Partial<Pick<StoredNotification, 'id' | 'timestamp'>>) => void;
  markNotificationRead: (id: string) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
}

export const useAppStore = create<AppState>()(
  devtools(
    persist(
      (set) => ({
        leftPanelOpen: true,
        notificationPanelOpen: false,
        theme: 'light',
        notifications: [],

        toggleLeftPanel: () => set(state => ({ leftPanelOpen: !state.leftPanelOpen })),
        setLeftPanelOpen: (open) => set({ leftPanelOpen: open }),
        toggleNotificationPanel: () => set(state => ({ notificationPanelOpen: !state.notificationPanelOpen })),
        setNotificationPanelOpen: (open) => set({ notificationPanelOpen: open }),

        setTheme: (theme) => {
          set({ theme });
          if (typeof document !== 'undefined') {
            document.documentElement.setAttribute('data-theme', theme);
          }
        },

        addNotification: (notification) => {
          const newNotification = {
            ...notification,
            id: notification.id || `notification_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
            timestamp: notification.timestamp || new Date().toISOString(),
            read: false,
          } as StoredNotification;
          set(state => ({
            notifications: [newNotification, ...state.notifications],
            notificationPanelOpen: true,
          }));
        },

        markNotificationRead: (id) => {
          set(state => ({
            notifications: state.notifications.map(n => n.id === id ? { ...n, read: true } : n),
          }));
        },

        removeNotification: (id) => {
          set(state => ({ notifications: state.notifications.filter(n => n.id !== id) }));
        },

        clearNotifications: () => set({ notifications: [] }),
      }),
      {
        name: 'app-storage',
        partialize: (state) => ({ theme: state.theme, leftPanelOpen: state.leftPanelOpen }),
      }
    ),
    { name: 'app-store' }
  )
);

// 初始化 WebSocket 通知监听
if (typeof window !== 'undefined') {
  runtimeSocket.on<NotificationMessage>('notification', (data) => {
    useAppStore.getState().addNotification({
      id: data.id,
      type: data.type as StoredNotification['type'],
      title: data.title,
      message: data.message,
      timestamp: data.timestamp,
      details: data.details,
    });
  });
}
