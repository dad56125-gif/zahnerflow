export type UiIconName =
  | 'activity'
  | 'battery'
  | 'chart'
  | 'check'
  | 'close'
  | 'data'
  | 'error'
  | 'inbox'
  | 'info'
  | 'link'
  | 'list'
  | 'loop'
  | 'mail'
  | 'megaphone'
  | 'refresh'
  | 'settings'
  | 'signal'
  | 'skip'
  | 'timer'
  | 'trash'
  | 'user'
  | 'warning'
  | 'workflow';

type UiIconPaths = {
  primary: string[];
  secondary: string[];
};

export const UI_ICON_PATHS: Record<UiIconName, UiIconPaths> = {
  activity: {
    primary: ['M3,12H7L9,7L13,17L15,12H21'],
    secondary: ['M4,19H20'],
  },
  battery: {
    primary: ['M4,8H18a2,2,0,0,1,2,2v4a2,2,0,0,1-2,2H4a2,2,0,0,1-2-2V10A2,2,0,0,1,4,8Z'],
    secondary: ['M22,11v2', 'M6,12H10'],
  },
  chart: {
    primary: ['M4,19H20', 'M6,17L11,11L14,14L19,7'],
    secondary: ['M16,7H19V10'],
  },
  check: {
    primary: ['M20,6L9,17L4,12'],
    secondary: ['M12,3a9,9,0,1,1,0,18a9,9,0,1,1,0-18'],
  },
  close: {
    primary: ['M6,6L18,18', 'M18,6L6,18'],
    secondary: [],
  },
  data: {
    primary: ['M4,19H20', 'M7,16V10', 'M12,16V6', 'M17,16V12'],
    secondary: ['M5,5H19'],
  },
  error: {
    primary: ['M15,9L9,15', 'M9,9L15,15'],
    secondary: ['M12,3a9,9,0,1,1,0,18a9,9,0,1,1,0-18'],
  },
  inbox: {
    primary: ['M4,13L6.4,6.2A2,2,0,0,1,8.3,5H15.7a2,2,0,0,1,1.9,1.2L20,13V18a2,2,0,0,1-2,2H6a2,2,0,0,1-2-2Z'],
    secondary: ['M4,13H8l1.4,2h5.2L16,13h4'],
  },
  info: {
    primary: ['M12,11V17', 'M12,7.5V7.6'],
    secondary: ['M12,3a9,9,0,1,1,0,18a9,9,0,1,1,0-18'],
  },
  link: {
    primary: ['M10,13a5,5,0,0,0,7.1,0l2-2a5,5,0,0,0-7.1-7.1l-1.1,1.1', 'M14,11a5,5,0,0,0-7.1,0l-2,2A5,5,0,0,0,12,20.1l1.1-1.1'],
    secondary: ['M8.5,15.5L15.5,8.5'],
  },
  list: {
    primary: ['M8,6H20', 'M8,12H20', 'M8,18H20'],
    secondary: ['M4,6H4.1', 'M4,12H4.1', 'M4,18H4.1'],
  },
  loop: {
    primary: ['M4,12A7,7,0,0,1,16.4,7.6', 'M20,12A7,7,0,0,1,7.6,16.4'],
    secondary: ['M16,4V8H20', 'M8,20V16H4'],
  },
  mail: {
    primary: ['M4,6H20V18H4Z'],
    secondary: ['M4,7L12,13L20,7'],
  },
  megaphone: {
    primary: ['M4,13H7L17,17V7L7,11H4Z'],
    secondary: ['M7,13L9,20', 'M19,9.5a4,4,0,0,1,0,5'],
  },
  refresh: {
    primary: ['M4,12A8,8,0,0,1,18.9,8', 'M20,12A8,8,0,0,1,5.1,16'],
    secondary: ['M14,8H19V3', 'M10,16H5V21'],
  },
  settings: {
    primary: ['M12,9a3,3,0,1,1,0,6a3,3,0,1,1,0-6'],
    secondary: ['M19.4,13.5a7.8,7.8,0,0,0,.1-1.5a7.8,7.8,0,0,0-.1-1.5l2-1.5l-2-3.4l-2.4,1a7.8,7.8,0,0,0-2.6-1.5L14,2H10L9.6,4.6A7.8,7.8,0,0,0,7,6.1l-2.4-1l-2,3.4l2,1.5A7.8,7.8,0,0,0,4.5,12a7.8,7.8,0,0,0,.1,1.5l-2,1.5l2,3.4l2.4-1a7.8,7.8,0,0,0,2.6,1.5L10,22h4l.4-2.6a7.8,7.8,0,0,0,2.6-1.5l2.4,1l2-3.4Z'],
  },
  signal: {
    primary: ['M4,16a8,8,0,0,1,16,0', 'M7,16a5,5,0,0,1,10,0'],
    secondary: ['M10,16a2,2,0,0,1,4,0', 'M12,19H12.1'],
  },
  skip: {
    primary: ['M5,6L13,12L5,18Z', 'M15,6V18'],
    secondary: [],
  },
  timer: {
    primary: ['M12,6a7,7,0,1,1,0,14a7,7,0,1,1,0-14'],
    secondary: ['M12,10V14L15,16', 'M9,3H15'],
  },
  trash: {
    primary: ['M6.4,7.2H17.6', 'M9.8,7.2V5.8H14.2V7.2', 'M12,9.8V16.7'],
    secondary: ['M8.2,8.6L8.8,18.2H15.2L15.8,8.6'],
  },
  user: {
    primary: ['M12,12a4,4,0,1,0,0-8a4,4,0,1,0,0,8', 'M4,21a8,8,0,0,1,16,0'],
    secondary: [],
  },
  warning: {
    primary: ['M12,8V13', 'M12,17H12.1'],
    secondary: ['M10.3,4.2L2.8,18a2,2,0,0,0,1.7,3H19.5a2,2,0,0,0,1.7-3L13.7,4.2a2,2,0,0,0-3.4,0Z'],
  },
  workflow: {
    primary: ['M5,7H11V13H5Z', 'M13,11H19V17H13Z'],
    secondary: ['M11,10H13', 'M8,13V18H13'],
  },
};
