import { io, Socket } from 'socket.io-client';
import { getWsUrl } from './config/env.config';
import { getDesktopRuntimeBaseUrl } from './desktopBridge';
import { DEVICE_STATUS_UPDATE } from './eventContracts';
import type { RuntimeDeviceStatusEnvelope } from '@zahnerflow/types';

type QueryValue = string | number | boolean | null | undefined;
type QueryParams = Record<string, QueryValue>;
type RequestBody = unknown;
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

const deviceStatusUpdateEvent = DEVICE_STATUS_UPDATE;

export interface RuntimeError {
  code: string;
  message: string;
  status: number;
  details?: unknown;
}

function queryString(params?: QueryParams): string {
  if (!params) return '';
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      search.set(key, String(value));
    }
  });
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return null as T;
  const text = await response.text();
  if (!text.trim()) return null as T;
  return JSON.parse(text) as T;
}

export async function runtimeRequest<T>(
  method: HttpMethod,
  endpoint: string,
  body?: RequestBody,
  params?: QueryParams
): Promise<T> {
  const runtimeBaseUrl = getDesktopRuntimeBaseUrl();
  const requestEndpoint = runtimeBaseUrl && endpoint.startsWith('/') ? `${runtimeBaseUrl}${endpoint}` : endpoint;
  const url = `${requestEndpoint}${queryString(params)}`;
  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, init);
    if (!response.ok) {
      const payload: { detail?: unknown; error?: string; message?: string } =
        await parseResponse<{ detail?: unknown; error?: string; message?: string }>(response).catch(() => ({}));
      const detail = payload.detail;
      throw {
        code: `HTTP_${response.status}`,
        message:
          typeof detail === 'string'
            ? detail
            : payload.error || payload.message || response.statusText || `HTTP ${response.status}`,
        status: response.status,
        details: detail,
      } satisfies RuntimeError;
    }
    return await parseResponse<T>(response);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error) {
      throw error;
    }
    throw {
      code: 'NETWORK_ERROR',
      message: error instanceof Error ? error.message : String(error),
      status: 0,
    } satisfies RuntimeError;
  }
}

const get = <T>(endpoint: string, params?: QueryParams) => runtimeRequest<T>('GET', endpoint, undefined, params);
const post = <T>(endpoint: string, body?: RequestBody, params?: QueryParams) =>
  runtimeRequest<T>('POST', endpoint, body, params);
const put = <T>(endpoint: string, body?: RequestBody, params?: QueryParams) =>
  runtimeRequest<T>('PUT', endpoint, body, params);
const del = <T>(endpoint: string, params?: QueryParams) => runtimeRequest<T>('DELETE', endpoint, undefined, params);

export type RuntimeEventHandler<T = unknown> = (payload: T) => void;

class RuntimeSocket {
  private socket: Socket | null = null;

  connectSocket(): void {
    if (this.socket) return;
    this.socket = io(getWsUrl(), { transports: ['websocket'], timeout: 5000 });
  }

  disconnectSocket(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  on<T = unknown>(event: string, handler: RuntimeEventHandler<T>): () => void {
    this.connectSocket();
    this.socket?.on(event, handler as RuntimeEventHandler);
    return () => this.socket?.off(event, handler as RuntimeEventHandler);
  }

  onDeviceStatus(handler: RuntimeEventHandler<RuntimeDeviceStatusEnvelope>): () => void {
    return this.on(deviceStatusUpdateEvent, handler);
  }

  emit(event: string, payload?: unknown): void {
    this.connectSocket();
    this.socket?.emit(event, payload);
  }

  get connected(): boolean {
    return Boolean(this.socket?.connected);
  }
}

export const runtimeSocket = new RuntimeSocket();

export const runtimeClient = {
  workflows: {
    get: <T>(id: string) => get<T>(`/api/workflows/${encodeURIComponent(id)}`),
    toggleFavorite: <T = { id: string; isFavorite: boolean }>(id: string) =>
      post<T>(`/api/workflows/${encodeURIComponent(id)}/favorite`),
    updateName: <T = { id: string; name: string; updatedAt: string }>(id: string, name: string) =>
      post<T>(`/api/workflows/${encodeURIComponent(id)}/name`, { name }),
    summaries: <T>() => get<T>('/api/workflows/summaries'),
    map: <T>(params?: QueryParams) => get<T>('/api/workflows/map', params),
    executions: <T>(id: string, params?: QueryParams) =>
      get<T>(`/api/workflows/${encodeURIComponent(id)}/executions`, params),
    definition: <T>(id: string) => get<T>(`/api/workflows/${encodeURIComponent(id)}/definition`),
  },

  executions: {
    start: <T>(body: RequestBody) => post<T>('/api/executions', body),
    unrollPreview: <T>(body: RequestBody) => post<T>('/api/executions/unroll-preview', body),
    estimate: <T>(body: RequestBody) => post<T>('/api/executions/estimate', body),
    list: <T>(params?: QueryParams) => get<T>('/api/executions', params),
    get: <T>(id: string) => get<T>(`/api/executions/${encodeURIComponent(id)}`),
    getReport: <T>(id: string) => get<T>(`/api/executions/${encodeURIComponent(id)}/report`),
    pause: <T = { message: string }>(id: string) => put<T>(`/api/executions/${encodeURIComponent(id)}/pause`),
    resume: <T = { message: string }>(id: string) => put<T>(`/api/executions/${encodeURIComponent(id)}/resume`),
    cancel: <T = { message: string }>(id: string) => del<T>(`/api/executions/${encodeURIComponent(id)}`),
    reset: <T = { success: boolean; message: string; timestamp: string }>() => post<T>('/api/executions/reset'),
  },

  devices: {
    furnace: {
      connect: <T>(config: RequestBody) => post<T>('/api/devices/furnace/connect', config),
      disconnectDevice: <T = { device: string; connected: boolean }>() => post<T>('/api/devices/furnace/disconnect'),
      status: <T>() => get<T>('/api/devices/furnace/status'),
      runtimeStatus: () => get<RuntimeDeviceStatusEnvelope>('/api/devices/furnace/runtime/status'),
      commandLogs: <T = { logs: unknown[] }>() => get<T>('/api/devices/furnace/command-logs'),
      clearCommandLogs: <T = { logs: unknown[] }>() => post<T>('/api/devices/furnace/command-logs/clear'),
      ports: <T = string[]>() => get<T>('/api/devices/furnace/ports'),
      run: <T>() => post<T>('/api/devices/furnace/run'),
      pause: <T>() => post<T>('/api/devices/furnace/pause'),
      stop: <T>() => post<T>('/api/devices/furnace/stop'),
      setSegment: <T>(segment: number) => post<T>('/api/devices/furnace/segment/set', { segment }),
      getProgramSegments: <T = { segments: unknown[] }>() => get<T>('/api/devices/furnace/program/segments'),
      setProgramSegments: <T>(segments: unknown[]) => post<T>('/api/devices/furnace/program/segments', { segments }),
      presets: {
        list: <T>() => get<T>('/api/devices/furnace/presets'),
        create: <T>(preset: RequestBody) => post<T>('/api/devices/furnace/presets', preset),
        get: <T>(name: string) => get<T>(`/api/devices/furnace/presets/${encodeURIComponent(name)}`),
        update: <T>(name: string, segments: unknown[]) =>
          put<T>(`/api/devices/furnace/presets/${encodeURIComponent(name)}`, { segments }),
        delete: <T = { message: string }>(name: string) =>
          del<T>(`/api/devices/furnace/presets/${encodeURIComponent(name)}`),
        clone: <T>(name: string, newName: string) =>
          post<T>(`/api/devices/furnace/presets/${encodeURIComponent(name)}/clone`, { newName }),
        apply: <T>(name: string) => post<T>(`/api/devices/furnace/presets/${encodeURIComponent(name)}/apply`),
      },
      activitySummary: <T>(params?: QueryParams) => get<T>('/api/devices/furnace/activity-summary', params),
      samples: <T>(params?: QueryParams) => get<T>('/api/devices/furnace/samples', params),
      temperatureLogs: <T>(params?: QueryParams) => get<T>('/api/devices/furnace/logs/temperature', params),
    },

    mfc: {
      connect: <T>(config: RequestBody) => post<T>('/api/devices/mfc/connect', config),
      disconnectDevice: <T = { device: string; connected: boolean }>() => post<T>('/api/devices/mfc/disconnect'),
      status: <T>(address?: number) => get<T>('/api/devices/mfc/status', address === undefined ? undefined : { address }),
      runtimeStatus: () => get<RuntimeDeviceStatusEnvelope>('/api/devices/mfc/runtime/status'),
      commandLogs: <T = { logs: unknown[] }>() => get<T>('/api/devices/mfc/command-logs'),
      clearCommandLogs: <T = { logs: unknown[] }>() => post<T>('/api/devices/mfc/command-logs/clear'),
      ports: <T = string[]>() => get<T>('/api/devices/mfc/ports'),
      scan: <T>(body: RequestBody = {}) => post<T>('/api/devices/mfc/scan', body),
      stopScan: <T = { active: boolean; message: string }>() => del<T>('/api/devices/mfc/scan'),
      devices: <T>() => get<T>('/api/devices/mfc/devices'),
      setpoint: <T>(body: RequestBody) => post<T>('/api/devices/mfc/setpoint', body),
      flowLogs: <T>(params?: QueryParams) => get<T>('/api/devices/mfc/logs/flow', params),
    },

    zahner: {
      connect: <T>(config: RequestBody) => post<T>('/api/devices/zahner-zennium/connect', config),
      disconnectDevice: <T = { device: string; connected: boolean }>() =>
        post<T>('/api/devices/zahner-zennium/disconnect'),
      status: <T>() => get<T>('/api/devices/zahner-zennium/status'),
      runtimeStatus: () => get<RuntimeDeviceStatusEnvelope>('/api/devices/zahner-zennium/runtime/status'),
      ports: <T = string[]>() => get<T>('/api/devices/zahner-zennium/ports'),
    },
  },

  users: {
    create: <T>(body: RequestBody) => post<T>('/api/users', body),
    list: <T = { users: string[] }>() => get<T>('/api/users'),
    delete: <T = { success: boolean; message: string }>(user: string) => del<T>(`/api/users/${encodeURIComponent(user)}`),
    getSettings: <T>(user: string) => get<T>(`/api/users/${encodeURIComponent(user)}/settings`),
    saveSettings: <T>(user: string, settings: RequestBody) => put<T>(`/api/users/${encodeURIComponent(user)}/settings`, settings),
    saveSettingsSection: <T>(user: string, section: string, value: RequestBody) =>
      put<T>(`/api/users/${encodeURIComponent(user)}/settings/${encodeURIComponent(section)}`, value),
    testEmail: <T>(user: string) => post<T>(`/api/users/${encodeURIComponent(user)}/settings/test-email`),
  },

  files: {
    projects: <T = { success: boolean; projects: string[] }>(user: string) => get<T>('/api/files/projects', { user }),
    deleteProject: <T = { success: boolean; message: string }>(projectName: string, user: string) =>
      del<T>(`/api/files/projects/${encodeURIComponent(projectName)}`, { user }),
    browseSystemPath: <T = { success: boolean; path?: string; message?: string }>() =>
      get<T>('/api/files/browse-system-path'),
  },
};
