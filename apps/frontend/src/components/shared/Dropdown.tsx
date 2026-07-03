import React, { RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface DropdownProps {
  isOpen: boolean;
  isHiding: boolean;
  onClose: () => void;
  position: { top: number; left: number; width: number; id?: string };
  children: React.ReactNode;
  pointerEvents?: 'auto' | 'none';
  className?: string;
  triggerRef?: RefObject<HTMLElement>;
}

type DropdownPhase = 'open' | 'closing';

const DROPDOWN_EXIT_DURATION_MS = 260;

export const Dropdown: React.FC<DropdownProps> = ({ isOpen, isHiding, onClose, position, children, className, triggerRef }) => {
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
      requestClose();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') requestClose();
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isRendered, phase, requestClose, triggerRef]);

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
    >
      <div className="dropdown__list">
        {children}
      </div>
    </div>,
    mountNode
  );
};
