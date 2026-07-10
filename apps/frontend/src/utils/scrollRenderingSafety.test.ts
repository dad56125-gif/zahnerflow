import { describe, expect, it } from 'vitest';
import { installScrollRenderingSafety, isScrollableOverflow } from './scrollRenderingSafety';

describe('isScrollableOverflow', () => {
  it.each(['auto', 'scroll', 'overlay'])('recognizes %s as a scrollable overflow mode', (value) => {
    expect(isScrollableOverflow(value)).toBe(true);
  });

  it.each(['visible', 'hidden', 'clip', ''])('does not mark %s as scrollable', (value) => {
    expect(isScrollableOverflow(value)).toBe(false);
  });

  it('marks existing and later-enabled scroll surfaces', async () => {
    const root = document.createElement('div');
    const existing = document.createElement('div');
    existing.style.overflow = 'auto';
    root.append(existing);
    document.body.append(root);

    const uninstall = installScrollRenderingSafety(root);
    expect(existing.classList.contains('scroll-render-safe')).toBe(true);

    const laterEnabled = document.createElement('div');
    root.append(laterEnabled);
    laterEnabled.style.overflowY = 'scroll';
    await Promise.resolve();

    expect(laterEnabled.classList.contains('scroll-render-safe')).toBe(true);
    uninstall();
    root.remove();
  });
});
