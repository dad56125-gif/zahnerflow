import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '../services/api';

interface User {
  id: string;
  user: string;
  email: string | null;
  created_at: string;
}

interface UserContextType {
  currentUser: string;
  setCurrentUser: (user: string) => void;
  users: User[];
  createUser: (userData: { user: string; email?: string }) => Promise<User>;
  deleteUser: (user: string) => Promise<boolean>;
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
    deleteUser
  };

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
};
