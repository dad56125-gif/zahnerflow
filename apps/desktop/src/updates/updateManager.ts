import type { DesktopUpdateState } from '@zahnerflow/types';
import { DirectUpdateTransport } from './directTransport.js';
import { downloadUpdate, type UpdateTransport } from './download.js';
import { RELEASE_API, parseRelease, isNewerVersion, type ParsedRelease } from './release.js';

interface UpdateOptions {
  currentVersion: string;
  cacheRoot: string;
  downloadsRoot: string;
  platform?: string;
  arch?: string;
  onStateChanged: (state: DesktopUpdateState) => void;
  transport?: UpdateTransport;
}

/** 单进程唯一更新状态；窗口关闭/重开不会重建下载任务。 */
export class UpdateManager {
  private state: DesktopUpdateState;
  private release?: ParsedRelease;
  private job?: Promise<void>;
  private controller?: AbortController;
  private readonly transport: UpdateTransport;
  private readonly direct?: DirectUpdateTransport;

  constructor(private readonly options: UpdateOptions) {
    this.state = { revision: 0, currentVersion: options.currentVersion, status: 'idle', downloadedBytes: 0, totalBytes: 0 };
    this.transport = options.transport ?? (this.direct = new DirectUpdateTransport());
  }

  getState(): DesktopUpdateState { return structuredClone(this.state); }

  private change(patch: Partial<DesktopUpdateState>): void {
    this.state = { ...this.state, ...patch, revision: this.state.revision + 1 };
    this.options.onStateChanged(this.getState());
  }

  async check(): Promise<DesktopUpdateState> {
    if (this.job) return this.getState();
    this.release = undefined;
    const controller = this.controller = new AbortController();
    this.change({ status: 'checking', release: undefined, error: undefined, filePath: undefined, downloadedBytes: 0, totalBytes: 0 });
    this.job = (async () => {
      try {
        const data = await this.transport.json(`${RELEASE_API}/latest`, AbortSignal.any([controller.signal, AbortSignal.timeout(25_000)]));
        controller.signal.throwIfAborted();
        this.release = parseRelease(data, this.options.platform ?? process.platform, this.options.arch ?? process.arch);
        this.change({ release: this.release.info, status: isNewerVersion(this.release.info.version, this.options.currentVersion) ? 'available' : 'upToDate' });
      } catch (error) { this.failed(error, controller.signal); }
      finally { this.job = undefined; }
    })();
    await this.job;
    return this.getState();
  }

  download(): DesktopUpdateState {
    if (this.job || this.state.status === 'downloaded') return this.getState();
    const asset = this.release?.asset;
    if (!asset || !this.release?.info.canDownload || !isNewerVersion(this.release.info.version, this.options.currentVersion)) {
      throw new Error('请先检查更新并选择可下载的新版本。');
    }
    const controller = this.controller = new AbortController();
    this.change({ status: 'downloading', error: undefined, filePath: undefined, downloadedBytes: 0, totalBytes: asset.size });
    let lastProgress = 0;
    this.job = (async () => {
      try {
        const filePath = await downloadUpdate({
          transport: this.transport, asset, cacheRoot: this.options.cacheRoot, downloadsRoot: this.options.downloadsRoot,
          signal: controller.signal,
          onProgress: bytes => {
            if (controller.signal.aborted) return;
            if (Date.now() - lastProgress > 200 || bytes === asset.size) {
              lastProgress = Date.now(); this.change({ downloadedBytes: bytes });
            }
          },
          onVerifying: () => { if (!controller.signal.aborted) this.change({ status: 'verifying', downloadedBytes: asset.size }); },
        });
        this.change({ status: 'downloaded', filePath, downloadedBytes: asset.size });
      } catch (error) { this.failed(error, controller.signal); }
      finally { this.job = undefined; }
    })();
    return this.getState();
  }

  async cancel(): Promise<DesktopUpdateState> {
    if (this.job) { this.controller?.abort(); await this.job; }
    return this.getState();
  }

  private failed(error: unknown, signal: AbortSignal): void {
    this.change({ status: signal.aborted ? 'cancelled' : 'error', error: signal.aborted ? undefined : (error instanceof Error ? error.message : '更新操作失败，请重试。') });
  }

  dispose(): void { this.controller?.abort(); this.direct?.dispose(); }
}
