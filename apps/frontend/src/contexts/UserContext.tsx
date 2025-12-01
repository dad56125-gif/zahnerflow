import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '../services/api';

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

  // 文件路径配置状态，从sessionStorage初始化
  const [filePathConfig, setFilePathConfigState] = useState<FilePathConfig>(() => {
    try {
      const saved = sessionStorage.getItem('filePathConfig');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (error) {
      console.warn('Failed to load filePathConfig from sessionStorage:', error);
    }
    // 默认配置
    return {
      base_path: 'C:\\data\\archive',
      project_name: '',
      individual_name: ''
    };
  });

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

  const setCurrentUser = (user: string) => {
    setCurrentUserState(user);
    // 可以在这里添加持久化逻辑，比如保存到localStorage
    localStorage.setItem('currentUser', user);
  };

  const setFilePathConfig = (config: FilePathConfig) => {
    setFilePathConfigState(config);
    // 保存到sessionStorage，实现会话期间持久化
    try {
      sessionStorage.setItem('filePathConfig', JSON.stringify(config));
    } catch (error) {
      console.warn('Failed to save filePathConfig to sessionStorage:', error);
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
      }
      return true;
    }
    return false;
  };

  // 初始化时只加载用户列表，不选择任何用户
  useEffect(() => {
    loadUsers();
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
