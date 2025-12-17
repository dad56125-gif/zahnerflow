import { Injectable, OnModuleInit } from '@nestjs/common';
import { DbService } from '../../db/db.service';

/**
 * 用户设置接口
 */
export interface UserSettings {
    file_path: {
        base_path: string;
        project_name: string;
        individual_name: string;
    };
    notification: {
        email: string;
        enabled: boolean;
        on_complete: boolean;
        on_error: boolean;
        // SMTP 配置
        smtp_server: string;
        smtp_port: number;
        smtp_user: string;
        smtp_password: string;
        smtp_secure: boolean;  // 是否使用 SSL/TLS
    };
    cloud: {
        provider: string;  // 'none' | 'aliyun' | 'aws' | 'azure'
        sync_enabled: boolean;
        endpoint?: string;
        bucket?: string;
    };
}

/**
 * 默认用户配置
 */
const DEFAULT_SETTINGS: UserSettings = {
    file_path: {
        base_path: 'C:\\data\\archive',
        project_name: '',
        individual_name: ''
    },
    notification: {
        email: '',
        enabled: false,
        on_complete: true,
        on_error: true,
        smtp_server: 'smtp.qq.com',
        smtp_port: 465,
        smtp_user: '',
        smtp_password: '',
        smtp_secure: true
    },
    cloud: {
        provider: 'none',
        sync_enabled: false
    }
};

@Injectable()
export class UserSettingsService implements OnModuleInit {
    constructor(private readonly db: DbService) { }

    onModuleInit() {
        // 创建统一的用户设置表
        this.db.prepare(`
      CREATE TABLE IF NOT EXISTS user_settings (
        user TEXT PRIMARY KEY,
        settings_json TEXT NOT NULL,
        updated_at TEXT
      )
    `).run();
    }

    /**
     * 获取用户的完整配置
     */
    getUserSettings(user: string): UserSettings {
        const row = this.db.prepare(`
      SELECT settings_json FROM user_settings WHERE user = ?
    `).get(user) as { settings_json: string } | undefined;

        if (row?.settings_json) {
            try {
                const parsed = JSON.parse(row.settings_json);
                // 合并默认值，确保新增的配置项有默认值
                return this.mergeWithDefaults(parsed);
            } catch (e) {
                console.warn(`[UserSettings] Failed to parse settings for user ${user}`);
            }
        }

        return { ...DEFAULT_SETTINGS };
    }

    /**
     * 保存用户的完整配置
     */
    saveUserSettings(user: string, settings: Partial<UserSettings>): void {
        // 获取现有配置并合并
        const current = this.getUserSettings(user);
        const merged = this.deepMerge(current, settings);
        const now = new Date().toISOString();

        this.db.prepare(`
      INSERT OR REPLACE INTO user_settings (user, settings_json, updated_at)
      VALUES (?, ?, ?)
    `).run(user, JSON.stringify(merged), now);
    }

    /**
     * 更新用户配置的单个分类
     */
    updateSettingsSection<K extends keyof UserSettings>(
        user: string,
        section: K,
        value: UserSettings[K]
    ): void {
        const current = this.getUserSettings(user);
        current[section] = value;
        this.saveUserSettings(user, current);
    }

    /**
     * 获取用户配置的单个分类
     */
    getSettingsSection<K extends keyof UserSettings>(
        user: string,
        section: K
    ): UserSettings[K] {
        const settings = this.getUserSettings(user);
        return settings[section];
    }

    /**
     * 删除用户的所有配置
     */
    deleteUserSettings(user: string): void {
        this.db.prepare(`DELETE FROM user_settings WHERE user = ?`).run(user);
    }

    /**
     * 合并配置与默认值
     */
    private mergeWithDefaults(settings: Partial<UserSettings>): UserSettings {
        return {
            file_path: { ...DEFAULT_SETTINGS.file_path, ...(settings.file_path || {}) },
            notification: { ...DEFAULT_SETTINGS.notification, ...(settings.notification || {}) },
            cloud: { ...DEFAULT_SETTINGS.cloud, ...(settings.cloud || {}) }
        };
    }

    /**
     * 深度合并对象
     */
    private deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
        const result = { ...target };
        for (const key of Object.keys(source) as (keyof T)[]) {
            const sourceValue = source[key];
            if (sourceValue !== undefined) {
                if (typeof sourceValue === 'object' && sourceValue !== null && !Array.isArray(sourceValue)) {
                    result[key] = this.deepMerge(result[key] || {} as any, sourceValue);
                } else {
                    result[key] = sourceValue as T[keyof T];
                }
            }
        }
        return result;
    }
}
