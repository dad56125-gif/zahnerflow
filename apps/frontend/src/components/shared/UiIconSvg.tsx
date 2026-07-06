import React from 'react';
import { UI_ICON_PATHS, type UiIconName } from './uiIcons';

interface UiIconSvgProps {
  name: UiIconName;
  className?: string;
  style?: React.CSSProperties;
}

export function UiIconSvg({ name, className, style }: UiIconSvgProps) {
  const icon = UI_ICON_PATHS[name];

  return (
    <svg
      className={`btn-svg-icon ui-svg-icon ui-svg-icon--${name}${className ? ` ${className}` : ''}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      style={style}
    >
      {icon.primary.map((path) => (
        <path key={path} className="btn-svg-icon__primary" d={path} />
      ))}
      {icon.secondary.map((path) => (
        <path key={path} className="btn-svg-icon__secondary" d={path} />
      ))}
    </svg>
  );
}

