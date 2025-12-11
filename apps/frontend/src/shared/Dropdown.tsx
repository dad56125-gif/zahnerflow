import React, { useRef, useEffect } from 'react';
import { Portal } from '../components/Portal';

interface DropdownProps {
  isOpen: boolean;
  isHiding: boolean;
  onClose: () => void;
  position: { top: number; left: number; width: number; id?: string };
  children: React.ReactNode;
}

export const Dropdown: React.FC<DropdownProps> = ({ isOpen, isHiding, onClose, position, children }) => {
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || isHiding) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, isHiding, onClose]);

  if (!isOpen && !isHiding) return null;

  return (
    <Portal>
      <div
        ref={dropdownRef}
        className={`dropdown_base overlay_base ${isHiding ? 'hiding' : 'show'}`}
        style={{
          top: `${position.top}px`,
          left: `${position.left}px`,
          width: `${position.width}px`,
          pointerEvents: 'auto',
          zIndex: 10000
        } as React.CSSProperties}
      >
        <div className="dropdown_list">
          {children}
        </div>
      </div>
    </Portal>
  );
};