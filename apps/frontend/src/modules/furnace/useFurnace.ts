import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { FurnaceApi } from './furnaceApi';
import { furnaceWebSocketService, FurnaceStatusUpdate } from './furnaceWebSocket.service';
import { FurnaceStatus, ProgramSegment, FurnacePresetMeta, FurnacePreset, CreatePresetRequest, FurnaceConnectRequest, HistoryQueryParams, SegmentProgress, LogEntry, ApplyPresetResult } from './furnaceTypes';
import { DeviceError } from './furnaceTypes';

export interface FurnaceState {
  device_status: FurnaceStatus | null;
  connection_status: 'connected' | 'disconnected';
  segments: ProgramSegment[];
  presets: FurnacePresetMeta[];
  history_data: any[];
  history_params: HistoryQueryParams;
  loading: boolean;
  error: string | null;
  logs: LogEntry[];
  segment_progress: SegmentProgress | null;
}

export interface FurnaceControls {
  connect: (config: FurnaceConnectRequest) => Promise<void>;
  disconnect: () => Promise<void>;
  set_segment: (segment: number) => Promise<void>;
  run: () => Promise<void>;
  pause: () => Promise<void>;
  stop: () => Promise<void>;
  get_segments: () => Promise<void>;
  set_segments: (segments: ProgramSegment[]) => Promise<void>;
  load_presets: () => Promise<void>;
  create_preset: (preset: CreatePresetRequest) => Promise<void>;
  update_preset: (name: string, segments: ProgramSegment[]) => Promise<void>;
  delete_preset: (name: string) => Promise<void>;
  clone_preset: (name: string, new_name: string) => Promise<void>;
  apply_preset: (name: string) => Promise<void>;
  load_history_data: (params?: HistoryQueryParams) => Promise<void>;
  update_history_params: (params: Partial<HistoryQueryParams>) => void;
  reset: () => void;
  clear_error: () => void;
  add_log: (type: LogEntry['type'], message: string) => void;
  clear_logs: () => void;
}

export function useFurnace(): [FurnaceState, FurnaceControls] {
  const initial: FurnaceState = {
    device_status: null, connection_status: 'disconnected', segments: [], presets: [],
    history_data: [], history_params: { limit: 1000 }, loading: false, error: null, logs: [], segment_progress: null
  };
  const [state, set_state] = useState<FurnaceState>(initial);
  const ws_conn = useRef(false);
  const update = useCallback((u: Partial<FurnaceState>) => set_state(p => ({ ...p, ...u })), []);
  
  const add_log = useCallback((t: LogEntry['type'], m: string) => {
    set_state(p => ({ ...p, logs: [{ id: Math.random().toString(), timestamp: new Date().toLocaleTimeString(), type: t, message: m }, ...p.logs].slice(0, 100) }));
  }, []);
  
  const handle_error = useCallback((e: any) => {
    const m = e?.message || 'Error';
    update({ error: m, loading: false, segment_progress: null });
    add_log('error', m);
  }, [update, add_log]);

  const exec = useCallback(async (fn: () => Promise<any>, msg?: string, skipLoad = false) => {
    try {
      if(!skipLoad) update({ loading: true, error: null });
      await fn();
      if(msg) add_log('success', msg);
    } catch (e) { handle_error(e); } 
    finally { if(!skipLoad) update({ loading: false }); }
  }, [handle_error, add_log, update]);

  // --- 批量读写（后端循环） ---
  const get_segments = useCallback(async () => {
    try {
      update({ loading: true });
      const segments = await FurnaceApi.getSegments();
      update({ segments });
      add_log('success', 'Read 27 segments');
    } catch(e) { handle_error(e); }
    finally { update({ loading: false }); }
  }, [update, handle_error, add_log]);

  const set_segments = useCallback(async (segs: ProgramSegment[]) => {
    try {
      update({ loading: true });
      await FurnaceApi.setSegments(segs);
      update({ segments: segs });
      add_log('success', `Wrote ${segs.length} segments`);
    } catch(e) { handle_error(e); }
    finally { update({ loading: false }); }
  }, [update, handle_error, add_log]);

  // --- 其他控制 ---
  const connect = (c: FurnaceConnectRequest) => exec(async () => { await FurnaceApi.connect(c); update({connection_status:'connected'}); ensure_ws(); }, `Connected to ${c.port}`);
  const disconnect = () => exec(async () => { await FurnaceApi.disconnect(); update({connection_status:'disconnected', device_status:null}); }, 'Disconnected');
  
  // ... 其他方法与之前相同，略微缩写 ...
  const ensure_ws = () => { if(!ws_conn.current) { furnaceWebSocketService.connect(); ws_conn.current=true; furnaceWebSocketService.onStatusUpdate(d => update({device_status: d.status, connection_status: d.connection_state.status as any})); furnaceWebSocketService.onSamplingData(d => set_state(p => ({...p, history_data: [...p.history_data, {timestamp: d.timestamp, temperature: d.temperature, sv: d.sv, mv: d.mv}].slice(-500)}))); furnaceWebSocketService.onConnected(() => furnaceWebSocketService.subscribeToFurnace()); } };

  const controls: FurnaceControls = {
    get_segments,
    set_segments,
    connect,
    disconnect,
    set_segment: (s) => exec(() => FurnaceApi.setSegment(s), `Segment ${s}`),
    run: () => exec(() => FurnaceApi.run(), 'Run'),
    pause: () => exec(() => FurnaceApi.pause(), 'Pause'),
    stop: () => exec(() => FurnaceApi.stop(), 'Stop'),
    load_presets: () => exec(async () => update({presets: await FurnaceApi.getPresets()})),
    create_preset: (p) => exec(async () => { await FurnaceApi.createPreset(p); update({presets: await FurnaceApi.getPresets()}); }),
    update_preset: (n, s) => exec(async () => { await FurnaceApi.updatePreset(n, s); update({presets: await FurnaceApi.getPresets()}); }),
    delete_preset: (n) => exec(async () => { await FurnaceApi.deletePreset(n); update({presets: await FurnaceApi.getPresets()}); }),
    clone_preset: (n, nn) => exec(async () => { await FurnaceApi.clonePreset(n, nn); update({presets: await FurnaceApi.getPresets()}); }),
    apply_preset: (n) => exec(() => FurnaceApi.applyPreset(n), `Applied ${n}`),
    load_history_data: (p) => exec(async () => update({history_data: await FurnaceApi.getTemperatureHistory(p || state.history_params)})),
    update_history_params: (p) => update({history_params: {...state.history_params, ...p}}),
    reset: () => set_state(initial), clear_error: () => update({error: null}), add_log, clear_logs: () => update({logs: []})
  };

  useEffect(() => { controls.load_presets(); }, []);
  useEffect(() => { if(state.connection_status === 'connected') controls.get_segments(); }, [state.connection_status]);

  // WebSocket 进度监听
  useEffect(() => {
    furnaceWebSocketService.onReadProgress((data) => {
      update({
        segment_progress: {
          active: true,
          type: 'read',
          progress: data.progress,
          message: data.message || `读取中... ${data.progress}%`
        }
      });
    });

    furnaceWebSocketService.onWriteProgress((data) => {
      update({
        segment_progress: {
          active: true,
          type: 'write',
          progress: data.progress,
          message: data.message || `写入中... ${data.progress}%`
        }
      });
    });

    return () => {
      // cleanup if needed
    };
  }, [update]);

  useEffect(() => { return () => { if(ws_conn.current) furnaceWebSocketService.disconnect(); }; }, []);

  return [state, controls];
}
export default useFurnace;