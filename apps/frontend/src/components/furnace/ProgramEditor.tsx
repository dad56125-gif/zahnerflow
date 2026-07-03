import React, { useState, useEffect, useCallback } from 'react';
import type { FurnaceState, FurnaceControls } from '../../modules/furnace/useFurnace';
import type { ProgramSegment } from '../../modules/furnace/furnaceTypes';
import { SegmentValidator } from '../../modules/furnace/segmentValidation';

interface ProgramEditorProps {
  furnaceState: FurnaceState;
  furnaceControls: FurnaceControls;
}

export const ProgramEditor: React.FC<ProgramEditorProps> = ({ furnaceState, furnaceControls }) => {
  const [inputs, setInputs] = useState<{ [key: string]: string }>({});
  const [validationErrors, setValidationErrors] = useState<{ [key: string]: string }>({});

  // 初始化输入框
  useEffect(() => {
    if (furnaceState.segments?.length) {
      const newInputs: { [key: string]: string } = {};
      furnaceState.segments.forEach(segment => {
        newInputs[`temp_${segment.id}`] = segment.temperature.toString();
        newInputs[`time_${segment.id}`] = segment.time.toString();
      });
      setInputs(prev => ({ ...prev, ...newInputs }));
    }
  }, [furnaceState.segments]);

  const isConnected = furnaceState.connection_status === 'connected';

  const handleInputChange = useCallback((field: string, value: string) => {
    const newInputs = { ...inputs, [field]: value };
    setInputs(newInputs);

    // 实时验证
    const isTemp = field.startsWith('temp_');
    const result = isTemp
      ? SegmentValidator.validateTemperature(value)
      : SegmentValidator.validateTime(value);

    // 验证失败时立即修正
    if (!result.is_valid) {
      setInputs(prev => ({ ...prev, [field]: result.value.toString() }));
    }
  }, [inputs]);

  const handleRead = useCallback(() => {
    furnaceControls.get_segments();
  }, [furnaceControls]);

  const handleWrite = useCallback(() => {
    if (!SegmentValidator.hasValidData(inputs)) {
      alert('请输入至少一个程序段的温度或时间数据！');
      return;
    }

    if (!confirm('确认写入？')) return;

    const segments: ProgramSegment[] = [];
    for (let i = 1; i <= 27; i++) {
      const temp = parseInt(inputs[`temp_${i}`] || '0');
      const time = parseInt(inputs[`time_${i}`] || '0');
      if (temp > 0 || time > 0 || time === -121) {
        segments.push({ id: i, temperature: temp, time: time });
      }
    }
    furnaceControls.set_segments(segments);
  }, [inputs, furnaceControls]);

  return (
    <div className="presets-tab">
      {/* 控制栏 */}
      <div className="control-bar">
        <button
          className="btn btn--sm btn--primary"
          onClick={handleRead}
          disabled={!isConnected || furnaceState.loading}
        >
          {furnaceState.loading ? '读取中...' : '读取程序段'}
        </button>
        <button
          className="btn btn--sm btn--success"
          onClick={handleWrite}
          disabled={!isConnected || furnaceState.loading}
        >
          {furnaceState.loading ? '写入中...' : '写入程序段'}
        </button>
      </div>

      {/* 程序段编辑器 */}
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
                        className={`input segment__input ${validationErrors[`temp_${id}`] ? 'has-error' : ''}`}
                        value={inputs[`temp_${id}`] ?? ''}
                        onChange={(e) => handleInputChange(`temp_${id}`, e.target.value)}
                        disabled={!isConnected}
                        title={validationErrors[`temp_${id}`] || ''}
                      />
                      <span className="unit">℃</span>
                    </div>

                    <div className="segment__label">
                      t{id.toString().padStart(2, '0')}
                    </div>
                    <div className="input-group">
                      <input
                        type="number"
                        className={`input segment__input ${validationErrors[`time_${id}`] ? 'has-error' : ''}`}
                        value={inputs[`time_${id}`] ?? ''}
                        onChange={(e) => handleInputChange(`time_${id}`, e.target.value)}
                        disabled={!isConnected}
                        title={validationErrors[`time_${id}`] || ''}
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
    </div>
  );
};
