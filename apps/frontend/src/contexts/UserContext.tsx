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
  loadUsers: () => Promise<void>;
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
          id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          user: username,
          email: null,
          created_at: new Date().toISOString()
        };
      });
      setUsers(fullUsers);

      if (!currentUser && fullUsers.length > 0) {
        const savedUser = localStorage.getItem('currentUser');
        if (savedUser && fullUsers.find(u => u.user === savedUser)) {
          setCurrentUserState(savedUser);
        } else {
          setCurrentUserState(fullUsers[0].user);
        }
      }
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
        id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        user: userData.user,
        email: userData.email || null,
        created_at: new Date().toISOString()
      };

      setUsers(prev => [...prev, newUser]);

      if (!currentUser) {
        setCurrentUserState(newUser.user);
      }

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
        const remainingUsers = users.filter(u => u.user !== user);
        setCurrentUserState(remainingUsers.length > 0 ? remainingUsers[0].user : '');
      }
      return true;
    }
    return false;
  };

  // 初始化时加载用户和当前用户
  useEffect(() => {
    loadUsers();
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
      setCurrentUserState(savedUser);
    }
  }, []);

  const value: UserContextType = {
    currentUser,
    setCurrentUser,
    users,
    loadUsers,
    createUser,
    deleteUser
  };

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
};
