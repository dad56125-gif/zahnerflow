import React from 'react';
import type { FurnaceState } from '../useFurnace';

interface ControlBarProps {
  furnace_state: FurnaceState;
  current_preset_name: string;
  selected_preset_name: string;
  has_valid_data: boolean;
  on_preset_select: (name: string) => void;
  on_write: () => void;
  on_preset_name_change: (name: string) => void;
  on_new: () => void;
  on_save: () => void;
  on_load_run: () => void;
}

export const ControlBar: React.FC<ControlBarProps> = ({
  furnace_state,
  current_preset_name,
  selected_preset_name,
  has_valid_data,
  on_preset_select,
  on_write,
  on_preset_name_change,
  on_new,
  on_save,
  on_load_run
}) => {
  const is_connected = furnace_state.connection_status === 'connected';
  const is_loading = furnace_state.loading;

  const canSave = current_preset_name.trim() && has_valid_data;

  return (
    <div className="control-bar">
      {/* 预设下拉选择器 */}
      <select
        className="preset-selector"
        value={selected_preset_name}
        onChange={(e) => on_preset_select(e.target.value)}
        disabled={!is_connected || is_loading}
      >
        <option value="">选择预设程序段</option>
        {furnace_state.presets.map(preset => (
          <option key={preset.name} value={preset.name}>
            {preset.name}
          </option>
        ))}
      </select>

      {/* 写入按钮 */}
      <button
        className="btn_base btn_layout btn_style_common btn_small btn_warning"
        onClick={on_write}
        disabled={!is_connected || is_loading}
      >
        写入
      </button>

      {/* 预设名称输入框 */}
      <input
        type="text"
        className="preset-name-input"
        placeholder="请输入/编辑预设名称"
        value={current_preset_name}
        onChange={(e) => on_preset_name_change(e.target.value)}
        disabled={!is_connected || is_loading}
      />

      {/* 新建按钮 */}
      <button
        className="btn_base btn_layout btn_style_common btn_small btn_secondary"
        onClick={on_new}
        disabled={!is_connected || is_loading}
      >
        新建
      </button>

      {/* 保存按钮 */}
      <button
        className="btn_base btn_layout btn_style_common btn_small btn_success"
        onClick={on_save}
        disabled={!canSave || is_loading}
      >
        保存
      </button>

      {/* 读取运行按钮 */}
      <button
        className="btn_base btn_layout btn_style_common btn_small btn_primary"
        onClick={on_load_run}
        disabled={!is_connected || is_loading}
      >
        读取运行
      </button>
    </div>
  );
};