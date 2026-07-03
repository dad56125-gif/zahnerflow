import React, { RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type OverlayLayerState = 'entering' | 'open' | 'closing';

interface OverlayLayerRenderContext {
  state: OverlayLayerState;
  close: () => void;
}

interface OverlayLayerProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onClose?: () => void;
  children: React.ReactNode | ((context: OverlayLayerRenderContext) => React.ReactNode);
  container?: HTMLElement;
  id?: string;
  className?: string;
  contentClassName?: string;
  backdropClassName?: string;
  style?: React.CSSProperties;
  contentStyle?: React.CSSProperties;
  centered?: boolean;
  backdrop?: boolean;
  blur?: boolean;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  closeOnOutsidePointer?: boolean;
  outsidePointerIgnoreRefs?: RefObject<HTMLElement>[];
  rootPointerEvents?: 'auto' | 'none';
  zIndex?: number;
  exitDurationMs?: number;
}

const DEFAULT_EXIT_DURATION_MS = 260;

const resolveChildren = (
  children: OverlayLayerProps['children'],
  context: OverlayLayerRenderContext
) => {
  return typeof children === 'function' ? children(context) : children;
};

export const OverlayLayer: React.FC<OverlayLayerProps> = ({
  open = true,
  onOpenChange,
  onClose,
  children,
  container,
  id = 'overlay-root',
  className = '',
  contentClassName = '',
  backdropClassName = '',
  style,
  contentStyle,
  centered = false,
  backdrop = true,
  blur = false,
  closeOnBackdrop = true,
  closeOnEscape = true,
  closeOnOutsidePointer = false,
  outsidePointerIgnoreRefs = [],
  rootPointerEvents = 'auto',
  zIndex,
  exitDurationMs = DEFAULT_EXIT_DURATION_MS,
}) => {
  const [mountNode, setMountNode] = useState<HTMLDivElement | null>(null);
  const [isRendered, setIsRendered] = useState(open);
  const [state, setState] = useState<OverlayLayerState>(open ? 'entering' : 'closing');
  const contentRef = useRef<HTMLDivElement>(null);
  const closeRequestedRef = useRef(false);

  useEffect(() => {
    const target = container || document.body;
    const node = document.createElement('div');
    node.id = id;
    target.appendChild(node);
    setMountNode(node);

    return () => {
      node.remove();
    };
  }, [container, id]);

  useEffect(() => {
    if (open) {
      closeRequestedRef.current = false;
      setIsRendered(true);
      setState('entering');
      const frame = window.requestAnimationFrame(() => setState('open'));
      return () => window.cancelAnimationFrame(frame);
    }

    if (!isRendered) return;
    setState('closing');
    const timer = window.setTimeout(() => {
      setIsRendered(false);
      closeRequestedRef.current = false;
    }, exitDurationMs);

    return () => window.clearTimeout(timer);
  }, [open, isRendered, exitDurationMs]);

  const requestClose = useCallback(() => {
    if (closeRequestedRef.current || state === 'closing') return;
    closeRequestedRef.current = true;
    onOpenChange?.(false);
    onClose?.();
  }, [onClose, onOpenChange, state]);

  useEffect(() => {
    if (!isRendered || !closeOnEscape) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') requestClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closeOnEscape, isRendered, requestClose]);

  useEffect(() => {
    if (!isRendered || !closeOnOutsidePointer) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (contentRef.current?.contains(target)) return;
      if (outsidePointerIgnoreRefs.some((ref) => ref.current?.contains(target))) return;
      requestClose();
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [closeOnOutsidePointer, isRendered, outsidePointerIgnoreRefs, requestClose]);

  if (!mountNode || !isRendered) return null;

  const rootClassName = [
    'overlay-layer',
    `overlay-layer--${state}`,
    centered ? 'overlay-layer--centered' : '',
    blur ? 'overlay-layer--blur' : '',
    className,
  ].filter(Boolean).join(' ');

  const content = (
    <div
      className={rootClassName}
      data-state={state}
      data-pointer-events={rootPointerEvents}
      style={{ ...style, zIndex }}
    >
      {backdrop && (
        <div
          className={`overlay-layer__backdrop ${backdropClassName}`.trim()}
          onMouseDown={closeOnBackdrop ? requestClose : undefined}
        />
      )}
      <div
        ref={contentRef}
        className={`overlay-layer__content ${contentClassName}`.trim()}
        style={contentStyle}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        {resolveChildren(children, { state, close: requestClose })}
      </div>
    </div>
  );

  return createPortal(content, mountNode);
};

interface ModalLayerProps extends Omit<OverlayLayerProps, 'rootPointerEvents'> {
  blur?: boolean;
  closeOnBackdrop?: boolean;
}

export const ModalLayer: React.FC<ModalLayerProps> = ({
  blur = false,
  closeOnBackdrop = true,
  closeOnEscape = true,
  centered = false,
  exitDurationMs = DEFAULT_EXIT_DURATION_MS,
  ...props
}) => (
  <OverlayLayer
    {...props}
    centered={centered}
    backdrop={props.backdrop ?? true}
    blur={blur}
    closeOnBackdrop={closeOnBackdrop}
    closeOnEscape={closeOnEscape}
    rootPointerEvents="auto"
    exitDurationMs={exitDurationMs}
  />
);

interface FloatingLayerProps extends Omit<OverlayLayerProps, 'backdrop' | 'blur' | 'rootPointerEvents'> {
  passthrough?: boolean;
}

export const FloatingLayer: React.FC<FloatingLayerProps> = ({
  closeOnBackdrop = false,
  closeOnEscape = true,
  closeOnOutsidePointer = true,
  passthrough = true,
  exitDurationMs = DEFAULT_EXIT_DURATION_MS,
  ...props
}) => (
  <OverlayLayer
    {...props}
    backdrop={false}
    blur={false}
    closeOnBackdrop={closeOnBackdrop}
    closeOnEscape={closeOnEscape}
    closeOnOutsidePointer={closeOnOutsidePointer}
    rootPointerEvents={passthrough ? 'none' : 'auto'}
    exitDurationMs={exitDurationMs}
  />
);
