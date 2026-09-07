import React, { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { runtimeClient } from '../../runtimeClient';
import {
  UserContext,
  type FilePathConfig,
  type User,
  type UserContextValue,
} from './userContextState';

import { DEFAULT_FILE_PATH_CONFIG } from '@zahnerflow/types';
import type { UserSettingsResponse } from '@zahnerflow/types';

interface UserProviderProps {
  children: ReactNode;
}

export const UserProvider: React.FC<UserProviderProps> = ({ children }) => {
  const [currentUser, setCurrentUserState] = useState<string>('');
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoadError, setUsersLoadError] = useState<string | null>(null);
  const [currentUserAvatar, setCurrentUserAvatarState] = useState<string>('');

  // 文件路径配置状态
  const [filePathConfig, setFilePathConfigState] = useState<FilePathConfig>(DEFAULT_FILE_PATH_CONFIG);

  // 每次用户切换使旧请求失效，避免慢响应覆盖新用户的配置。
  const configRequestRef = useRef(0);

  /**
   * 从后端加载用户的配置（使用统一的用户配置 API）
   */
  const loadUserPathConfig = useCallback(async (user: string) => {
    if (!user) return;

    const requestId = ++configRequestRef.current;
    try {
      // 使用新的统一用户配置 API
      const response = await runtimeClient.users.getSettings<UserSettingsResponse>(user);
      if (requestId !== configRequestRef.current) return;
      if (response?.success) {
        if (response.settings?.filePath) {
          setFilePathConfigState(response.settings.filePath);
        }
        if (response.settings?.cloud?.avatar) {
          setCurrentUserAvatarState(response.settings.cloud.avatar);
        } else {
          setCurrentUserAvatarState('');
        }
      }
    } catch (error) {
      if (requestId !== configRequestRef.current) return;
      console.warn(`[UserContext] 加载用户 "${user}" 的路径配置失败:`, error);
      // 失败时使用默认配置
      setFilePathConfigState(DEFAULT_FILE_PATH_CONFIG);
      setCurrentUserAvatarState('');
    }
  }, []);



  const loadUsers = useCallback(async () => {
    const selectionVersion = configRequestRef.current;
    setUsersLoadError(null);
    try {
      const response = await runtimeClient.users.list();
      if (!response || !Array.isArray(response.users)) throw new Error('用户列表响应格式无效');
      const userList = response.users.map(profile => profile.user);
      setUsers(response.users);
      if (selectionVersion !== configRequestRef.current) return;
      const savedUser = localStorage.getItem('currentUser');
      if (savedUser && userList.includes(savedUser)) {
        setCurrentUserState(savedUser);
        await loadUserPathConfig(savedUser);
      } else if (savedUser) {
        localStorage.removeItem('currentUser');
        setCurrentUserState('');
        setFilePathConfigState(DEFAULT_FILE_PATH_CONFIG);
        setCurrentUserAvatarState('');
      }
    } catch (error) {
      setUsers([]);
      setUsersLoadError(error instanceof Error ? error.message : '无法读取用户列表');
    }
  }, [loadUserPathConfig]);

  /**
   * 设置当前用户（同时加载该用户的路径配置）
   */
  const setCurrentUser = (user: string) => {
    // 如果用户没变，不重复操作
    if (user === currentUser) return;

    ++configRequestRef.current;
    setCurrentUserState(user);
    setFilePathConfigState(DEFAULT_FILE_PATH_CONFIG);
    setCurrentUserAvatarState('');
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
    const response = await runtimeClient.users.create(userData);

    if (response && response.success) {
      const newUser = response.user;
      if (!newUser) throw new Error('用户创建响应缺少档案');

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
        ++configRequestRef.current;
        setCurrentUserAvatarState('');
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
    void loadUsers();
  }, [loadUsers]);

  const value: UserContextValue = {
    currentUser,
    setCurrentUser,
    users,
    usersLoadError,
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
