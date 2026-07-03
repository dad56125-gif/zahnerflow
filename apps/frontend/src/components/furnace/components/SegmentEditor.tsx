import React, { useCallback } from 'react';
import type { FurnaceState } from '../../../modules/furnace/useFurnace';
import { SegmentValidator } from '../../../modules/furnace/segmentValidation';

interface SegmentEditorProps {
  furnace_state: FurnaceState;
  inputs: { [key: string]: string };
  on_inputs_change: (inputs: { [key: string]: string } | ((prev: { [key: string]: string }) => { [key: string]: string })) => void;
  validation_errors: { [key: string]: string };
}

export const SegmentEditor: React.FC<SegmentEditorProps> = ({
  furnace_state,
  inputs,
  on_inputs_change,
  validation_errors
}) => {
  const is_connected = furnace_state.connection_status === 'connected';

  const handle_input_change = useCallback((field: string, value: string) => {
    const new_inputs = { ...inputs, [field]: value };

    // 立即更新输入框显示
    on_inputs_change(new_inputs);

    // 实时验证
    const is_temp = field.startsWith('temp_');

    // 使用SegmentValidator统一处理所有验证逻辑
    const result = is_temp
      ? SegmentValidator.validateTemperature(value)
      : SegmentValidator.validateTime(value);

    // 验证失败时立即修正，无需等待
    if (!result.is_valid) {
      on_inputs_change((prev: { [key: string]: string }) => ({ ...prev, [field]: result.value.toString() }));
    }
  }, [inputs, on_inputs_change]);

  return (
    <div className="segments__editor">
      <div className="segments__grid">
        {/* 按列优先顺序生成：3列布局时，竖向显示 c01 c02 c03 ... */}
        {(() => {
          const COLS = 3;
          const ROWS = 9; // 27 ÷ 3 = 9
          const elements = [];

          // 按行遍历，每行从3列取元素
          for (let row = 0; row < ROWS; row++) {
            for (let col = 0; col < COLS; col++) {
              const id = col * ROWS + row + 1; // 列优先索引
              if (id > 27) continue;

              elements.push(
                <div key={id} className="segment__item">
                  <div className="segment__label">
                    C{id.toString().padStart(2, '0')}
                  </div>
                  <div className="input-group">
                    <input
                      type="number"
                      className={`input segment__input ${validation_errors[`temp_${id}`] ? 'has-error' : ''}`}
                      value={inputs[`temp_${id}`] ?? ''}
                      onChange={(e) => handle_input_change(`temp_${id}`, e.target.value)}
                      disabled={!is_connected}
                      title={validation_errors[`temp_${id}`] || ''}
                    />
                    <span className="unit">℃</span>
                  </div>

                  <div className="segment__label">
                    t{id.toString().padStart(2, '0')}
                  </div>
                  <div className="input-group">
                    <input
                      type="number"
                      className={`input segment__input ${validation_errors[`time_${id}`] ? 'has-error' : ''}`}
                      value={inputs[`time_${id}`] ?? ''}
                      onChange={(e) => handle_input_change(`time_${id}`, e.target.value)}
                      disabled={!is_connected}
                      title={validation_errors[`time_${id}`] || ''}
                    />
                    <span className="unit">min</span>
                  </div>
                </div>
              );
            }
          }
          return elements;
        })()}
      </div>
    </div>
  );
};