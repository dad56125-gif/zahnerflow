/** 自动生成，来源 apps/shared/contracts/settings.py；勿手动修改。 */

export interface FilePathConfig {
  basePath: string;
  projectName: string;
  individualName: string;
}

export interface NotificationSettings {
  email: string;
  enabled: boolean;
  onComplete: boolean;
  onError: boolean;
  onWarning: boolean;
  smtpServer: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassword: string;
  smtpSecure: boolean;
}

export interface CloudSettings {
  provider: string;
  syncEnabled: boolean;
  endpoint: string;
  bucket: string;
  avatar: string;
}

export interface UserSettings {
  filePath: FilePathConfig;
  notification: NotificationSettings;
  cloud: CloudSettings;
}

export interface UserProfile {
  id: string;
  user: string;
  email: string | null;
  createdAt: string;
  avatar: string;
}

export interface UserListResponse {
  users: UserProfile[];
}

export interface UserSettingsResponse {
  success: boolean;
  settings: UserSettings;
}

export interface CreateUserResponse {
  success: boolean;
  message: string;
  user: UserProfile | null;
}

export const DEFAULT_FILE_PATH_CONFIG: FilePathConfig = {"basePath": "C:\\data\\archive", "projectName": "", "individualName": ""};
