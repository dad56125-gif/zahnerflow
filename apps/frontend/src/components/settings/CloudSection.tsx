import React from 'react';

interface CloudSettings {
    provider: string;
    syncEnabled: boolean;
    endpoint?: string;
    bucket?: string;
}

interface CloudSectionProps {
    settings: CloudSettings;
    onChange: (field: keyof CloudSettings, value: any) => void;
}

export const CloudSection: React.FC<CloudSectionProps> = ({
    settings,
    onChange
}) => {
    return (
        <div className="settings__section-content">
            <div className="settings__form-group">
                <label>云服务提供商</label>
                <select
                    className="select"
                    value={settings.provider}
                    onChange={(e) => onChange('provider', e.target.value)}
                >
                    <option value="none">不使用云同步</option>
                    <option value="aliyun">阿里云 OSS</option>
                    <option value="aws">AWS S3</option>
                    <option value="azure">Azure Blob</option>
                </select>
            </div>

            {settings.provider !== 'none' && (
                <>
                    <div className="settings__form-group checkbox__group">
                        <label className="checkbox__label">
                            <input
                                type="checkbox"
                                checked={settings.syncEnabled}
                                onChange={(e) => onChange('syncEnabled', e.target.checked)}
                            />
                            <span>启用自动同步</span>
                        </label>
                    </div>

                    <div className="settings__form-group">
                        <label>服务端点 (Endpoint)</label>
                        <input
                            className="input"
                            type="text"
                            value={settings.endpoint || ''}
                            onChange={(e) => onChange('endpoint', e.target.value)}
                            placeholder="oss-cn-hangzhou.aliyuncs.com"
                        />
                    </div>

                    <div className="settings__form-group">
                        <label>存储桶名称 (Bucket)</label>
                        <input
                            className="input"
                            type="text"
                            value={settings.bucket || ''}
                            onChange={(e) => onChange('bucket', e.target.value)}
                            placeholder="your-bucket-name"
                        />
                    </div>

                    <div className="settings__cloud-note">
                        <p>💡 API 密钥等敏感信息请在服务器端配置，不在客户端存储。</p>
                    </div>
                </>
            )}
        </div>
    );
};
