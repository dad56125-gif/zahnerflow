import React, { RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DropdownPosition } from './dropdownPosition';

interface DropdownProps {
  isOpen: boolean;
  isHiding: boolean;
  onClose: () => void;
  position: DropdownPosition;
  children: React.ReactNode;
  pointerEvents?: 'auto' | 'none';
  className?: string;
  triggerRef?: RefObject<HTMLElement>;
  triggerElement?: HTMLElement | null;
  lockWheelOutside?: boolean;
}

type DropdownPhase = 'open' | 'closing';

const DROPDOWN_EXIT_DURATION_MS = 260;

export const Dropdown: React.FC<DropdownProps> = ({
  isOpen,
  isHiding,
  onClose,
  position,
  children,
  className,
  triggerRef,
  triggerElement,
  lockWheelOutside = false,
}) => {
  const [mountNode, setMountNode] = useState<HTMLDivElement | null>(null);
  const [isRendered, setIsRendered] = useState(isOpen && !isHiding);
  const [phase, setPhase] = useState<DropdownPhase>(isOpen && !isHiding ? 'open' : 'closing');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const closeRequestedRef = useRef(false);

  useEffect(() => {
    const node = document.createElement('div');
    node.id = position.id || 'dropdown-portal';
    document.body.appendChild(node);
    setMountNode(node);

    return () => {
      node.remove();
    };
  }, [position.id]);

  useEffect(() => {
    const shouldOpen = isOpen && !isHiding;

    if (shouldOpen) {
      closeRequestedRef.current = false;
      setIsRendered(true);
      const frame = window.requestAnimationFrame(() => setPhase('open'));
      return () => window.cancelAnimationFrame(frame);
    }

    if (!isRendered) return;

    setPhase('closing');
    const timer = window.setTimeout(() => {
      setIsRendered(false);
      closeRequestedRef.current = false;
    }, DROPDOWN_EXIT_DURATION_MS);

    return () => window.clearTimeout(timer);
  }, [isOpen, isHiding, isRendered]);

  const requestClose = useCallback(() => {
    if (closeRequestedRef.current || phase === 'closing') return;
    closeRequestedRef.current = true;
    onClose();
  }, [onClose, phase]);

  useEffect(() => {
    if (!isRendered || phase === 'closing') return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (dropdownRef.current?.contains(target)) return;
      if (triggerRef?.current?.contains(target)) return;
      if (triggerElement?.contains(target)) return;
      requestClose();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') requestClose();
    };

    document.addEventListener('mousedown', handlePointerDown, true);
    document.addEventListener('touchstart', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown, true);
      document.removeEventListener('touchstart', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isRendered, phase, requestClose, triggerElement, triggerRef]);

  useEffect(() => {
    if (!lockWheelOutside || !isRendered || phase === 'closing') return;

    const handleWheel = (event: WheelEvent) => {
      const target = event.target as Node;
      if (dropdownRef.current?.contains(target)) return;
      event.preventDefault();
    };

    document.addEventListener('wheel', handleWheel, { capture: true, passive: false });
    return () => document.removeEventListener('wheel', handleWheel, { capture: true });
  }, [isRendered, lockWheelOutside, phase]);

  if (!mountNode || !isRendered) return null;

  return createPortal(
    <div
      ref={dropdownRef}
      className={`dropdown overlay-base ${className || ''} ${phase === 'closing' ? 'is-hiding' : 'is-visible'}`}
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        width: `${position.width}px`,
        pointerEvents: 'auto',
        zIndex: 10000
      } as React.CSSProperties}
      onWheel={(event) => event.stopPropagation()}
    >
      <div className="dropdown__list">
        {children}
      </div>
    </div>,
    mountNode
  );
};
