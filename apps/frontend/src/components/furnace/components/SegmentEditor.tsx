import React, { useCallback } from 'react';
import { SegmentValidator } from '../../../modules/furnace/segmentValidation';
import { FURNACE_PROGRAM_SEGMENT_COUNT } from '../../../modules/furnace/temperatureLimits';

interface SegmentEditorProps {
  isConnected: boolean;
  inputs: { [key: string]: string };
  on_inputs_change: (inputs: { [key: string]: string } | ((prev: { [key: string]: string }) => { [key: string]: string })) => void;
  validation_errors: { [key: string]: string };
}

export const SegmentEditor: React.FC<SegmentEditorProps> = ({
  isConnected,
  inputs,
  on_inputs_change,
  validation_errors
}) => {
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
        {/* 段号按自然顺序排列，响应式网格从左到右、从上到下展示。 */}
        {Array.from({ length: FURNACE_PROGRAM_SEGMENT_COUNT }, (_, index) => {
          const id = index + 1;
          return (
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
                  disabled={!isConnected}
                  title={validation_errors[`temp_${id}`] || ''}
                />
                <span className="unit">°C</span>
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
                  disabled={!isConnected}
                  title={validation_errors[`time_${id}`] || ''}
                />
                <span className="unit">min</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
