import React from 'react';

const NODE_ICON_PATHS = {
  eis_potentiostatic: {
    secondary: ['M3.5,16.5C3.5,4.6,20.5,4.6,20.5,16.5', 'M3.5,20H20.5'],
    primary: [],
    label: 'V',
  },
  eis_galvanostatic: {
    secondary: ['M3.5,16.5C3.5,4.6,20.5,4.6,20.5,16.5', 'M3.5,20H20.5'],
    primary: [],
    label: 'A',
  },
  voltage_ramp: {
    secondary: ['M7.2,12.2V7.2', 'M15.4,20H20', 'M17.4,7.2H20V9.8'],
    primary: ['M7.2,20V7.2', 'M7.2,20H20', 'M9.2,17.8L20,7.2'],
    label: 'V',
  },
  current_ramp: {
    secondary: ['M7.2,12.2V7.2', 'M15.4,20H20', 'M17.4,7.2H20V9.8'],
    primary: ['M7.2,20V7.2', 'M7.2,20H20', 'M9.2,17.8L20,7.2'],
    label: 'A',
  },
  ocp_measurement: {
    secondary: ['M6.2,6.4L9.1,9.3', 'M14.9,14.7L17.8,17.6', 'M9.1,14.7L6.2,17.6', 'M14.9,9.3L17.8,6.4'],
    primary: ['M12,12m-3.2,0a3.2,3.2,0,1,0,6.4,0a3.2,3.2,0,1,0-6.4,0', 'M4.2,20H19.8'],
  },
  chronoamperometry: {
    secondary: ['M6.2,5.2a4.2,4.2,0,1,1,0,8.4a4.2,4.2,0,1,1,0-8.4', 'M6.2,7.2V9.4L7.9,10.6'],
    primary: ['M3.8,19H20.2', 'M4.2,14.4H7.6L9.1,10.7L11.1,17.2L13.6,12.4L15.2,14.4H20'],
    label: 'A',
  },
  chronopotentiometry: {
    secondary: ['M6.2,5.2a4.2,4.2,0,1,1,0,8.4a4.2,4.2,0,1,1,0-8.4', 'M6.2,7.2V9.4L7.9,10.6'],
    primary: ['M3.8,19H20.2', 'M4.2,14.4H7.2C8,10.9,10,10.9,10.8,14.4S13.5,17.9,15,14.4H20'],
    label: 'V',
  },
  galvanostatic_switching: {
    secondary: ['M2.2,5H5M3.6,3.6V6.4', 'M18.6,21.6H22.4'],
    primary: ['M2.8,20H7.5V7.2H9.1', 'M14.9,20H16.5V7.2H21.2'],
    label: 'A',
  },
  potentiostatic_switching: {
    secondary: ['M2.2,5H5M3.6,3.6V6.4', 'M18.6,21.6H22.4'],
    primary: ['M2.8,20H7.5V7.2H9.1', 'M14.9,20H16.5V7.2H21.2'],
    label: 'V',
  },
  galvanostatic_step_ramp: {
    secondary: ['M7.2,12.2V7.2', 'M15.4,20H20', 'M17.4,7.2H20V9.8'],
    primary: ['M7.2,20V7.2', 'M7.2,20H20', 'M9,17.8H12.2V14.9H15.3V12H18.5V9.1H20'],
    label: 'A',
  },
  potentiostatic_step_ramp: {
    secondary: ['M7.2,12.2V7.2', 'M15.4,20H20', 'M17.4,7.2H20V9.8'],
    primary: ['M7.2,20V7.2', 'M7.2,20H20', 'M9,17.8H12.2V14.9H15.3V12H18.5V9.1H20'],
    label: 'V',
  },
  change_temperature: {
    secondary: ['M6,6H8', 'M6,10H8', 'M6,14H7'],
    primary: ['M12,13.55V5a2,2,0,0,1,4,0v8.55a4,4,0,1,1-4,0Z'],
  },
  change_gas_flow: {
    secondary: ['M3,7h7a2,2,0,0,0,0-4', 'M16,21a3,3,0,0,0,0-6H3'],
    primary: ['M3,19H10', 'M3,11H17.5a3.5,3.5,0,0,0,0-7'],
  },
  wait_delay: {
    secondary: ['M8,12H12V7'],
    primary: ['M12,3a9,9,0,1,1-9,9'],
  },
  scheduled_start: {
    secondary: ['M12,7V12L14,15'],
    primary: ['M12,3a9,9,0,1,1,0,18a9,9,0,1,1,0-18'],
  },
  loop_start: {
    secondary: ['M5,5L3,7L5,9', 'M3,7H18'],
    primary: ['M3,7H18a3,3,0,0,1,3,3a3,3,0,0,1-3,3H9a3,3,0,0,0-3,3a3,3,0,0,0,3,3H21'],
  },
  loop_end: {
    secondary: ['M19,19L21,17L19,15', 'M6,17H21'],
    primary: ['M21,17H6a3,3,0,0,1-3-3a3,3,0,0,1,3-3H15a3,3,0,0,0,3-3a3,3,0,0,0-3-3H3'],
  },
  workflow_block: {
    secondary: ['M9.38,19.54a8,8,0,0,0,9.81-3.92A7.86,7.86,0,0,0,20.06,12A8.26,8.26,0,0,0,20,11L3,17.78'],
    primary: ['M21,6.22L4,13a8.43,8.43,0,0,1-.06-1a7.86,7.86,0,0,1,.87-3.62A8,8,0,0,1,11.94,4a7.88,7.88,0,0,1,2.67,.46'],
  },
} as const;

export function NodeIconSvg({ nodeType, fallback }: { nodeType?: string; fallback: React.ReactNode }) {
  if (!nodeType || !(nodeType in NODE_ICON_PATHS)) {
    return <>{fallback}</>;
  }

  const icon = NODE_ICON_PATHS[nodeType as keyof typeof NODE_ICON_PATHS];
  const shouldDrawPrimaryOnTop = nodeType === 'chronoamperometry' || nodeType === 'chronopotentiometry';
  const labelPosition = (() => {
    if (
      nodeType === 'voltage_ramp' ||
      nodeType === 'current_ramp' ||
      nodeType === 'galvanostatic_step_ramp' ||
      nodeType === 'potentiostatic_step_ramp'
    ) {
      return { x: '10.8', y: '8.6' };
    }
    if (nodeType === 'chronoamperometry' || nodeType === 'chronopotentiometry') {
      return { x: '18', y: '7.2' };
    }
    if (nodeType === 'galvanostatic_switching' || nodeType === 'potentiostatic_switching') {
      return { x: '12', y: '12.4' };
    }
    return { x: '12', y: '13.8' };
  })();

  return (
    <svg
      className={`node-library-svg node-library-svg--${nodeType}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      {!shouldDrawPrimaryOnTop && icon.primary.map((path) => (
        <path key={path} className="node-library-svg__primary" d={path} />
      ))}
      {icon.secondary.map((path) => (
        <path key={path} className="node-library-svg__secondary" d={path} />
      ))}
      {shouldDrawPrimaryOnTop && icon.primary.map((path) => (
        <path key={path} className="node-library-svg__primary" d={path} />
      ))}
      {'label' in icon && (
        <text
          className="node-library-svg__label"
          x={labelPosition.x}
          y={labelPosition.y}
        >
          {icon.label}
        </text>
      )}
    </svg>
  );
}
