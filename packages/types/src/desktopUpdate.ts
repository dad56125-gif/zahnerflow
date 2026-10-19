/** 桌面更新 IPC 契约；不属于 Python 业务运行时。 */
export type DesktopUpdateStatus = 'idle' | 'checking' | 'available' | 'upToDate' | 'downloading' | 'verifying' | 'downloaded' | 'cancelled' | 'error';

export interface DesktopUpdateRelease {
  version: string;
  tag: string;
  name: string;
  notes: string;
  publishedAt: string;
  assetName?: string;
  assetSize?: number;
  canDownload: boolean;
  unsupportedReason?: string;
}

export interface DesktopUpdateState {
  revision: number;
  currentVersion: string;
  status: DesktopUpdateStatus;
  release?: DesktopUpdateRelease;
  downloadedBytes: number;
  totalBytes: number;
  error?: string;
  filePath?: string;
}

export interface DesktopUpdateBridge {
  getState: () => Promise<DesktopUpdateState>;
  check: () => Promise<DesktopUpdateState>;
  download: () => Promise<DesktopUpdateState>;
  cancel: () => Promise<DesktopUpdateState>;
  revealFile: () => Promise<void>;
  onStateChanged: (callback: (state: DesktopUpdateState) => void) => () => void;
}
