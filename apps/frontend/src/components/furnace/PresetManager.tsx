import React from 'react';
import type { FurnaceState, FurnaceControls } from '../../services/hooks/useFurnace';

interface PresetManagerProps {
  furnaceState: FurnaceState;
  furnaceControls: FurnaceControls;
}

export const PresetManager: React.FC<PresetManagerProps> = ({ furnaceState, furnaceControls }) => {
  return (
    <div className="presets-tab">
      <div className="presets-header">
        <h4>预设程序段</h4>
      </div>
      <div className="presets-content">
        {furnaceState.presets.length === 0 ? (
          <div className="no-data">暂无预设程序段</div>
        ) : (
          <div className="presets-list">
            {furnaceState.presets.map((preset) => (
              <div key={preset.name} className="preset-item">
                <div className="preset-info">
                  <h5>{preset.name}</h5>
                  <p>{preset.summary || '无描述'}</p>
                  <small>创建时间: {new Date(preset.created_at).toLocaleString()}</small>
                </div>
                <div className="preset-actions">
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => furnaceControls.select_preset(preset.name)}
                    disabled={furnaceState.loading}
                  >
                    查看
                  </button>
                  <button
                    className="btn btn-sm btn-success"
                    onClick={() => furnaceControls.apply_preset(preset.name)}
                    disabled={
                      furnaceState.connection_status !== 'connected' ||
                      furnaceState.loading
                    }
                  >
                    应用
                  </button>
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => {
                      const newName = prompt('请输入新预设名称:', `${preset.name}_copy`);
                      if (newName && newName !== preset.name) {
                        furnaceControls.clone_preset(preset.name, newName);
                      }
                    }}
                    disabled={furnaceState.loading}
                  >
                    克隆
                  </button>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => {
                      if (confirm(`确定要删除预设 "${preset.name}" 吗?`)) {
                        furnaceControls.delete_preset(preset.name);
                      }
                    }}
                    disabled={furnaceState.loading}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};