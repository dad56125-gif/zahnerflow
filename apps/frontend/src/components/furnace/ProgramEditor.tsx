import React, { memo, useState, useEffect, useCallback } from 'react';
import type { ProgramSegment } from '../../modules/furnace/furnaceTypes';
import { SegmentValidator } from '../../modules/furnace/segmentValidation';
import { FURNACE_PROGRAM_SEGMENT_COUNT } from '../../modules/furnace/temperatureLimits';
import { SpacedCjkText } from '../common/SpacedCjkText';

interface ProgramEditorProps {
  segments: ProgramSegment[];
  isConnected: boolean;
  isLoading: boolean;
  onRead: () => Promise<void>;
  onWrite: (segments: ProgramSegment[]) => Promise<void>;
}

export const ProgramEditor: React.FC<ProgramEditorProps> = memo(({
  segments,
  isConnected,
  isLoading,
  onRead,
  onWrite,
}) => {
  const [inputs, setInputs] = useState<{ [key: string]: string }>({});
  const [validationErrors, setValidationErrors] = useState<{ [key: string]: string }>({});

  // 初始化输入框
  useEffect(() => {
    if (segments.length) {
      const newInputs: { [key: string]: string } = {};
      segments.forEach(segment => {
        newInputs[`temp_${segment.id}`] = segment.temperature.toString();
        newInputs[`time_${segment.id}`] = segment.time.toString();
      });
      setInputs(prev => ({ ...prev, ...newInputs }));
    }
  }, [segments]);

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
    void onRead();
  }, [onRead]);

  const handleWrite = useCallback(() => {
    if (!SegmentValidator.hasValidData(inputs)) {
      alert('请输入至少一个程序段的温度或时间数据！');
      return;
    }

    if (!confirm('确认写入？')) return;

    const segments: ProgramSegment[] = [];
    for (let i = 1; i <= FURNACE_PROGRAM_SEGMENT_COUNT; i++) {
      const temp = parseInt(inputs[`temp_${i}`] || '0');
      const time = parseInt(inputs[`time_${i}`] || '0');
      if (temp > 0 || time > 0 || time === -121) {
        segments.push({ id: i, temperature: temp, time: time });
      }
    }
    void onWrite(segments);
  }, [inputs, onWrite]);

  return (
    <div className="presets-tab">
      {/* 控制栏 */}
      <div className="control-bar">
        <button
          className="btn btn--sm btn--primary"
          onClick={handleRead}
          disabled={!isConnected || isLoading}
        >
          {isLoading ? <SpacedCjkText text="读取中..." /> : <SpacedCjkText text="读取程序段" />}
        </button>
        <button
          className="btn btn--sm btn--success"
          onClick={handleWrite}
          disabled={!isConnected || isLoading}
        >
          {isLoading ? <SpacedCjkText text="写入中..." /> : <SpacedCjkText text="写入程序段" />}
        </button>
      </div>

      {/* 程序段编辑器 */}
      <div className="segments__editor">
        <div className="segments__grid">
          {/* 按列优先顺序生成：3列布局时，竖向显示 c01 c02 c03 ... */}
          {(() => {
            const COLS = 3;
            const ROWS = Math.ceil(FURNACE_PROGRAM_SEGMENT_COUNT / COLS);
            const elements = [];

            // 按行遍历，每行从3列取元素
            for (let row = 0; row < ROWS; row++) {
              for (let col = 0; col < COLS; col++) {
                const id = col * ROWS + row + 1; // 列优先索引
                if (id > FURNACE_PROGRAM_SEGMENT_COUNT) continue;

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
                      <span className="unit">°C</span>
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
});
