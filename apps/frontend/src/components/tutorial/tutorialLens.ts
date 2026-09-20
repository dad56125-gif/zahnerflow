// A display-only mirror of the rendered target. Business components remain untouched.
export function createTutorialLens(host: HTMLDivElement) {
  let target: HTMLElement | null = null;
  host.inert = true;
  const clear = () => {
    target = null;
    host.replaceChildren();
    host.hidden = true;
  };
  const refresh = () => {
    if (!target?.isConnected || !target.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) || target.closest('.is-hiding, [data-state="closing"]')) { clear(); return; }
    const rect = target.getBoundingClientRect();
    const scale = 1.4;
    const width = Math.min(640, innerWidth - 32, rect.width * scale + 24);
    const height = Math.min(260, innerHeight - 120, rect.height * scale + 48);
    const obstacles = [rect, ...[...document.querySelectorAll<HTMLElement>('[data-tutorial-controls]')].map(el => el.getBoundingClientRect())];
    const candidates = [
      { left: innerWidth - width - 16, top: innerHeight - height - 50 },
      { left: 16, top: innerHeight - height - 50 },
      { left: innerWidth - width - 16, top: 90 },
      { left: 16, top: 90 },
    ];
    const overlap = (p: { left: number; top: number }) => obstacles.reduce((sum, r) => sum + Math.max(0, Math.min(p.left + width, r.right) - Math.max(p.left, r.left)) * Math.max(0, Math.min(p.top + height, r.bottom) - Math.max(p.top, r.top)), 0);
    const position = candidates.reduce((best, p) => overlap(p) < overlap(best) ? p : best);
    Object.assign(host.style, { left: `${Math.max(8, position.left)}px`, top: `${Math.max(8, Math.min(innerHeight - height - 8, position.top))}px`, width: `${width}px`, height: `${height}px` });
    const copy = target.cloneNode(true) as HTMLElement;
    const sources = [target, ...target.querySelectorAll('*')];
    const copies = [copy, ...copy.querySelectorAll('*')];
    sources.forEach((source, index) => {
      const clone = copies[index] as HTMLElement | SVGElement;
      // Computed styles retain ancestor-dependent CSS without mounting another app.
      const style = getComputedStyle(source);
      for (const name of style) clone.style.setProperty(name, style.getPropertyValue(name));
      for (const attribute of [...clone.attributes]) {
        if (attribute.name !== 'style' && (attribute.name === 'id' || attribute.name === 'name' || attribute.name.startsWith('data-') || attribute.name.startsWith('on'))) clone.removeAttribute(attribute.name);
      }
      clone.style.setProperty('animation', 'none', 'important');
      clone.style.setProperty('transition', 'none', 'important');
      if (source instanceof HTMLInputElement && clone instanceof HTMLInputElement) { clone.value = source.value; clone.checked = source.checked; }
      if (source instanceof HTMLTextAreaElement && clone instanceof HTMLTextAreaElement) clone.value = source.value;
      if (source instanceof HTMLCanvasElement && clone instanceof HTMLCanvasElement) { clone.width = source.width; clone.height = source.height; clone.getContext('2d')?.drawImage(source, 0, 0); }
    });
    const sourceWidth = target.offsetWidth || rect.width;
    const sourceHeight = target.offsetHeight || rect.height;
    Object.assign(copy.style, { position: 'relative', inset: 'auto', margin: '0', boxSizing: 'border-box', width: `${sourceWidth}px`, height: `${sourceHeight}px`, transform: `scale(${scale * rect.width / sourceWidth}, ${scale * rect.height / sourceHeight})`, transformOrigin: 'top left', scale: 'none', opacity: '1' });
    const label = document.createElement('div');
    label.className = 'tutorial-lens__label';
    label.textContent = '局部放大 · 1.4×';
    const viewport = document.createElement('div');
    viewport.className = 'tutorial-lens__viewport';
    viewport.attachShadow({ mode: 'open' }).append(copy);
    host.replaceChildren(label, viewport);
    copies.forEach((clone, index) => { clone.scrollTop = sources[index].scrollTop; clone.scrollLeft = sources[index].scrollLeft; });
    host.hidden = false;
  };
  const timer = window.setInterval(refresh, 120);
  clear();
  return { show(element: HTMLElement) { target = element; refresh(); }, clear, dispose() { window.clearInterval(timer); clear(); } };
}
