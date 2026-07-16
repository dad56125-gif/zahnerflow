import { createContext, useContext } from 'react';

export interface User {
  id: string;
  user: string;
  email: string | null;
  createdAt: string;
  avatar?: string;
}

export interface FilePathConfig {
  basePath: string;
  projectName: string;
  individualName: string;
}

export interface UserContextValue {
  currentUser: string;
  setCurrentUser: (user: string) => void;
  users: User[];
  createUser: (userData: { user: string; email?: string }) => Promise<User>;
  deleteUser: (user: string) => Promise<boolean>;
  filePathConfig: FilePathConfig;
  setFilePathConfig: (config: FilePathConfig, options?: { persist?: boolean }) => void;
  currentUserAvatar: string;
  setCurrentUserAvatar: (avatar: string) => void;
}

export const UserContext = createContext<UserContextValue | undefined>(undefined);

export const useUser = (): UserContextValue => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};
