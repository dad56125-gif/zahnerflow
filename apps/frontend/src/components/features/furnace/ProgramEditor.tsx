import React, { useState, useEffect } from 'react';
import type { FurnaceState, FurnaceControls } from '../../../services/hooks/useFurnace';
import type { ProgramSegment } from '../../../types/devices';

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
          className="btn btn-primary"
          onClick={furnaceControls.load_segments}
          disabled={!isConnected || furnaceState.loading}
        >
          {furnaceState.loading ? '读取中...' : '读取程序段'}
        </button>
        <button
          className="btn btn-success"
          onClick={handleWrite}
          disabled={!isConnected || furnaceState.loading}
        >
          {furnaceState.loading ? '写入中...' : '写入程序段'}
        </button>
      </div>

      <div className="segments-grid">
        {[0, 15].map(offset => (
          <div className="segments-column" key={offset}>
            {Array.from({ length: 15 }, (_, i) => {
              const id = i + 1 + offset;
              if (id > 30) return null;
              const seg = furnaceState.segments.find(s => s.id === id);
              return (
                <div key={id} className="segment-row">
                  <label>C{id.toString().padStart(2, '0')}</label>
                  <input
                    type="number"
                    value={inputs[`temp_${id}`] ?? (seg?.temperature ?? 0)}
                    onChange={e => setInputs(p => ({ ...p, [`temp_${id}`]: e.target.value }))}
                    disabled={!isConnected}
                  />
                  <span>℃</span>
                  <label>t{id.toString().padStart(2, '0')}</label>
                  <input
                    type="number"
                    value={inputs[`time_${id}`] ?? (seg?.time ?? 0)}
                    onChange={e => setInputs(p => ({ ...p, [`time_${id}`]: e.target.value }))}
                    disabled={!isConnected}
                  />
                  <span>min</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};