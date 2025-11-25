import React, { useState, useEffect } from 'react';
import type { FurnaceState, FurnaceControls } from './useFurnace';
import type { ProgramSegment } from './furnaceTypes';

interface ProgramEditorProps {
  furnaceState: FurnaceState;
  furnaceControls: FurnaceControls;
}

export const ProgramEditor: React.FC<ProgramEditorProps> = ({ furnaceState, furnaceControls }) => {
  const [inputs, setInputs] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    if (furnaceState.segments?.length) {
      const newInputs: any = {};
      furnaceState.segments.forEach(s => {
        newInputs[`temp_${s.id}`] = s.temperature;
        newInputs[`time_${s.id}`] = s.time;
      });
      setInputs(prev => ({ ...prev, ...newInputs }));
    }
  }, [furnaceState.segments]);

  const handleWrite = () => {
    const segments: ProgramSegment[] = [];
    for (let i = 1; i <= 27; i++) {
      const t = parseFloat(inputs[`temp_${i}`] || '0');
      const time = parseInt(inputs[`time_${i}`] || '0');
      if (t > 0 || time > 0) { // 简单的过滤
        segments.push({ id: i, temperature: t, time: time });
      }
    }
    furnaceControls.write_segments(segments);
  };

  const isConnected = furnaceState.connection_status === 'connected';

  return (
    <div className="program-tab">
      <div className="program-controls">
        <button
          className="btn_base btn_layout btn_style_common btn_medium btn_primary"
          onClick={furnaceControls.load_segments}
          disabled={!isConnected || furnaceState.loading}
        >
          {furnaceState.loading ? '读取中...' : '读取程序段'}
        </button>
        <button
          className="btn_base btn_layout btn_style_common btn_medium btn_success"
          onClick={handleWrite}
          disabled={!isConnected || furnaceState.loading}
        >
          {furnaceState.loading ? '写入中...' : '写入程序段'}
        </button>
      </div>

      <div className="segments-grid">
        {Array.from({ length: 14 }, (_, rowIndex) => {
          const id1 = rowIndex * 2 + 1;
          const id2 = rowIndex * 2 + 2;
          if (id1 > 27) return null;
          const seg1 = furnaceState.segments.find(s => s.id === id1);
          const seg2 = furnaceState.segments.find(s => s.id === id2);
          return (
            <div key={rowIndex} className="segment-row">
              {/* 第一个段 */}
              <label>C{id1.toString().padStart(2, '0')}</label>
              <input
                type="number"
                value={inputs[`temp_${id1}`] ?? (seg1?.temperature ?? 0)}
                onChange={e => setInputs(p => ({ ...p, [`temp_${id1}`]: e.target.value }))}
                disabled={!isConnected}
              />
              <span>℃</span>
              <label>t{id1.toString().padStart(2, '0')}</label>
              <input
                type="number"
                value={inputs[`time_${id1}`] ?? (seg1?.time ?? 0)}
                onChange={e => setInputs(p => ({ ...p, [`time_${id1}`]: e.target.value }))}
                disabled={!isConnected}
              />
              <span>min</span>

              {/* 第二个段（如果有） */}
              {id2 <= 27 && (
                <>
                  <label style={{ marginLeft: '20px' }}>C{id2.toString().padStart(2, '0')}</label>
                  <input
                    type="number"
                    value={inputs[`temp_${id2}`] ?? (seg2?.temperature ?? 0)}
                    onChange={e => setInputs(p => ({ ...p, [`temp_${id2}`]: e.target.value }))}
                    disabled={!isConnected}
                  />
                  <span>℃</span>
                  <label>t{id2.toString().padStart(2, '0')}</label>
                  <input
                    type="number"
                    value={inputs[`time_${id2}`] ?? (seg2?.time ?? 0)}
                    onChange={e => setInputs(p => ({ ...p, [`time_${id2}`]: e.target.value }))}
                    disabled={!isConnected}
                  />
                  <span>min</span>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};