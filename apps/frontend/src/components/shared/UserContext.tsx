import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { runtimeClient } from '../../runtimeClient';

interface User {
  id: string;
  user: string;
  email: string | null;
  createdAt: string;
}

export interface FilePathConfig {
  basePath: string;
  projectName: string;
  individualName: string;
}

interface UserContextType {
  currentUser: string;
  setCurrentUser: (user: string) => void;
  users: User[];
  createUser: (userData: { user: string; email?: string }) => Promise<User>;
  deleteUser: (user: string) => Promise<boolean>;
  filePathConfig: FilePathConfig;
  setFilePathConfig: (config: FilePathConfig) => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const useUser = () => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};

interface UserProviderProps {
  children: ReactNode;
}

export const UserProvider: React.FC<UserProviderProps> = ({ children }) => {
  const [currentUser, setCurrentUserState] = useState<string>('');
  const [users, setUsers] = useState<User[]>([]);

  // 文件路径配置状态
  const [filePathConfig, setFilePathConfigState] = useState<FilePathConfig>({
    basePath: 'C:\\data\\archive',
    projectName: '',
    individualName: ''
  });

  // 标记是否正在加载用户配置，防止重复请求
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);

  const loadUsers = async () => {
    const response = await runtimeClient.users.list();
    if (response?.users) {
      const userList = response.users;
      const fullUsers: User[] = userList.map(username => {
        return {
          id: `user_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
          user: username,
          email: null,
          createdAt: new Date().toISOString()
        };
      });
      setUsers(fullUsers);
    }
  };

  /**
   * 从后端加载用户的配置（使用统一的用户配置 API）
   */
  const loadUserPathConfig = async (user: string) => {
    if (!user || isLoadingConfig) return;

    setIsLoadingConfig(true);
    try {
      // 使用新的统一用户配置 API
      const response: any = await runtimeClient.users.getSettings(user);
      if (response?.success && response?.settings?.filePath) {
        setFilePathConfigState({
          basePath: response.settings.filePath.basePath || 'C:\\data\\archive',
          projectName: response.settings.filePath.projectName || '',
          individualName: response.settings.filePath.individualName || ''
        });
      }
    } catch (error) {
      console.warn(`[UserContext] 加载用户 "${user}" 的路径配置失败:`, error);
      // 失败时使用默认配置
      setFilePathConfigState({
        basePath: 'C:\\data\\archive',
        projectName: '',
        individualName: ''
      });
    } finally {
      setIsLoadingConfig(false);
    }
  };

  /**
   * 设置当前用户（同时加载该用户的路径配置）
   */
  const setCurrentUser = (user: string) => {
    // 如果用户没变，不重复操作
    if (user === currentUser) return;

    setCurrentUserState(user);
    localStorage.setItem('currentUser', user);

    // 加载该用户的路径配置
    if (user) {
      loadUserPathConfig(user);
    } else {
      // 用户被清空时，重置路径配置
      setFilePathConfigState({
        basePath: 'C:\\data\\archive',
        projectName: '',
        individualName: ''
      });
    }
  };

  /**
   * 设置文件路径配置（同时保存到后端）
   */
  const setFilePathConfig = async (config: FilePathConfig) => {
    setFilePathConfigState(config);

    // 使用新的统一用户配置 API 保存
    if (currentUser) {
      try {
        await runtimeClient.users.saveSettingsSection(currentUser, 'filePath', config);
      } catch (error) {
        console.warn(`[UserContext] 保存用户路径配置失败:`, error);
      }
    }
  };

  const createUser = async (userData: { user: string; email?: string }): Promise<User> => {
    const response = await runtimeClient.users.create<{ success: boolean; message?: string }>(userData);

    if (response && response.success) {
      const newUser: User = {
        id: `user_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
        user: userData.user,
        email: userData.email || null,
        createdAt: new Date().toISOString()
      };

      setUsers(prev => [...prev, newUser]);

      // 创建用户后不自动选择，让用户手动选择

      return newUser;
    } else {
      throw new Error((response && response.message) || 'Failed to create user');
    }
  };

  const deleteUser = async (user: string): Promise<boolean> => {
    const response = await runtimeClient.users.delete(user);

    if (response.success) {
      setUsers(prev => prev.filter(u => u.user !== user));
      if (currentUser === user) {
        // 删除当前用户后清空选择，让用户手动选择
        setCurrentUserState('');
        localStorage.removeItem('currentUser');
        // 重置路径配置
        setFilePathConfigState({
          basePath: 'C:\\data\\archive',
          projectName: '',
          individualName: ''
        });
      }
      return true;
    }
    return false;
  };

  // 初始化时加载用户列表
  useEffect(() => {
    loadUsers();

    // 如果 localStorage 中有保存的用户，加载其配置
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
      setCurrentUserState(savedUser);
      loadUserPathConfig(savedUser);
    }
  }, []);

  const value: UserContextType = {
    currentUser,
    setCurrentUser,
    users,
    createUser,
    deleteUser,
    filePathConfig,
    setFilePathConfig
  };

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
};
