import { useEffect, useLayoutEffect, useState } from 'react';
import { hasDesktopBridge } from '../desktopBridge';

export function useDesktopWindow() {
  const desktopBridgeAvailable = hasDesktopBridge();
  const [desktopWindowExpanded, setDesktopWindowExpanded] = useState(() => desktopBridgeAvailable ? window.zahnerflowDesktop!.isMaximized() : false);
  useEffect(() => {
    if (!hasDesktopBridge()) return;
    setDesktopWindowExpanded(window.zahnerflowDesktop!.isMaximized());
    return window.zahnerflowDesktop!.onMaximizedChanged(setDesktopWindowExpanded);
  }, []);

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('zf-desktop-window', desktopBridgeAvailable);
    document.documentElement.classList.toggle('zf-desktop-window--expanded', desktopBridgeAvailable && desktopWindowExpanded);

    return () => {
      document.documentElement.classList.remove('zf-desktop-window', 'zf-desktop-window--expanded');
    };
  }, [desktopBridgeAvailable, desktopWindowExpanded]);

  return { desktopBridgeAvailable, desktopWindowExpanded };
}
