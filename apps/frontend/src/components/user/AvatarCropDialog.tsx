import { useRef, useState } from 'react';
import { ModalLayer } from '../shared/OverlayLayer';

const CROP_SIZE = 200;
const OUTPUT_SIZE = 60;

export function AvatarCropDialog({ src, onClose, onConfirm }: {
  src: string; onClose: () => void; onConfirm: (avatar: string) => void;
}) {
  const imageRef = useRef<HTMLImageElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState({ width: CROP_SIZE, height: CROP_SIZE });
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const clamp = (x: number, y: number, zoom = scale) => ({
    x: Math.max(-(size.width * zoom - CROP_SIZE) / 2, Math.min((size.width * zoom - CROP_SIZE) / 2, x)),
    y: Math.max(-(size.height * zoom - CROP_SIZE) / 2, Math.min((size.height * zoom - CROP_SIZE) / 2, y)),
  });
  const confirm = () => {
    if (!ready || !imageRef.current) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = OUTPUT_SIZE;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('无法创建图像画布');
      context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
      const ratio = OUTPUT_SIZE / CROP_SIZE;
      context.drawImage(imageRef.current,
        ((CROP_SIZE - size.width * scale) / 2 + offset.x) * ratio,
        ((CROP_SIZE - size.height * scale) / 2 + offset.y) * ratio,
        size.width * scale * ratio, size.height * scale * ratio);
      onConfirm(canvas.toDataURL('image/png'));
    } catch { setError('无法处理这张图片，请更换文件重试。'); }
  };
  return <ModalLayer onClose={onClose} centered id="avatar-crop-dialog">
    <section className="avatar-crop-dialog" role="dialog" aria-modal="true" aria-labelledby="avatar-crop-title">
      <h3 id="avatar-crop-title">调整头像</h3>
      <div className="avatar-crop-dialog__viewport" style={{ width: CROP_SIZE, height: CROP_SIZE }}
        onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX - offset.x, y: event.clientY - offset.y }; }}
        onPointerMove={event => { if (drag.current) setOffset(clamp(event.clientX - drag.current.x, event.clientY - drag.current.y)); }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
        tabIndex={0} aria-label="头像位置，拖动或使用方向键调整" onKeyDown={event => {
          if (!event.key.startsWith('Arrow')) return;
          event.preventDefault(); setOffset(clamp(offset.x + (event.key === 'ArrowRight' ? 5 : event.key === 'ArrowLeft' ? -5 : 0), offset.y + (event.key === 'ArrowDown' ? 5 : event.key === 'ArrowUp' ? -5 : 0)));
        }}>
        <img ref={imageRef} src={src} alt="头像预览" draggable={false} onError={() => { setReady(false); setError('图片读取失败'); }}
          onLoad={event => { const img = event.currentTarget; const ratio = CROP_SIZE / Math.min(img.naturalWidth, img.naturalHeight); setSize({ width: img.naturalWidth * ratio, height: img.naturalHeight * ratio }); setReady(true); }}
          style={{ width: size.width * scale, height: size.height * scale, transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))` }} />
      </div>
      <label>缩放 {Math.round(scale * 100)}%<input type="range" min="1" max="5" step="0.05" value={scale}
        onChange={event => { const zoom = Number(event.target.value); setScale(zoom); setOffset(clamp(offset.x, offset.y, zoom)); }} /></label>
      <p>拖动图片或使用方向键调整位置</p>
      {error && <p role="alert">{error}</p>}
      <footer><button className="btn btn--md" onClick={onClose}>取消</button><button className="btn btn--md btn--primary" disabled={!ready} onClick={confirm}>确认</button></footer>
    </section>
  </ModalLayer>;
}
