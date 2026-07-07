export interface DirectorySelectionResult {
    canceled: boolean;
    path?: string;
}

export interface ZahnerflowDesktopBridge {
    selectDirectory: () => Promise<DirectorySelectionResult>;
    getRuntimeBaseUrl: () => string;
    windowMinimize: () => void;
    windowToggleMaximize: () => void;
    windowClose: () => void;
    isMaximized: () => boolean;
    onMaximizedChanged: (callback: (maximized: boolean) => void) => () => void;
}

declare global {
    interface Window {
        zahnerflowDesktop?: ZahnerflowDesktopBridge;
    }
}

export function hasDesktopBridge(): boolean {
    return Boolean(window.zahnerflowDesktop);
}

export function getDesktopRuntimeBaseUrl(): string {
    return window.zahnerflowDesktop?.getRuntimeBaseUrl() || '';
}

export async function selectDesktopDirectory(): Promise<DirectorySelectionResult | null> {
    if (!window.zahnerflowDesktop) return null;
    return window.zahnerflowDesktop.selectDirectory();
}
