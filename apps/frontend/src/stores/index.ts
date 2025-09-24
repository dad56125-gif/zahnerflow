import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { 
  Workflow, 
  Execution, 
  Device, 
  NodeStatus,
  ExecutionStatus 
} from '@zahnerflow/types';
import { workflowService, executionService, deviceService } from '@/services';
import { workflowWebSocketService } from '@/services/websocket.service';

// 工作流状态管理
interface WorkflowState {
  workflows: Workflow[];
  currentWorkflow: Workflow | null;
  isLoading: boolean;
  error: string | null;
  
  // 操作方法
  fetchWorkflows: () => Promise<void>;
  createWorkflow: (data: any) => Promise<void>;
  updateWorkflow: (id: string, data: any) => Promise<void>;
  deleteWorkflow: (id: string) => Promise<void>;
  setCurrentWorkflow: (workflow: Workflow | null) => void;
  clearError: () => void;
}

export const useWorkflowStore = create<WorkflowState>()(
  devtools(
    persist(
      (set, get) => ({
        workflows: [],
        currentWorkflow: null,
        isLoading: false,
        error: null,

        fetchWorkflows: async () => {
          set({ isLoading: true, error: null });
          try {
            const response = await workflowService.getWorkflows();
            set({ workflows: response.items, isLoading: false });
            } catch (error) {
            set({ error: '加载工作流列表失败', isLoading: false });
          }
        },

        createWorkflow: async (data) => {
          set({ isLoading: true, error: null });
          try {
            const workflow = await workflowService.createWorkflow(data);
            set(state => ({ 
              workflows: [...state.workflows, workflow], 
              isLoading: false 
            }));
            } catch (error) {
            set({ error: '创建工作流失败', isLoading: false });
            throw error;
          }
        },

        updateWorkflow: async (id, data) => {
          set({ isLoading: true, error: null });
          try {
            const workflow = await workflowService.updateWorkflow(id, data);
            set(state => ({
              workflows: state.workflows.map(w => w.id === id ? workflow : w),
              currentWorkflow: state.currentWorkflow?.id === id ? workflow : state.currentWorkflow,
              isLoading: false
            }));
          } catch (error) {
            set({ error: '更新工作流失败', isLoading: false });
            throw error;
          }
        },

        deleteWorkflow: async (id) => {
          set({ isLoading: true, error: null });
          try {
            await workflowService.deleteWorkflow(id);
            set(state => ({
              workflows: state.workflows.filter(w => w.id !== id),
              currentWorkflow: state.currentWorkflow?.id === id ? null : state.currentWorkflow,
              isLoading: false
            }));
          } catch (error) {
            set({ error: '删除工作流失败', isLoading: false });
            throw error;
          }
        },

        setCurrentWorkflow: (workflow) => {
          set({ currentWorkflow: workflow });
        },

        clearError: () => {
          set({ error: null });
        },
      }),
      {
        name: 'workflow-storage',
        partialize: (state) => ({ 
          workflows: state.workflows,
          currentWorkflow: state.currentWorkflow 
        }),
      }
    ),
    { name: 'workflow-store' }
  )
);

// 执行状态管理
interface ExecutionState {
  currentExecution: any;
  executionHistory: Execution[];
  isRunning: boolean;
  isPaused: boolean;
  progress: number;
  error: string | null;
  
  // 操作方法
  startExecution: (workflowId: string, params?: any) => Promise<void>;
  pauseExecution: () => Promise<void>;
  resumeExecution: () => Promise<void>;
  stopExecution: () => Promise<void>;
  fetchExecutionHistory: () => Promise<void>;
  updateExecutionStatus: (status: any) => void;
  clearCurrentExecution: () => void;
  clearError: () => void;
}

export const useExecutionStore = create<ExecutionState>()(
  devtools(
    (set, get) => ({
      currentExecution: null,
      executionHistory: [],
      isRunning: false,
      isPaused: false,
      progress: 0,
      error: null,

      startExecution: async (workflowId: string, params?: any) => {
        set({ isRunning: true, isPaused: false, error: null });
        try {
          
          // 执行工作流
          const result = await executionService.executeWorkflow(workflowId, params);
          
          set({ 
            currentExecution: result,
            progress: 0
          });

          // 监听WebSocket更新
          const handleExecutionUpdate = (data: any) => {
            if (data.executionId === result.executionId) {
              get().updateExecutionStatus(data);
            }
          };

          workflowWebSocketService.onExecutionUpdate(handleExecutionUpdate);

          // 开始轮询状态（作为WebSocket的备份）
          get().pollExecutionStatus(result.executionId);

        } catch (error) {
          set({ 
            error: '启动执行失败', 
            isRunning: false, 
            isPaused: false 
          });
          throw error;
        }
      },

      pauseExecution: async () => {
        const { currentExecution } = get();
        if (!currentExecution) return;

        try {
          await executionService.pauseExecution(currentExecution.executionId);
          set({ isPaused: true });
        } catch (error) {
          set({ error: '暂停执行失败' });
        }
      },

      resumeExecution: async () => {
        const { currentExecution } = get();
        if (!currentExecution) return;

        try {
          await executionService.resumeExecution(currentExecution.executionId);
          set({ isPaused: false });
        } catch (error) {
          set({ error: '恢复执行失败' });
        }
      },

      stopExecution: async () => {
        const { currentExecution } = get();
        if (!currentExecution) return;

        try {
          await executionService.stopExecution(currentExecution.executionId);
          set({ 
            isRunning: false, 
            isPaused: false,
            progress: 0 
          });
          
          // WebSocket订阅会通过workflowWebSocketService自动管理
          
        } catch (error) {
          set({ error: '停止执行失败' });
        }
      },

      pollExecutionStatus: (executionId: string) => {
        const poll = async () => {
          const { currentExecution, isRunning } = get();
          
          // 如果不再运行，停止轮询
          if (!isRunning || !currentExecution) {
            return;
          }

          try {
            const status = await executionService.getExecutionStatus(executionId);
            get().updateExecutionStatus(status);
            
            // 如果执行完成或失败，停止轮询
            if (status.status === 'completed' || status.status === 'failed') {
              set({ isRunning: false, isPaused: false });
              return;
            }
            
            // 继续轮询
            setTimeout(poll, 1000);
          } catch (error) {
            // 网络错误时继续轮询
            setTimeout(poll, 2000);
          }
        };
        
        poll();
      },

      updateExecutionStatus: (status: any) => {
        
        set({ 
          currentExecution: status,
          progress: status.progress || 0,
          isRunning: status.status === 'running',
          isPaused: status.status === 'paused'
        });

        // 如果执行完成或失败，更新状态
        if (status.status === 'completed' || status.status === 'failed') {
          set({ 
            isRunning: false, 
            isPaused: false 
          });
          
          // 发送通知（通过后端API发送，而不是直接发送WebSocket消息）
        }
      },

      fetchExecutionHistory: async () => {
        try {
          const response = await executionService.getExecutionHistory({ limit: 50 });
          set({ executionHistory: response.items });
        } catch (error) {
        }
      },

      clearCurrentExecution: () => {
        // WebSocket订阅会通过workflowWebSocketService自动管理
        set({ 
          currentExecution: null,
          isRunning: false,
          isPaused: false,
          progress: 0,
          error: null
        });
      },

      clearError: () => {
        set({ error: null });
      },
    }),
    { name: 'execution-store' }
  )
);

// 设备状态管理
interface DeviceState {
  devices: Device[];
  deviceStatuses: Record<string, any>;
  isLoading: boolean;
  error: string | null;
  
  // 操作方法
  fetchDevices: () => Promise<void>;
  connectDevice: (type: string, config?: any) => Promise<void>;
  disconnectDevice: (type: string) => Promise<void>;
  updateDeviceStatus: (deviceId: string, status: any) => void;
  clearError: () => void;
}

export const useDeviceStore = create<DeviceState>()(
  devtools(
    (set, get) => ({
      devices: [],
      deviceStatuses: {},
      isLoading: false,
      error: null,

      fetchDevices: async () => {
        set({ isLoading: true, error: null });
        try {
          const devices = await deviceService.getDevices();
          set({ devices, isLoading: false });
          console.log('📱 设备列表加载成功:', devices.length, '个');
          
          // 获取每个设备的状态
          for (const device of devices) {
            try {
              const status = await deviceService.getDeviceStatus(device.type);
              set(state => ({
                deviceStatuses: {
                  ...state.deviceStatuses,
                  [device.id]: status
                }
              }));
            } catch (error) {
              console.warn(`⚠️ 获取设备 ${device.id} 状态失败:`, error);
            }
          }
        } catch (error) {
          set({ error: '加载设备列表失败', isLoading: false });
        }
      },

      connectDevice: async (type: string, config?: any) => {
        set({ isLoading: true, error: null });
        try {
          const result = await deviceService.connectDevice(type, config);
          
          // 更新设备状态
          set(state => ({
            deviceStatuses: {
              ...state.deviceStatuses,
              [result.deviceId]: result
            }
          }));
          
          set({ isLoading: false });
        } catch (error) {
          set({ error: '连接设备失败', isLoading: false });
          throw error;
        }
      },

      disconnectDevice: async (type: string) => {
        set({ isLoading: true, error: null });
        try {
          await deviceService.disconnectDevice(type);
          
          // 更新设备状态
          set(state => {
            const newStatuses = { ...state.deviceStatuses };
            Object.keys(newStatuses).forEach(deviceId => {
              if (deviceId.includes(type)) {
                delete newStatuses[deviceId];
              }
            });
            return { deviceStatuses: newStatuses };
          });
          
          set({ isLoading: false });
        } catch (error) {
          set({ error: '断开设备失败', isLoading: false });
          throw error;
        }
      },

      updateDeviceStatus: (deviceId: string, status: any) => {
        console.log('📱 更新设备状态:', deviceId, status);
        set(state => ({
          deviceStatuses: {
            ...state.deviceStatuses,
            [deviceId]: status
          }
        }));
      },

      clearError: () => {
        set({ error: null });
      },
    }),
    { name: 'device-store' }
  )
);

// 全局应用状态
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
  
  // 操作方法
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
      (set, get) => ({
        sidebarOpen: true,
        notificationPanelOpen: false,
        theme: 'light',
        notifications: [],

        toggleSidebar: () => {
          set(state => ({ sidebarOpen: !state.sidebarOpen }));
        },

        setSidebarOpen: (open) => {
          set({ sidebarOpen: open });
        },

        toggleNotificationPanel: () => {
          set(state => ({ notificationPanelOpen: !state.notificationPanelOpen }));
        },

        setNotificationPanelOpen: (open) => {
          set({ notificationPanelOpen: open });
        },

        setTheme: (theme) => {
          set({ theme });
          // 应用主题到document
          document.documentElement.setAttribute('data-theme', theme);
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
          
          console.log('🔔 新通知:', newNotification);
        },

        markNotificationRead: (id) => {
          set(state => ({
            notifications: state.notifications.map(n => 
              n.id === id ? { ...n, read: true } : n
            ),
          }));
        },

        removeNotification: (id) => {
          set(state => ({
            notifications: state.notifications.filter(n => n.id !== id),
          }));
        },

        clearNotifications: () => {
          set({ notifications: [] });
        },
      }),
      {
        name: 'app-storage',
        partialize: (state) => ({ 
          theme: state.theme,
          sidebarOpen: state.sidebarOpen,
        }),
      }
    ),
    { name: 'app-store' }
  )
);

// 监听WebSocket通知
if (typeof window !== 'undefined') {
  workflowWebSocketService.onNotification((data) => {
    useAppStore.getState().addNotification({
      type: data.type,
      title: data.title,
      message: data.message,
    });
  });
}