export interface DropdownPosition {
  top: number;
  left: number;
  width: number;
  id?: string;
}

interface DropdownAnchorRect {
  bottom: number;
  left: number;
  right: number;
  width: number;
}

interface ResolveDropdownPositionOptions {
  id?: string;
  offset?: number;
  minWidth?: number;
  viewportPadding?: number;
}

const DEFAULT_DROPDOWN_MIN_WIDTH = 280;
const DEFAULT_VIEWPORT_PADDING = 12;

export function resolveDropdownPosition(
  rect: DropdownAnchorRect,
  options: ResolveDropdownPositionOptions = {}
): DropdownPosition {
  const offset = options.offset ?? 4;
  const minWidth = options.minWidth ?? DEFAULT_DROPDOWN_MIN_WIDTH;
  const viewportPadding = options.viewportPadding ?? DEFAULT_VIEWPORT_PADDING;
  const viewportWidth = typeof window === 'undefined' ? rect.right + minWidth : window.innerWidth;
  const maxAvailableWidth = Math.max(0, viewportWidth - viewportPadding * 2);
  const preferredWidth = Math.max(rect.width, minWidth);
  const width = maxAvailableWidth > 0 ? Math.min(preferredWidth, maxAvailableWidth) : preferredWidth;
  const maxLeft = viewportWidth - viewportPadding - width;
  const leftAligned = rect.left;
  const rightAligned = rect.right - width;
  const preferredLeft = leftAligned + width > viewportWidth - viewportPadding
    ? rightAligned
    : leftAligned;
  const left = Math.max(viewportPadding, Math.min(preferredLeft, maxLeft));

  return {
    top: rect.bottom + offset,
    left,
    width,
    id: options.id,
  };
}
