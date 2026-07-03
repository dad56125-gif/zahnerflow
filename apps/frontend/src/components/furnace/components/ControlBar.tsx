import React, { useRef, useCallback } from 'react';
import type { FurnaceState } from '../../../modules/furnace/useFurnace';
import { Dropdown } from '../../shared/Dropdown';
import { useDropdownPosition } from '../../shared/useDropdownPosition';

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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const canSave = current_preset_name.trim() && has_valid_data;

  const dropdown = useDropdownPosition({
    triggerRef,
    dropdownRef,
    offset: 4,
    minWidth: 200,
  });

  const handleSelect = useCallback((name: string) => {
    on_preset_select(name);
    dropdown.startClose();
  }, [on_preset_select, dropdown]);

  const selectedLabel = selected_preset_name || '选择预设程序段';

  return (
    <div className="control-bar">
      {/* 预设下拉选择器 */}
      <button
        ref={triggerRef}
        className="btn btn--sm btn--secondary preset__selector"
        onClick={() => dropdown.toggle()}
        disabled={!is_connected || is_loading}
      >
        {selectedLabel}
      </button>

      <Dropdown
        isOpen={dropdown.isOpen}
        isHiding={dropdown.isHiding}
        onClose={() => dropdown.startClose()}
        position={{ ...dropdown.position, id: 'furnace-preset-dropdown' }}
        triggerRef={triggerRef}
      >
        <div ref={dropdownRef}>
          <div
            className={`dropdown__item ${!selected_preset_name ? 'is-active' : ''}`}
            onClick={() => handleSelect('')}
          >
            选择预设程序段
          </div>
          {furnace_state.presets.map(preset => (
            <div
              key={preset.name}
              className={`dropdown__item ${selected_preset_name === preset.name ? 'is-active' : ''}`}
              onClick={() => handleSelect(preset.name)}
            >
              {preset.name}
            </div>
          ))}
        </div>
      </Dropdown>

      {/* 写入按钮 */}
      <button
        className="btn btn--sm btn--warning"
        onClick={on_write}
        disabled={!is_connected || is_loading}
      >
        写入
      </button>

      {/* 预设名称输入框 */}
      <input
        type="text"
        className="input preset__name-input"
        placeholder="请输入/编辑预设名称"
        value={current_preset_name}
        onChange={(e) => on_preset_name_change(e.target.value)}
        disabled={!is_connected || is_loading}
      />

      {/* 新建按钮 */}
      <button
        className="btn btn--sm btn--secondary"
        onClick={on_new}
        disabled={!is_connected || is_loading}
      >
        新建
      </button>

      {/* 保存按钮 */}
      <button
        className="btn btn--sm btn--success"
        onClick={on_save}
        disabled={!canSave || is_loading}
      >
        保存
      </button>

      {/* 读取运行按钮 */}
      <button
        className="btn btn--sm btn--primary"
        onClick={on_load_run}
        disabled={!is_connected || is_loading}
      >
        读取运行
      </button>
    </div>
  );
};
