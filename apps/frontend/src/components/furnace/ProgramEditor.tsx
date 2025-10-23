import React, { useState, useEffect } from 'react';
import type { FurnaceState, FurnaceControls } from '../../services/hooks/useFurnace';
import type { ProgramSegment } from '../../types/devices';

interface ProgramEditorProps {
  furnaceState: FurnaceState;
  furnaceControls: FurnaceControls;
}

export const ProgramEditor: React.FC<ProgramEditorProps> = ({ furnaceState, furnaceControls }) => {
  // 程序段输入状态 - 使用受控组件
  const [segmentInputs, setSegmentInputs] = useState<{ [key: string]: string }>({});

  // 当segments数据更新时，同步更新输入框的值
  useEffect(() => {
    if (furnaceState.segments && furnaceState.segments.length > 0) {
      const newInputs: { [key: string]: string } = {};
      furnaceState.segments.forEach(segment => {
        newInputs[`temp_${segment.id}`] = segment.temperature.toString();
        newInputs[`time_${segment.id}`] = segment.time.toString();
      });
      setSegmentInputs(prev => ({ ...prev, ...newInputs }));
    }
  }, [furnaceState.segments]);

  return (
    <div className="program-tab">
      {/* 程序段控制按钮 */}
      <div className="program-controls">
        <button
          className={`btn btn-primary ${furnaceState.operation_progress?.active && furnaceState.operation_progress?.type === 'reading' ? 'btn-progress' : ''}`}
          onClick={furnaceControls.load_segments}
          disabled={furnaceState.connection_status !== 'connected' || furnaceState.loading}
        >
          {furnaceState.operation_progress?.active && furnaceState.operation_progress?.type === 'reading' ? (
            <>
              <div className="btn-progress-bar">
                <div
                  className="btn-progress-fill"
                  style={{ left: `${furnaceState.operation_progress.progress}%` }}
                />
              </div>
              <div className="btn-progress-content">
                <div className="btn-text">读取程序段</div>
                <div className="btn-progress-text">
                  {Math.round(furnaceState.operation_progress.progress)}%
                </div>
              </div>
            </>
          ) : (
            '读取程序段'
          )}
        </button>
        <button
          className={`btn btn-success ${furnaceState.operation_progress?.active && furnaceState.operation_progress?.type === 'writing' ? 'btn-progress' : ''}`}
          onClick={() => {
            // 从受控组件状态中收集数据
            const segments: ProgramSegment[] = [];

            for (let i = 1; i <= 30; i++) {
              const temperature = parseFloat(segmentInputs[`temp_${i}`] || '0') || 0;
              const time = parseInt(segmentInputs[`time_${i}`] || '0') || 0;

              segments.push({
                id: i,
                temperature,
                time
              });
            }

            furnaceControls.write_segments(segments.filter(s => s.temperature > 0 || s.time > 0));
          }}
          disabled={furnaceState.connection_status !== 'connected' || furnaceState.loading}
        >
          {furnaceState.operation_progress?.active && furnaceState.operation_progress?.type === 'writing' ? (
            <>
              <div className="btn-progress-bar">
                <div
                  className="btn-progress-fill"
                  style={{ left: `${furnaceState.operation_progress.progress}%` }}
                />
              </div>
              <div className="btn-progress-content">
                <div className="btn-text">写入程序段</div>
                <div className="btn-progress-text">
                  {Math.round(furnaceState.operation_progress.progress)}%
                </div>
              </div>
            </>
          ) : (
            '写入程序段'
          )}
        </button>
      </div>

      {/* 程序段网格 */}
      <div className="segments-grid">
        <div className="segments-column">
          {Array.from({ length: 15 }, (_, i) => {
            const segId = i + 1;
            const segment = Array.isArray(furnaceState.segments) ? furnaceState.segments.find(s => s.id === segId) : null;
            return (
              <div key={segId} className="segment-row">
                <label className="segment-label">C{segId.toString().padStart(2, '0')}</label>
                <input
                  type="number"
                  className="segment-input temp-input"
                  value={segmentInputs[`temp_${segId}`] || (segment?.temperature?.toString() || '0')}
                  step="0.1"
                  disabled={furnaceState.connection_status !== 'connected'}
                  onChange={(e) => setSegmentInputs(prev => ({ ...prev, [`temp_${segId}`]: e.target.value }))}
                />
                <label className="segment-label">t{segId.toString().padStart(2, '0')}</label>
                <input
                  type="number"
                  className="segment-input time-input"
                  value={segmentInputs[`time_${segId}`] || (segment?.time?.toString() || '0')}
                  disabled={furnaceState.connection_status !== 'connected'}
                  onChange={(e) => setSegmentInputs(prev => ({ ...prev, [`time_${segId}`]: e.target.value }))}
                />
              </div>
            );
          })}
        </div>
        <div className="segments-column">
          {Array.from({ length: 15 }, (_, i) => {
            const segId = i + 16;
            const segment = Array.isArray(furnaceState.segments) ? furnaceState.segments.find(s => s.id === segId) : null;
            return (
              <div key={segId} className="segment-row">
                <label className="segment-label">C{segId.toString().padStart(2, '0')}</label>
                <input
                  type="number"
                  className="segment-input temp-input"
                  value={segmentInputs[`temp_${segId}`] || (segment?.temperature?.toString() || '0')}
                  step="0.1"
                  disabled={furnaceState.connection_status !== 'connected'}
                  onChange={(e) => setSegmentInputs(prev => ({ ...prev, [`temp_${segId}`]: e.target.value }))}
                />
                <label className="segment-label">t{segId.toString().padStart(2, '0')}</label>
                <input
                  type="number"
                  className="segment-input time-input"
                  value={segmentInputs[`time_${segId}`] || (segment?.time?.toString() || '0')}
                  disabled={furnaceState.connection_status !== 'connected'}
                  onChange={(e) => setSegmentInputs(prev => ({ ...prev, [`time_${segId}`]: e.target.value }))}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};