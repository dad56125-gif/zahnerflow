const SCROLLABLE_OVERFLOW_VALUES = new Set(['auto', 'scroll', 'overlay']);

export function isScrollableOverflow(value: string): boolean {
  return SCROLLABLE_OVERFLOW_VALUES.has(value);
}

function isScrollSurface(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  return (
    isScrollableOverflow(style.overflow) ||
    isScrollableOverflow(style.overflowX) ||
    isScrollableOverflow(style.overflowY)
  );
}

function markScrollSurfaces(root: ParentNode): void {
  const elements = root instanceof HTMLElement
    ? [root, ...root.querySelectorAll<HTMLElement>('[class], [style]')]
    : root.querySelectorAll<HTMLElement>('[class], [style]');

  elements.forEach((element) => {
    if (isScrollSurface(element)) {
      element.classList.add('scroll-render-safe');
    }
  });
}

/**
 * Chromium can defer a backdrop-filter layer while its scroll container moves,
 * leaving a transient blank card even though React has rendered its content.
 * Mark every real and subsequently mounted scroll surface before it is used so
 * the shared CSS can keep the scrolling compositor on a reliable paint path.
 */
export function installScrollRenderingSafety(root: ParentNode = document): () => void {
  markScrollSurfaces(root);

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes') {
        const element = mutation.target;
        if (element instanceof HTMLElement && !element.classList.contains('scroll-render-safe')) {
          markScrollSurfaces(element);
        }
        return;
      }

      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) {
          markScrollSurfaces(node);
        }
      });
    });
  });

  observer.observe(root, {
    attributes: true,
    attributeFilter: ['class', 'style'],
    childList: true,
    subtree: true,
  });
  return () => observer.disconnect();
}
