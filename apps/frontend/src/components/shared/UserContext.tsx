import React, { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { runtimeClient } from '../../runtimeClient';
import {
  UserContext,
  type FilePathConfig,
  type User,
  type UserContextValue,
} from './userContextState';

const DEFAULT_FILE_PATH_CONFIG: FilePathConfig = {
  basePath: 'C:\\data\\archive',
  projectName: '',
  individualName: ''
};

interface UserSettingsResponse {
  success: boolean;
  settings?: {
    filePath?: Partial<FilePathConfig>;
    cloud?: { avatar?: string };
  };
}

interface UserProviderProps {
  children: ReactNode;
}

export const UserProvider: React.FC<UserProviderProps> = ({ children }) => {
  const [currentUser, setCurrentUserState] = useState<string>('');
  const [users, setUsers] = useState<User[]>([]);
  const [currentUserAvatar, setCurrentUserAvatarState] = useState<string>('');

  // 文件路径配置状态
  const [filePathConfig, setFilePathConfigState] = useState<FilePathConfig>(DEFAULT_FILE_PATH_CONFIG);

  // 标记是否正在加载用户配置，防止重复请求
  const isLoadingConfigRef = useRef(false);

  const loadUsers = useCallback(async () => {
    const response = await runtimeClient.users.list();
    if (response?.users) {
      const userList = response.users;
      
      // 并行请求每个用户的 Settings 配置，填充头像数据
      const fullUsersPromises = userList.map(async (username) => {
        let avatar = '';
        try {
          const settingsRes = await runtimeClient.users.getSettings<UserSettingsResponse>(username);
          if (settingsRes?.success && settingsRes.settings?.cloud?.avatar) {
            avatar = settingsRes.settings.cloud.avatar;
          }
        } catch (err) {
          console.warn(`[UserContext] 预加载用户 "${username}" 的头像配置失败:`, err);
        }
        
        return {
          id: `user_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
          user: username,
          email: null,
          createdAt: new Date().toISOString(),
          avatar
        };
      });

      const fullUsers = await Promise.all(fullUsersPromises);
      setUsers(fullUsers);
    }
  }, []);

  /**
   * 从后端加载用户的配置（使用统一的用户配置 API）
   */
  const loadUserPathConfig = useCallback(async (user: string) => {
    if (!user || isLoadingConfigRef.current) return;

    isLoadingConfigRef.current = true;
    try {
      // 使用新的统一用户配置 API
      const response = await runtimeClient.users.getSettings<UserSettingsResponse>(user);
      if (response?.success) {
        if (response.settings?.filePath) {
          setFilePathConfigState({
            basePath: response.settings.filePath.basePath || 'C:\\data\\archive',
            projectName: response.settings.filePath.projectName || '',
            individualName: response.settings.filePath.individualName || ''
          });
        }
        if (response.settings?.cloud?.avatar) {
          setCurrentUserAvatarState(response.settings.cloud.avatar);
        } else {
          setCurrentUserAvatarState('');
        }
      }
    } catch (error) {
      console.warn(`[UserContext] 加载用户 "${user}" 的路径配置失败:`, error);
      // 失败时使用默认配置
      setFilePathConfigState(DEFAULT_FILE_PATH_CONFIG);
      setCurrentUserAvatarState('');
    } finally {
      isLoadingConfigRef.current = false;
    }
  }, []);

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
      setFilePathConfigState(DEFAULT_FILE_PATH_CONFIG);
      setCurrentUserAvatarState('');
    }
  };

  /**
   * 设置文件路径配置（同时保存到后端）
   */
  const setFilePathConfig = useCallback(async (config: FilePathConfig, options: { persist?: boolean } = {}) => {
    setFilePathConfigState(config);

    // 使用新的统一用户配置 API 保存
    if (currentUser && options.persist !== false) {
      try {
        await runtimeClient.users.saveSettingsSection(currentUser, 'filePath', config);
      } catch (error) {
        console.warn(`[UserContext] 保存用户路径配置失败:`, error);
      }
    }
  }, [currentUser]);

  // 设置并联动同步当前用户的头像
  const setCurrentUserAvatar = useCallback((avatar: string) => {
    setCurrentUserAvatarState(avatar);
    setUsers(prev => prev.map(u => {
      if (u.user === currentUser) {
        return { ...u, avatar };
      }
      return u;
    }));
  }, [currentUser]);

  const createUser = async (userData: { user: string; email?: string }): Promise<User> => {
    const response = await runtimeClient.users.create<{ success: boolean; message?: string }>(userData);

    if (response && response.success) {
      const newUser: User = {
        id: `user_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
        user: userData.user,
        email: userData.email || null,
        createdAt: new Date().toISOString(),
        avatar: ''
      };

      setUsers(prev => [...prev, newUser]);

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
        setFilePathConfigState(DEFAULT_FILE_PATH_CONFIG);
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
  }, [loadUserPathConfig, loadUsers]);

  const value: UserContextValue = {
    currentUser,
    setCurrentUser,
    users,
    createUser,
    deleteUser,
    filePathConfig,
    setFilePathConfig,
    currentUserAvatar,
    setCurrentUserAvatar
  };

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
};
