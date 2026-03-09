import { contextBridge, ipcRenderer } from 'electron';

import { DESKTOP_GLOBAL_KEY, type DesktopRuntimeSnapshot, type DesktopSettings } from '@glade/shared';

contextBridge.exposeInMainWorld(DESKTOP_GLOBAL_KEY, {
  platform: process.platform,
  serverPort: Number(process.env.BAYESGROVE_SERVER_PORT ?? 7842),
  selectFilePath: () => ipcRenderer.invoke('glade:select-file-path') as Promise<string | null>,
  selectExecutablePath: () => ipcRenderer.invoke('glade:select-executable-path') as Promise<string | null>,
  openDetachedTerminal: () => ipcRenderer.invoke('glade:open-detached-terminal') as Promise<boolean>,
  getDesktopState: () => ipcRenderer.invoke('glade:get-desktop-state') as Promise<DesktopRuntimeSnapshot>,
  refreshDesktopState: () => ipcRenderer.invoke('glade:refresh-desktop-state') as Promise<DesktopRuntimeSnapshot>,
  saveDesktopSettings: (settings: DesktopSettings) =>
    ipcRenderer.invoke('glade:save-desktop-settings', settings) as Promise<DesktopRuntimeSnapshot>,
  resetDesktopSettings: () => ipcRenderer.invoke('glade:reset-desktop-settings') as Promise<DesktopRuntimeSnapshot>,
  checkForUpdates: () => ipcRenderer.invoke('glade:check-for-updates') as Promise<DesktopRuntimeSnapshot>,
  downloadUpdate: () => ipcRenderer.invoke('glade:download-update') as Promise<DesktopRuntimeSnapshot>,
  installDownloadedUpdate: () => ipcRenderer.invoke('glade:install-downloaded-update') as Promise<boolean>,
  onDetachedTerminalStateChange: (listener: (isDetached: boolean) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, isDetached: boolean) => listener(isDetached);
    ipcRenderer.on('glade:repl-detached-state', wrapped);
    return () => {
      ipcRenderer.removeListener('glade:repl-detached-state', wrapped);
    };
  },
  onDesktopStateChange: (listener: (state: DesktopRuntimeSnapshot) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, state: DesktopRuntimeSnapshot) => listener(state);
    ipcRenderer.on('glade:desktop-state', wrapped);
    return () => {
      ipcRenderer.removeListener('glade:desktop-state', wrapped);
    };
  },
});
