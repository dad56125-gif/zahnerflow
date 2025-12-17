import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '../shared/api';

interface User {
  id: string;
  user: string;
  email: string | null;
  created_at: string;
}

export interface FilePathConfig {
  base_path: string;
  project_name: string;
  individual_name: string;
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
    base_path: 'C:\\data\\archive',
    project_name: '',
    individual_name: ''
  });

  // 标记是否正在加载用户配置，防止重复请求
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);

  const loadUsers = async () => {
    const response = await api.get('/users');
    if (response && (response as any).users) {
      const userList = (response as any).users as string[];
      const fullUsers: User[] = userList.map(username => {
        return {
          id: `user_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
          user: username,
          email: null,
          created_at: new Date().toISOString()
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
      const response: any = await api.get(`/users/${encodeURIComponent(user)}/settings`);
      if (response?.success && response?.settings?.file_path) {
        setFilePathConfigState({
          base_path: response.settings.file_path.base_path || 'C:\\data\\archive',
          project_name: response.settings.file_path.project_name || '',
          individual_name: response.settings.file_path.individual_name || ''
        });
        console.log(`[UserContext] 已加载用户 "${user}" 的路径配置:`, response.settings.file_path);
      }
    } catch (error) {
      console.warn(`[UserContext] 加载用户 "${user}" 的路径配置失败:`, error);
      // 失败时使用默认配置
      setFilePathConfigState({
        base_path: 'C:\\data\\archive',
        project_name: '',
        individual_name: ''
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
        base_path: 'C:\\data\\archive',
        project_name: '',
        individual_name: ''
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
        await api.put(`/users/${encodeURIComponent(currentUser)}/settings/file_path`, config);
        console.log(`[UserContext] 已保存用户 "${currentUser}" 的路径配置`);
      } catch (error) {
        console.warn(`[UserContext] 保存用户路径配置失败:`, error);
      }
    }
  };

  const createUser = async (userData: { user: string; email?: string }): Promise<User> => {
    const response = await api.post('/users', userData);

    if (response && response.success) {
      const newUser: User = {
        id: `user_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
        user: userData.user,
        email: userData.email || null,
        created_at: new Date().toISOString()
      };

      setUsers(prev => [...prev, newUser]);

      // 创建用户后不自动选择，让用户手动选择

      return newUser;
    } else {
      throw new Error((response && response.message) || 'Failed to create user');
    }
  };

  const deleteUser = async (user: string): Promise<boolean> => {
    const response = await api.delete(`/users/${user}`);

    if (response.success) {
      setUsers(prev => prev.filter(u => u.user !== user));
      if (currentUser === user) {
        // 删除当前用户后清空选择，让用户手动选择
        setCurrentUserState('');
        localStorage.removeItem('currentUser');
        // 重置路径配置
        setFilePathConfigState({
          base_path: 'C:\\data\\archive',
          project_name: '',
          individual_name: ''
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

