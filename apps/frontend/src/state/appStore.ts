import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { workflowWebSocketService } from '../workflow/websocket.service';

interface AppState {
  sidebarOpen: boolean;
  notificationPanelOpen: boolean;
  theme: 'light' | 'dark';
  notifications: Array<{
    id: string;
    type: 'info' | 'success' | 'warning' | 'error';
    title: string;
    message: string;
    timestamp: string;
    read: boolean;
  }>;

  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleNotificationPanel: () => void;
  setNotificationPanelOpen: (open: boolean) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  addNotification: (notification: Omit<AppState['notifications'][0], 'id' | 'timestamp' | 'read'>) => void;
  markNotificationRead: (id: string) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
}

export const useAppStore = create<AppState>()(
  devtools(
    persist(
      (set) => ({
        sidebarOpen: true,
        notificationPanelOpen: false,
        theme: 'light',
        notifications: [],

        toggleSidebar: () => set(state => ({ sidebarOpen: !state.sidebarOpen })),
        setSidebarOpen: (open) => set({ sidebarOpen: open }),
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
            id: `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString(),
            read: false,
          };
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
        partialize: (state) => ({ theme: state.theme, sidebarOpen: state.sidebarOpen }),
      }
    ),
    { name: 'app-store' }
  )
);

// 初始化 WebSocket 通知监听
if (typeof window !== 'undefined') {
  workflowWebSocketService.onNotification((data) => {
    useAppStore.getState().addNotification({
      type: data.type,
      title: data.title,
      message: data.message,
    });
  });
}