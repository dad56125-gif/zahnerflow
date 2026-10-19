import { useCallback, useEffect, useRef, useState } from 'react';
import type { DesktopUpdateState } from '@zahnerflow/types';
import { APP_VERSION } from '../../generated/appVersion';
import { ModalLayer } from '../shared/OverlayLayer';

const labels: Record<DesktopUpdateState['status'], string> = {
  idle: '手动检查是否有新版本', checking: '正在检查更新…', available: '发现新版本', upToDate: '当前无需更新',
  downloading: '正在下载安装包…', verifying: '正在校验安装包…', downloaded: '安装包已下载并通过校验',
  cancelled: '已取消，可继续下载', error: '更新操作失败',
};
const formatSize = (bytes: number) => `${(bytes / 1024 ** 2).toFixed(1)} MiB`;

export function UpdateControl() {
  const bridge = window.zahnerflowDesktop?.updates;
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<DesktopUpdateState>({ revision: -1, currentVersion: APP_VERSION, status: 'idle', downloadedBytes: 0, totalBytes: 0 });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const revision = useRef(-1);
  const requestPending = useRef(false);
  const accept = useCallback((next: DesktopUpdateState) => {
    if (next.revision < revision.current) return;
    revision.current = next.revision;
    setState(next);
  }, []);
  useEffect(() => {
    if (!bridge) return;
    let active = true;
    const receive = (next: DesktopUpdateState) => { if (active) accept(next); };
    const unsubscribe = bridge.onStateChanged(receive);
    void bridge.getState().then(receive).catch(() => { if (active) setError('无法读取更新状态，请重试。'); });
    return () => { active = false; unsubscribe(); };
  }, [bridge, accept]);
  const run = async (action: () => Promise<DesktopUpdateState | void>) => {
    if (requestPending.current) return;
    requestPending.current = true;
    setPending(true); setError('');
    try { const next = await action(); if (next) accept(next); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '操作失败，请重试。'); }
    finally { requestPending.current = false; setPending(false); }
  };
  const transferring = state.status === 'downloading' || state.status === 'verifying';
  const busy = transferring || state.status === 'checking';
  const canDownload = state.release?.canDownload && ['available', 'cancelled', 'error'].includes(state.status);
  const percent = state.totalBytes > 0 ? Math.min(100, state.downloadedBytes / state.totalBytes * 100) : 0;
  return <>
    <button type="button" className="bottom-bar__version" title="版本与更新" aria-label="版本与更新" onClick={() => setOpen(true)}>
      v{APP_VERSION}{state.status === 'available' && <span className="bottom-bar__update-dot" aria-label="有新版本" />}
    </button>
    <ModalLayer open={open} onOpenChange={setOpen} id="update-modal-overlay" centered className="update-overlay">
      {({ close }) => <section className="update-modal overlay-base" role="dialog" aria-modal="true" aria-labelledby="update-modal-title">
        <header className="update-modal__header">
          <h2 id="update-modal-title">版本与更新</h2>
          <button type="button" className="btn btn--sm btn--ghost btn--icon btn--rounded" onClick={close} aria-label="关闭版本与更新">✕</button>
        </header>
        <div className="update-modal__body">
          <div className="update-modal__versions"><span>当前版本</span><strong>v{state.currentVersion}</strong></div>
          {!bridge ? <p className="update-modal__hint">请在 ZahnerFlow 桌面版中检查更新和下载安装包。</p> : <>
            {state.release && <div className="update-modal__versions"><span>最新公开版本</span><strong>v{state.release.version}</strong></div>}
            <p className="update-modal__status" aria-live="polite">{state.status === 'cancelled' && !state.release ? '已取消检查' : labels[state.status]}</p>
            {(error || state.error) && <p className="update-modal__error" role="alert">{error || state.error}</p>}
            {state.release?.unsupportedReason && <p className="update-modal__hint">{state.release.unsupportedReason}</p>}
            {state.totalBytes > 0 && <div className="update-modal__progress">
              <progress max={100} value={percent} aria-label="安装包下载进度" />
              <span>{formatSize(state.downloadedBytes)} / {formatSize(state.totalBytes)} · {Math.floor(percent)}%</span>
            </div>}
            {state.filePath && <p className="update-modal__path">已保存到：{state.filePath}</p>}
            {state.release?.notes && <div className="update-modal__notes"><h3>更新说明</h3><pre>{state.release.notes}</pre></div>}
            <p className="update-modal__hint">仅下载安装包，不会自动安装或重启。{transferring ? '关闭此面板后下载继续。' : ''}</p>
          </>}
        </div>
        {bridge && <footer className="update-modal__footer">
          <button type="button" className="btn btn--sm btn--secondary" disabled={busy || pending} onClick={() => void run(bridge.check)}>检查更新</button>
          {canDownload && <button type="button" className="btn btn--sm btn--primary" disabled={pending} onClick={() => void run(bridge.download)}>
            {state.status === 'cancelled' || state.status === 'error' ? '继续下载' : '下载安装包'}
          </button>}
          {transferring && <button type="button" className="btn btn--sm btn--secondary" disabled={pending} onClick={() => void run(bridge.cancel)}>取消下载</button>}
          {state.status === 'downloaded' && <button type="button" className="btn btn--sm btn--primary" disabled={pending} onClick={() => void run(bridge.revealFile)}>打开所在文件夹</button>}
        </footer>}
      </section>}
    </ModalLayer>
  </>;
}
